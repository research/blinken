//
// Blinken simulator (jhalderm 2013-12)
//

class Blinken {
  constructor(obj) { // {title, author}
    if (typeof obj === 'undefined') {
      obj = {};
    }
    this.title = obj.title;
    this.author = obj.author;
    this.simulator = new Simulator(this, document.body);
  }

  run(code) {
    return this.simulator.execStart(code);
  }

  stop() {
    return this.simulator.execStop();
  }
}

class Simulator {
  constructor(blinken, target) {
    this.blinken = blinken;
    this.published = false;
    this.token = undefined;
    this.apiPath = 'https://blinken.org/api/0';
    this.runId = 0;

    this.render(target);

    window.onbeforeunload = () => {
      this.cancelJob(true);
    };
  }

  render(target) {
    // Create and style our environment
    const view = document.createElement('div');
    const scale = document.createElement('div');
    const world = document.createElement('div');
    const floor = document.createElement('div');
    const send = document.createElement('button');
    view.appendChild(scale);
    scale.appendChild(world);
    world.appendChild(floor);
    view.appendChild(send);

    view.style.cssText = `
      position: absolute;
      left: 0; right: 0; bottom: 0; top: 0;
      overflow: hidden;
      user-select: none;
      perspective: 2048px;
      background-color: rgb(240, 240, 240);
    `;
    scale.style.cssText = `
      position: absolute;
      width: 512px; height: 512px;
      left: 50%; top: 50%;
      margin-left: -256px; margin-top: -256px;
      transform-style: preserve-3d;
    `;
    world.style.cssText = `
      position: absolute;
      width: 512px; height: 512px;
      left: 50%; top: 50%;
      margin-left: -256px; margin-top: -256px;
      transform-style: preserve-3d;
    `;
    floor.style.cssText = `
      position: absolute;
      width: 768px; height: 768px;
      left: -128px; top: -128px;
      transform-style: preserve-3d;
      background-color: rgba(200, 200, 200, .5);
      transform: translateZ(-768px);
    `;
    send.style.cssText = `
      margin-top: 10px;
      margin-left: 10px;
      padding: 5px 10px;
      font-family: Helvetica, Arial, FreeSans, sans-serif;
      font-size: 15px;
    `;
    send.innerText = 'Run on Stairs';
    send.disabled = true;
    target.append(view);
    this.send = send;

    // Let there be lights
    const createLight = (n) => {
      const div = document.createElement('div');
      const x = Math.sin(n / 100 * 6 * Math.PI) * 256;
      const y = Math.cos(n / 100 * 6 * Math.PI) * 256;
      const z = (n - 50) * 15;
      div.style.cssText = `
        left: 256px; top: 256px;
        transform-style: preserve-3d;
        position: absolute;
        transform:
          translate3d(${x.toFixed(4)}px,${y.toFixed(4)}px,${z.toFixed(4)}px);
      `;
      world.appendChild(div);
      const light = document.createElement('div');
      light.style.cssText = `
        position: absolute;
        background-color: rgba(127, 127, 127, 0.5);
        width: 20px; height: 20px;
        border-radius: 10px;
        border: 0.05px solid black;
        margin-left: -10px; margin-top: -10px;
      `;
      div.appendChild(light);
      return light;
    };
    this.objects = [];
    for (let i = 0; i < 100; i++) {
      this.objects.push(createLight(i));
    }

    // Scale world to window
    const setScale = () => {
      const s = view.clientHeight / (4 * world.clientHeight);
      scale.style.transform =
        `scale(${s.toFixed(4)}, ${s.toFixed(4)})`;
    };
    setScale();
    window.onresize = () => {
      setScale();
    };

    // Position the world
    let worldXAngle = 90;
    let worldZAngle = 0;
    let depth = 0;
    const updateView = () => {
      world.style.transform = `
        translateZ(${depth.toFixed(4)}px)
        rotateX(${worldXAngle.toFixed(4)}deg)
        rotateZ(${worldZAngle.toFixed(4)}deg)
      `;
      for (let i = 0; i < 100; i++) {
        this.objects[i].style.transform = `
          rotateZ(${(-worldZAngle).toFixed(4)}deg)
          rotateX(${(-worldXAngle).toFixed(4)}deg)
        `;
      }
    };
    updateView();

    // Change position on mouse events
    let startX = 0;
    let startY = 0;
    let startXAngle = 0;
    let startZAngle = 0;
    let moving = false;
    view.onmousedown = (e) => {
      if (e.which == 1) {
        startX = e.pageX;
        startY = e.pageY;
        startXAngle = worldXAngle;
        startZAngle = worldZAngle;
        moving = true;
      }
    };
    view.onmousemove = (e) => {
      if (moving && e.which == 1) {
        worldZAngle = startZAngle -
          (((e.pageX - startX) / view.clientWidth)) * 180;
        worldXAngle = startXAngle -
          (((e.pageY - startY) / view.clientHeight)) * 180;
        worldXAngle = Math.max(Math.min(worldXAngle, 180), 0);
        updateView();
      }
    };
    view.onmouseup = (e) => {
      moving = false;
    };
    view.onwheel = (e) => {
      if (e.originalEvent.wheelDeltaY) {
        depth += e.originalEvent.wheelDeltaY;
      } else {
        depth -= e.originalEvent.deltaY * 15;
      }
      updateView();
    };
  }

