//
// Class to represent and manipulate a bulb
//
function Bulb() {
    this.r = 0;
    this.b = 0;
    this.g = 0;
    this.a = 0;
    function limit(x) {
	return Math.min(1, Math.max(0, x));
    }
    this.rgb = function (r, g, b) {
        this.r = limit(r);
        this.g = limit(g);
        this.b = limit(b);
        this.a = 1;
    };
    this.rgba = function (r, g, b, a) {
        this.rgb(r, g, b);
        this.a = limit(a);
    };
    this.cssColor = function () {
        return 'rgb(' + Math.round(limit(this.a) * limit(this.r) * 255) + ',' + 
                        Math.round(limit(this.a) * limit(this.g) * 255) + ',' + 
                        Math.round(limit(this.a) * limit(this.b) * 255) + ')';
    };
}
