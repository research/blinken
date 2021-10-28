const vm = require('vm');
const fs = require('fs');
const dgram = require('dgram');
const bulb = require('./bulb.js');
const Bulb = bulb.Bulb;

let runId = 0;

// Return alpha scale factor to keep total energy of strand less than max
function getBrightnessScale(lights) {
  const max = 0.55; // empirically determined by red/white alternation test
  let e = 0;
  for (let i=0; i < lights.length; i++) {
    const l = lights[i];
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
    payload = [];
    ws2812payload = [];
    const scale = getBrightnessScale(lights);
    for (let i=0; i < lights.length; i++) {
      payload = payload.concat(lights[lights.length-1-i].strandBytes(scale));
      ws2812payload = payload.concat(lights[lights.length-1-i].strandBytesWs2812(scale));
    }
    const packet = Buffer.from(payload);
    this.sock.send(packet, 0, packet.length, this.port, this.host,
        function(err, b) {
          if (err) {
            console.log('Network error: ' + err);
          }
        });
    const ws2812packet = Buffer.from(payload);
    for (let i=0; i<this.streams.length; i++) {
      try {
        this.streams[i].send(ws2812packet);
      } catch (ex) {
        // remove this stream
        this.streams.splice(i, 1);
        i--;
      }
    }
  };
}

// use stored IP address from strandIpFile
const strandIpFile = __dirname + '/strand-ip.conf';
let strandIp = '127.0.0.1';
try {
  strandIp = fs.readFileSync(strandIpFile, 'utf8');
} catch (e) {
  console.log(e);
}
const strand = new StrandControl(strandIp, 1337);

// dynamically update strand IP and store for restart
exports.setStrandHost = function(host) {
  strand.host = host;
  fs.writeFileSync(strandIpFile, host);
};

// Pi strand is 8-bit alpha, 12-bit rgb (4 bit each color)
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

// WS2812 has 24-bit rgb (8 bit each color), no alpha
Bulb.prototype.strandBytesWs2812 = function(scale) {
    function limit(x) {
        return Math.min(1, Math.max(0,x));
    }
    //scale = scale*limit(this.a);
    scale = limit(this.a);
    return [0,   // Could delete, but sending 32-bits is nice for clients
        Math.round(limit(this.r*scale)*255),
        Math.round(limit(this.g*scale)*255),
        Math.round(limit(this.b*scale)*255)];
};

let currentParams = {};

// Takes the websocket (and assumes a .write/.send function)
exports.addStream = function(res) {
  strand.streams.push(res);
};

exports.getCurrent = function() {
  return currentParams;
};

exports.run = function(params) {
  const myId = ++runId;

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
    if (runId == myId) {
      if (params.cancel()) {
        runId++;
        params.after(0, 'Canceled');
      } else {
        setTimeout(checkCancel, 100);
      }
    }
  }
  setTimeout(checkCancel, 50);

  const fakeWindow = {};
  fakeWindow.runnerWindow = {};
  fakeWindow.runnerWindow.protect = function() {};
  fakeWindow.runnerWindow.protect.protect = function() {
    return false;
  };
  const WS = require('ws');
  const lights = Array(100);
  const sandbox = {window: fakeWindow, Bulb: Bulb,
    WebSocket: WS, ___lights: lights};
  const options = {timeout: 100,
    contextCodeGeneration: {
      strings: false,
      wasm: false,
    }};
  try {
    vm.createContext(sandbox);
    vm.runInContext('___main=' + params.code, sandbox, options);
  } catch (e) {
    runId++;
    console.log('Error during compilation: ' + e.message);
    return params.after(-1, 'Error during compilation: ' + e.message);
  }

  function updateLights() {
    for (let i = 0; i < lights.length; i++) {
      if (typeof lights[i] !== 'object' ||
          lights[i] instanceof Bulb === false) {
        lights[i] = new Bulb();
      }
    }
    strand.update(lights);
  }
  updateLights();

  try {
    vm.runInContext('var ___step=___main(___lights);', sandbox, options);
  } catch (e) {
    runId++;
    console.log('Error during initialization: ' + e.message);
    return params.after(-1, 'Error during initialization: ' + e.message);
  }
  updateLights();

  function runStep() {
    if (runId != myId) {
      return undefined;
    }
    for (let i = 0; i < lights.length; i++) {
      if (typeof lights[i] !== 'object' ||
          lights[i] instanceof Bulb === false) {
        lights[i] = new Bulb();
      }
    }
    let delay;
    try {
      delay = vm.runInContext('___step(___lights);', sandbox, options);
    } catch (e) {
      runId++;
      console.log('Error during step function: ' + e.message);
      return params.after(-1, 'Error in step function: ' + e.message);
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
  runStep();
  return undefined;
};
