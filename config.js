config = {};

config['API_PORT'] = 8080;
config['REPREPRO_BASE_DIR'] = '';
config['REPO_DISTS_DIR'] = config.REPREPRO_BASE_DIR + 'huayra/dists/';
config['reprepro'] = {
	package_versions: 'cat examples/package_versions',
	package_info: 'cat examples/package_info',
	distro_list: 'cat examples/distro_list',
	distro_packages: 'cat examples/distro_packages',
	distro_repo_packages: 'cat examples/distro_repo_packages'
};
//config['reprepro'] = {
//	package_versions: 'reprepro ls "<package>"',
// 	package_info: '', /* Parsear Release */
// 	distro_list: 'cat ' + config.REPREPRO_BASE_DIR + 'conf/distributions',
// 	distro_packages: 'reprepro list "<distro>"',
//	distro_repo_packages: 'find "' + config.REPO_DISTS_DIR + '<distro>/InRelease" -type f -iname Packages -exec cat \{\} \;'
//};

module.exports = config;