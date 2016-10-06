/* Imports */
var fs = require('fs');
var zlib = require('zlib');
var exec = require('child_process').exec;
var config = require('./config');
var utils = require('./utils');
var debug = require('./debug')('debian_parsing');

var format = utils.format_map;
var regex_fold = utils.regex_fold;
var get_field = utils.get_field;

/* Diccionario para parsear fields específicos */
var FIELD = {};

function init_parser(files) {
	var repo = {};

	function watch_file(filename) {
		var filewatch;
		var distro_regex = /\/([^/]+)\/[^/]+\/[^/]+\/[^/]+$/;
		var distro_match = distro_regex.exec(filename);
		var distro = distro_match && distro_match[1] ? distro_match[1] : 'unknown';

		function read_to_repo(event) {

			debug('El archivo [%s] se ha modificado (event: %s)', filename, event);

			read_file(filename, save_to_repo);
		}

		function save_to_repo(contents, filename) {
			var distro_match = distro_regex.exec(filename);
			var distro = distro_match && distro_match[1] ? distro_match[1] : 'unknown';

			debug('Registrando la información de %s', filename);

			filewatch.contents = contents;
			filewatch.filename = filename;
			filewatch.distro = distro;
			filewatch.lastread = Date.now();
		}

		filewatch = {
			contents: {},
			filename: filename,
			distro: distro,
			lastread: 0,
			watch: fs.watch(filename, read_to_repo)
		};

		filewatch.watch.emit('change', 'load', filename); /* Emito el evento de cargar el archivo */

		return filewatch;
	}

	repo.watches = files.map(watch_file);
	repo.get = repo_get.bind(null, repo);
	repo.get_distro = repo_get_distro.bind(null, repo);
	repo.contents = { lastfold: 0 };

	return repo;
}

function read_file(filename, cb) {
	function parse_file(error, data) {
		var component_match = /\/([^/]+)\/[^/]+\/[^/]+$/.exec(filename); /* Matcheo el directorio correspondiente al componente */
		var component = component_match && component_match[1] ? component_match[1] : 'unknown'; /* Si no matchié algo con sentido no se cuál es el componente */
		var packages_text = data.toString();
		var package_list = parse_packages(packages_text, component); /* Parseo este archivo */

		cb(package_list, filename);
	}

	function gunzip(error, data) {
		zlib.gunzip(data, parse_file);
	}

	debug('Leyendo el archivo %s', filename);

	fs.readFile(filename, gunzip);
}

function repo_get(repo, distro, package) {
	var distro_repo;

	repo_check_news(repo);

	distro_repo = repo.contents[distro] || {};

	return distro_repo[package];
}

function repo_get_distro(repo, distro) {
	repo_check_news(repo);

	return repo.contents[distro] || {};
}

function repo_check_news(repo) {
	var lastread;
	var new_content;

	function max(a,b) {
		return Math.max(a,b); /* Lo necesito para poder hacer el reduce, ya que el callback de reduce tiene más argumentos */
	}

	function divide_distros(content, watch) {
		var distro = watch.distro;

		if(content[distro]) {
			content[distro] = content[distro].concat(watch.contents);
		} else {
			content[distro] = watch.contents;
		}

		return content;
	}

	function create_distro_dictionary(packages) {
		packages = packages || []; /* Si por alguna razón no hay packages hago un array vació en lugar de undefined */
		return packages.reduce(fold_packages, {});
	}

	lastread = repo.watches
		.map(get_field('lastread'))
		.reduce(max);
	new_content = repo.contents.lastfold < lastread;

	if(new_content) {
		var distros;

		debug('Unificando los datos de cada archivo');

		distros = repo.watches.reduce(divide_distros, {}); /* Genero un mapa { <distro> => [paquetes] } */
		repo.contents = utils.object_map(distros, create_distro_dictionary); /* Genero un mapa { <distro> => { <paquete> => {contenidos} } } */
		repo.contents.lastfold = Date.now();
	}
}

function init_repo(search_repo_files_cmdline, cb) {
	var cmdline = search_repo_files_cmdline;

	function exec_search_files(error, stdout, stderr) {
		var files = stdout
			.toString()
			.replace(/\n+$/, '') /* Vuelo el salto de línea final */
			.split('\n');
		var repo = init_parser(files);

		cb(repo);
	}

	exec(cmdline, exec_search_files);
}

function init_binaries(cb) {
	var cmdline = config.reprepro.search_package_files;

	init_repo(cmdline, cb);
}

function init_sources(cb) {
	var cmdline = config.reprepro.search_source_files;

	init_repo(cmdline, cb);
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
	init_parser: init_parser,
	read_file: read_file,
	repo_get: repo_get,
	repo_get_distro: repo_get_distro,
	repo_check_news: repo_check_news,
	init_binaries: init_binaries,
	init_sources: init_sources,
	parse_packages: parse_packages,
	parse_depends: parse_depends,
	parse_description: parse_description
};
