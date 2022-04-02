const test = require('ava');
const { customEval, Scope } = require('../../eval');

test("basic", t => {
  const scope = new Scope();

  const obj = customEval(
    `
const obj = {
  i: 0
};

module.exports = obj;
  `,
    scope
  );

  t.true(typeof obj.i === "number");
  t.deepEqual(obj.i, 0);
});

test("object with method", t => {
  const scope = new Scope();

  const obj = customEval(
    `
const obj = {
  i: 0,
  get(){
    return this.i;
  }
};

module.exports = obj;
  `,
    scope
  );
  t.deepEqual(obj.i, 0);
  t.deepEqual(obj.get(), obj.i);
});
