import * as acorn from 'acorn';
import { evaluate } from './evaluate';
import { Scope, ScopeType } from './scope';
import { CustomNode, hoistingTransform } from './hoisting';
import * as astring from 'astring';
import * as fs from 'fs';
import * as path from 'path';
import { traverse } from './traverse';
import { Comment, Statement } from 'estree';

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

if (require.main === module) {
  const testCode = fs.readFileSync(path.resolve(__dirname, '../test-code.js'), 'utf-8');
  const testNode = traverse(function (node, ctx, next) {
    const { hoisting } = node as CustomNode;
    if (hoisting) {
      ((node as any).comments) = [
        { type: 'Line', value: `[${node.type}] ${JSON.stringify(hoisting)}` }
      ];
    }
    return next(node, ctx);
  })(hoistingTransform(acorn.parse(testCode, { ecmaVersion: 'latest' }) as CustomNode), null);

  console.log(astring.generate(
    testNode,
    { comments: true }
  ));

  customEval(testCode);
}
