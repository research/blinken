const crypto = require('crypto');
const fs = require('fs');
const runner = require('./runner.js');
const https = require('https');
const vm = require('vm');
const util = require('util');

const jobs = {};
const queue = [];
let stopTime = 0;

exports.makeJob = function(code, url, title, author) {
  const token = makeToken();
  jobs[token] = {code: code, url: url, title: title, author: author, limit: 120,
    cancel: false, status: {}};
  return token;
};

exports.queueJob = function(token) {
  if (typeof jobs[token] === 'undefined') {
    return;
  }
  jobs[token].status = {value: 10, message: 'Queued'};
  jobs[token].cancel = false;
  queue.push(token);
};

exports.cancelJob = function(token) {
  if (typeof jobs[token] === 'undefined') {
    return;
  }
  jobs[token].cancel = true;
  jobs[token].status = {value: 0, message: 'Canceled'};
};

exports.getTimeLeft = function() {
  return stopTime - Date.now()/1000;
};

exports.setTimeLeft = function(limit) {
  stopTime = Date.now()/1000 + limit;
};

function estimateWait(token) {
  if (typeof jobs[token] === 'undefined') {
    return undefined;
  }
  let wait = stopTime - Date.now()/1000;
  if (wait < 0) {
    wait = 0;
  }
  for (let i=0; i < queue.length; i++) {
    const t = queue[i];
    if (t == token) {
      break;
    }
    if (!jobs[t].cancel) {
      wait += jobs[t].limit;
    }
  }
  return wait;
}

exports.getStatus = function(token) {
  if (typeof jobs[token] === 'undefined') {
    return undefined;
  }
  if (jobs[token].status.value == 10) {
    // estimate time left in queue
    const wait = Math.round(estimateWait(token));
    const m = Math.floor(wait / 60); const s = wait - 60*m;
    let out = m + ':';
    if (s < 10) {
      out += '0';
    }
    out += s;
    jobs[token].status.message = 'Queued (' + out + ')';
  }
  return jobs[token].status;
};

function makeToken() {
  return crypto.randomBytes(16).toString('hex');
}

function runLocalShow(callback) {
  console.log('Falling back to default idle code');
  fs.readFile(__dirname + '/idle.js', 'utf8', function(err, data) {
    if (err) {
      throw new Error(err);
    }
    callback({code: data, title: 'Circus'});
  });
}

function getIdleCode(callback) {
  // Run a program from the gallery to get the metadata and 'run'
  // function from the Blinken object.
  return https.get('https://blinken.org/api/0/random', function(res) {
    let output = '';
    if (res.statusCode != 200) {
      console.log('Failed to get random show: HTTP ' + res.statusCode +
                  ' (is the gallery running?)');
      return runLocalShow(callback);
    }
    res.on('data', (chunk) => {
      output += chunk;
    });
    res.on('end', () => {
      // output is (hopefully) JSON with code, url, and name members
      // code is (hopefully) some JavaScript, but it uses the Blinken object
      // which is undefined here. So we want to mock up a Blinken object.
      let galleryObj;
      let code;
      try {
        galleryObj = JSON.parse(output);
        code = galleryObj.code;
      } catch (e) {
        console.log('JSON parse error: ' + e);
        return runLocalShow(callback);
      }
      const fakeWindow = {};
      fakeWindow.runnerWindow = {};
      fakeWindow.runnerWindow.protect = function() {};
      fakeWindow.onload = function() {};
      let blinkenObj = {};
      function blinken(obj) {
        if (typeof obj !== 'undefined') {
          blinkenObj = obj;
        }
      }
      let blinkenCode;
      blinken.prototype.run = function(code) {
        blinkenCode = code.toString();
      };
      const sandbox = {window: fakeWindow, Blinken: blinken};
      const options = {timeout: 100,
        contextCodeGeneration: {
          strings: false,
          wasm: false,
        }};
      try {
        vm.createContext(sandbox);
        vm.runInContext(code.toString() + '\nwindow.onload();\n',
            sandbox, options);
        if (!blinkenCode) {
          throw new Error('Code did not create a Blinken object');
        }
        let title = blinkenObj.title;
        if (!title) {
          title = galleryObj.title;
        }
        if (!title) {
          title = 'Untitled';
        }
        return callback({code: blinkenCode, url: galleryObj.url,
          title: title, author: blinkenObj.author});
      } catch (e) {
        if (e.name === 'SyntaxError') {
          console.log('Syntax error: ' + e.stack);
          console.log(util.inspect(sandbox));
        }
        console.log('Idle error: ' + e.toString());
        return runLocalShow(callback);
      }
    });
    res.on('error', function(e) {
      console.log('Got HTTP error: ' + e.message);
      return runLocalShow(callback);
    });
  }).on('error', function(e) {
    console.log('Got HTTP error: ' + e.message);
    return runLocalShow(callback);
  });
}

function safeHash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function saveCode(code) {
  const uploadPath = __dirname + '/uploads/';
  const hash = safeHash(code);
  console.log('job hash: ' + hash);
  files = fs.readdirSync(uploadPath);
  if (files.filter(function(x) {
    return x.search(hash)>=0;
  }).length == 0) {
    fs.writeFileSync(uploadPath + '/' + hash + '.js', code);
  }
}

function scheduler() {
  if (queue.length > 0) {
    const token = queue.shift();
    if (jobs[token].cancel) {
      return scheduler();
    }
    jobs[token].status = {value: 20, message: 'Running'};
    stopTime = Date.now()/1000 + jobs[token].limit;
    saveCode(jobs[token].code);
    if (!jobs[token].title) {
      // TODO: Some gallery shows don't define a title in the
      // Blinken object, but they do have a name in the Reddit
      // post. We used to cache the URLs when retrieving idle
      // shows from the Gallery and try to match them to the
      // mangled URLs in referers, but the code was a huge mess.
      // An alternative would be to correct the older gallery
      // samples, if possible.
      jobs[token].title = 'Untitled';
    }
    return runner.run({ // User program
      code: jobs[token].code,
      url: jobs[token].url,
      idle: false,
      title: jobs[token].title,
      author: jobs[token].author,
      limit: jobs[token].limit,
      cancel: function() {
        return jobs[token].cancel;
      },
      after: function(status, message) {
        if (status == 0) {
          jobs[token].status = {value: 0, message: message};
        } else {
          jobs[token].status = {value: -10, message: message};
        }
        scheduler();
      },
    });
  }
  return getIdleCode( function(idleObj) {
    return runner.run({ // Idle program
      code: idleObj.code,
      url: idleObj.url,
      title: idleObj.title,
      author: idleObj.author,
      idle: true,
      limit: 60,
      cancel: function() {
        return queue.length > 0;
      },
      after: function(status, message) {
        if (status != 0) {
          console.log('Error in idle code: ' + message);
        }
        scheduler();
      },
    });
  });
}

scheduler();
