//
// Class to represent and manipulate a bulb
//
function Bulb(w,x,y,z) {
    // Create a Bulb:
    //   new Bulb()
    //   new Bulb(existingBulb)
    //   new Bulb(r,g,b)
    //   new Bulb(r,g,b,a)
    this.r = this.g = this.b = this.a = 0;
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

    // You can color channels and overall brightness ("alpha") directly.
    // Range is 0-1.
    // this.r = 0;
    // this.g = 0;
    // this.b = 0;
    // this.a = 0;

    // Set light color: rgb(r,g,b)
    this.rgb = function (r, g, b) {
        this.r = limit(r);
        this.g = limit(g);
        this.b = limit(b);
        this.a = 1;
    };

    // Set light color with alpha: rgba(r,g,b,a)
    this.rgba = function (r, g, b, a) {
        this.rgb(r, g, b);
        this.a = limit(a);
    };

    // Set bulb to off
    this.off = function() {
        this.r = this.g = this.b = this.a = 0;
    }

    ////////////////////////////////////////////////////////////
    this.gamma = 0.3; // scale color in simulator to match bulbs
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
