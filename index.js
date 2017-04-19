/* Imports */
var Promise = require('es6-promise');
var express = require('express');
var exec = require('child_process').exec;
var utils = require('./utils');
var util = require('util');
var debian_packages = require('./debian_packages');
var config = require('./config');
var debug = require('./debug')('webapp');
var node_error = require('./debug')('NODE-ERROR');
var repo = {};

var format = util.format;
var format_map = utils.format_map;
var object_map = utils.object_map;
var object_values = utils.object_values;

/* Variables */
var app = express();

function sanitize_input(req) {
	function strip_illegal_chars(str) {
		return str.replace(/[^a-z0-9-+.]/g, '');
	}
	return object_map(req, strip_illegal_chars);
}

process.on('uncaughtException', function evitar_que_explote_todo(error) {
	node_error('Se produjo una excepción que no fué capturada (casi cierra el proceso)');
	console.log(error.stack || error.message);
});

/* Agrego los headers de CORS */
app.use(function add_cors_headers(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
});

app.get('/packages/search/:query', function get_package_search(req, res) {
	var params = sanitize_input(req.params);
	var search = new RegExp('.*' + params.query + '.*', 'g');
	var results = repo.package_list.list.match(search) || [];

	var query_results = results.map(function augument_result(title) {
		var package = repo.binaries.get_any(title, config.prefered_distro) || repo.sources.get_any(title, config.prefered_distro) || {};
		var description = package.Description || {};

		return {
			title: title,
			description: description['Short-Description'],
		};
	});

	res.send(query_results);
});

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
app.get('/packages/:package', function get_package_versions(req, res) {
	var params = sanitize_input(req.params);
	var cmdline = format_map(config.reprepro.package_versions, req.params);

	debug(req.method, req.url);

	exec(cmdline, function exec_package_versions(execerror, stdout, stderr) {
		var salida = stdout
			.toString()
			.replace(/ /g, '')   /* Quito todos los espacios  */
			.replace(/^u\|/m, '') /* la marca de paquetes udeb */
			.replace(/\n$/g, '');  /* y el salto de línea final */
		var versiones;

		function add_version(versions, text) {
			var data = text.split('|');

			return {
				package: data[0],
				versions: versions.versions.concat({
					version: data[1],
					distribution: data[2],
					archs: data[3].split(',')
				})
			};
		}

		/* Si la salida es vacía no se encontró el paquete */
		if(salida === '') {
			var error = {
				code: 404,
				message: 'No se encontró el paquete \'' + params.package + '\'',
				params: params,
				stderr: stderr.toString()
			};

			res.status(404);
			res.send(error);
			debug('NOT-FOUND:', req.method, req.url, error.message);

			return;
		}

		versiones = salida
			.split('\n')
			.reduce(add_version, { versions: [] });

		res.send(versiones);
	});
});

app.get('/packages/:distro/:package', function get_package_info(req, res) {
	var params = sanitize_input(req.params);
	var distro = params.distro;
	var package_name = params.package;
	var package;
	var error;

	debug(req.method, req.url);

	package = repo.binaries.get(distro, package_name);

	if(package === undefined) {
		error = {
			code: 404,
			message: format('No se encontró el paquete binario \'%s\' en la distro \'%s\'', package_name, distro),
			params: params
		};

		res.status(404);
		res.send(error);
		debug('NOT-FOUND:', req.method, req.url, error.message);

		return;
	}

	res.send(package);
});

app.get('/sources/:distro/:package', function get_source_info(req, res) {
	var params = sanitize_input(req.params);
	var distro = params.distro;
	var package_name = params.package;
	var package;
	var error;

	debug(req.method, req.url);

	package = repo.sources.get(distro, package_name);

	if(package === undefined) {
		error = {
			code: 404,
			message: 'No se encontró el paquete source \'' + package_name + '\' en la distro \'' + distro + '\'',
			params: params
		};

		res.status(404);
		res.send(error);
		debug('NOT-FOUND:', req.method, req.url, error.message);

		return;
	}

	res.send(package);
});

app.get('/distributions', function get_distro_list(req, res) {
	var cmdline = config.reprepro.distro_list;
	var distributions;

	debug(req.method, req.url);

	exec(cmdline, function exec_distro_list(error, stdout, stderr) {

		var salida = stdout.toString();

		function add_distro(text) {

			function add_field(distro, text) {
				var field = text.split(': ');
				distro[field[0]] = field[1];
				return distro;
			}

			return text
				.split('\n')
				.reduce(add_field, {});
		}

		distributions = salida
			.split('\n\n')
			.map(add_distro);

		res.send(distributions);
	});
});

function extract_data(package) {

	function extract_versions(version) {
		return {
			Version: version.Version,
			Architecture: version.Architecture
		};
	}

	return {
		Package: package.Package,
		Description: package.Description['Short-Description'],
		Component: package.Component,
		versions: package.versions.map(extract_versions)
	};
}


app.get('/distributions/:distro/packages', function get_distro_packages(req, res) {
	var params = sanitize_input(req.params);
	var packages = repo.binaries.get_distro(params.distro);
	var package_list = object_values(packages).map(extract_data);

	debug(req.method, req.url);

	/* Si la salida es vacía no se encontró el paquete */
	if(Object.keys(packages).length === 0) {
		var error = {
			code: 404,
			message: 'No existe la distribución \'' + params.distro + '\'',
			params: params
		};

		res.status(404);
		res.send(error);
		debug('NOT-FOUND:', req.method, req.url, error.message);

		return;
	}

	res.send(package_list);
});

app.get('/distributions/:distro/sources', function get_distro_sources(req, res) {
	var params = sanitize_input(req.params);
	var packages = repo.sources.get_distro(params.distro);
	var package_list = object_values(packages).map(extract_data);

	debug(req.method, req.url);

	/* Si la salida es vacía no se encontró el paquete */
	if(Object.keys(packages).length === 0) {
		var error = {
			code: 404,
			message: 'No existe la distribución \'' + params.distro + '\'',
			params: params
		};

		res.status(404);
		res.send(error);
		debug('NOT-FOUND:', req.method, req.url, error.message);

		return;
	}

	res.send(package_list);
});

function load_packages() {
	function binaries_loaded(binaries) {
		repo.binaries = binaries;

		debug('Cargados los binarios');
	}

	function sources_loaded(sources) {
		repo.sources = sources;

		debug('Cargados los sources');
	}

	function packages_listed(packages) {
		repo.package_list = packages;

		debug('Cargada la lista de paquetes');
	}

	Promise.all([
		debian_packages.init_binaries().then(binaries_loaded),
		debian_packages.init_sources().then(sources_loaded),
		debian_packages.load_package_list().then(packages_listed)
	]).then(function start_app() {
		app.listen(config.API_PORT, function start_server() {
		  console.log('repo-backend listening on port', config.API_PORT);
		});
	});

	debug('Cargando binarios y sources');
}

load_packages();

if(config.PIDFILE) {
	debug("Creando pidfile (%s)", config.PIDFILE);

	require('fs').writeFile(config.PIDFILE, process.pid);

	process.on('exit', function remove_pidfile() {
		debug("Borrando pidfile (%s)", config.PIDFILE);
		require('fs').unlinkSync(config.PIDFILE);
	});

	process.on('SIGTERM', function recv_sigterm() {
		debug("Recibí un sigterm, buenas noches!");
		process.exit();
	});

	process.on('SIGINT', function recv_sigint() {
		debug("Recibí un sigint, buenas noches!");
		process.exit();
	});
}
