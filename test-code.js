
var Test = function(text) {
  if (text) {
    var o = JSON.parse(text);
    this.id = o.id;
    this.list = o.list;
  } else {
    this.id = '';
    this.list = [];
  }
};

var test = new Test('{"id":1,"list":[1, 2, 3]}');

module.exports = { test, Test }