/* Imports */
var express = require('express');
var exec = require('child_process').exec;
var utils = require('./utils');
var packages = require('./debian_packages');

/* Constants */
var API_PORT = 8080;
var REPREPRO_BASE_DIR = '';
var RELEASE_FILES = {}; /* <distro>: <release_url> */
var reprepro = {
	package_versions: 'reprepro ls <package>',
	package_info: '', /* Parsear Release */
	distro_list: 'grep Codename ' + REPREPRO_BASE_DIR + '/conf/distributions',
	distro_packages: 'reprepro list <distro>'
};
/*
var reprepro = {
	package_versions: 'cat examples/package_versions',
	package_info: 'cat examples/package_info',
	distro_list: 'cat examples/distro_list',
	distro_packages: 'cat examples/distro_packages'
};
*/

/* Variables */
var app = express();

function sanitize_input(req) {
	function strip_illegal_chars(str) {
		str.replace(/[^a-z0-9-+.]/g, '');
	}
	return utils.object_map(req, strip_illegal_chars);
}

/*
 * Salida esperada:
 *
 * {
 *   package: 'huayra-tpm',
 *   versions: [
 *     {
 *       version: '2.0.0.116-7',
 *       distribution: 'brisa',
 *       archs: ['i386', 'source']
 *     },
 *     {
 *       version: '2.0.0.117-3',
 *       distribution: 'torbellino',
 *       archs: ['i386', 'amd64', 'source']
 *     },
 *   ]
 * }
 */
app.get('/packages/:package', function (req, res) {
	var params = sanitize_input(req.params);
	var cmdline = utils.format_map(reprepro.package_versions, req.params);

	exec(cmdline, function(error, stdout, stderr) {
		/* Matchea algo similar a esto
		 *   huayra-desktop|2.74|brisa|source,i386,amd64
		 */
		var PACKAGE_VERSIONS_FORMAT = /^([a-z0-9-.+]{2,})\|([a-z0-9-.+~]+)\|([a-z0-9-.]+)\|([a-z0-9,]+)$/mg
		/* source, i386, amd64 */
		var PACKAGE_VERSIONS_ARCHS_FORMAT = /([a-z0-9]+)/g

		function add_version(data, versions) {
			/* Para entender data ver PACKAGE_VERSIONS_FORMAT */
			var package = { package: data[1] };
			var version = {
				version: data[2],
				distribution: data[3],
				archs: utils.regex_fold(PACKAGE_VERSIONS_ARCHS_FORMAT, data[4], add_arch, [])
			}
			package.versions = versions.versions
				? versions.versions.concat(version)
				: [version];

			return package;
		}

		function add_arch(data, archs) {
			/* Para entender data ver PACKAGE_VERSIONS_ARCHS_FORMAT */
			return archs.concat(data[1]);
		}

		/* Quito todos los espacios porque son inecesarios, `|` es el fieldsep */
		var salida = stdout.toString().replace(/ /g, '');

		var versiones = utils.regex_fold(PACKAGE_VERSIONS_FORMAT, salida, add_version, {});

		res.send(versiones);
	});
});

app.get('/packages/:distro/:package', function (req, res) {
	var params = sanitize_input(req.params);
	res.send(packages()[params.package]);
});

app.get('/distributions', function (req, res) {
	var cmdline = reprepro.distro_list;
	exec(cmdline, function(error, stdout, stderr) {
		res.send(stdout);
	});
});

app.get('/distributions/:distro/packages', function (req, res) {
	var params = sanitize_input(req.params);
	var cmdline = utils.format_map(reprepro.distro_packages, params);
	exec(cmdline, function(error, stdout, stderr) {
		res.send(stdout);
	});
});


app.listen(API_PORT, function () {
  console.log('Example app listening on port', API_PORT);
});