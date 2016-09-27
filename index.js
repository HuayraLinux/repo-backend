/* Imports */
var express = require('express');
var exec = require('child_process').exec;
var utils = require('./utils');
var get_package = require('./debian_packages').get_package;
var get_source = require('./debian_packages').get_source;
var config = require('./config');
var debug = require('./debug')('webapp');
/* Variables */
var app = express();

function sanitize_input(req) {
	function strip_illegal_chars(str) {
		return str.replace(/[^a-z0-9-+.]/g, '');
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
app.get('/packages/:package', function get_package_versions(req, res) {
	var params = sanitize_input(req.params);
	var cmdline = utils.format_map(config.reprepro.package_versions, req.params);

	debug(req.method, req.url);

	exec(cmdline, function exec_package_versions(error, stdout, stderr) {
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
				message: 'No se encontró el paquete \'' + req.package + '\'',
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

	debug(req.method, req.url);

	function send(package) {
		if(package === undefined) {
			var error = {
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
	}

	get_package(distro, package_name, send);
});

app.get('/sources/:distro/:package', function get_source_info(req, res) {
	var params = sanitize_input(req.params);
	var distro = params.distro;
	var package_name = params.package;

	debug(req.method, req.url);

	function send(package) {
		if(package === undefined) {
			var error = {
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
	}

	get_source(distro, package_name, send);
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
	var cmdline = utils.format_map(config.reprepro.distro_packages, params);

	debug(req.method, req.url);

	exec(cmdline, function exec_distro_packages(error, stdout, stderr) {
		var salida = stdout
			.toString()
			.replace(/\n$/g, ''); /* Quito el salto de línea final */
		var packages;
		var package_list;

		function add_package(text) {
			var package = {};
			var data = text.split(': ');

			function add_repo_data(text, index) {
				var FIELDS = ['distro', 'component', 'arch'];
				package[FIELDS[index]] = text;
				return package;
			}

			function add_package_data(text, index) {
				var FIELDS = ['package', 'version'];
				package[FIELDS[index]] = text;
				return package;
			}

			data[0]
				.replace(/^u\|/, '') /* Quito la marca de udeb porque no la usamos */
				.split('|')
				.forEach(add_repo_data);
			data[1]
				.split(' ')
				.forEach(add_package_data);

			return package;
		}

		function fold_packages(packages, package) {
			var name = package.package;
			var version = {
				arch: package.arch,
				version: package.version
			};

			if(packages[name]) {
				packages[name].versions.push(version);
			} else {
				packages[name] = {
					package: name,
					distro: package.distro,
					component: package.component,
					versions: [version]
				};
			}
			return packages;
		}

		/* Si la salida es vacía no se encontró el paquete */
		if(salida === '') {
			var error = {
				code: 404,
				message: 'No existe la distribución \'' + req.distro + '\'',
				params: params,
				stderr: stderr.toString()
			};

			res.status(404);
			res.send(error);
			debug('NOT-FOUND:', req.method, req.url, error.message);

			return;
		}

		packages = salida
			.split('\n')
			.map(add_package)
			.reduce(fold_packages, {});

		package_list = utils.object_values(packages);

		res.send(package_list);
	});
});

app.listen(config.API_PORT, function start_server() {
  console.log('Example app listening on port', config.API_PORT);
});
