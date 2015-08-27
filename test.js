var PricebookClient = require('./client');
var moment = require('moment');

client = new PricebookClient({
  host: 'localhost',
  port: 8080
});

var pair = {
  base: {
    currency: 'XRP'
  },
  counter: {
    currency: 'CNY',
    issuer: 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y'
  }
};


client.subscribe(pair);
//pair2 = JSON.parse(JSON.stringify(pair));
//pair2.counter.currency = 'BTC';
//client.subscribe(pair2);

client.on('pricebook', function(book) {
  var diff = moment.utc().diff(moment.utc(book.date), 'ms')/1000;
  console.log(book.date, diff);
  console.log(book.bids[0], book.asks[0]);
});

client.on('delta', function(delta) {
  var diff = moment.utc().diff(moment.utc(delta.date), 'ms')/1000;
  console.log(delta.date, diff);
  delete delta.date;
  console.log(delta);
});

