const { customEval } = require('./dist/index');
const { Scope, ScopeType } = require('./dist/scope');

class TestScope extends Scope {
	constructor(contents = {}, parent) {
		super(ScopeType.Global, parent);
		for (const [name, value] of Object.entries(contents)) {
			const variable = this.declare('var', name);
			variable.value = value;
		}
	}
}

module.exports = {
	customEval,
	Scope: TestScope
};