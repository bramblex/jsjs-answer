import { Node } from "estree";
import { Scope, Variable } from "./scope";

export interface Context {
	next: number;
	tmpResult: any;
	tmpMember?: {
		object: any;
		property: any;
	};
	tmpVariable?: Variable;
}

export class StackFrame {
	public readonly node: Node;
	public readonly scope: Scope;
	public readonly context: Context;

	constructor(node: Node, scope: Scope) {
		this.node = node;
		this.scope = scope;
		this.context = { next: 0, tmpResult: undefined };
	}
}

export class Stack {
	private readonly content: StackFrame[] = [];

	empty() {
		return this.content.length === 0;
	}

	top(n: number = 0) {
		return this.content[this.content.length - 1 - n];
	}

	push(frame: StackFrame) {
		return this.content.push(frame);
	}

	pop() {
		return this.content.pop();
	}
}

export class Coroutine {
	public done: boolean = false;
	public halt: boolean = false;
	public error: boolean = false;

	public result: any = null;

	public readonly stack: Stack = new Stack();

	constructor(node: Node, scope: Scope) {
		this.enter(node, {}, scope);
	}

	throw(exception: any) {
		this.enter({
			type: 'ThrowStatement',
			argument: { type: 'Literal', value: exception }
		});
	}

	enter(node: Node, context: {} = {}, scope: Scope = this.stack.top().scope) {
		const frame = new StackFrame(node, scope);
		Object.assign(frame.context, context);
		this.stack.push(frame);
	}

	leave(value?: any, context: {} = {}) {
		this.stack.pop();
		if (this.stack.empty()) {
			this.return(value);
		} else {
			Object.assign(this.current().context, { tmpResult: value }, context)
		}
	}

	leaveWhile(value: any, context: {}, func: (co: Coroutine) => boolean) {
		while (!func(this)) {
			this.leave(value, context);
		}
	}

	return(value: any) {
		this.halt = true;
		this.done = true;
		this.result = value;
	}

	interrupt(value: any) {
		this.halt = true;
		this.result = value;
	}

	resume(value: any, step: (env: Coroutine) => void) {
		this.halt = false
		this.current().context.tmpResult = value;
		while (!this.done && !this.halt && !this.error) {
			step(this);
		}
		return this.result;
	}

	current() {
		return this.stack.top();
	}
}
