config = {};

config['API_PORT'] = 8081;
config['REPREPRO_BASE_DIR'] = process.env['REPREPRO_BASE_DIR'];
config['REPO_DISTS_DIR'] = config.REPREPRO_BASE_DIR + '/dists/';
config['DEBUG'] = true;
config['LOG_EXEC_OUTPUT'] = false; /* No tiene efecto aún */
//config['reprepro'] = {
//	package_versions: 'cat examples/package_versions',
//	distro_list: 'cat examples/distro_list',
//	distro_packages: 'cat examples/distro_packages',
//	distro_repo_binaries: 'cat examples/distro_repo_binaries',
//	distro_repo_sources: 'cat examples/distro_repo_sources'
//};
config['reprepro'] = {
	package_versions: 'reprepro ls "<package>"',
	distro_list: 'cat ' + config.REPREPRO_BASE_DIR + '/conf/distributions',
	distro_packages: 'reprepro list "<distro>"',
	distro_repo_binaries: 'find "' + config.REPO_DISTS_DIR + '<distro>" -iname Packages.gz -exec cat \{\} \; | gunzip',
	distro_repo_sources: 'find "' + config.REPO_DISTS_DIR + '<distro>" -iname Sources.gz -exec cat \{\} \; | gunzip'
};
module.exports = config;
