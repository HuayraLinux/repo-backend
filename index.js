/* Imports */
var express = require('express');
var exec = require('child_process').exec;
var utils = require('./utils');
var debian_packages = require('./debian_packages');
var config = require('./config');
var debug = require('./debug')('webapp');
var repo = { binaries_loaded: false, sources_loaded: false };

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

	if(repo.binaries_loaded === false) {
		error = {
			code: 500,
			message: 'El servicio no terminó de inicializarse, intente en unos minutos',
			params: params
		};

		res.status(500);
		res.send(error);
		debug('NOT-INITIALIZED', req.method, req.url, error.message);

		return;
	}

	package = repo.binaries.get(distro, package_name);

	if(package === undefined) {
		error = {
			code: 404,
			message: 'No se encontró el paquete binario \'' + package_name + '\' en la distro \'' + distro + '\'',
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

	if(repo.sources_loaded === false) {
		error = {
			code: 500,
			message: 'El servicio no terminó de inicializarse, intente en unos minutos',
			params: params
		};

		res.status(500);
		res.send(error);
		debug('NOT-INITIALIZED', req.method, req.url, error.message);

		return;
	}

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

app.get('/distributions/:distro/packages', function get_distro_packages(req, res) {
	var params = sanitize_input(req.params);
	var packages = repo.binaries.get_distro(params.distro);
	var sources = repo.sources.get_distro(params.distro);
	var package_list = object_values(packages);

	function extract_data(package) {
		var versions = package.versions.map(extract_data_versions);
		var source = sources[package.Package];

		if(source) {
			var source_versions = source.versions.map(extract_data_versions);

			versions = versions.concat(source_versions);
		}

		return {
			Package: package.Package,
			Component: package.Component,
			versions: versions
		};
	}

	function extract_data_versions(version) {
		return {
			Version: version.Version,
			Architecture: version.Architecture
		};
	}

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

	res.send(package_list.map(extract_data));
});

app.listen(config.API_PORT, function start_server() {
  console.log('Example app listening on port', config.API_PORT);
});


function load_packages() {
	function binaries_loaded(binaries) {
		repo.binaries_loaded = true;
		repo.binaries = binaries;

		debug('Cargados los binarios');
	}

	function sources_loaded(sources) {
		repo.sources_loaded = true;
		repo.sources = sources;

		debug('Cargados los sources');
	}

	debian_packages.init_binaries(binaries_loaded);
	debian_packages.init_sources(sources_loaded);

	debug('Cargando binarios y sources');
}

load_packages();
