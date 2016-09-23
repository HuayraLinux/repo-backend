/* Imports */
var express = require('express');
var utils = require('./utils');
var exec = require('child_process').exec;

/* Constants */
var API_PORT = 8080;
var reprepro = {
	package_info: 'echo "<package>"',
	package_versions: 'sleep 10 && echo "<distro>" && echo "<package>"',
	distro_list: 'ls',
	distro_packages: 'echo "<distro>"'
};

/* Variables */
var app = express();

function sanitize_input(req) {
	function strip_illegal_chars(str) {
		str.replace(/[^a-z0-9-+.]/g, '');
	}
	return utils.object_map(req, strip_illegal_chars);
}

app.get('/packages/:package', function (req, res) {
	var cmdline = utils.format_map(reprepro.package_info, req.params);
	exec(cmdline, function(error, stdout, stderr) {
		res.send(stdout);
	});
});

app.get('/packages/:distro/:package', function (req, res) {
	var cmdline = utils.format_map(reprepro.package_versions, req.params);
	exec(cmdline, function(error, stdout, stderr) {
		res.send(cmdline);
	});
});

app.get('/distributions', function (req, res) {
	var cmdline = reprepro.distro_list;
	exec(cmdline, function(error, stdout, stderr) {
		res.send(stdout);
	});
});

app.get('/distributions/:distro/packages', function (req, res) {
	var cmdline = utils.format_map(reprepro.distro_packages, req.params);
	exec(cmdline, function(error, stdout, stderr) {
		res.send(cmdline);
	});
});


app.listen(API_PORT, function () {
  console.log('Example app listening on port', API_PORT);
});