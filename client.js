var WebSocket = require('ws');
var util = require('util');
var events = require('events');

var PricebookClient = function(options) {
  var self = this;
  var queue = [];
  var ws;
  var uri = options.secure ? 'https://' : 'http://' +
    options.host + (options.port ? ':' + options.port : '');

  self._connected = false;
  ws = new WebSocket(uri);

  ws.on('open', function() {
    var message;

    console.log('pricebook client connected');
    self._connected = true;

    while (message = queue.pop()) {
      send(message);
    }
  });

  self.subscribe = function (pair) {
    var message = {
      method: 'subscribe',
      params: {
        base: pair.base,
        counter: pair.counter
      }
    };

    send(message);
  };

  self.unsubscribe = function (pair) {
    var message = {
      method: 'unsubscribe',
      params: {
        base: pair.base,
        counter: pair.counter
      }
    };

    send(message);
  };

  self.close = function() {
    ws.close();
  };

  ws.on('message', function(message) {
    message = JSON.parse(message);

    if (message.pricebook) {
      message.pricebook.date = message.date;
      self.emit('pricebook', message.pricebook);
    } else if (message.delta) {
      message.delta.date = message.date;
      self.emit('delta', message.delta);
    } else {
      console.log(message);
    }
  });

  function send (message) {
    if (!self._connected) {
      queue.push(message);
      return;
    }

    try {
      ws.send(JSON.stringify(message));
    } catch (e) {
      console.log(e);
    }
  }
}

util.inherits(PricebookClient, events.EventEmitter);
module.exports = PricebookClient;

