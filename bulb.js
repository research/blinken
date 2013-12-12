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
        return 'rgb(' + Math.round(this.a * this.r * 255) + ',' +
            Math.round(this.a * this.g * 255) + ',' +
            Math.round(this.a * this.b * 255) + ')';
    };
	this.strandBytes = function(scale) {
		if (typeof scale === 'undefined') {
			scale = 1;
		}
		return [Math.round(scale*limit(this.a)*255),
				Math.round(limit(this.r)*15),
				Math.round(limit(this.g)*15),
				Math.round(limit(this.b)*15)];
	};
}

exports.Bulb = Bulb;
