var util = require('util');
var scheduler = require('./scheduler.js');
var express = require('express');
var path = require('path');
var app = express();

app.use(express.urlencoded());
app.use(express.logger());
app.use(express.static(path.join(__dirname, 'static')));

app.post('/publish', function(req, res){
	res.header('Access-Control-Allow-Origin', '*');
	var token = scheduler.makeJob(req.body.code);
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

app.all('/cancel/:token', function(req, res){
	res.header('Access-Control-Allow-Origin', '*');
	if (typeof scheduler.getStatus(req.params.token) === 'undefined') {
		res.send(404);
	} else {
		scheduler.cancelJob(req.params.token);
		res.send('');
	}
});

app.listen(3000);
console.log('Listening');
