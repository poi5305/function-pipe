const _ = require('lodash');

class CallFunctionAsArgument {
  constructor(fn, args) {
    this.fn = fn;
    this.args = args;
  }
}

class FpArgumentOrder {
  constructor(...args) {
    this.order = args;
  }
}

class FpOutputPipes {
  constructor(...args) {
    this.pipes = args;
  }
}

class FpErrorPipes {
  constructor(...args) {
    this.pipes = args;
  }
}

class FpMapIndex {
  constructor(...args) {
    if (args.length === 0) {
      args.push(0);
    }
    this.mapIndexes = args;
  }
}

class FunctionPipe {
  constructor(fn, ...args) {
    this.mFunctionNumber = 0;
    this.mCatchNumber = 0;

    this.mPipeOutBuffer = {};
    this.mPipeErrBuffer = {};

    this.mPromise = Promise.resolve();
    this.run = true;
    this.pipe(fn, ...args);
  }

  static makeParameters(...args) {
    const parameters = [
      new FpArgumentOrder(),
      new FpOutputPipes(),
      new FpErrorPipes(),
      new FpMapIndex(),
    ];
    _.forEach(args, (v) => {
      if (v instanceof FpArgumentOrder) {
        parameters[0] = v;
      } else if (v instanceof FpOutputPipes) {
        parameters[1] = v;
      } else if (v instanceof FpErrorPipes) {
        parameters[2] = v;
      } else if (v instanceof FpMapIndex) {
        parameters[3] = v;
      }
    });
    return parameters;
  }

  static pushToPipe(pipeBuf, fnIdx, fpPipes, value) {
    const pipeBuffer = pipeBuf;
    const pushValueToPipeBuffer = (idx, v) => {
      if (_.isUndefined(pipeBuffer[idx])) {
        pipeBuffer[idx] = [];
      }
      pipeBuffer[idx].push(v);
    };
    if (fpPipes.pipes.length === 0) {
      fpPipes.pipes.push(1);
    }
    _.forEach(fpPipes.pipes, (outIdx) => {
      pushValueToPipeBuffer(fnIdx + outIdx, value);
    });
  }

  static reOrderArgs(fn, fpOrder) {
    let func = fn;
    if (fpOrder.order.length > 0) {
      func = _.rearg(fn, fpOrder.order);
    }
    return func;
  }

  newCatchThenFunction(fn, fpOrder, fpOutPipes, fpErrPipes) {
    this.mCatchNumber += 1;
    const erIdx = this.mCatchNumber;
    const func = FunctionPipe.reOrderArgs(fn, fpOrder);

    const wrapFunc = () => {
      if (!this.run) return {};
      const args = _.get(this.mPipeErrBuffer, erIdx, []);
      const result = func(...args);

      if (result instanceof Promise) {
        return result
          .then((value) => {
            FunctionPipe.pushToPipe(this.mPipeErrBuffer, erIdx, fpOutPipes, value);
            return Promise.reject();
          })
          .catch((value) => {
            FunctionPipe.pushToPipe(this.mPipeErrBuffer, erIdx, fpErrPipes, value);
            return Promise.reject();
          });
      }
      return new Promise((resolve) => {
        resolve(result);
      });
    };
    return wrapFunc;
  }

  newCatchFunction(fn, fpOrder, fpOutPipes, fpErrPipes) {
    this.mCatchNumber += 1;
    const fnIdx = this.mFunctionNumber;
    const erIdx = this.mCatchNumber;
    const func = FunctionPipe.reOrderArgs(fn, fpOrder);

    const wrapFunc = () => {
      if (!this.run) return {};
      const args = _.get(this.mPipeErrBuffer, erIdx, []);
      const result = func(...args);

      if (result instanceof Promise) {
        return result
          .then((value) => {
            FunctionPipe.pushToPipe(this.mPipeOutBuffer, fnIdx, fpOutPipes, value);
            return Promise.resolve();
          })
          .catch((value) => {
            FunctionPipe.pushToPipe(this.mPipeErrBuffer, erIdx, fpErrPipes, value);
            return Promise.reject();
          });
      }
      return new Promise((resolve) => {
        resolve(result);
      });
    };
    return wrapFunc;
  }

  newPipeFunction(fn, fpOrder, fpOutPipes, fpErrPipes) {
    this.mFunctionNumber += 1;
    const fnIdx = this.mFunctionNumber;
    const erIdx = this.mCatchNumber;
    const func = FunctionPipe.reOrderArgs(fn, fpOrder);

    const wrapFunc = () => {
      if (!this.run) return {};
      const args = _.get(this.mPipeOutBuffer, fnIdx, []);
      const result = func(...args);

      if (result instanceof Promise) {
        return result
          .then((value) => {
            FunctionPipe.pushToPipe(this.mPipeOutBuffer, fnIdx, fpOutPipes, value);
            return Promise.resolve();
          })
          .catch((value) => {
            FunctionPipe.pushToPipe(this.mPipeErrBuffer, erIdx, fpErrPipes, value);
            return Promise.reject();
          });
      }
      FunctionPipe.pushToPipe(this.mPipeOutBuffer, fnIdx, fpOutPipes, result);
      return Promise.resolve();
    };
    return wrapFunc;
  }

