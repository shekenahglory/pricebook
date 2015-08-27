var util = require('util');
var events = require('events');

var methods = [
  'subscribe',
  'unsubscribe'
];

var Socket = function(ws, server) {
  var self = this;
  self._ws = ws;
  self._server = server;
  self.id = ws._socket._handle.fd;

  // handle incoming message
  ws.on('message', function(data, flags) {
    try {
      routeMessage(JSON.parse(data), flags);

    } catch (e) {
      console.log(e.stack);
      self.send({error: e.message});
      return;
    }
  });

  // handle connection close
  ws.on('close', function close() {
    self.closeConnection(ws);
  });

  // handle socket error
  ws.on('error', function(error) {
    console.log(error);
  });

  /**
   * routeMessage
   * route incoming message
   */

  function routeMessage (data, flags) {
    if (!data.method || !data.params) {
      self.send({error: 'method and params are required'});

    } else if (methods.indexOf(data.method) === -1) {
      self.send({error: 'invalid method: ' + data.method});

    } else {
      self.emit(data.method, data.params, data.id);
    }
  }

  return this;
};

// inherit events
util.inherits(Socket, events.EventEmitter);

/**
 * closeConnection
 */

Socket.prototype.closeConnection = function() {
  this._server.removeClient(this.id);
};

/**
 * send (JSON)
 */

Socket.prototype.send = function(message) {
  try {
    this._ws.send(JSON.stringify(message));
  } catch (e) {
    console.log(e.stack);
  }
};

module.exports = Socket;
