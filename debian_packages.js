/* Imports */
var Promise = require('es6-promise');
var fs = require('fs');
var zlib = require('zlib');
var exec = require('child_process').exec;
var config = require('./config');
var utils = require('./utils');
var debug = require('./debug')('debian_parsing');

var format = utils.format_map;
var regex_fold = utils.regex_fold;
var get_field = utils.get_field;

/* Intervalo en el que node hace polling de los archivos, mínimo 5007 y máximo ~5 segundos antes del LOAD_INTERVAL */
var watchFile_interval = Math.max(LOAD_INTERVAL - 5007, 5007);

/* Diccionario para parsear fields específicos */
var FIELD = {};

function init_parser(files) {
	var repo = { dirty: true };

	function watch_file(filename) {
		var filewatch;
		var distro_regex = /\/([^/]+)\/[^/]+\/[^/]+\/[^/]+$/;
		var distro_match = distro_regex.exec(filename);
		var distro = distro_match && distro_match[1] ? distro_match[1] : 'unknown';

		function mark_dirty(stats_now, last_stats) {
			var usable_filename = filename.replace(config.REPO_DISTS_DIR, '');

			if(stats_now.mtimeMs != last_stats.mtimeMs) {
				debug('Se modificó [%s]', usable_filename);

				repo.dirty = true;
			}
		}

		filewatch = {
			filename: filename,
			distro: distro,
			watch: fs.watchFile(filename, { interval: watchFile_interval }, mark_dirty)
		};

		return filewatch;
	}

	repo.watches = files.map(watch_file);
	repo.get = repo_get.bind(null, repo);
	repo.get_distro = repo_get_distro.bind(null, repo);
	repo.get_any = repo_get_any.bind(null, repo);
	repo.contents = {};
	repo.loadInterval = setInterval(repo_load_files, config.LOAD_INTERVAL, repo);

	/* Cargo los archivos */
	repo_load_files(repo);

	return repo;
}

function repo_load_files(repo) {
	var read_files_promises;

	if(!repo.dirty) {
		return;
	}

	/* Recibe un watch y devuelve una Promesa que resuelve a {watch: watch, packages: [paquetes]} */
	function read_to_repo(watch) {
		function add_metadata(packages) {
			return { watch: watch, packages: packages };
		}

		return read_file_promise(watch.filename).then(add_metadata);
	}

	/* Genero un mapa { <distro> => [paquetes] } */
	function divide_distros(repo, data) {
		var distro = data.watch.distro;

		if(repo[distro]) {
			repo[distro] = repo[distro].concat(data.packages);
		} else {
			repo[distro] = data.packages;
		}

		return repo;
	}

	/* Genero un mapa { <distro> => { <paquete> => {contenidos} } } */
	function create_distro_dictionary(packages) {
		packages = packages || []; /* Si por alguna razón no hay packages hago un array vació en lugar de undefined */
		return packages.reduce(fold_packages, {});
	}

	function unify_data(data) {
		var distros;

		debug('Unificando los datos de cada archivo');

		distros = data.reduce(divide_distros, {});
		repo.contents = utils.object_map(distros, create_distro_dictionary);
		repo.dirty = false;
	}

	read_files_promises = repo.watches.map(read_to_repo);
	Promise.all(read_files_promises).then(unify_data);
}

function read_file_promise(filename) {
	return new Promise(read_file.bind(null, filename));
}

function read_file(filename, cb) {
	var usable_filename = filename.replace(config.REPO_DISTS_DIR, '');

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

	debug('Leyendo el archivo %s', usable_filename);

	fs.readFile(filename, gunzip);
}

function repo_get(repo, distro, package) {
	var distro_repo;

	distro_repo = repo.contents[distro] || {};

	return distro_repo[package];
}

function repo_get_distro(repo, distro) {
	return repo.contents[distro] || {};
}

