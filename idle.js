function (lights) {
    // My self-contained program goes here.    
    var x = 0;
    var d = 1;

    // Update lights and return number of ms until
    // this function gets called again.
    return function () {
        for (i = 0; i < 100; i++) {
            if (i > x - 10 && i < x + 10) {
                lights[i].rgb(1, 0.5, 0.25);
            } else {
                lights[i].a = 0;
            }
        }
        x += d;
        if (x == 110 || x == -10) {
            d *= -1;
        }
        return 200;
    };
}