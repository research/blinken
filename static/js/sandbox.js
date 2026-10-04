// Runs shows in the browser, isolated from this page. See sandbox-frame.js.
//
//   const sandbox = new Sandbox();
//   const run = sandbox.run(code, {
//     started({title, author, animated, frame}) {},
//     frame(frame) {},
//     log(level, text) {},
//     error(message) {},
//     done() {},
//   });
//   run.stop();

let nextId = 1;

export class Sandbox {
  constructor() {
    this.handlers = new Map();
    this.iframe = document.createElement('iframe');
    this.iframe.setAttribute('sandbox', 'allow-scripts');
    this.iframe.src = '/sandbox.html';
    this.iframe.hidden = true;
    this.iframe.title = 'Show sandbox';
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    window.addEventListener('message', (e) => this.onMessage(e));
    document.body.append(this.iframe);
  }

  onMessage(e) {
    if (e.source !== this.iframe.contentWindow || typeof e.data !== 'object') {
      return;
    }
    const msg = e.data;
    if (msg.type === 'ready') {
      this.resolveReady();
      return;
    }
    const h = this.handlers.get(msg.id);
    if (!h) {
      return;
    }
    if (msg.type === 'started') {
      h.started?.(msg);
      h.frame?.(msg.frame);
    } else if (msg.type === 'frame') {
      h.frame?.(msg.frame);
    } else if (msg.type === 'log') {
      h.log?.(msg.level, msg.text);
    } else if (msg.type === 'error') {
      this.handlers.delete(msg.id);
      h.error?.(msg.message);
    } else if (msg.type === 'done') {
      this.handlers.delete(msg.id);
      h.done?.();
    }
  }

  run(code, handlers) {
    const id = nextId++;
    this.handlers.set(id, handlers);
    this.ready.then(() => {
      if (this.handlers.has(id)) {
        this.iframe.contentWindow.postMessage({id, type: 'start', code}, '*');
      }
    });
    return {
      stop: () => {
        if (this.handlers.delete(id)) {
          this.iframe.contentWindow.postMessage({id, type: 'stop'}, '*');
        }
      },
    };
  }
}