function repo_get_any(repo, package_name, preferences) {
	var package;

	if(preferences instanceof Array) { /* Si es un array supongo que es un array de distros */
		package = preferences.find(function find_package(distro) {
			return repo.get(distro, package_name);
		});
	} else if(preferences instanceof String) { /* Si es un string supongo que es la distro */
		package = repo.get(preferences, package_name);
	}

	if(package !== undefined) {
		return package;
	}

	for(var distro in repo.contents) {
		package = repo.get(distro, package_name);

		if(package !== undefined) {
			return package;
		}
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

function init_binaries() {
	var cmdline = config.reprepro.search_package_files;
	return new Promise(function loaded(accept) {
		init_repo(cmdline, accept);
	});
}

function init_sources() {
	var cmdline = config.reprepro.search_source_files;

	return new Promise(function loaded(accept) {
		init_repo(cmdline, accept);
	});
}

function load_package_list() {
	var cmdline = config.reprepro.list_all_packages;
	var package_list = { dirty: true };

	function load() {
		return new Promise(function loaded(accept) {
			if(package_list.dirty) {
				debug('Lista de paquetes sin actualizar, actualizando');
				exec(cmdline, function all_packages(execerror, packages) {
					debug('Cargados %s nombres en la lista de paquetes', packages.split('\n').length);
					package_list.list = packages;
					package_list.dirty = false;
					accept(package_list);
				});
			}
		});
	}

	fs.watch(config.REPO_POOL_DIR, { recursive: true }, function mark_dirty() {
		package_list.dirty = true;
	});

	setInterval(load, config.LOAD_INTERVAL);

	return load();
}

function parse_packages(text, component) {
	var packages;

	function add_package(text) {
		var field_regex = /.+(\n[ ].*)*/g;
		var package;

		function add_field(package, field_match) {
			var field = field_match[0].split(':');
			var fieldname = field[0];

			package[fieldname] = field
				.slice(1) /* Quito el fieldname */
				.join(':') /* junto todo */
				.replace(/^ /mg, '') /* quito prefijos inútiles */
				.replace(/^\n/g, '');


			/* Si hay una función para parsear este field en particular la uso */
			if(FIELD[fieldname] !== undefined) {
				package[fieldname] = FIELD[fieldname](package[fieldname], fieldname);
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
	/*
	 * Algo feo que hago acá es usar keys en un array de JS,
	 * pero al encodearlo a JSON desaparecen, entonces
	 *                   ¯\_(ツ)_/¯
	 */
	var name = package.Package;
	var arch = package.Architecture;
	var version = {
		Architecture: package.Architecture,
		Version: package.Version,
		Size: package.Size,
		Filename: package.Filename,
		'Installed-Size': package['Installed-Size'],
	};

	if(packages[name]) {
		/* Un paquete all va a aparecer en varios lugares, (o podría existir en varios componentes) */
		if(packages[name].versions[arch] === undefined) {
			packages[name].versions.push(version);
			packages[name].versions[arch] = version;
		}
	} else {
		packages[name] = package;
		packages[name].versions = [version];
		packages[name].versions[arch] = version;

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
			var alternatives = matches.slice(1);
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

			if(alternatives.length > 0) {
				depend.Alternatives = alternatives.map(build_depend);
			}

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

function split_commas(text, fieldname) {
	var rval = { Text: text };
	rval[fieldname] = text.split(', ');

	return rval;
}

function split_newlines(text, fieldname) {
	var rval = { Text: text };
	rval[fieldname] = text.split('\n');

	return rval;
}

FIELD.Depends = parse_depends;
FIELD.Suggests = parse_depends;
FIELD.Conflicts = parse_depends;
FIELD.Recomends = parse_depends;
FIELD['Pre-Depends'] = parse_depends;
FIELD['Build-Depends'] = parse_depends;
FIELD['Build-Depends-Indep'] = parse_depends;
FIELD.Description = parse_description;
FIELD.Binary = split_commas;
FIELD['Package-List'] = split_newlines;
FIELD['Checksums-Sha1'] = split_newlines;
FIELD['Checksums-Sha256'] = split_newlines;
FIELD.Files = split_newlines;

module.exports = {
	init_parser: init_parser,
	read_file: read_file,
	repo_get: repo_get,
	repo_get_distro: repo_get_distro,
	repo_get_any: repo_get_any,
	init_binaries: init_binaries,
	init_sources: init_sources,
	load_package_list: load_package_list,
	parse_packages: parse_packages,
	parse_depends: parse_depends,
	parse_description: parse_description,
	split_commas: split_commas,
	split_newlines: split_newlines
};
