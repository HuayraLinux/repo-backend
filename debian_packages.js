/* Imports */
var config = require('./config');
var format = require('./utils').format_map;
var regex_fold = require('./utils').regex_fold;
var exec = require('child_process').exec;
var debug = require('./debug')(__filename);
/* Variables */
var APT = {};

module.exports.get_package = function get_package(distro, package, cb) {
	function end(repo) {
		cb(repo[package]);
	}

	debug('Se pidió el binario', package, 'de la distro', distro);

	if(APT[distro] === undefined || APT[distro].binaries === undefined) {
		/* Si la distro tiene un nombre lógico lo agregamos */
		if(distro !== '..' && distro !== '.') {
			debug('Leyendo binaries de la distro', distro);
			read_binaries(distro, end);
		} else {
			end({});
		}
		return;
	}

	end(APT[distro].binaries);
};

module.exports.get_source = function get_source(distro, source, cb) {
	function end(repo) {
		cb(repo[source]);
	}

	debug('Se pidió el source', source, 'de la distro', distro);

	if(APT[distro] === undefined || APT[distro].sources === undefined) {
		/* Si la distro tiene un nombre lógico la agregamos */
		if(distro !== '..' && distro !== '.') {
			debug('Leyendo sources de la distro', distro);
			read_sources(distro, end);
		} else {
			end({});
		}
		return;
	}

	end(APT[distro].sources);
};

function read_binaries(distro, cb) {
	var cmdline = format(config.reprepro.distro_repo_binaries, { distro: distro });
	exec(cmdline, function exec_distro_repo_binaries(error, stdout, stderr) {
		var salida = stdout.toString();
		var package_list = parse_packages(salida);
		var packages = package_list.reduce(fold_packages, {});

		APT[distro] = APT[distro] || {};
		APT[distro].binaries = packages;

		cb(packages);
	});
}

function read_sources(distro, cb) {
	var cmdline = format(config.reprepro.distro_repo_sources, { distro: distro });
	exec(cmdline, function exec_distro_repo_sources(error, stdout, stderr) {
		var salida = stdout.toString();
		var package_list = parse_packages(salida);
		var packages = package_list.reduce(fold_packages, {});

		APT[distro] = APT[distro] || {};
		APT[distro].sources = packages;

		cb(packages);
	});
}

function parse_packages(text) {
	var packages;

	function add_package(text) {
		var field_regex = /.+(\n[ ].*)*/g;

		function add_field(package, field_match) {
			var field = field_match[0].split(': ');

			package[field[0]] = field
				.slice(1) /* Quito el fieldname */
				.join(': ') /* junto todo */
				.replace(/^ /mg, '');

			return package;
		}

		return regex_fold(field_regex, text, add_field, {});
	}

	packages = text
		.split('\n\n')
		.slice(0, -1)
		.map(add_package);

	debug('Leídos', packages.length, 'binaries/sources');

	return packages;
}

function fold_packages(packages, package) {
	var name = package.Package;
	var version = {
		Architecture: package.Architecture,
		Version: package.Version,
		Size: package.Size,
		Filename: package.Filename,
		'Installed-Size': package['Installed-Size'],
	};

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
