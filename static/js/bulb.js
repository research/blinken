/**
 * One light on the strand.
 *
 * Each bulb has red, green, and blue channels and a brightness ("alpha"),
 * all from 0 to 1. Shows can set r, g, b, and a directly or use the
 * methods below, most of which return the bulb so calls can be chained:
 *
 *   lights[0].rgb(1, 0.5, 0);
 *   lights[1].red().a = 0.5;
 *
 * This file is shared by the server's sandbox, the browser sandbox, and
 * the site's pages, so it must stay a self-contained classic script.
 */
class Bulb {
  /**
   * new Bulb()            black at full brightness
   * new Bulb(bulb)        a copy of another bulb
   * new Bulb(r, g, b)     the given color at full brightness
   * new Bulb(r, g, b, a)  the given color and brightness
   */
  constructor(r, g, b, a) {
    // Exponent used to approximate the real bulbs' brightness on screen
    this.gamma = 0.33;
    this.clear();
    if (r instanceof Bulb && g === undefined && b === undefined &&
        a === undefined) {
      this.copy(r);
    } else if (typeof r === 'number' && typeof g === 'number' &&
               typeof b === 'number') {
      this.r = r;
      this.g = g;
      this.b = b;
      if (typeof a === 'number') {
        this.a = a;
      }
    }
  }

  static #limit(x) {
    return Math.min(1, Math.max(0, x));
  }

  /** Reset to black at full brightness. */
  clear() {
    this.r = 0;
    this.g = 0;
    this.b = 0;
    this.a = 1;
    return this;
  }

  /** Set the color, at full brightness. */
  rgb(r, g, b) {
    return this.rgba(r, g, b, 1);
  }

  /** Set the color and brightness. */
  rgba(r, g, b, a) {
    this.r = Bulb.#limit(r);
    this.g = Bulb.#limit(g);
    this.b = Bulb.#limit(b);
    this.a = Bulb.#limit(a);
    return this;
  }

  /** Set to the same color and brightness as another bulb. */
  copy(bulb) {
    if (bulb instanceof Bulb) {
      this.r = bulb.r;
      this.g = bulb.g;
      this.b = bulb.b;
      this.a = bulb.a;
    }
    return this;
  }

  /** Add another bulb's color and brightness to this one's. */
  add(bulb) {
    if (bulb instanceof Bulb) {
      this.r = Bulb.#limit(this.r + bulb.r);
      this.g = Bulb.#limit(this.g + bulb.g);
      this.b = Bulb.#limit(this.b + bulb.b);
      this.a = Bulb.#limit(this.a + bulb.a);
    }
    return this;
  }

  // Simple colors. These leave the brightness unchanged.

  black() {
    this.r = 0;
    this.g = 0;
    this.b = 0;
    return this;
  }

  red() {
    this.r = 1;
    this.g = 0;
    this.b = 0;
    return this;
  }

  green() {
    this.r = 0;
    this.g = 1;
    this.b = 0;
    return this;
  }

  blue() {
    this.r = 0;
    this.g = 0;
    this.b = 1;
    return this;
  }

  cyan() {
    this.r = 0;
    this.g = 1;
    this.b = 1;
    return this;
  }

  purple() {
    this.r = 1;
    this.g = 0;
    this.b = 1;
    return this;
  }

  yellow() {
    this.r = 1;
    this.g = 1;
    this.b = 0;
    return this;
  }

  white() {
    this.r = 1;
    this.g = 1;
    this.b = 1;
    return this;
  }

  /** The bulb's color as a CSS color, for drawing it on screen. */
  cssColor() {
    const a = Bulb.#limit(this.a);
    const channel = (c) =>
      Math.round(Math.pow(a * Bulb.#limit(c), this.gamma) * 255);
    return `rgb(${channel(this.r)},${channel(this.g)},${channel(this.b)})`;
  }
}
