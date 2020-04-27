//
// Blinken simulator (jhalderm 2013-12)
//

// Requires:
//
//  <script src="https://code.jquery.com/jquery-latest.js"></script>
//

class Blinken {
  constructor(obj) { // {title, author}
    if (typeof obj === 'undefined') {
      obj = {};
    }
    this.title = obj.title;
    this.author = obj.author;
    this.simulator = new Simulator(this, $('body'));
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

    $(window).unload( () => {
      this.cancelJob(true);
    });
    $(document).ajaxError( (event, jqXHR, ajaxSettings, thrownError) => {
      $(this.send).text('Ajax Fail: ' + thrownError);
    });
  }

  render(target) {
    // Create and style our environment
    const view = document.createElement('div');
    const scale = document.createElement('div');
    const world = document.createElement('div');
    const floor = document.createElement('div');
    const send = document.createElement('button');
    this.send = send;
    view.appendChild(scale);
    scale.appendChild(world);
    world.appendChild(floor);
    target.append(view);
    view.appendChild(send);
    $(view).css({
      position: 'absolute',
      left: '0',
      right: '0',
      bottom: '0',
      top: '0',
      overflow: 'hidden',
      userSelect: 'none',
      perspective: '2048px',
      backgroundColor: 'rgb(240, 240, 240)',
    });
    $(scale).css({
      position: 'absolute',
      width: '512px',
      height: '512px',
      left: '50%',
      top: '50%',
      marginLeft: '-256px',
      marginTop: '-256px',
      transformStyle: 'preserve-3d',
    });
    $(world).css({
      position: 'absolute',
      width: '512px',
      height: '512px',
      left: '50%',
      top: '50%',
      marginLeft: '-256px',
      marginTop: '-256px',
      transformStyle: 'preserve-3d',
    });
    $(floor).css({
      position: 'absolute',
      width: '768px',
      height: '768px',
      left: '-128px',
      top: '-128px',
      transformStyle: 'preserve-3d',
      backgroundColor: 'rgba(200, 200, 200, .5)',
    });
    $(send).text('Run on Stairs');
    $(send).css({
      marginTop: '10px',
      marginLeft: '10px',
      padding: '5px 10px',
      fontFamily: 'Helvetica, Arial, FreeSans, sans-serif',
      fontSize: '15px',
    });
    send.disabled = true;

    const transform = (sel, t) => {
      sel.css('transform', t);
    };
    transform($(floor), 'translateZ(-768px)');

    // Let there be lights
    const createLight = (n) => {
      const div = document.createElement('div');
      const x = Math.sin(n / 100 * 6 * Math.PI) * 256;
      const y = Math.cos(n / 100 * 6 * Math.PI) * 256;
      const z = (n - 50) * 15;
      transform($(div),
          'translateX( ' + x.toFixed(4) + 'px ) ' +
                'translateY( ' + y.toFixed(4) + 'px ) ' +
                'translateZ( ' + z.toFixed(4) + 'px )');
      world.appendChild(div);
      $(div).css({
        left: '256px',
        top: '256px',
        transformStyle: 'preserve-3d',
        position: 'absolute',
      });
      const light = document.createElement('div');
      div.appendChild(light);
      $(light).css({
        position: 'absolute',
        backgroundColor: 'rgba(127, 127, 127, 0.5)',
        width: '20px',
        height: '20px',
        borderRadius: '10px',
        border: '0.05px solid black',
        marginLeft: '-10px',
        marginTop: '-10px',
      });
      return light;
    };
    this.objects = [];
    for (let i = 0; i < 100; i++) {
      this.objects.push(createLight(i));
    }

    // Scale world to window
    const setScale = () => {
      const s = $(view).height() / (4 * $(world).height());
      transform($(scale),
          'scale(' + s.toFixed(4) + ',' + s.toFixed(4) + ')');
    };
    setScale();
    $(window).resize( () => {
      setScale();
    } );

    // Position the world
    let worldXAngle = 90;
    let worldZAngle = 0;
    let depth = 0;
    const updateView = () => {
      transform($(world),
          'translateZ( ' + depth.toFixed(4) + 'px ) ' +
                 'rotateX(' + worldXAngle.toFixed(4) + 'deg) ' +
                 'rotateZ( ' + worldZAngle.toFixed(4) + 'deg)');
      for (let i = 0; i < 100; i++) {
        transform($(this.objects[i]),
            'rotateZ( ' + (-worldZAngle).toFixed(4) + 'deg) ' +
                   'rotateX( ' + (-worldXAngle).toFixed(4) + 'deg)');
      }
    };
    updateView();

    // Change position on mouse events
    let startX = 0;
    let startY = 0;
    let startXAngle = 0;
    let startZAngle = 0;
    let moving = false;
    $(view).mousedown( (e) => {
      if (e.which == 1) {
        startX = e.pageX;
        startY = e.pageY;
        startXAngle = worldXAngle;
        startZAngle = worldZAngle;
        moving = true;
      }
    });
    $(view).mousemove( (e) => {
      if (moving && e.which == 1) {
        worldZAngle = startZAngle -
          (((e.pageX - startX) / $(view).width())) * 180;
        worldXAngle = startXAngle -
          (((e.pageY - startY) / $(view).height())) * 180;
        worldXAngle = Math.max(Math.min(worldXAngle, 180), 0);
        updateView();
      }
    });
    $(view).mouseup( (e) => {
      moving = false;
    });
    $(view).on('wheel', (e) => {
      if (e.originalEvent.wheelDeltaY) {
        depth += e.originalEvent.wheelDeltaY;
      } else {
        depth -= e.originalEvent.deltaY * 15;
      }
      updateView();
    });
  }

