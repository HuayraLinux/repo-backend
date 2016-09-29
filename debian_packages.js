/* Imports */
var fs = require('fs');
var zlib = require('zlib');
var exec = require('child_process').exec;
var config = require('./config');
var utils = require('./utils');
var debug = require('./debug')(__filename);

var format = utils.format_map;
var regex_fold = utils.regex_fold;

/* Variables */
var APT = {
	/* Estos valores quedan cargados vacíos tal que si alguien intenta
	 * hacer cosas malas formulando nombres de porquería en las distros
	 * termine recibiendo un 404
	 */
	'..': {
		binaries: {},
		sources: {}
	},
	'.': {
		binaries: {},
		sources: {}
	}
};

/* Diccionario para parsear fields específicos */
var FIELD = {};

function get_package(distro, package, cb) {
	function end(repo) {
		cb(repo[package]);
	}

	debug('Se pidió el binario', package, 'de la distro', distro);

	if(APT[distro] === undefined || APT[distro].binaries === undefined) {
		debug('Leyendo binaries de la distro', distro);
		read_binaries(distro, end);
	} else {
		end(APT[distro].binaries);
	}
}

function get_source(distro, source, cb) {
	function end(repo) {
		cb(repo[source]);
	}

	debug('Se pidió el source', source, 'de la distro', distro);

	if(APT[distro] === undefined || APT[distro].sources === undefined) {
		debug('Leyendo sources de la distro', distro);
		read_sources(distro, end);
	} else {
		end(APT[distro].sources);
	}
}

function read_binaries(distro, cb) {
	var cmdline = format(config.reprepro.repo_package_files, { distro: distro });

	function exec_repo_package_files(error, stdout, stderr) {
		var files = stdout
			.toString()
			.replace(/\n$/, '') /* Vuelo el salto de línea final */
			.split('\n');

		function load_binaries_distro(packages) {
			APT[distro] = APT[distro] || {};
			APT[distro].binaries = packages; /* La asigno a donde corresponde */

			cb(packages);

			debug('Leídos', Object.keys(packages).length, 'binaries/sources');
		}

		read_repo_files(files, load_binaries_distro);
	}

	exec(cmdline, { maxBuffer: 1024 * 1024 * 15 }, exec_repo_package_files);
}

function read_sources(distro, cb) {
	var cmdline = format(config.reprepro.repo_source_files, { distro: distro });
	var read_files = read_repo_files.bind(null, 'sources', cb);

	function exec_repo_source_files(error, stdout, stderr) {
		var files = stdout
			.toString()
			.replace(/\n$/, '') /* Vuelo el salto de línea final */
			.split('\n');

		function load_sources_distro(packages) {
			APT[distro] = APT[distro] || {};
			APT[distro].sources = packages; /* La asigno a donde corresponde */

			cb(packages);

			debug('Leídos', Object.keys(packages).length, 'binaries/sources');
		}

		read_repo_files(files, load_sources_distro);
	}

	exec(cmdline, { maxBuffer: 1024 * 1024 * 15 }, exec_repo_source_files);
}

/* Dado que tengo que llamar el callback una sóla vez esta función va
 * haciendo un fold asíncrono sobre los archivos y al procesar todo
 * llama al callback
 */
function read_repo_files(files, cb, package_list) {
	var file = files[0];
	var next_files = files.slice(1);
	package_list = package_list || [];

	debug('Leyendo', file);

	function read_file(error, data) {
		var component_match = /(\/[^/]+)\/[^/]+\/[^/]+$/.exec(file); /* Matcheo el directorio correspondiente al componente */
		var component = component_match && component_match[1] ? component_match[1] : 'unknown'; /* Si no matchié algo con sentido no se cuál es el componente */
		var packages_text = data.toString();
		var file_package_list = parse_packages(packages_text, component); /* Parseo este archivo */
		var next_package_list = package_list.concat(file_package_list); /* Lo agrego con los anteriores*/

		if(files.length === 1) { /* Era el último? */
			var packages = next_package_list.reduce(fold_packages, {}); /* Transformo la lista en un diccionario */

			cb(packages);
		} else {
			read_repo_files(next_files, cb, next_package_list);
		}
	}

	function gunzip(error, data) {
		zlib.gunzip(data, read_file);
	}

	fs.readFile(file, gunzip);
}

function parse_packages(text, component) {
	var packages;

	function add_package(text) {
		var field_regex = /.+(\n[ ].*)*/g;
		var package;

		function add_field(package, field_match) {
			var field = field_match[0].split(': ');
			var fieldname = field[0];

			package[fieldname] = field
				.slice(1) /* Quito el fieldname */
				.join(': ') /* junto todo */
				.replace(/^ /mg, '');

			/* Si hay una función para parsear este field en particular la uso */
			if(FIELD[fieldname] !== undefined) {
				package[fieldname] = FIELD[fieldname](package[fieldname]);
			}

			return package;
		}

		package = regex_fold(field_regex, text, add_field, {});
		package.Component = component;

		return package;
	}

	packages = text.split('\n\n').slice(0, -1).map(add_package);

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

function parse_depends(text) {
	var depends = text
		.replace(/ |\n/g, '') /* Todos los espacios y saltos de línea son inútiles */
		.split(',') /* Separo las dependencias */
		.map(function split_alternatives(depend) { /* Separo las alternativas */
			return depend.split('|');
		})
		.map(function parse_depend(depend_text) { /* Parseo la dependencia y sus alternativas */
			var pattern = /([^(]+)(\((>>|>=|=|<=|<<|<|>)([^)]+)\))?/;
			var matches = depend_text.map(function match_depend(alternative) {
				return pattern.exec(alternative);
			});
			var depend;

			function build_depend(match) {
				var depend = { Package: match[1] };

				if(match[2]) {
					depend.Version = {
						Text: match[2],
						Relation: match[3],
						Version: match[4]
					};
				}

				return depend;
			}

			depend = build_depend(matches[0]);
			depend.Alternatives = matches
				.slice(1)
				.map(build_depend);

			return depend;
		});
	depends.Text = text;

	return depends;
}

function parse_description(text) {
	return {
		Text: text,
		'Short-Description': text.split('\n')[0], /* Lo separo por saltos de línea y agarro la primer línea */
		'Long-Description': text.replace(/^[^\n]*\n/, '') /* Vuelo todo lo anterior al primer salto de línea */
	};
}

FIELD.Depends = parse_depends;
FIELD.Suggests = parse_depends;
FIELD.Conflicts = parse_depends;
FIELD.Recomends = parse_depends;
FIELD['Pre-Depends'] = parse_depends;
FIELD['Build-Depends'] = parse_depends;
FIELD['Build-Depends-Indep'] = parse_depends;

module.exports = {
	get_package: get_package,
	get_source: get_source,
	read_binaries: read_binaries,
	read_sources: read_sources,
	parse_packages: parse_packages,
	fold_packages: fold_packages,
	parse_depends: parse_depends,
	parse_description: parse_description
};