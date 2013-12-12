function Bulb() {
    this.r = 0;
    this.b = 0;
    this.g = 0;
    this.a = 0;
    this.rgb = function (r, g, b) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = 1;
    };
    this.rgba = function (r, g, b, a) {
        this.rgb(r, g, b);
        this.a = a;
    };
    this.cssColor = function () {
        return 'rgb(' + Math.round(this.a * this.r * 255) + ',' +
            Math.round(this.a * this.g * 255) + ',' +
            Math.round(this.a * this.b * 255) + ')';
    };
	this.strandBytes = function() {
		return [Math.round(this.a*200),
				Math.round(this.r*15),
				Math.round(this.g*15),
				Math.round(this.b*15)];
	};
}

exports.Bulb = Bulb;