  execStart(code) {
    this.runId++;
    this.send.onclick = () => {
      this.publish(code);
    };
    const myId = this.runId;
    const lights = Array(100);
    const updateLights = () => {
      for (let i = 0; i < lights.length; i++) {
        if (typeof lights[i] !== 'object' ||
            lights[i] instanceof Bulb === false) {
          lights[i] = new Bulb();
        }
        this.objects[i].style.backgroundColor = lights[i].cssColor();
      }
    };
    updateLights();

    let step;
    try {
      step = code(lights);
    } catch (e) {
      this.send.innerText = 'Error (see console)';
      throw e;
    }
    updateLights();
    if (typeof step !== 'function') {
      this.runId++;
      return;
    }

    const animate = () => {
      let delay;
      try {
        delay = step(lights);
      } catch (e) {
        this.send.innerText = 'Error (see console)';
        throw e;
      }
      updateLights();
      this.send.disabled = false;
      if (typeof delay !== 'number') {
        delay = 30;
      } else if (delay < 0) {
        this.runId++;
        return;
      }
      if (myId == this.runId) {
        setTimeout( () => {
          animate();
        }, delay);
      }
    };
    animate();
  }

  execStop() {
    this.runId++;
  }

  _ajaxHelper(method, url, callback, data) {
    const request = new XMLHttpRequest();
    request.open(method, url, true);
    if (typeof data === 'object') {
      request.setRequestHeader('Content-type', 'application/json');
      data = JSON.stringify(data);
    } else if (typeof data === 'undefined') {
      data = null;
    }
    request.onload = () => {
      if (request.status >= 200 && request.status < 400) {
        if (typeof callback === 'function') {
          callback(request.response);
        }
      } else {
        this.send.innerText = 'Server error: ' + request.status;
      }
    };
    request.onerror = () => {
      this.send.innerText = 'AJAX failure';
    };
    request.send(data);
  }

  checkStatus() {
    this._ajaxHelper('GET', this.apiPath + '/status/' + this.token, (data) => {
      const res = JSON.parse(data);
      if (res.value > 0) {
        this.send.innerText = res.message;
        setTimeout( () => {
          this.checkStatus();
        }, 500);
      } else if (res.value == 0) {
        this.send.innerText = res.message + '.  Run again?';
        this.published = false;
      } else {
        this.send.innerText = res.message;
        this.published = false;
      }
    });
  }

  publishJob(code) {
    this.published = true;
    this.send.innerText = 'Sending';
    this._ajaxHelper('POST', this.apiPath + '/publish', (data) => {
      this.send.innerText = 'Sent';
      this.token = data;
      setTimeout(() => {
        this.checkStatus();
      }, 50);
    }, {
      code: code.toString(),
      url: document.location.toString(),
      title: this.blinken.title, author: this.blinken.author,
    });
  }

