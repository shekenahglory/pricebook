'use strict';
var port = 8080;
var WebSocketServer = require('ws').Server;
var Socket = require('./socket');
var Pricebook = require('./pricebook');

var Server = function(options) {
  var self = this;
  self._books = {};
  self._clients = {};
  self._wss = new WebSocketServer({
    port: options.port
  });

  console.log('server listening on port ' + options.port);

  // handle incoming connection
  self._wss.on('connection', function(ws) {
    var client = new Socket(ws, self);
    self._clients[client.id] = client;
    console.log('new client:', client.id);

    // subscribe method
    client.on('subscribe', function (params, id) {
      var book = self.getBook(params);
      book.addSubscriber(this);

      this.send({
        id: id,
        result: {
          status: 'subscribed',
          base: params.base,
          counter: params.counter
        }
      });
    });

    // unsubscribe method
    client.on('unsubscribe', function (params, id) {
      var book = self.getBook(params);
      book.removeSubscriber(this.id);

      this.send({
        id: id,
        result: {
          status: 'unsubscribed',
          base: params.base,
          counter: params.counter
        }
      });
    });
  });

  return this;
};

/**
 * getBook
 */

Server.prototype.getBook = function(options) {
  var key = options.base.currency +
    (options.base.issuer ? '.' + options.base.issuer : '') + '/' +
    options.counter.currency +
    (options.counter.issuer ? '.' + options.counter.issuer : '');

  if (!this._books[key]) {
    this._books[key] = new Pricebook(options);
    this._books[key].key = key;
  }

  return this._books[key];
};

/**
 * removeClient
 * remove from client pool
 */

Server.prototype.removeClient = function(id) {
  for (var key in this._books) {
      this._books[key].removeSubscriber(id);
  }

  delete this._clients[id];
  console.log('connection closed:', id);
};

var server = new Server({
  port: port
});

