/* Imports */
var express = require('express');
var utils = require('./utils');
var exec = require('child_process').exec;

/* Constants */
var API_PORT = 80;
var reprepro = {
	package_versions: '',
	package_info: '',
	distro_packages: '',
	distro_list: ''
};

/* Variables */
var app = express();

app.get('/packages/:package', function (req, res) {
	exec(reprepro.package_info, function(error, stdout, stderr) {

	});
});

app.get('/packages/:distro/:packageName', function (req, res) {
	exec(reprepro.package_versions, function(error, stdout, stderr) {

	});
});

app.get('/distributions', function (req, res) {
	exec(reprepro.distro_list, function(error, stdout, stderr) {

	});
});

app.get('/distributions/:distro/packages', function (req, res) {
	exec(reprepro.distro_packages, function(error, stdout, stderr) {

	});
});


app.listen(API_PORT, function () {
  console.log('Example app listening on port', API_PORT);
});