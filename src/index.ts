import * as acorn from 'acorn';
import { Node } from 'estree';
import { evaluate } from './evaluate';
import { Scope, ScopeType } from './scope';
import * as fs from 'fs';
import * as path from 'path';

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

	evaluate(node as Node, scope);
	return scope.get('module')?.value.exports;
}