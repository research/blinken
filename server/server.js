var util = require('util');
var scheduler = require('./scheduler.js');
var express = require('express');
var bodyParser = require('body-parser');
var logger = require('morgan');
var path = require('path');
var fs = require('fs');
var runner = require('./runner.js');


var ews = require('express-ws')
var expressWs = ews(express());
var app = expressWs.app;


app.use(bodyParser.urlencoded({ extended: true }));
app.use(logger("default"));

// This allows people to connect in on the /stream websocket, and get a continuous stream of frames
// of the current running show (~5KB/s per stream)
app.ws('/ws/stream', function(ws, req) {
  ws.on('message', function(msg) {
    console.log('ws message:', msg);
  });
  runner.addStream(ws);
  console.log('stream websocket', req._remoteAddress);
});

app.get('/', function(req, res) {
    res.sendfile('static/index.html');
});

app.get('/client.js', function(req, res) {
    fs.readFile(__dirname + '/static/client.js', 'utf8', function(err, client) {
        if (err) { throw new Error(err); };
        fs.readFile(__dirname + '/bulb.js', 'utf8', function(err, bulb) {
            if (err) { throw new Error(err); }
            res.setHeader('Content-Type', 'text/javascript');
            res.send(client + "\n" + bulb);
        });
    });
});

app.get('/watch-live.html', function(req, res) {
    res.sendfile('static/watch-live.html');
});

app.post('/publish', function(req, res){
    res.header('Access-Control-Allow-Origin', '*');
    var token = scheduler.makeJob(req.body.code, req.body.url, req.body.title, req.body.author);
    console.log('published from: ' + req.body.url);
    scheduler.queueJob(token);
    res.send(token);
});

app.get('/status/:token', function(req, res){
    res.header('Access-Control-Allow-Origin', '*');
    var status = scheduler.getStatus(req.params.token);
    if (typeof status === 'undefined') {
        res.send(404);
    } else {
        res.send(JSON.stringify(status));
    }
});

var JSON_CACHE = '/tmp/bbbblinken.json.last';
var CACHE_STALE_TIME = 120;
var last_cache_update = 0;
var json_obj_cache = {};

// For jsbin.com and jsfiddle.net
function url_normalize(url) {

    if (url.indexOf('http://jsbin.com/')==0 && url.indexOf('/edit')!=-1) {
        return url.substr(0, url.indexOf('/edit'));
    } else if (url.indexOf('http://jsbin.com/')==0 && url.indexOf('/show')==(url.length - '/show'.length)) {
        return url.substr(0, url.indexOf('/show'));
    } else if (((url.indexOf('http://fiddle.jshell.net/')==0 || url.indexOf('http://jsfiddle.net/')) && url.indexOf('/show')==-1)) {
        return url + '/show/';
    } else if (url.indexOf('http://jsfiddle.net/')==0) {
        // Ugh hack
        return url + '/';
    } else {
        return url;
    }
}

function fill_name_from_url(params) {
    if (typeof json_obj_cache == 'undefined' || typeof json_obj_cache.data == 'undefined') {
        return;
    }
    for (var i in json_obj_cache.data.children) {
        c = json_obj_cache.data.children[i];
        if (c.data.is_self) {
            continue;
        }

        if (url_normalize(c.data.url) == params.url) {
            console.log('Found url:' + params.url);
            params.name = c.data.title;
            break;
        }
    }    
}

// Updates json_obj_cache from /tmp/bbbblinken.json if it's newer than us,
// calls fill_name_from_url
function get_name_from_url(params) {
    fs.stat(JSON_CACHE, function(err, stat) {
        if (err) {
            console.log('Error: ' + err);
            return;
        }
        if (stat.mtime.getTime()/1000 > last_cache_update) {
            // Update our object
            fs.readFile(JSON_CACHE, 'utf8', function (err, data) {
                if (err) {
                    console.log('Error: ' + err);
                    return;
                }
                json_obj_cache = JSON.parse(data);
                console.log('Updated json_obj_cache: ' + json_obj_cache);
                fill_name_from_url(params);
                last_cache_update = stat.mtime.getTime()/1000;
                return;
            });
            return;
        }
        fill_name_from_url(params);
    });
}

function name_from_url(params) {
    // Just in case we can...
    fill_name_from_url(params);

    // Slow path update if needed
    get_name_from_url(params);
}

app.get('/current', function(req, res){
    res.header('Access-Control-Allow-Origin', '*');
    var params = runner.getCurrent();
    var time_left = (params.start + params.limit) - Date.now()/1000;
    if (typeof params.name === 'undefined') {
        // No name for this (yet). Read through bbblinken.json to see if there is one
        // Won't get it this time around, but maybe next time?
        name_from_url(params);
    }
    var current_job = {is_idle: params.idle, name: params.name, url: params.url,
                        time_left: Math.round(time_left*1000)/1000,
                        title: params.title, author: params.author};
    res.send(JSON.stringify(current_job));
});

app.all('/cancel/:token', function(req, res){
    res.header('Access-Control-Allow-Origin', '*');
    if (typeof scheduler.getStatus(req.params.token) === 'undefined') {
        res.send(404);
    } else {
        scheduler.cancelJob(req.params.token);
        res.send('');
    }
});


app.listen(3000, 'localhost');
console.log('Listening');
