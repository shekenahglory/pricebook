var ripple = require('ripple-lib');
var events = require('events');
var util = require('util');
var moment = require('moment');
var Amount = ripple._DEPRECATED.Amount;
var remote = new ripple._DEPRECATED.Remote({
  trace   : false,
  trusted : false,
  servers: [
    { host: 's1.ripple.com', port: 443, secure: true },
    { host: 's1.ripple.com', port: 443, secure: true }
  ]
});

var timeFormat = 'YYYY-MM-DD HH:mm:ss.SSS';
var bookInterval = 15000;
var resetInterval = 60000;

/*
setInterval(function() {
  console.log('reset');
  remote.disconnect(function() {
    console.log('disconnect');
    remote.connect();
  });
}, resetInterval);
*/

var Pricebook = function (options) {

  var self = this;

  self._subscribers = {};
  self._subscribersCount = 0;
  self._active = false;
  self._asksModel;
  self._bidsModel;
  self._interval;
  self._base = options.base;
  self._counter = options.counter;
  self.key;

  // subscribe asks
  self._asksBook = remote.createOrderBook({
    currency_pays: self._counter.currency,
    issuer_pays: self._counter.issuer,
    currency_gets: self._base.currency,
    issuer_gets: self._base.issuer
  });

  // subscribe bids
  self._bidsBook = remote.createOrderBook({
    currency_pays: self._base.currency,
    issuer_pays: self._base.issuer,
    currency_gets: self._counter.currency,
    issuer_gets: self._counter.issuer
  });

  return this;
};

// inherit events
util.inherits(Pricebook, events.EventEmitter);

Pricebook.prototype.addSubscriber = function(socket) {
  var self = this;

  if (!this._subscribers[socket.id]) {
    this._subscribers[socket.id] = socket;
    this._subscribersCount++;
    console.log(this.key, 'subscriber added:', socket.id, this._active);
  }

  if (!this._active) {
    this._subscribe();
  } else {
    setImmediate(emitBook, socket.id);
  }

  function emitBook(id) {
    self._emitBook(id);
  }
}

Pricebook.prototype.removeSubscriber = function(id) {
  if (this._subscribers[id]) {
    delete this._subscribers[id];
    this._subscribersCount--;
    console.log(this.key, 'subscriber removed:', id);
  }

  // stop listening
  if (!this._subscribersCount) {
    this._unsubscribe();
  }
}

/**
 * subscribe
 * subscribe to the orderbook
 */

Pricebook.prototype._subscribe = function() {
  var self = this;

  if (!remote.connected) {
    remote.connect();
  }

  // reset subscription
  this._unsubscribe();
  this._asksBook._shouldSubscribe = true;
  this._bidsBook._shouldSubscribe = true;

  console.log(self.key, 'subscribe book');

  this._asksBook.on('model', handleAskModel);
  this._bidsBook.on('model', handleBidModel);

  this._interval = setInterval(emitBook, bookInterval);
  this._active = true;

  function handleAskModel(asks) {
    self._handleAsks(asks);
  }

  function handleBidModel(bids) {
    self._handleBids(bids);
  }

  function emitBook() {
    self._emitBook();
  }
};

// unsubscribe from orderbook
Pricebook.prototype._unsubscribe = function() {
  var self = this;

  if (self._active) {
    console.log(self.key, 'unsubscribe book');
  }

  delete self._bids;
  delete self._asks;

  clearInterval(self._interval);

  if (self._asksBook) {
    self._asksBook.removeAllListeners('model');
    self._asksBook.unsubscribe();
  }

  if (self._bidsBook) {
    self._bidsBook.removeAllListeners('model');
    self._bidsBook.unsubscribe();
  }

  self._active = false;
};

// handle asks update
Pricebook.prototype._handleAsks = function (asks) {
  var self = this;
  var revision = handleBook(asks, 'asks');
  var first = self._asks ? false : true;
  var delta = pricebookDiff(self._asks, revision);
  self._asks = revision; //update asks

    console.log(self.key, 'asks changed', first);

  // emit book on first asks retreival
  if (first) {
    self._emitBook();

  // emit any changes
  } else if (delta) {
    self._emitDelta(delta, 'asks');
  }
};

// handle bids update
Pricebook.prototype._handleBids = function (bids) {
  var self = this;

  var revision = handleBook(bids,'bids');
  var first = self._bids ? false : true;
  var delta = pricebookDiff(self._bids, revision);
  self._bids = revision; //update bids

  console.log(self.key, 'bids changed', first);

  // emit book on first bids retreival
  if (first) {
    self._emitBook();

  // emit any changes
  } else if (delta) {
    self._emitDelta(delta, 'bids');
  }
};

/**
 * emitDelta
 */

Pricebook.prototype._emitDelta = function (delta, type) {
  var self = this;
  var message;
  var key;

  for(key in delta) {
    delete delta[key].offers;
  }

  message = {
    base: self._base,
    counter: self._counter,
    date: moment.utc().format(timeFormat),
    delta: {}
  };

  message.delta[type] = delta;

  for (key in self._subscribers) {
    self._subscribers[key].send(message);
  }

  console.log(self.key, 'emit delta');
}

/**
 * emitBook
 */

