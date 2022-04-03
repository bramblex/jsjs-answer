import { Scope, ScopeType } from './scope';
import { Coroutine } from "./coroutine";
import { step } from './step';
import { CustomNode } from './hoisting';

export function evaluate(node: CustomNode, scope: Scope = new Scope(ScopeType.Global)) {
  const co = new Coroutine(node, { blockScope: scope }, scope);
  const result = co.resume(null, step);
  if (co.error) {
    throw co.result;
  }
  return result;
}

export function generatorEvaluate(node: CustomNode, scope: Scope = new Scope(ScopeType.Global)) {
  const co = new Coroutine(node, { blockScope: scope }, scope);
  let done = false;

  return {
    next(value?: any) {
      if (done) {
        return { done, value: undefined };
      }

      const result = co.resume(value, step);
      if (co.done) {
        done = true;
      } else if (co.error) {
        throw result;
      }

      return { done, value: result };
    },
    return(value: any) {
      done = true;
      return { done, value };
    },
    throw(exception: any) {
      if (done) {
        return { done, value: undefined };
      }
      co.throw(exception);
      return this.next();
    }
  };
}

export function asyncEvaluate(node: CustomNode, scope: Scope = new Scope(ScopeType.Global)) {
  return new Promise((resolve, reject) => {
    const gen = generatorEvaluate(node, scope);

    function asyncStep(resolvedData?: any) {
      try {
        const { done, value } = gen.next(resolvedData);
        if (done) {
          resolve(value);
        } else if (typeof value?.then === 'function') {
          value.then(asyncStep);
          value.catch(reject);
        } else {
          asyncStep(value);
        }
      } catch (exception) {
        reject(exception);
      }
    }

    asyncStep();
  })
}