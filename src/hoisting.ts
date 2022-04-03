import { BlockStatement, Identifier, Node, Program, SwitchCase, VariableDeclaration } from 'estree';
import { Scope, ScopeType } from './scope';
import { traverse } from './traverse';


export type Hoisting = { [key in VariableDeclaration['kind']]: string[] }

export type CustomNode = Node & { hoisting?: Hoisting }

export function hoistFunctionDeclaration<T extends Node>(body: T[]): T[] {
  return [...body].sort((a, b) => {
    if (a.type === 'FunctionDeclaration' && b.type !== 'FunctionDeclaration') {
      return -1;
    } else if (a.type !== 'FunctionDeclaration' && b.type === 'FunctionDeclaration') {
      return 1;
    } else {
      return 0;
    }
  });
}

export function hoistingTransform(root: CustomNode): CustomNode {
  return traverse<Hoisting>(function (node, ctx, next) {

    // 提升函数声明
    switch (node.type) {
      case 'Program':
      case 'BlockStatement':
        node.body = hoistFunctionDeclaration(node.body); break;
      case 'SwitchCase':
        node.consequent = hoistFunctionDeclaration(node.consequent); break;
    }

    // 收集变量
    switch (node.type) {
      case 'VariableDeclaration':
        for (const d of node.declarations) {
          ctx[node.kind].push((d.id as Identifier).name);
        }
        break;
      case 'FunctionDeclaration':
        ctx.var.push((node.id as Identifier).name);
        break;
    }

    // 创建环境
    switch (node.type) {
      case 'BlockStatement':
      case 'ForStatement':
      case 'ForInStatement': {
        const hoisting: Hoisting = { var: ctx.var, let: [], const: [] };
        next(node, hoisting);
        (node as CustomNode).hoisting = hoisting;
        return node;
      }
      case 'Program':
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        const hoisting: Hoisting = { var: [], let: [], const: [] };
        next(node, hoisting);
        if (node.type !== 'Program' && node.body.type === 'BlockStatement') {
          const block = node.body as CustomNode;
          hoisting.let = block.hoisting?.let || [];
          hoisting.const = block.hoisting?.const || [];
          delete block.hoisting;
        }
        (node as CustomNode).hoisting = hoisting;
        return node;
      }
    }

    return next(node, ctx);
  })(root, null as any);
}

export function hoist(node: CustomNode, scope: Scope) {
  const { hoisting } = node;
  if (hoisting) {
    for (const [kind, names] of Object.entries(hoisting)) {
      for (const name of names) {
        scope.declare(kind as VariableDeclaration['kind'], name);
      }
    }
  }
}

// function hoistingFunctions(body: Statement[]) {
//   return [...body].sort((a, b) => {
//     if (a.type === 'FunctionDeclaration' && b.type !== 'FunctionDeclaration') {
//       return -1;
//     } else if (a.type !== 'FunctionDeclaration' && b.type === 'FunctionDeclaration') {
//       return 1;
//     } else {
//       return 0;
//     }
//   });
// }

// function hoistingBlockScope(node: BlockStatement | Program | SwitchCase, scope: Scope) {
//   let body: Statement[];
//   if (node.type === 'BlockStatement') {
//     body = node.body;
//   } else if (node.type === 'Program') {
//     body = node.body as Statement[];
//   } else {
//     body = node.consequent;
//   }
//   for (const stat of body) {
//     if (stat.type === 'VariableDeclaration' && stat.kind !== 'var') {
//       for (const d of stat.declarations) {
//         const name = (d.id as Identifier).name;
//         scope.declare(stat.kind, name);
//       }
//     }
//   }
// }

// function hoistingFunctionScope(node: CustomNode, scope: Scope) {
//   return traverse(function (node: CustomNode, ctx, next) {
//     switch (node.type) {
//       case 'VariableDeclaration': {
//         const kind = node.kind;
//         if (kind === 'var') {
//           for (const d of node.declarations) {
//             const name = (d.id as Identifier).name;
//             scope.declare(kind, name);
//           }
//         }
//         return node;
//       }
//       case 'FunctionDeclaration': {
//         const variable = scope.declare('var', (node.id as Identifier).name);
//         return node;
//       }
//       case 'FunctionExpression':
//       case 'ArrowFunctionExpression': {
//         return node;
//       }
//       default: {
//         return next(node, ctx);
//       }
//     }
//   })(node, null)
// }