  cancelJob(sync) {
    if (typeof this.token !== 'undefined') {
      this.send.innerText = 'Canceling';
      if (sync) {
        (new Image(0, 0)).src = this.apiPath + '/cancel/' + this.token;
      } else {
        this._ajaxHelper('POST', this.apiPath + '/cancel/' + this.token);
      }
    }
  }

  publish(code) {
    if (!this.published) {
      this.publishJob(code);
    } else {
      this.cancelJob();
    }
  }
}

// //////////////////////////////////////////////////////////
//
// Class to represent and manipulate a bulb
//

class Bulb {
  /** Create a Bulb:
      new Bulb();
      new Bulb(existingBulb);
      new Bulb(r,g,b);
      new Bulb(r,g,b,a); **/
  constructor(w, x, y, z) {
    this.gamma = 0.33;
    this.clear();
    if (typeof w === 'object' && w instanceof Bulb &&
        typeof x === 'undefined' &&
        typeof y === 'undefined' &&
        typeof z === 'undefined') {
      this.copy(w);
    } else if (typeof w === 'number' &&
               typeof x === 'number' &&
               typeof y === 'number') {
      this.r = w;
      this.g = x;
      this.b = y;
      if (typeof z === 'number') {
        this.a = z;
      }
    }
  }

  // Reset bulb
  clear() {
    this.r = 0; this.g = 0; this.b = 0; this.a = 1;
  };

  // You can set color channels and overall brightness ("alpha") directly.
  // Range is 0-1, e.g.:
  //   this.r = 0;
  //   this.g = 0;
  //   this.b = 0;
  //   this.a = 1;

  // Set light color: rgb(r,g,b)
  rgb(r, g, b) {
    return this.rgba(r, g, b, 1);
  };

  // Set light color with alpha: rgba(r,g,b,a)
  rgba(r, g, b, a) {
    this.r = _limit(r);
    this.g = _limit(g);
    this.b = _limit(b);
    this.a = _limit(a);
    return this;
  };

  // Set to the state of another bulb
  copy(bulb) {
    if (typeof bulb === 'object' && bulb instanceof Bulb) {
      this.r = bulb.r;
      this.g = bulb.g;
      this.b = bulb.b;
      this.a = bulb.a;
    }
  };

  // Add color of another bulb to this one
  add(bulb) {
    if (typeof bulb === 'object' && bulb instanceof Bulb) {
      this.r = _limit(this.r + bulb.r);
      this.g = _limit(this.g + bulb.g);
      this.b = _limit(this.b + bulb.b);
      this.a = _limit(this.a + bulb.a);
    }
    return this;
  };

  // Convenience functions for simple colors
  black() {
    this.r = 0; this.g = 0; this.b = 0; return this;
  };
  red() {
    this.r = 1; this.g = 0; this.b = 0; return this;
  };
  green() {
    this.r = 0; this.g = 1; this.b = 0; return this;
  };
  blue() {
    this.r = 0; this.g = 0; this.b = 1; return this;
  };
  cyan() {
    this.r = 0; this.g = 1; this.b = 1; return this;
  };
  purple() {
    this.r = 1; this.g = 0; this.b = 1; return this;
  };
  yellow() {
    this.r = 1; this.g = 1; this.b = 0; return this;
  };
  white() {
    this.r = 1; this.g = 1; this.b = 1; return this;
  };

  // Preview color for the website
  cssColor() {
    return 'rgb(' +
      Math.round(Math.pow(_limit(this.a) * _limit(this.r),
          this.gamma) * 255) + ',' +
      Math.round(Math.pow(_limit(this.a) * _limit(this.g),
          this.gamma) * 255) + ',' +
      Math.round(Math.pow(_limit(this.a) * _limit(this.b),
          this.gamma) * 255) + ')';
  };
}

function _limit(x) {
  return Math.min(1, Math.max(0, x));
}

if (typeof exports !== 'undefined') {
  exports.Bulb = Bulb;
}

