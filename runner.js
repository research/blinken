var vm = require('vm'),
    util = require('util'),
    dgram = require('dgram'),
    bulb = require('./bulb.js'),
    Bulb = bulb.Bulb;

var runId = 0;

function StrandControl(host, port) {
	this.sock = dgram.createSocket('udp4');	
	this.host = host;
	this.port = port;
	this.update = function(lights, callback) {
		payload = Array();
		for (var i=0; i < lights.length; i++) {
			payload = payload.concat(lights[i].strandBytes());
		}
		var packet = Buffer(payload);
		this.sock.send(packet, 0, packet.length, port, host,
					   function(err, b) {
			if (err) { console.log('Network error: ' + err); }
		});
		callback();
	}
}
var strand = new StrandControl('141.212.108.209', 1337);

exports.run = function(params) {
	var myId = ++runId;

	function checkTimeout() {
		if (runId == myId) {
			runId++;
			params.after(0, 'Time\'s up');
		}
	}
	setTimeout(checkTimeout, params.limit*1000);

	function checkCancel() {
		if (runId == myId)
			if (params.cancel()) {
				runId++;
				params.after(0, 'Canceled');
			} else {
				setTimeout(checkCancel, 100);
			}
	}
	setTimeout(checkCancel, 100);

	var fakeWindow = {};
	fakeWindow.runnerWindow = {};
	fakeWindow.runnerWindow.protect = function(){};
	var script, sandbox = {window : fakeWindow};
	try {
		script = vm.createScript('main = ' + params.code);
		script.runInNewContext(sandbox);
	} catch (e) {
		runId++;
		return params.after(-1, 'Error during compilation: ' + e.toString());
	}

	var lights = Array(100);
	function fixLights() {
        for (var i = 0; i < lights.length; i++) {
            if (typeof lights[i] !== 'object' || lights[i] instanceof Bulb === false) {
                lights[i] = new Bulb();
            }
		}
	}

	fixLights();
	var step;
	try {
		step = sandbox.main(lights);
	} catch (e) {
		runId++;
		return params.after(-1, 'Error during initialization: ' + e.toString());
	}
	fixLights();

	function runStep() {
		if (runId != myId) {
			return;
		}
	        for (var i = 0; i < 100; i++) {
	            if (typeof lights[i] !== 'object' || lights[i] instanceof Bulb === false) {
                	lights[i] = new Bulb();
        	    }	
		}
		var delay;
		try {
			delay = step(lights);
		} catch (e) {
			runId++;
			return params.after(-1, 'Error in step function: ' + e.toString());
		}
		fixLights();
		strand.update(lights, function(){
			if (typeof delay !== 'number') {
		            delay = 30;
			} else if (delay < 0) {
				runId++;
				return params.after(0, 'Completed');
			}
			setTimeout(runStep, delay);
		});
	}
	runStep();
	return 0;
}