  newMapFunction(fn, fpOrder, fpOutPipes, fpErrPipes, fpMapIndex) {
    this.mFunctionNumber += 1;
    const fnIdx = this.mFunctionNumber;
    const erIdx = this.mCatchNumber;
    const func = FunctionPipe.reOrderArgs(fn, fpOrder);

    const wrapFunc = () => {
      if (!this.run) return {};
      const args = _.get(this.mPipeOutBuffer, fnIdx, []);

      const firstMapArg = args[fpMapIndex.mapIndexes[0]];
      const promises = _.map(firstMapArg, (firstArg, row) => {
        const newArgs = _.map(args, (arg, col) => {
          if (_.indexOf(fpMapIndex.mapIndexes, col) !== -1 && _.isArray(arg)) {
            return arg[row];
          }
          return arg;
        });
        return func(...newArgs);
      });

      return Promise.all(promises)
        .then((value) => {
          FunctionPipe.pushToPipe(this.mPipeOutBuffer, fnIdx, fpOutPipes, value);
          return Promise.resolve();
        })
        .catch((value) => {
          FunctionPipe.pushToPipe(this.mPipeErrBuffer, erIdx, fpErrPipes, value);
          return Promise.reject();
        });
    };
    return wrapFunc;
  }

  pipeMap(fn, ...args) {
    const parameters = FunctionPipe.makeParameters(...args);
    const wrapFunc = this.newMapFunction(fn, ...parameters);
    this.mPromise = this.mPromise.then(wrapFunc);
    return this;
  }

  pipeMapSpread(fn, ...args) {
    return this.pipeMap(_.spread(fn), ...args);
  }

  pipe(fn, ...args) {
    const parameters = FunctionPipe.makeParameters(...args);
    const wrapFunc = this.newPipeFunction(fn, ...parameters);
    this.mPromise = this.mPromise.then(wrapFunc);
    return this;
  }

  pipeSpread(fn, ...args) {
    return this.pipe(_.spread(fn), ...args);
  }

  catch(fn, ...args) {
    const parameters = FunctionPipe.makeParameters(...args);
    const func = this.newCatchFunction(fn, ...parameters);
    this.mPromise = this.mPromise.catch(func);
    return this;
  }

  catchThen(fn, ...args) {
    const parameters = FunctionPipe.makeParameters(...args);
    const func = this.newCatchThenFunction(fn, ...parameters);
    this.mPromise = this.mPromise.catch(func);
    return this;
  }

  catchStop(fn, ...args) {
    const parameters = FunctionPipe.makeParameters(...args);
    const func = this.newCatchFunction(fn, ...parameters);
    this.mPromise = this.mPromise.catch((...args2) => {
      const r = func(...args2);
      this.run = false;
      return r;
    });
    return this;
  }

  promise() {
    return this.mPromise
      .then(() => Promise.resolve(_.get(this.mPipeOutBuffer, this.mFunctionNumber + 1, [])[0]))
      .catch(() => Promise.reject(_.get(this.mPipeErrBuffer, this.mCatchNumber + 1, [])[0]));
  }

  static order(...args) {
    return new FpArgumentOrder(...args);
  }

  static out(...args) {
    return new FpOutputPipes(...args);
  }

  static err(...args) {
    return new FpErrorPipes(...args);
  }

  static mapIndex(...args) {
    return new FpMapIndex(...args);
  }

  static lazyImpl(args) {
    return _.map(args, (arg) => {
      if (arg instanceof CallFunctionAsArgument) {
        return arg.fn(...arg.args);
      }
      return arg;
    });
  }

  static pipe(fn, ...args) {
    return new FunctionPipe(fn, ...args);
  }

  static lazy(...args) {
    if (!_.isArray(args) || args.length === 0 || typeof args[0] !== 'function') {
      return args;
    }
    const fn = args.shift();
    return new CallFunctionAsArgument(fn, args);
  }

  static bind(fn, ...args) {
    return _.partial((...inArgs) => {
      const calledArgs = FunctionPipe.lazyImpl(inArgs);
      return fn(...calledArgs);
    }, ...args);
  }

  static bindObj(fn, obj, ...args) {
    return _.bind((...inArgs) => {
      const calledArgs = FunctionPipe.lazyImpl(inArgs);
      return fn(...calledArgs);
    }, obj, ...args);
  }

  static map(fn) {
    return (items, ...args) => Promise.resolve(_.map(items, (item, key) => fn(item, key, ...args)));
  }

  static forEach(fn) {
    return (items, ...args) => {
      _.forEach(items, (item, key) => {
        fn(item, key, ...args);
      });
      return Promise.resolve(items);
    };
  }
}

module.exports = FunctionPipe;
