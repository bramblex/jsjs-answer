import { VariableDeclaration } from "estree";

type Kind = VariableDeclaration['kind'];

export enum ScopeType {
	Global,
	Function,
	Block,
}

export class Variable {
	private _value: any;

	public readonly kind: Kind;
	public readonly name: string;
	public init: boolean;

	get value() {
		if (!this.init) {
			throw new ReferenceError(`Cannot access '${this.name}' before initialization`);
		}
		return this._value;
	}

	set value(_value) {
		this.init = true;
		this._value = _value;
	}

	constructor(name: string, kind: Kind) {
		this.name = name;
		this.kind = kind;
		this.init = kind === 'var';
	}
}

export class Scope {
	public readonly type: ScopeType;
	public readonly parent: Scope | null;
	private readonly content: Map<string, Variable>;

	constructor(type: ScopeType, parent: Scope | null = null, content: Map<string, Variable> = new Map()) {
		this.type = type;
		this.parent = parent;
		this.content = content;
	}

	private getNearFunctionOrGlobalScope() {
		let scope: Scope = this;
		while (scope.parent) {
			if (scope.type === ScopeType.Function
				|| scope.type === ScopeType.Global) {
				return scope;
			}
			scope = scope.parent;
		}
		throw new Error('Can not find function or global scope');
	}

	declare(kind: Kind, name: string) {
		const variable = this.get(name) || new Variable(name, kind);
		this.content.set(name, variable);
		return variable;
	}

	get(name: string): Variable | null {
		return this.content.get(name) || this.parent?.get(name) || null;
	}

	clone() {
		return new Scope(this.type, this.parent, new Map(this.content));
	}
}

// class Scope {
// 	constructor(type, parent = null) { // global, function, block
// 		this.type = type;
// 		this.parent = parent;
// 		this.content = new Map();
// 	}

// 	getFunctionScope() {
// 		let scope = this;
// 		while (scope.parent) {
// 			if (scope.type === 'function') {
// 				return scope;
// 			}
// 			scope = scope.parent;
// 		}
// 		return scope;
// 	}

// 	declare(kind, name) {
// 		if (kind === 'var') {
// 			const functionScope = this.getFunctionScope();
// 			const variable = functionScope.content.get(name) || { kind, init: false, value: undefined };
// 			functionScope.content.set(name, variable);
// 		} else {
// 			const variable = { kind, init: false, value: undefined };
// 			this.content.set(name, variable)
// 		}
// 	}


// 	set(name, value) {
// 		if (this.content.has(name)) {
// 			const variable = this.content.get(name);
// 			if (variable.kind === 'const' && variable.init === true) {
// 				throw new TypeError(`Assignment to constant variable.`);
// 			}
// 			variable.init = true;
// 			variable.value = value;
// 		} else {
// 			if (!this.parent) {
// 				throw new ReferenceError(`${name} is not defined`);
// 			}
// 			return this.parent.set(name, value);
// 		}
// 	}

// 	has(name) {
// 		if (this.content.has(name)) {
// 			return true;
// 		} else {
// 			if (!this.parent) {
// 				return false;
// 			}
// 			return this.parent.get(name);
// 		}
// 	}

// 	get(name) {
// 		if (this.content.has(name)) {
// 			const variable = this.content.get(name);
// 			if (variable.kind === 'const' && variable.init === false) {
// 				throw new ReferenceError(`Cannot access '${name}' before initialization`);
// 			}
// 			return variable.value;
// 		} else {
// 			if (!this.parent) {
// 				throw new ReferenceError(`${name} is not defined`)
// 			}
// 			return this.parent.get(name);
// 		}
// 	}

// 	clone() {
// 		const newScope = new Scope(this.kind, this.parent);
// 		newScope.content = new Map(this.content);
// 	}
// }

// module.exports = Scope;