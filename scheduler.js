var crypto = require('crypto'),
    fs = require('fs'),
    runner = require('./runner.js');

var jobs = {};
var queue = [];

exports.makeJob = function(code) {
	var token = makeToken();
	jobs[token] = {code: code, cancel: false, status: {} };
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

exports.getStatus = function(token) {
	if (typeof jobs[token] === 'undefined') {
		return undefined;
	}
	return jobs[token].status;
};

function makeToken() {
	return crypto.randomBytes(16).toString('hex');
}

function getIdleCode(callback) {
	return fs.readFile(__dirname + '/static/idle.js', 'utf8', function(err,data) {
		if (err) {
			throw new Error(err);
		}
		callback(data);
	});
}

function scheduler() {
	if (queue.length > 0) {
		var token = queue.shift();
		if (jobs[token].cancel) {
			return scheduler();
		}
		jobs[token].status = {value: 20, message: 'Running'};
		console.log(jobs[token].code);
		return runner.run({ // User program
			code: jobs[token].code,
			limit: 120,
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
	return getIdleCode(function(idleCode){
		return runner.run({ // Idle program
			code: idleCode,
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
