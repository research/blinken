// Source for /client.js, the library that shows written outside this site
// (for example on jsbin) load with a <script> tag. It defines two globals:
//
//   Bulb     one light (from bulb.js)
//   Blinken  runs a show in a full-window simulator, with a button to
//            run it on the real stairs:
//
//     const b = new Blinken({title: 'My Show', author: 'Me'});
//     b.run((lights) => {
//       // set up the lights, then return a step function
//       return (lights) => 30;  // ms until the next step
//     });
//
// Build with `npm run build:vendor` in server/.

/* global Bulb */
import {Stairs, NUM_LIGHTS} from './stairs.js';

// Talk to the server this script was loaded from
const API = new URL('/api/0', document.currentScript?.src ||
  'https://blinken.org/').href;

class Blinken {
  constructor({title, author} = {}) {
    this.title = title;
    this.author = author;
    this.simulator = new Simulator(this, document.body);
  }

  run(code) {
    return this.simulator.start(code);
  }

  stop() {
    return this.simulator.stop();
  }
}

class Simulator {
  constructor(blinken, target) {
    this.blinken = blinken;
    this.runId = 0;
    this.token = null;     // the show's job on the stairs, if any
    this.published = false;
    this.render(target);
    window.addEventListener('pagehide', () => this.cancelJob(true));
  }

  render(target) {
    const view = document.createElement('div');
    view.style.cssText = 'position: absolute; inset: 0;';
    target.append(view);
    this.stairs = new Stairs(view);

    const button = document.createElement('button');
    button.style.cssText = `
      position: absolute; top: 10px; left: 10px; z-index: 1;
      padding: 5px 10px;
      font: 15px Helvetica, Arial, FreeSans, sans-serif;
    `;
    button.textContent = 'Run on Stairs';
    button.disabled = true;
    view.append(button);
    this.button = button;
  }

  setText(text) {
    this.button.textContent = text;
  }

  start(code) {
    const myId = ++this.runId;
    this.button.onclick = () => this.publishOrCancel(code);

    const lights = new Array(NUM_LIGHTS);
    const frame = new Float32Array(NUM_LIGHTS * 4);
    const show = () => {
      for (let i = 0; i < NUM_LIGHTS; i++) {
        if (!(lights[i] instanceof Bulb)) {
          lights[i] = new Bulb();
        }
        const l = lights[i];
        frame.set([l.r, l.g, l.b, l.a], i * 4);
      }
      this.stairs.setFrame(frame);
    };
    show();

    let step;
    try {
      step = code(lights);
    } catch (e) {
      this.setText('Error (see console)');
      throw e;
    }
    show();
    if (typeof step !== 'function') {
      return;
    }

    const animate = () => {
      if (myId !== this.runId) {
        return;
      }
      let delay;
      try {
        delay = step(lights);
      } catch (e) {
        this.setText('Error (see console)');
        throw e;
      }
      show();
      this.button.disabled = false;
      if (typeof delay !== 'number') {
        delay = 30;
      } else if (delay < 0) {
        return;
      }
      setTimeout(animate, delay);
    };
    animate();
  }

  stop() {
    this.runId++;
  }

  async request(method, path, body) {
    let res;
    try {
      res = await fetch(API + path, {
        method,
        headers: body ? {'Content-Type': 'application/json'} : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      this.setText('Network error');
      throw e;
    }
    const text = await res.text();
    if (!res.ok) {
      // The server explains why it refused a show (such as an error in it)
      this.setText(res.status === 400 && text ? text :
        `Server error: ${res.status}`);
      throw new Error(text);
    }
    return text;
  }

  publishOrCancel(code) {
    if (this.published) {
      this.cancelJob();
    } else {
      this.publish(code);
    }
  }

  async publish(code) {
    this.published = true;
    this.setText('Sending');
    try {
      this.token = await this.request('POST', '/publish', {
        code: code.toString(),
        url: location.href,
        title: this.blinken.title,
        author: this.blinken.author,
      });
    } catch (e) {
      this.published = false;
      return;
    }
    this.setText('Sent');
    this.checkStatus();
  }

  async checkStatus() {
    const token = this.token;
    let status;
    try {
      status = JSON.parse(await this.request('GET', `/status/${token}`));
    } catch (e) {
      this.published = false;
      return;
    }
    if (token !== this.token) {
      return;
    }
    if (status.value > 0) {
      this.setText(status.message);
      setTimeout(() => this.checkStatus(), 500);
    } else {
      this.setText(status.value === 0 ?
        `${status.message}.  Run again?` : status.message);
      this.published = false;
      this.token = null;
    }
  }

  // When the page is closing, use a beacon, which outlives the page
  cancelJob(closing = false) {
    if (!this.token) {
      return;
    }
    const url = `${API}/cancel/${this.token}`;
    if (closing) {
      navigator.sendBeacon(url);
      return;
    }
    this.setText('Canceling');
    this.request('POST', `/cancel/${this.token}`).catch(() => {});
  }
}

window.Blinken = Blinken;
