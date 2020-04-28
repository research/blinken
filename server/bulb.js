/** Represents and manipulates a bulb **/
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