  execStart(code) {
    this.runId++;
    $(this.send).click( () => {
      this.publish(code);
    } );

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
      $(this.send).text('Error (see console)');
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
        $(this.send).text('Error (see console)');
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

  checkStatus() {
    $.get(this.apiPath + '/status/' + this.token, (data) => {
      if (data.value > 0) {
        $(this.send).text(data.message);
        setTimeout( () => {
          this.checkStatus();
        }, 500);
      } else if (data.value == 0) {
        $(this.send).text(data.message + '.  Run again?');
        this.published = false;
      } else {
        $(this.send).text(data.message);
        this.published = false;
      }
    }, 'json');
  }

  publishJob(code) {
    this.published = true;
    $(this.send).text('Sending');
    $.post(this.apiPath + '/publish',
        {
          code: code.toString(),
          url: document.location.toString(),
          title: this.blinken.title, author: this.blinken.author,
        }, (data) => {
          $(this.send).text('Sent');
          this.token = data;
          setTimeout(() => {
            this.checkStatus();
          }, 100);
        },
    );
  }

  cancelJob(sync) {
    if (typeof this.token !== 'undefined') {
      $(this.send).text('Canceling');
      if (sync) {
        (new Image(0, 0)).src = this.apiPath + '/cancel/' + this.token;
      } else {
        $.post(this.apiPath + '/cancel/' + this.token);
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
    this.clear();
    this.gamma = 0.33;
    if (typeof w === 'object' && w instanceof Bulb &&
        typeof x === 'undefined' &&
        typeof y === 'undefined' &&
        typeof z === 'undefined') {
      this.r = _limit(w.r);
      this.g = _limit(w.g);
      this.b = _limit(w.b);
      this.a = _limit(w.a);
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
    this.r = this.g = this.b = 0;
    this.a = 1;
  };

  // You can set color channels and overall brightness ("alpha") directly.
  // Range is 0-1:
  //   this.r = 0;
  //   this.g = 0;
  //   this.b = 0;
  //   this.a = 1;

  // Set light color: rgb(r,g,b)
  rgb(r, g, b) {
    this.r = _limit(r);
    this.g = _limit(g);
    this.b = _limit(b);
    this.a = 1;
    return this;
  };

  // Set light color with alpha: rgba(r,g,b,a)
  rgba(r, g, b, a) {
    this.a = _limit(a);
    return this.rgb(r, g, b);
  };

  // Add color of another bulb to this one
  add(bulb) {
    this.r = _limit(this.r + bulb.r);
    this.g = _limit(this.g + bulb.g);
    this.b = _limit(this.b + bulb.b);
    this.a = _limit(this.a + bulb.a);
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

