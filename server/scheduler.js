var crypto = require('crypto'),
    fs = require('fs'),
    runner = require('./runner.js'),
    https = require('https'),
    vm = require('vm'),
    util = require('util');

var jobs = {};
var queue = [];
var stopTime = 0;

exports.makeJob = function(code, url, title, author) {
    var token = makeToken();
    jobs[token] = {code: code, url: url, title: title, author: author, limit: 120, cancel: false, status: {} };
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
    var wait = stopTime - Date.now()/1000;
    if (wait < 0) {
        wait = 0;
    }
    for (var i=0; i < queue.length; i++) {
        var t = queue[i];
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
        var wait = Math.round(estimateWait(token));
        var m = Math.floor(wait / 60), s = wait - 60*m;
        var out = m + ':';
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
    console.log('Falling back to default idle code')
    fs.readFile(__dirname + '/idle.js', 'utf8', function(err,data) {
        if (err) {
            throw new Error(err);
        }
        callback({code: data, url: 'local', name: 'Circus'});
    });
}
 
function getIdleCode(callback) {
    // Run a program from the gallery to get the metadata and 'run' function from the Blinken object.
    return https.get('https://blinken.org/api/0/random', function(res) {
        let output = '';
        res.on('data', (chunk) => {
            output += chunk;
        });
        res.on('end', () => {
            // output is (hopefully) JSON with code, url, and name members
            // code is (hopefully) some JavaScript, but it uses the Blinken object
            // which is undefined here. So we want to mock up a Blinken object.
            var obj;
            try {
                obj = JSON.parse(output);
                var code = obj.code;
            } catch (e) {
                console.log('JSON parse error: ' + e);
                return runLocalShow(callback);
            }
            var fakeWindow = {};
            fakeWindow.runnerWindow = {};
            fakeWindow.runnerWindow.protect = function(){};
            fakeWindow.onload = function(){};
            var blinken_obj = {};
            function blinken(obj) { 
                if (typeof obj !== 'undefined') {
                    blinken_obj = obj;
                }
            }
            var gotBlinken = false;
            blinken.prototype.run = function(code) {
                gotBlinken = true;
                callback({code: code.toString(), url: blinken_obj.url, name: blinken_obj.name,
                          title: blinken_obj.title, author: blinken_obj.author});
            }
            const sandbox = {window: fakeWindow, Blinken: blinken};
            const options = {timeout: 100,
                             contextCodeGeneration: {
                                 strings: false,
                                 wasm: false
                             }};
            try {
                //console.log('Trying to run:\n' + code.toString());
                vm.createContext(sandbox);
                vm.runInContext(code.toString() + '\nwindow.onload();\n',
                                sandbox, options);
                if (!gotBlinken) {
                    throw new Error('Code did not create a Blinken object')
                }
            } catch (e) {
                if (e.name === 'SyntaxError') {
                    console.log('Syntax error: ' + e.stack);
                    console.log(util.inspect(sandbox));
                }
                console.log('Idle error: ' + e.toString());
                return runLocalShow(callback);
            }
        });
        res.on('error', function(e) { console.log('Got HTTP error: ' + e.message); });
    });
}

function saveCode(code) {
    var uploadPath = __dirname + '/uploads/';
    var hash = crypto.createHash('sha256').update(code).digest('hex');
    console.log('job hash: ' + hash);
    console.log(code);
    files = fs.readdirSync(uploadPath);
    if (files.filter(function(x){return x.search(hash)>=0}).length == 0) {
        fs.writeFileSync(uploadPath + '/' + hash + '.js', code);
    }
}

function scheduler() {
    if (queue.length > 0) {
        var token = queue.shift();
        if (jobs[token].cancel) {
            return scheduler();
        }
        jobs[token].status = {value: 20, message: 'Running'};
        stopTime = Date.now()/1000 + jobs[token].limit;
        saveCode(jobs[token].code);
        return runner.run({ // User program
            code: jobs[token].code,
            url: jobs[token].url,
            idle: false,
            title: jobs[token].title,
            author: jobs[token].author,
            limit: jobs[token].limit,
            cancel: function() { return jobs[token].cancel },
            after: function(status, message) {
                if (status == 0) {
                    jobs[token].status = {value: 0, message: message};
                } else {
                    jobs[token].status = {value: -10, message: message};
                }
                scheduler();
            }
        });
    }
    return getIdleCode( function(idleObj) {
        return runner.run({ // Idle program
            code: idleObj.code,
            url: idleObj.url,
            name: idleObj.name,
            title: idleObj.title,
            author: idleObj.author,
            idle: true,
            limit: 60,
            cancel: function() { return queue.length > 0 },
            after: function(status, message) {
                if (status != 0) {
                    console.log('Error in idle code: ' + message);
                }
                scheduler();
            }
        });
    });
}

scheduler();
