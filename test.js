

const _ = require('lodash');
const { expect } = require('chai');

const fp = require('./function-pipe.js');

const DB = {
  queryByName: name => new Promise((resolve, reject) => {
    if (name === 'Andy') {
      resolve({ name: 'Andy', email: 'test@gmail.com', joinDate: '2000/01/01' });
    } else if (name === 'Dana') {
      resolve({ name: 'Dana', email: 'dana@gmail.com', joinDate: '2001/01/01' });
    } else {
      reject(new Error('user not found'));
    }
  }),
  scanName: () => new Promise((resolve) => {
    resolve({
      items: [
        { name: 'Andy' },
        { name: 'Dana' },
      ],
    });
  }),
};

const Utils = {
  checkPath: (obj, path) => {
    if (_.has(obj, path)) {
      return Promise.resolve();
    }
    return Promise.reject();
  },
  parseJSON: (str) => {
    try {
      return Promise.resolve(JSON.parse(str));
    } catch (e) {
      return Promise.reject(e);
    }
  },
  isEqual: (a, b) => {
    if (a === b) {
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  },
};

const event = {
  headers: {
    token: 'token-1234',
  },
  pathParameters: {
    userId: 'user-1234',
  },
  body: '{"name": "Andy", "age": 18}',
};

describe('Function Pipe Test', () => {
  it('fp.pipe should chain promise function', (done) => {
    fp
      .pipe(fp.bind(Utils.checkPath, event, 'body'))
      .pipe(fp.bind(Utils.parseJSON, event.body))
      .pipe((body) => {
        expect(body.name).to.equal('Andy');
        expect(body.age).to.equal(18);
        done();
      });
  });
  it('fp.pipe should mutiple chain promise function', (done) => {
    fp
      .pipe(fp.bind(Utils.checkPath, event, 'body'))
      .pipe(fp.bind(Utils.parseJSON, event.body))
      .pipe((body) => {
        expect(body.name).to.equal('Andy');
        expect(body.age).to.equal(18);
        // direct return a value is OK, it will be wappered by Promise
        return (body.age + 100);
      })
      .pipe((newAge) => {
        expect(newAge).to.equal(118);
        done();
      });
  });
  it('fp.catch should catch promise exception', (done) => {
    fp
      .pipe(fp.bind(Utils.checkPath, event, 'not_exist_path'))
      .pipe(fp.bind(Utils.parseJSON, event.body))
      .pipe(() => {
        // not run
      })
      .catch((e) => {
        expect(e).to.equal(undefined);
        done();
      });
  });
  it('fp.out fp.bind(_) should pipe out to next second function', (done) => {
    fp
      .pipe(fp.bind(Utils.checkPath, event, 'body'))
      .pipe(fp.bind(Utils.parseJSON, event.body), fp.out(1, 3)) // pipe to next 1 and 3 function
      .pipe(body => body.name)
      .pipe(fp.bind(DB.queryByName, _)) // lodash bind _ (body)
      .pipe((body, user) => {
        expect(body.age).to.equal(18);
        expect(user.email).to.equal('test@gmail.com');
        done();
      });
  });
  it('fp.pipeMap shoule pipe array values', (done) => {
    fp
      .pipe(fp.bind(DB.scanName))
      .pipe(result => result.items)
      .pipeMap(item => item.name)
      .pipeMap(fp.bind(DB.queryByName, _))
      .pipe((results) => {
        expect(results.length).to.equal(2);
        expect(results[0].email).to.equal('test@gmail.com');
        expect(results[1].email).to.equal('dana@gmail.com');
        done();
      });
  });
  it('fp.mapIndex shoule pipe array values', (done) => {
    fp
      .pipe(fp.bind(Utils.parseJSON, event.body))
      .pipe(body => body.name, fp.out(4))
      .pipe(fp.bind(DB.scanName))
      .pipe(result => result.items)
      .pipeMap(item => item.name)
      // ('Andy', ['Andy', 'Dana']), param 1 from body, param 2 from scanName
      .pipeMap(fp.bind(Utils.isEqual, _, _), fp.mapIndex(1)) // pipe map ['Andy', 'Dana']
      .pipe((results) => {
        expect(results.length).to.equal(2);
        expect(results[0]).to.equal(true);
        expect(results[1]).to.equal(false);
        done();
      });
  });
  it('fp.pipeSpread shoule spread array to function arguments', (done) => {
    fp
      .pipe(fp.bind(Utils.parseJSON, event.body))
      .pipe(body => body.name, fp.out(3))
      .pipe(fp.bind(DB.queryByName, 'Andy'), fp.out(2))
      .pipe(fp.bind(DB.queryByName, 'Dana'), fp.out(1))
      // (bodyName, andy, dane) to (dana, bodyName, andy)
      .pipe((dana, bodyName, andy) => {
        expect(andy.name).to.equal('Andy');
        expect(dana.name).to.equal('Dana');
        expect(bodyName).to.equal('Andy');
        done();
      }, fp.order(2, 0, 1)); // reorder parameters
  });
});
