config = {};

config['API_PORT'] = 8080;
config['DEBUG'] = true;
config['LOG_EXEC_OUTPUT'] = false; /* No tiene efecto aún */
config['REPREPRO_BASE_DIR'] = process.env['REPREPRO_BASE_DIR'];
config['REPO_DISTS_DIR'] = config.REPREPRO_BASE_DIR + '/dists';
config['reprepro'] = {
	package_versions: 'cat examples/package_versions',
	distro_list: 'cat examples/distro_list',
	search_package_files: 'cat examples/repo_package_files',
	search_source_files: 'cat examples/repo_source_files'
};
//config['reprepro'] = {
//	package_versions: 'reprepro ls "<package>"',
// 	distro_list: 'cat ' + config.REPREPRO_BASE_DIR + '/conf/distributions',
// 	distro_packages: 'reprepro list "<distro>"',
//	search_package_files: 'find "' + config.REPO_DISTS_DIR + '" -iname Packages.gz',
//	search_source_files: 'find "' + config.REPO_DISTS_DIR + '" -iname Sources.gz'
//};
module.exports = config;
