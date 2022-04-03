import * as acorn from 'acorn';
import { evaluate } from './evaluate';
import { Scope, ScopeType } from './scope';
import { CustomNode, hoistingTransform } from './hoisting';

export function customEval(code: string, scope: Scope = new Scope(ScopeType.Global)) {
  const node = acorn.parse(code, { ecmaVersion: 'latest' });

  const baseApi: Record<string, any> = {
    console,
    require,
    module: {
      exports: {},
    },
    setTimeout,
    clearTimeout,
    Promise,
    JSON,
  };

  for (const [name, value] of Object.entries(baseApi)) {
    const variable = scope.declare('var', name);
    variable.value = value;
  }

  evaluate(
    hoistingTransform(node as CustomNode),
    scope);
  return scope.get('module')?.value.exports;
}