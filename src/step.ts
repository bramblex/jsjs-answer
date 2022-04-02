import * as astring from 'astring';
import { Node, ArrayExpression, FunctionExpression, Identifier, Property, ReturnStatement, VariableDeclaration, BlockStatement, Program, SwitchCase, Statement } from 'estree';
import { Coroutine } from './coroutine';
import { asyncEvaluate, evaluate, generatorEvaluate } from './evaluate';
import { Scope, ScopeType, Variable } from './scope';
import { traverse } from './traverse';

function cast<T extends {}>(ctx: any): asserts ctx is T { }

function hoistingBlock(node: BlockStatement | Program | SwitchCase, scope: Scope) {
	let body: Statement[];
	if (node.type === 'BlockStatement') {
		body = node.body;
	} else if (node.type === 'Program') {
		body = node.body as Statement[];
	} else {
		body = node.consequent;
	}
	for (const stat of body) {
		if (stat.type === 'VariableDeclaration' && stat.kind !== 'var') {
			for (const d of stat.declarations) {
				const name = (d.id as Identifier).name;
				scope.declare(stat.kind, name);
			}
		}
	}
	return node;
}

function hoistingFunction(node: Node, scope: Scope) {
	traverse(function (node: Node, ctx, next) {
		switch (node.type) {
			case 'VariableDeclaration': {
				const kind = node.kind;
				if (kind === 'var') {
					for (const d of node.declarations) {
						const name = (d.id as Identifier).name;
						scope.declare(kind, name);
					}
				}
				return node;
			}
			case 'FunctionDeclaration': {
				scope.declare('var', (node.id as Identifier).name);
				return node;
			}
			case 'FunctionExpression':
			case 'ArrowFunctionExpression': {
				return node;
			}
			default: {
				return next(node, ctx);
			}
		}
	})(node, null)
}

