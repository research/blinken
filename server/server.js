#!/usr/bin/node

const scheduler = require('./scheduler.js');
const express = require('express');
const bodyParser = require('body-parser');
const logger = require('morgan');
const runner = require('./runner.js');

const ews = require('express-ws');
const expressWs = ews(express());
const app = expressWs.app;

const prefix = '/api/0'; // path to this service

app.use(bodyParser.urlencoded({extended: true}));
app.use(logger('combined'));
app.set('trust proxy', 'loopback');

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

// Set IP address on strand boot
app.get(prefix+'/hello-pi', function(req, res) {
  runner.setStrandHost(req._remoteAddress);
  console.log('ip is now:', req._remoteAddress);
  res.send('👋');
});

app.post(prefix+'/publish', function(req, res) {
  res.header('Access-Control-Allow-Origin', '*');
  const token = scheduler.makeJob(
      req.body.code, req.body.url, req.body.title, req.body.author);
  console.log('published from: ' + req.body.url);
  scheduler.queueJob(token);
  res.send(token);
});

app.get(prefix+'/status/:token', function(req, res) {
  res.header('Access-Control-Allow-Origin', '*');
  const status = scheduler.getStatus(req.params.token);
  if (typeof status === 'undefined') {
    res.send(404);
  } else {
    res.send(JSON.stringify(status));
  }
});

app.get(prefix+'/current', function(req, res) {
  res.header('Access-Control-Allow-Origin', '*');
  const params = runner.getCurrent();
  const timeLeft = (params.start + params.limit) - Date.now()/1000;
  const currentJob = {is_idle: params.idle, url: params.url,
    time_left: Math.round(timeLeft*1000)/1000,
    title: params.title, author: params.author};
  res.send(JSON.stringify(currentJob));
});

app.all(prefix+'/cancel/:token', function(req, res) {
  res.header('Access-Control-Allow-Origin', '*');
  if (typeof scheduler.getStatus(req.params.token) === 'undefined') {
    res.sendStatus(404);
  } else {
    scheduler.cancelJob(req.params.token);
    res.send('');
  }
});

const host = 'localhost';
const port = 3000;
app.listen(port, host);
console.log('Listening on ' + host + ':' + port);
