const isNode = (target: any) =>
	target && typeof target.type === 'string';

const isNodeArray = (target: any) =>
	Array.isArray(target) && target[0] && isNode(target[0]);

const isChildNode = (target: any) =>
	isNodeArray(target) || isNode(target);

const getChildrenKeys = (node: any) =>
	Object.keys(node).filter(key => isChildNode(node[key] as Node));

const traverseChildren = (func: (node: any, ctx: any) => any) => (node: any, ctx: any) => {
	if (isNode(node)) {
		for (const key of getChildrenKeys(node)) {
			if (Array.isArray(node[key])) {
				for (let i = 0; i < node[key].length; i++) {
					node[key][i] = node[key][i] && func(node[key][i], ctx);
				}
			} else {
				node[key] = func(node[key], ctx);
			}
		}
	}
	return node;
}

export const traverse = (func: (node: any, ctx: any, next: (node: any, ctx: any) => any) => any) => {
	const _traverse = (node: any, ctx: any) => func(node, ctx, _traverseChildren);
	const _traverseChildren = traverseChildren(_traverse);
	return _traverse;
};