Pricebook.prototype._emitBook = function(id) {
  var self = this;
  var message;
  var bids = {};
  var asks = {};
  var key;

  // only emit when we have both
  if (!self._bids || !self._asks) {
    return;
  }

  // prepare bids
  bids = Object.keys(self._bids).map(function(id) {
    return {
      price: id,
      size: self._bids[id].size.toString()
    }
  }).sort(function (a, b) {
    return Number(b.price) - Number(a.price);
  });

  // prepare asks
  asks = Object.keys(self._asks).map(function(id) {
    return {
      price: id,
      size: self._asks[id].size.toString()
    }
  }).sort(function (a, b) {
    return Number(a.price) - Number(b.price);
  });


  message = {
    base: self._base,
    counter: self._counter,
    date: moment.utc().format(timeFormat),
    pricebook: {
      bids: bids,
      asks: asks
    }
  };

  if (id) {
    self._subscribers[id].send(message);
    return;
  }

  for (var key in self._subscribers) {
    self._subscribers[key].send(message);
  }

  console.log(self.key, 'emit book', id || '');
}

//handle data returned from ripple-lib
function handleBook (data, action) {
  var max_rows = 40;
  var rowCount = 0;
  var type = action === "asks" ? "gets" : "pays";
  var offers = [];
  var pricebook = { };
  var offer;
  var price;
  var sig = 4; //significant digits for price
  var exponent;
  var amount;
  var i;

  if (!data.length) {
    return;
  }

  // copy the data so
  // we don't mess with
  // the original
  data = JSON.parse(JSON.stringify(data));

  function decimalAdjust(type, value, exp) {
    // If the exp is undefined or zero...
    if (typeof exp === 'undefined' || +exp === 0) {
      return Math[type](value);
    }
    value = +value;
    exp = +exp;
    // If the value is not a number or the exp is not an integer...
    if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0)) {
      return NaN;
    }
    // Shift
    value = value.toString().split('e');
    value = Math[type](+(value[0] + 'e' + (value[1] ? (+value[1] - exp) : -exp)));
    // Shift back
    value = value.toString().split('e');
    return +(value[0] + 'e' + (value[1] ? (+value[1] + exp) : exp));
  }

  function formatAmount(amount) {
    var adjust = action === 'asks' ? 'ceil' : 'floor';
    return decimalAdjust(adjust, toNumber(amount), exponent)
    .toFixed(exponent < 0 ? (0 - exponent) : 0);
  }

  function toNumber(amount) {
    return Number(amount.to_human({group_sep: false}));
  }


  for(i=0; i<data.length; i++) {
    if (data[i].taker_gets_funded === "0" ||
        data[i].taker_pays_funded === "0") {
      continue;
    }

    offer = {
      account: data[i].Account || 'AUTOBRIDGED',
      pays: {},
      gets: {}
    };

    if (data[i].TakerGets.value) {
      offer.gets = {
        value: data[i].taker_gets_funded,
        currency: data[i].TakerGets.currency,
        issuer: data[i].TakerGets.issuer
      }
    } else {
      offer.gets = Number(data[i].taker_gets_funded);
    }

    if (data[i].TakerPays.value) {
      offer.pays = {
        value: data[i].taker_pays_funded,
        currency: data[i].TakerPays.currency,
        issuer: data[i].TakerPays.issuer
      }
    } else {
      offer.pays = Number(data[i].taker_pays_funded);
    }

    offer.gets = Amount.from_json(offer.gets);
    offer.pays = Amount.from_json(offer.pays);

    if (action === "asks") {
      offer.price = Amount.from_quality(data[i].BookDirectory,
                                    offer.pays.currency(),
                                    offer.pays.issuer(), {
        base_currency: offer.gets.currency(),
        reference_date: new Date()
      });
    } else {

      offer.price = Amount.from_quality(data[i].BookDirectory,
                                    offer.gets.currency(),
                                    offer.pays.issuer(), {
        inverse: true,
        base_currency: offer.pays.currency(),
        reference_date: new Date()
      });
    }

    // exponent determines the number
    // of decimals in the price
    if (!exponent) {
      price = toNumber(offer.price);
      exponent = Math.floor(Math.log(price)/Math.log(10)) - sig + 1;
    }

    offers.push(offer);
  }

  for (i=0; i<offers.length; i++) {
    if (rowCount >= max_rows) break;

    amount = toNumber(offers[i][type]);
    price = formatAmount(offers[i].price);

    if (!pricebook[price]) {
      rowCount++;
      pricebook[price] = {
        offers: [],
        size: 0,
        price: Number(price)
      };
    }

    pricebook[price].size += amount;
    pricebook[price].offers.push(offers[i]);
  }

  return pricebook;
}

function pricebookDiff(old, revision) {
  var diff = {};
  var key;

  // nothing to revise
  if (!old) {
    return;
  }

  // find updated and added
  for (key in revision) {
    if (!old[key]) {
      diff[key] = {
        price: key,
        size: revision[key].size.toString(),
        add: true
      };

    } else if (old[key] &&
               old[key].size !== revision[key].size) {
      diff[key] = diff[key] = {
        price: key,
        size: revision[key].size.toString(),
        update: true
      };
    }
  }

  // find removed
  for (key in old) {
    if (!revision[key]) {
      diff[key] = {remove: true};
    }
  }

  return Object.keys(diff).length ? diff : undefined;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

module.exports = Pricebook;
