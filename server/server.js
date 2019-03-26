#!/usr/bin/node

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

const prefix = "/api/0" // path to this service

app.use(bodyParser.urlencoded({ extended: true }));
app.use(logger('combined'));

// This allows people to connect in on the /stream websocket, and get
// a continuous stream of frames of the current running show (~5KB/s
// per stream)
app.ws(prefix+'/stream', function(ws, req) {
  ws.on('message', function(msg) {
    console.log('ws message:', msg);
  });
  runner.addStream(ws);
  console.log('stream websocket', req._remoteAddress);
});

app.post(prefix+'/publish', function(req, res){
    res.header('Access-Control-Allow-Origin', '*');
    var token = scheduler.makeJob(req.body.code, req.body.url, req.body.title, req.body.author);
    console.log('published from: ' + req.body.url);
    scheduler.queueJob(token);
    res.send(token);
});

app.get(prefix+'/status/:token', function(req, res){
    res.header('Access-Control-Allow-Origin', '*');
    var status = scheduler.getStatus(req.params.token);
    if (typeof status === 'undefined') {
        res.send(404);
    } else {
        res.send(JSON.stringify(status));
    }
});

app.get(prefix+'/current', function(req, res){
    res.header('Access-Control-Allow-Origin', '*');
    var params = runner.getCurrent();
    var time_left = (params.start + params.limit) - Date.now()/1000;
    var current_job = {is_idle: params.idle, url: params.url,
                        time_left: Math.round(time_left*1000)/1000,
                        title: params.title, author: params.author};
    res.send(JSON.stringify(current_job));
});

app.all(prefix+'/cancel/:token', function(req, res){
    res.header('Access-Control-Allow-Origin', '*');
    if (typeof scheduler.getStatus(req.params.token) === 'undefined') {
        res.send(404);
    } else {
        scheduler.cancelJob(req.params.token);
        res.send('');
    }
});

var host = 'localhost'
var port = 3000
app.listen(port, host);
console.log('Listening on ' + host + ':' + port);