export function step(co: Coroutine) {
	const { node, scope, context: ctx } = co.current();
	try {
		switch (node.type) {
			// 函数 & 协程
			case 'FunctionDeclaration': {
				switch (ctx.next) {
					case 0:
						const functionNode = { ...node, type: 'FunctionExpression' } as FunctionExpression;
						co.enter(functionNode); ctx.next = 1; return;
					case 1:
						const func = ctx.tmpResult;
						if (node.id) {
							const variable = scope.get(node.id.name) as Variable;
							variable.value = func;
						}
						co.leave(); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'ArrowFunctionExpression':
			case 'FunctionExpression': {
				const func = function (this: any, ...args: any[]) {
					const funcScope = new Scope(ScopeType.Function, scope);

					if (node.type === 'FunctionExpression') {
						const variable = funcScope.declare('var', 'this');
						variable.value = this;
					}

					for (let i = 0; i < node.params.length; i++) {
						const { name } = node.params[i] as Identifier;
						const variable = funcScope.declare('var', name);
						variable.value = args[i];
					}

					hoistingFunction(node.body, scope);

					if (node.async) {
						return asyncEvaluate(node.body, funcScope);
					} else if (node.generator) {
						return generatorEvaluate(node.body, funcScope);
					} else {
						return evaluate(node.body, funcScope);
					}
				}

				func.toString = function toString() {
					return astring.generate(node);
				}

				Object.defineProperties(func, {
					length: { writable: false, value: node.params.length }
				})

				if (node.type === 'FunctionExpression') {
					Object.defineProperties(func, {
						name: { writable: false, value: node?.id?.name }
					});
				}

				co.leave(func); return;
			}

			case 'YieldExpression':
			case 'AwaitExpression': {
				switch (ctx.next) {
					case 0:
						if (node.argument) {
							co.enter(node.argument); ctx.next = 1; return;
						}
					case 1:
						co.interrupt(ctx.tmpResult); ctx.next = 2; return;
					case 2:
						co.leave(ctx.tmpResult); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'ReturnStatement': {
				switch (ctx.next) {
					case 0:
						if (node.argument) {
							co.enter(node.argument); ctx.next = 1; return;
						}
					case 1:
						const nextContext = {
							next: 2,
							returnStatement: {
								type: 'ReturnStatement',
								argument: { type: 'Literal', value: ctx.tmpResult }
							}
						}
						co.leaveWhile(ctx.tmpResult, nextContext, function () {
							const first = co.stack.top();
							cast<{ state: number }>(first.context);
							return first.node.type === 'TryStatement' && first.context.state < 2
						}); return;
				}
				throw new Error('Unexpected Error');
			}

			// 指令和声明
			case 'ExpressionStatement': {
				switch (ctx.next) {
					case 0:
						co.enter(node.expression); ctx.next = 1; return;
					case 1:
						co.leave(); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'Program':
			case 'BlockStatement': {
				cast<{ i: number, blockScope: Scope }>(ctx);
				switch (ctx.next) {
					case 0:
						ctx.i = 0;
						ctx.blockScope = new Scope(ScopeType.Block, scope);
						if (node.type === 'Program') {
							hoistingFunction(node, ctx.blockScope);
						} else {
							hoistingBlock(node, ctx.blockScope);
						}
					case 1:
						co.enter(node.body[ctx.i], {}, ctx.blockScope); ctx.next = 2; return;
					case 2:
						if (ctx.i < node.body.length - 1) {
							ctx.i++; ctx.next = 1; return;
						}
						co.leave(); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'EmptyStatement': {
				co.leave(); return;
			}

			case 'DebuggerStatement': {
				debugger; co.leave(); return;
			}

			case 'LabeledStatement': {
				switch (ctx.next) {
					case 0:
						co.enter(node.body); return;
					case 1:
						co.leave(); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'BreakStatement': {
				const label = node.label?.name;
				co.leaveWhile(undefined, {}, function (co) {
					const first = co.stack.top();
					if (label) {
						return first.node.type === 'LabeledStatement' && first.node.label.name === label;
					}
					return [
						'ForStatement',
						'ForInStatement',
						'ForOfStatement',
						'WhileStatement',
						'DoWhileStatement',
						'SwitchStatement',
					].includes(first.node.type);
				});
				co.leave(); return;
			}

			case 'ContinueStatement': {
				const label = node.label?.name;
				co.leaveWhile(undefined, { continue: true }, function (co) {
					if (label) {
						const second = co.stack.top(1);
						return second.node.type === 'LabeledStatement' && second.node.label.name === label;
					}
					const first = co.stack.top();
					return [
						'ForStatement',
						'WhileStatement',
						'DoWhileStatement',
						'ForInStatement',
					].includes(first.node.type);
				});
				return;
			}

			case 'IfStatement': {
				switch (ctx.next) {
					case 0:
						co.enter(node.test); ctx.next = 1; return;
					case 1:
						if (ctx.tmpResult) {
							co.enter(node.consequent); ctx.next = 3; return;
						}
					case 2:
						if (node.alternate) {
							co.enter(node.alternate); ctx.next = 3; return;
						}
					case 3:
						co.leave(); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'SwitchStatement': {
				cast<{ discriminant: any, i: number, blockScope: Scope, matched: boolean }>(ctx);
				switch (ctx.next) {
					case 0:
						ctx.i = 0;
						ctx.matched = false;
						ctx.blockScope = new Scope(ScopeType.Block, scope);
						for (const switchCase of node.cases) {
							hoistingBlock(switchCase, ctx.blockScope);
						}
						co.enter(node.discriminant, {}); ctx.next = 1; return;
					case 1:
						ctx.discriminant = ctx.tmpResult;
					case 2:
						if (ctx.i < node.cases.length) {
							const cs = node.cases[ctx.i];
							ctx.i++;
							co.enter(cs, {
								discriminant: ctx.discriminant,
								matched: ctx.matched,
							}, ctx.blockScope); ctx.next = 2; return;
						}
						co.leave(undefined, { matched: ctx.matched });
				}
				throw new Error('Unexpected Error');
			}

			case 'SwitchCase': {
				cast<{ i: number, matched: boolean, discriminant: any }>(ctx);
				switch (ctx.next) {
					case 0:
						ctx.i = 0;
						if (!ctx.matched && node.test) {
							co.enter(node.test); ctx.next = 1; return;
						}
					case 1:
						ctx.matched || ctx.tmpResult === ctx.discriminant;
						if (!ctx.matched) {
							co.leave(); return;
						}
					case 2:
						if (ctx.i < node.consequent.length) {
							const stat = node.consequent[ctx.i];
							ctx.i++;
							co.enter(stat); ctx.next = 2; return;
						}
						co.leave(undefined, { matched: ctx.matched });
				}
				throw new Error('Unexpected Error');
			}

			case 'ThrowStatement': {
				switch (ctx.next) {
					case 0:
						co.enter(node.argument); ctx.next = 1; return;
					case 1:
						const nextContext = {
							next: 1,
							exception: ctx.tmpResult,
						}
						co.leaveWhile(ctx.tmpResult, nextContext, function () {
							const first = co.stack.top();
							cast<{ state: number }>(first.context);
							return first.node.type === 'TryStatement' && first.context.state < 1;
						});
						if (co.done) {
							co.error = true;
						}
						return;
				}
				throw new Error('Unexpected Error');
			}

			case 'TryStatement': {
				cast<{ state: number, exception: any, returnStatement?: ReturnStatement }>(ctx);
				switch (ctx.next) {
					case 0:
						ctx.state = 0;
						co.enter(node.block); ctx.next = 2; return;
					case 1:
						ctx.state = 1;
						if (node.handler) {
							co.enter(node.handler, { exception: ctx.exception }); ctx.next = 2; return;
						}
					case 2:
						ctx.state = 2;
						if (node.finalizer) {
							co.enter(node.finalizer); ctx.next = 3; return;
						}
					case 3:
						ctx.state = 3;
						if (ctx.returnStatement) {
							co.enter(ctx.returnStatement); ctx.next = 4; return;
						}
					case 4:
						co.leave(); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'CatchClause': {
				cast<{ exception: any }>(ctx);
				switch (ctx.next) {
					case 0:
						const blockScope = new Scope(ScopeType.Block, scope);
						const variable = blockScope.declare('var', (node.param as Identifier).name);
						variable.value = ctx.exception;
						co.enter(node.body, {}, blockScope); ctx.next = 1; return;
					case 1:
						co.leave(); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'WhileStatement': {
				cast<{ blockScope: Scope, continue: boolean }>(ctx);
				if (ctx.continue) {
					ctx.next = 1;
					ctx.continue = false;
				}
				switch (ctx.next) {
					case 0:
						ctx.blockScope = new Scope(ScopeType.Block, scope);
					case 1:
						co.enter(node.test, ctx.blockScope); ctx.next = 2; return;
					case 2:
						if (ctx.tmpResult) {
							co.enter(node.body, ctx.blockScope); ctx.next = 1; return;
						}
						co.leave(); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'DoWhileStatement': {
				cast<{ blockScope: Scope, continue: boolean }>(ctx);
				if (ctx.continue) {
					ctx.next = 1;
					ctx.continue = false;
				}
				switch (ctx.next) {
					case 0:
						ctx.blockScope = new Scope(ScopeType.Block, scope);
						co.enter(node.body, ctx.blockScope); ctx.next = 1; return;
					case 1:
						co.enter(node.test, ctx.blockScope); ctx.next = 2; return;
					case 2:
						if (ctx.tmpResult) {
							co.enter(node.body, ctx.blockScope); ctx.next = 1; return;
						}
						co.leave(); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'ForStatement': {
				cast<{ blockScope: Scope, continue: boolean }>(ctx);
				if (ctx.continue) {
					ctx.next = 3;
					ctx.continue = false;
				}
				switch (ctx.next) {
					case 0:
						ctx.blockScope = new Scope(ScopeType.Block, scope);
						if (node.init) {
							co.enter(node.init, ctx.blockScope); ctx.next = 1; return;
						}
					case 1:
						if (node.test) {
							co.enter(node.test, ctx.blockScope); ctx.next = 2; return;
						}
					case 2:
						if (!ctx.tmpResult) {
							co.leave(); return;
						}
						co.enter(node.body, ctx.blockScope); ctx.next = 3; return;
					case 3:
						ctx.blockScope = ctx.blockScope.clone();
						if (node.update) {
							co.enter(node.update, ctx.blockScope);
						}
						ctx.next = 1; return;
				}
				throw new Error('Unexpected Error');
			}

			case 'ForInStatement': {
				cast<{ i: number, right: any, keys: string[], continue: boolean }>(ctx);
				if (ctx.continue) {
					ctx.next = 2;
					ctx.continue = false;
				}
				switch (ctx.next) {
					case 0:
						ctx.i = 0;
						ctx.keys = [];
						co.enter(node.right); ctx.next = 1; return;
					case 1:
						ctx.right = ctx.tmpResult;
						for (const key in ctx.right) {
							ctx.keys.push(key);
						}
					case 2:
						if (ctx.i < ctx.keys.length) {
							const key = ctx.keys[ctx.i];
							const blockScope = new Scope(ScopeType.Block, scope);
							const variable = blockScope.declare(
								(node.left as VariableDeclaration).kind,
								((node.left as VariableDeclaration).declarations[0].id as Identifier).name
							);
							variable.value = key;
							ctx.i++;
							co.enter(node.body, blockScope); ctx.next = 2; return;
						}
						co.leave(); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'VariableDeclaration': {
				cast<{ i: number }>(ctx);
				let d;
				switch (ctx.next) {
					case 0:
						ctx.i = 0;
					case 1:
						d = node.declarations[ctx.i];
						if (d.init) {
							co.enter(d.init); ctx.next = 2; return;
						}
					case 2:
						d = node.declarations[ctx.i];
						const v = scope.declare(node.kind, (d.id as Identifier).name);
						if (d.init) {
							v.value = ctx.tmpResult;
						}
						if (ctx.i < node.declarations.length - 1) {
							ctx.i++; ctx.next = 1; return;
						}
						co.leave(); return;
				}
				throw new Error('Unexpected Error');
			}

			// 表达式
			case 'Identifier': {
				const variable = scope.get(node.name);
				if (!variable) {
					throw new ReferenceError(`${node.name} is not defined`);
				} else if (!variable.init) {
					throw new ReferenceError(`Cannot access '${node.name}' before initialization`);
				}

				co.leave(variable.value, { tmpVariable: variable }); return;
			}

			case 'Literal': {
				co.leave(node.value); return;
			}

			case 'ThisExpression': {
				const { value } = scope.get('this') || { value: null };
				co.leave(value); return;
			}

			case 'ArrayExpression': {
				cast<{ i: number, next: number, array: any[] }>(ctx);
				switch (ctx.next) {
					case 0:
						ctx.i = 0;
						ctx.array = [];
					case 1:
						const element = node.elements[ctx.i];
						if (element) {
							co.enter(element); ctx.next = 2; return;
						} else {
							ctx.tmpResult = null;
						}
					case 2:
						ctx.array.push(ctx.tmpResult);
						if (ctx.i < node.elements.length - 1) {
							ctx.i++;
							ctx.next = 1; return;
						}
						co.leave(ctx.array); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'ObjectExpression': {
				cast<{ i: number, object: any, key: any }>(ctx);
				let property;
				switch (ctx.next) {
					case 0:
						ctx.i = 0;
						ctx.object = {};
					case 1:
						property = node.properties[ctx.i] as Property;
						if (!property.computed && property.key.type === "Identifier") {
							ctx.tmpResult = property.key.name;
						} else {
							co.enter(property.key); ctx.next = 2; return;
						}
					case 2:
						ctx.key = ctx.tmpResult;
						property = node.properties[ctx.i] as Property;
						co.enter(property.value); ctx.next = 3; return;
					case 3:
						const value = ctx.tmpResult;
						ctx.object[ctx.key] = value;
						if (ctx.i < node.properties.length - 1) {
							ctx.i++;
							ctx.next = 1; return;
						}
						co.leave(ctx.object); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'UnaryExpression': {
				switch (ctx.next) {
					case 0:
						if (node.argument.type === 'Identifier') {
							if (node.operator === 'typeof') {
								const variable = scope.get(node.argument.name);
								if (!variable) {
									co.leave(undefined); return;
								}
							} else if (node.operator === 'delete') {
								const variable = scope.get('this');
								if (variable && variable.value) {
									delete variable.value[node.argument.name];
								}
								co.leave(true); return;
							}
						}
						co.enter(node.argument); ctx.next = 1; return;
					case 1:
						const { tmpResult: argument, tmpMember } = ctx;
						switch (node.operator) {
							case '-': co.leave(-argument); return;
							case '+': co.leave(+argument); return;
							case '!': co.leave(!argument); return;
							case '~': co.leave(~argument); return;
							case 'typeof': co.leave(typeof argument); return;
							case 'delete':
								if (tmpMember) {
									delete tmpMember.object[tmpMember.property]
								}
								co.leave(true); return;
						}
				}
				throw new Error('Unexpected Error');
			}

			case 'UpdateExpression': {
				switch (ctx.next) {
					case 0:
						co.enter(node.argument); ctx.next = 1; return;
					case 1:
						const { tmpResult: argument, tmpMember, tmpVariable } = ctx;
						const updated = node.operator === '++' ? argument + 1 : argument - 1;
						if (tmpMember) {
							const { object, property } = tmpMember;
							object[property] = updated;
						} else if (tmpVariable) {
							tmpVariable.value = updated;
						}
						co.leave(node.prefix ? updated : argument); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'BinaryExpression': {
				cast<{ left: any }>(ctx);
				switch (ctx.next) {
					case 0:
						co.enter(node.left); ctx.next = 1; return;
					case 1:
						ctx.left = ctx.tmpResult;
						co.enter(node.right); ctx.next = 2; return;
					case 2:
						const left = ctx.left;
						const right = ctx.tmpResult;
						switch (node.operator) {
							case '==': co.leave(left == right); return;
							case '!=': co.leave(left != right); return;
							case '===': co.leave(left === right); return;
							case '!==': co.leave(left !== right); return;
							case '<': co.leave(left < right); return;
							case '<=': co.leave(left <= right); return;
							case '>': co.leave(left > right); return;
							case '>=': co.leave(left >= right); return;
							case '<<': co.leave(left << right); return;
							case '>>': co.leave(left >> right); return;
							case '>>>': co.leave(left >>> right); return;
							case '+': co.leave(left + right); return;
							case '-': co.leave(left - right); return;
							case '*': co.leave(left * right); return;
							case '/': co.leave(left / right); return;
							case '%': co.leave(left % right); return;
							case '|': co.leave(left | right); return;
							case '^': co.leave(left ^ right); return;
							case '&': co.leave(left & right); return;
							case 'in': co.leave(left in right); return;
							case 'instanceof': co.leave(left instanceof right); return;
						}
				}
				throw new Error('Unexpected Error');
			}

			case 'AssignmentExpression': {
				cast<{ left: any, object: any, property: any }>(ctx);
				switch (ctx.next) {
					case 0:
						co.enter(node.left); ctx.next = 1; return;
					case 1:
						ctx.left = ctx.tmpResult;
						if (ctx.tmpMember) {
							ctx.object = ctx.tmpMember.object;
							ctx.property = ctx.tmpMember.property;
						} else if (ctx.tmpVariable) {
							ctx.object = ctx.tmpVariable;
							ctx.property = 'value';
						}
						co.enter(node.right); ctx.next = 2; return;
					case 2:
						const { left, tmpResult: right, object, property } = ctx;
						let updated;
						switch (node.operator) {
							case '=': updated = right; break;
							case '+=': updated = left + right; break;
							case '-=': updated = left - right; break;
							case '*=': updated = left * right; break;
							case '/=': updated = left / right; break;
							case '%=': updated = left % right; break;
							case '<<=': updated = left << right; break;
							case '>>=': updated = left >> right; break;
							case '>>>=': updated = left >>> right; break;
							case '|=': updated = left | right; break;
							case '^=': updated = left ^ right; break;
							case '&=': updated = left & right; break;
						}
						co.leave(object[property] = updated); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'LogicalExpression': {
				switch (ctx.next) {
					case 0:
						co.enter(node.left); ctx.next = 1; return;
					case 1:
						const left = ctx.tmpResult;
						if (node.operator === '&&' && !left) {
							co.leave(left); return;
						} else if (node.operator === '||' && left) {
							co.leave(left); return;
						}
						co.enter(node.right); ctx.next = 2; return;
					case 2:
						const right = ctx.tmpResult;
						co.leave(right); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'MemberExpression': {
				cast<{ object: any }>(ctx);
				switch (ctx.next) {
					case 0:
						co.enter(node.object); ctx.next = 1; return;
					case 1:
						ctx.object = ctx.tmpResult;
						if (!node.computed && node.property.type === 'Identifier') {
							ctx.tmpResult = node.property.name;
						} else {
							co.enter(node.property); ctx.next = 2; return;
						}
					case 2:
						const property = ctx.tmpResult;
						const result = ctx.object[property];
						co.leave(result, { tmpMember: { object: ctx.object, property } }); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'ConditionalExpression': {
				switch (ctx.next) {
					case 0:
						co.enter(node.test); ctx.next = 1; return;
					case 1:
						const test = ctx.tmpResult;
						co.enter(test ? node.consequent : node.alternate); ctx.next = 2; return;
					case 2:
						co.leave(ctx.tmpResult); return;
				}
				throw new Error('Unexpected Error');
			}

			case 'CallExpression':
			case 'NewExpression': {
				cast<{ callee: any, thisArg: any }>(ctx);
				switch (ctx.next) {
					case 0:
						co.enter(node.callee); ctx.next = 1; return;
					case 1:
						ctx.callee = ctx.tmpResult;
						ctx.thisArg = ctx.tmpMember?.object || null;
						const argumentsNode = { type: 'ArrayExpression', elements: node.arguments } as ArrayExpression;
						co.enter(argumentsNode); ctx.next = 2; return;
					case 2:
						const { tmpResult: args, callee, thisArg } = ctx;
						if (node.type === "CallExpression") {
							const result = callee.apply(thisArg, args);
							co.leave(result); return;
						} else if (node.type === "NewExpression") {
							const object = new (callee.bind.apply(callee, [null, ...args]));
							co.leave(object); return;
						}
				}
				throw new Error('Unexpected Error');
			}

			case 'SequenceExpression': {
				switch (ctx.next) {
					case 0:
						const expressionsNode = { type: 'ArrayExpression', elements: node.expressions } as ArrayExpression;
						co.enter(expressionsNode); ctx.next = 1; return;
					case 1:
						const expressions = ctx.tmpResult;
						co.leave(expressions[expressions.length - 1]); return;
				}
				throw new Error('Unexpected Error');
			}
		}
	} catch (exception) {
		co.throw(exception); return;
	};
	throw new Error('Unsupported Syntax');
}