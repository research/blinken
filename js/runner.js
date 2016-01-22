var vm = require('vm'),
    util = require('util'),
    dgram = require('dgram'),
    bulb = require('./bulb.js'),
    Bulb = bulb.Bulb;

var runId = 0;

// Return alpha scale factor to keep total energy of strand less than max
function getBrightnessScale(lights) {
    var max = 0.55; // empirically determined by red/white alternation test
    var e = 0;
    for (var i=0; i < lights.length; i++) {
        var l = lights[i];
        e += (l.r + l.g + l.b) * l.a / 3;
    }
    e /= lights.length;
    if (e > max) {
        return max / e;
    }
    return 1;
}

function StrandControl(host, port) {
    this.sock = dgram.createSocket('udp4');
    this.host = host;
    this.port = port;
    this.streams = [];
    this.update = function(lights) {
        payload = Array();
        var scale = getBrightnessScale(lights);
        for (var i=0; i < lights.length; i++) {
           payload = payload.concat(lights[lights.length-1-i].strandBytes(scale));
        }
        var packet = Buffer(payload);
        this.sock.send(packet, 0, packet.length, port, host,
	                    function(err, b) {
	                        if (err) { console.log('Network error: ' + err); }
                        });
        for (var i=0; i<this.streams.length; i++) {
            try {
                this.streams[i].send(packet);
            } catch (ex) {
                // remove this stream
                this.streams.splice(i, 1);
                i--;
            }
        }
    };
}
var strand = new StrandControl('141.212.108.242', 1337);

Bulb.prototype.strandBytes = function(scale) {
    function limit(x) {
        return Math.min(1, Math.max(0, x));
    }
    // TODO: We should correct for gamma here, but it interacts
    //       with voltage scaling.
    return [Math.round(scale*limit(this.a)*255),
    Math.round(limit(this.r)*15),
    Math.round(limit(this.g)*15),
    Math.round(limit(this.b)*15)];
};

var currentParams = {}

// Takes the websocket (and assumes a .write/.send function)
exports.addStream = function(res) {
    strand.streams.push(res);
}

exports.getCurrent = function() {
    return currentParams;
}

exports.run = function(params) {
    var myId = ++runId;

    function checkTimeout() {
        if (runId == myId) {
            runId++;
            params.after(0, 'Time\'s up');
        }
    }
    setTimeout(checkTimeout, params.limit*1000);

    params.myId = myId;
    params.start = Date.now()/1000;
    currentParams = params;

    function checkCancel() {
        if (runId == myId)
            if (params.cancel()) {
                runId++;
                params.after(0, 'Canceled');
            } else {
                setTimeout(checkCancel, 100);
            }
    }
    setTimeout(checkCancel, 50);

    var fakeWindow = {};
    fakeWindow.runnerWindow = {};
    fakeWindow.runnerWindow.protect = function(){};
    var WS = require('ws');
    var script, sandbox = {window : fakeWindow, Bulb : Bulb, WebSocket: WS};
    try {
        script = vm.createScript('main = ' + params.code);
        script.runInNewContext(sandbox);
    } catch (e) {
        runId++;
        return params.after(-1, 'Error during compilation: ' + e.toString());
    }

    var lights = Array(100);
    function updateLights() {
        for (var i = 0; i < lights.length; i++) {
            if (typeof lights[i] !== 'object' || lights[i] instanceof Bulb === false) {
                lights[i] = new Bulb();
            }
        }
        strand.update(lights);
    }
    updateLights();

    var step;
    try {
        step = sandbox.main(lights);
    } catch (e) {
        runId++;
        return params.after(-1, 'Error during initialization: ' + e.toString());
    }
    updateLights();

    function runStep() {
        if (runId != myId) {
            return undefined;
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
        updateLights();
        if (typeof delay !== 'number') {
            delay = 30;
        } else if (delay < 0) {
            runId++;
            return params.after(0, 'Completed');
        }
        setTimeout(runStep, delay);
        return undefined;
    }
    if (typeof step !== 'function') {
        runId++;
        return params.after(0, 'Completed');
    }
    runStep();
    return undefined;
};
