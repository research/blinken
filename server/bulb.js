//
// Class to represent and manipulate a bulb
//
function Bulb(w,x,y,z) {
    // Reset bulb
    this.clear = function() {
        this.r = this.g = this.b = 0;
        this.a = 1;
    };

    // Create a Bulb:
    //   new Bulb()
    //   new Bulb(existingBulb)
    //   new Bulb(r,g,b)
    //   new Bulb(r,g,b,a)
    this.clear();
    if (typeof w === 'object' && w instanceof Bulb &&
        typeof x === 'undefined' && typeof y === 'undefined' && typeof z === 'undefined') {
        this.r = limit(w.r);
        this.g = limit(w.g);
        this.b = limit(w.b);
        this.a = limit(w.a);
    } else if (typeof w === 'number' && typeof x === 'number' && typeof y === 'number') {
        this.r = w;
        this.g = x;
        this.b = y;
        if (typeof z === 'number') {
            this.a = z;
        }
    }

    // You can set color channels and overall brightness ("alpha") directly.
    // Range is 0-1:
    //   this.r = 0;
    //   this.g = 0;
    //   this.b = 0;
    //   this.a = 1;

    // Set light color: rgb(r,g,b)
    this.rgb = function (r, g, b) {
        this.r = limit(r);
        this.g = limit(g);
        this.b = limit(b);
        this.a = 1;
        return this;
    };

    // Set light color with alpha: rgba(r,g,b,a)
    this.rgba = function (r, g, b, a) {
        this.a = limit(a);
        return this.rgb(r, g, b);
    };

    // Add color of another bulb to this one
    this.add = function(bulb) {
        this.r = limit(this.r + bulb.r);
        this.g = limit(this.g + bulb.g);
        this.b = limit(this.b + bulb.b);
        this.a = limit(this.a + bulb.a);
        return this;
    };

    // Convenience functions for simple colors
    this.black  = function() { this.r = 0; this.g = 0; this.b = 0; return this; };
    this.red    = function() { this.r = 1; this.g = 0; this.b = 0; return this; };
    this.green  = function() { this.r = 0; this.g = 1; this.b = 0; return this; };
    this.blue   = function() { this.r = 0; this.g = 0; this.b = 1; return this; };
    this.cyan   = function() { this.r = 0; this.g = 1; this.b = 1; return this; };
    this.purple = function() { this.r = 1; this.g = 0; this.b = 1; return this; };
    this.yellow = function() { this.r = 1; this.g = 1; this.b = 0; return this; };
    this.white  = function() { this.r = 1; this.g = 1; this.b = 1; return this; };

    ////////////////////////////////////////////////////////////
    // Internal stuff

    this.gamma = 0.33;

    this.cssColor = function () {
        return 'rgb(' + Math.round(Math.pow(limit(this.a) * limit(this.r), this.gamma) * 255) + ',' +
                        Math.round(Math.pow(limit(this.a) * limit(this.g), this.gamma) * 255) + ',' +
                        Math.round(Math.pow(limit(this.a) * limit(this.b), this.gamma) * 255) + ')';
    };

    function limit(x) {
        return Math.min(1, Math.max(0, x));
    }
}

if (typeof exports !== 'undefined') {
    exports.Bulb = Bulb;
}
