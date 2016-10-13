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
var object_valuemap = utils.object_valuemap;
var object_filter = utils.object_filter;
var object_map = utils.object_map;
var object_merge = utils.object_merge;
var Waiter = utils.Waiter;

/* Diccionario para parsear fields específicos */
var FIELD = {};

function init_parser(files) {
	var repo = {};

	function watch_file(filename) {
		var filewatch;
		var distro_regex = /\/([^/]+)\/[^/]+\/[^/]+\/[^/]+$/;
		var distro_match = distro_regex.exec(filename);
		var distro = distro_match && distro_match[1] ? distro_match[1] : 'unknown';

		function read_to_repo(event, __, load) {
			var usable_filename = filename.replace(config.REPO_DISTS_DIR, '');

			function save_to_repo(contents, filename) {
				var distro_match = distro_regex.exec(filename);
				var distro = distro_match && distro_match[1] ? distro_match[1] : 'unknown';

				debug('Registrando la información de %s', filename);

				filewatch.contents = contents;
				filewatch.filename = filename;
				filewatch.distro = distro;
				filewatch.lastread = Date.now();

				/* Me dieron un callback para cuando cargue la distro */
				if(load !== undefined) {
					load();
				}
			}

			debug('El archivo [%s] se ha modificado (event: %s)', usable_filename, event);

			read_file(filename, save_to_repo);
		}

		filewatch = {
			contents: undefined,
			filename: filename,
			distro: distro,
			lastread: 0,
			watch: fs.watch(filename, read_to_repo)
		};

		//filewatch.watch.emit('change', 'load', filename); /* Emito el evento de cargar el archivo */

		return filewatch;
	}

	function divide_distros(distro_map, watch) {
		var distro = watch.distro;

		if(distro_map[distro]) {
			distro_map[distro].push(watch);
		} else {
			distro_map[distro] = [watch];
			distro_map[distro].distro = distro;
		}

		return distro_map;
	}

	repo.watches = files.map(watch_file).reduce(divide_distros, {});
	repo.get = repo_get.bind(null, repo);
	repo.get_distro = repo_get_distro.bind(null, repo);
	repo.contents = {};

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

function repo_get(repo, distro, package, cb) {

	function distro_loaded(distro) {
		cb(distro[package]);
	}

	repo_get_distro(repo, distro, distro_loaded);
}

function repo_get_distro(repo, distro, cb) {

	function access_distro(distro) {
		distro.lastaccess = Date.now();
		cb(distro);
	}

	repo_check_news(repo);

	if(repo.contents[distro] === undefined) {
		/* No se cargó la distro */
		repo_load_distro(repo, distro, access_distro);
	} else {
		access_distro(repo.contents[distro]);
	}
}

function repo_load_distro(repo, distro, cb) {
	var load_all = Waiter();

	function wait_file_load(watch) {
		watch.watch.emit('change', 'load', undefined, load_all.wait());
	}

	function call_cb() {
		var distro_contents = repo_add_distro(repo, distro);
		cb(distro_contents);
	}

	repo.watches[distro].forEach(wait_file_load);
	load_all.set_cb(call_cb);
}

function repo_add_distro(repo, distro) {
	var watches = repo.watches[distro];
	var distro_contents = fold_distro(watches, distro);

	repo.contents[distro] = distro_contents;

	return distro_contents;
}

function repo_check_news(repo) {
	var updated_distros;
	var folded_distros;

	function is_updated(distro_watches) {

		function is_newer(watch) {
			var distro_repo = repo.contents[watch.distro];

			/* Si la distro no está cargada */
			if(distro_repo === undefined) {
				return false;
			}

			return distro_repo.lastfold < watch.lastread;
		}

		return distro_watches.some(is_newer);
	}

	updated_distros = object_filter(repo.watches, is_updated);
	folded_distros = object_map(updated_distros, fold_distro);
	object_merge(repo.contents, folded_distros);
}

function fold_distro(watches, distro) {
	var distro_map;

	function fold_watch(contents, watch) {
		var watch_contents = watch.contents || []; /* Si por alguna razón no hay packages hago un array vacío en lugar de undefined */
		return watch_contents.reduce(fold_packages, contents);
	}

	distro_map = watches.reduce(fold_watch, { lastfold: Date.now(), lastaccess: Date.now(), distro: distro });

	return distro_map;
}

function repo_clean(repo) {
	var now = Date.now();

	function delete_if_idle(distro, name) {
		var elapsed_time = now - distro.lastaccess;

		if(elapsed_time > config.DISTRO_TTL) {
			debug("Borrando la distro %s (más de %s segundos de inactividad)", name, elapsed_time / 1000);
			delete repo.contents[name];

			repo.watches[name].map(delete_watch_contents);
		}
	}

	function delete_watch_contents(watch) {
		delete watch.contents;
	}

	object_map(repo.contents, delete_if_idle);
}

function init_repo(search_repo_files_cmdline, cb) {
	var cmdline = search_repo_files_cmdline;

	function exec_search_files(error, stdout, stderr) {
		var files = stdout
			.toString()
			.replace(/\n+$/, '') /* Vuelo el salto de línea final */
			.split('\n');
		var repo = init_parser(files);

		setInterval(repo_clean.bind(null, repo), config.DISTRO_TTL);

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
	repo_check_news: repo_check_news,
	init_binaries: init_binaries,
	init_sources: init_sources,
	parse_packages: parse_packages,
	parse_depends: parse_depends,
	parse_description: parse_description,
	split_commas: split_commas,
	split_newlines: split_newlines
};
