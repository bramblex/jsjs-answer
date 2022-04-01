
class Test {
	private _a: number = 0;
	private _b: number = 0;

	set a(v: number) {
		console.log('set a');
		this._a = v;
	}

	get a() {
		console.log('get a');
		return this._a;
	}

	set b(v: number) {
		console.log('set b');
		this._b = v;
	}

	get b() {
		console.log('get b');
		return this._b;
	}
}

const test = new Test();

test.a += test.b;