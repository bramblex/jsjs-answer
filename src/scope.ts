import { VariableDeclaration } from "estree";

type Kind = VariableDeclaration['kind'];

export enum ScopeType {
  Global = 1,
  Function = 2,
  Block = 3,
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
    if (this.kind === 'const' && this.init) {
      throw new TypeError(`Assignment to constant variable.`)
    }
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
    while (true) {
      if (scope.type === ScopeType.Function
        || scope.type === ScopeType.Global) {
        return scope;
      }
      if (scope.parent) {
        scope = scope.parent;
      } else {
        break;
      }
    }
    throw new Error('Can not find function or global scope');
  }

  declare(kind: Kind, name: string, force: boolean = false) {
    let scope = kind !== 'var' || force ? this : this.getNearFunctionOrGlobalScope();
    const variable = scope.content.get(name) || new Variable(name, kind);
    scope.content.set(name, variable);
    return variable;
  }

  get(name: string): Variable | null {
    return this.content.get(name) || this.parent?.get(name) || null;
  }

  clone() {
    return new Scope(this.type, this.parent, new Map(this.content));
  }
}
