var config = {
	config: function config(name, default_value) {
		this[name] = process.env[name] === undefined ? default_value : process.env[name];
		return this;
	}
};

config
.config('API_PORT', 8080)
.config('LOG', true)
.config('LOG_EXEC_OUTPUT', false) /* No tiene efecto aún */
.config('REPREPRO_BASE_DIR')
.config('REPO_DISTS_DIR', config.REPREPRO_BASE_DIR + '/dists')
.config('PIDFILE');

config.reprepro = {
	package_versions: 'cat test_data/package_versions',
	distro_list: 'cat test_data/distro_list',
	search_package_files: 'cat test_data/repo_package_files',
	search_source_files: 'cat test_data/repo_source_files'
};

module.exports = config;
