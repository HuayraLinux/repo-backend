/* Imports */
var config = require('./config.js');
var format = require('./utils.js').format_map;
var regex_fold = require('./utils.js').regex_fold;
var exec = require('child_process').exec;
/* Variables */
var APT = {};

module.exports = function get_package(distro, package, cb) {
	function end(repo) {
		cb(repo[package]);
	}

	if(APT[distro] === undefined) {
		add_distro(distro, end);
		return;
	}

	end(APT[distro]);
}

function add_distro(distro, cb) {
	/* Si la distro es un nombre tramposo rompemos todo */
	if(distro === '..' || distro === '.') {
		cb({});
		return;
	}

	read_packages(distro, cb);
}

function read_packages(distro, cb) {
	var cmdline = format(config.reprepro.distro_repo_packages, { distro: distro });
	exec(cmdline, function exec_distro_repo_packages(error, stdout, stderr) {
		var salida = stdout.toString();
		var package_list = parse_packages(salida);
		var packages = package_list.reduce(fold_packages, {});

		cb(packages);
	});
}

function parse_packages(text) {
	var packages;

	function add_package(text) {
		var field_regex = /.*\n([ ].*\n)*/g;

		function add_field(package, field_match) {
			var field = field_match[0].split(': ');

			package[field[0]] = field
				.slice(1) /* Quito el fieldname */
				.join(': ') /* junto todo */
				.replace(/\n$/, ''); /* Quito el \n del final */

			return package;
		}

		return regex_fold(field_regex, text, add_field, {});
	}

	packages = text
		.split('\n\n')
		.map(add_package);

	return packages;
}

function fold_packages(packages, package) {
	var name = package.Package;
	var version = {
		'Architecture': package['Architecture'],
		'Version': package['Version'],
		'Size': package['Size'],
		'Installed-Size': package['Installed-Size'],
		'Filename': package['Filename']
	}

	if(packages[name]) {
		packages[name].versions.push(version);
	} else {
		packages[name] = package;
		packages[name].versions = [version];

		Object.keys(version).forEach(function unset_key(key) {
			delete packages[name][key];
		});
	}
	return packages;
}