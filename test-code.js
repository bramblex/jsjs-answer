const delay = (ms) => new Promise(resolve => setTimeout(() => resolve(ms), ms));

async function hello(a) {
	try {
		console.log('try4-1');
		try {
			console.log('try3-1');
			try {
				console.log('try2-1');
				try {
					return;
					console.log('try1');
				} catch (err) {
				} finally {
					console.log('finally1');
				}
				console.log('try2-2');
			} catch (err) {
			} finally {
				console.log('finally2');
			}
			console.log('try3-2');
		} catch (err) {
		} finally {
			console.log('finally3');
		}
		console.log('try4-2');
	} catch (err) {
	} finally {
		console.log('finally4');
	}
}

hello(100).then(console.log);

// console.log((() => 1 + 2)());