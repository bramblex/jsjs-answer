const test = require('ava');

const { customEval, Scope } = require('../../eval');

test("basic", t => {
  const scope = new Scope();

  const a = customEval(
    `
var a = (1 , 2);

module.exports = a;
  `,
    scope
  );
  t.deepEqual(a, 2);
});