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
    fs.readFile(__dirname + '/idle.js', 'utf8', function(err,data) {
        if (err) {
            throw new Error(err);
        }
        callback({code: data, url: 'local', name: 'Circus'});
    });
}
 

function getIdleCode(callback) {

    return https.get('https://blinken.org/gallery/random', function(res) {
        res.on('data', function(output) { 
            //output is (hopefully) json with code, url, and name members
            // code is (hopefully) some javascript, but it uses the Blinken object
            // which is undefined here. So we want to mock up a blinken object

            var obj;
            try {
                obj = JSON.parse(output);
                var code = obj.code;
            } catch (e) {
                console.log("JSON parse error: " + e);
                runLocalShow(callback);
                return;
            }
            var fakeWindow = {};
            fakeWindow.runnerWindow = {};
            fakeWindow.runnerWindow.protect = function(){};
            fakeWindow.onload = function(){};
            var blinken_obj = {};
            function blinken(obj) { 
                if (typeof obj !== "undefined") {
                    blinken_obj = obj;
                }
            }
            blinken.prototype.run = function(lights) {
                console.log('running');
                callback({code: lights.toString(), url: obj.url, name: obj.name, title: blinken_obj.title, author: blinken_obj.author});
            }
            var script, sandbox = {window : fakeWindow, Blinken: blinken};
            try {
                console.log('trying to run: ');
                console.log(code.toString());
                if (code.toString() == '') {
                    runLocalShow(callback);
                    return;
                }
                //script = vm.createScript('main = ' + code.toString());
                script = vm.createScript(code.toString() + "\nwindow.onload();\n");
                script.runInNewContext(sandbox);
            } catch (e) {
                if (e.name === "SyntaxError") {
                    console.log('Syntax error: ' + e.stack);
                    console.log(util.inspect(sandbox));
                }
                console.log("Idle error: (falling back to circus) " + e.toString());
                
                runLocalShow(callback);
           }
        });

        res.on('error', function(e) { console.log("Got error: " + e.message); });
    }).on('error', function(e) { console.log("Got GET error: " + e.message); });


    /*
    return fs.readFile(__dirname + '/static/idle.js', 'utf8', function(err,data) {
        if (err) {
            throw new Error(err);
        }
        callback(data);
    });
    */
}

function saveCode(code) {
    var uploadPath = __dirname + '/uploads/';
    var hash = crypto.createHash('sha1').update(code).digest('hex');
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
    return getIdleCode(function(idleObj){
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
