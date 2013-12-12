function (lights) {
    // Circus!

    var colors = [ [1, 0, 0], [1, 8 / 15, 0], [1, 1, 0], [0, 1, 0],
        [0, 0, 1], [4 / 15, 14 / 15, 13 / 15], [14 / 15, 0, 14 / 15] ];
    for (i = 0; i < lights.length; i++) {
        lights[i].rgb(colors[i % colors.length][0],
                      colors[i % colors.length][1],
                      colors[i % colors.length][2]);
    }

    return function () {
        lights.unshift(lights.pop());
        return 100;
    };
}
