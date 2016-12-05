var config = {
	config: function config(name, default_value) {
		this[name] = process.env[name] || default_value;
		return this;
	}
};

config
.config('API_PORT', 8080)
.config('LOG', true)
.config('LOG_EXEC_OUTPUT', false) /* No tiene efecto aún */
.config('REPREPRO_BASE_DIR')
.config('REPO_DISTS_DIR', config.REPREPRO_BASE_DIR + '/dists')
.config('LOGFILE')
.config('PIDFILE')
.config('LOAD_INTERVAL', 600000);

config.reprepro = {
	package_versions: 'reprepro ls "<package>"',
	distro_list: 'cat ' + config.REPREPRO_BASE_DIR + '/conf/distributions',
	search_package_files: 'find "' + config.REPO_DISTS_DIR + '" -iname Packages.gz',
	search_source_files: 'find "' + config.REPO_DISTS_DIR + '" -iname Sources.gz'
};

module.exports = config;
