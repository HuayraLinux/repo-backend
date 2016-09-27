config = {};

config['API_PORT'] = 8081;
config['REPREPRO_BASE_DIR'] = process.env['REPREPRO_BASE_DIR'];
config['REPO_DISTS_DIR'] = config.REPREPRO_BASE_DIR + '/dists';
config['DEBUG'] = true;
config['LOG_EXEC_OUTPUT'] = false; /* No tiene efecto aún */
config['reprepro'] = {
	package_versions: 'reprepro ls "<package>"',
	distro_list: 'cat ' + config.REPREPRO_BASE_DIR + '/conf/distributions',
	distro_packages: 'reprepro list "<distro>"',
	distro_repo_binaries: 'find "' + config.REPO_DISTS_DIR + '/<distro>" -iname Packages.gz -exec cat \\{\\} \\; | gunzip',
	distro_repo_sources: 'find "' + config.REPO_DISTS_DIR + '/<distro>" -iname Sources.gz -exec cat \\{\\} \\; | gunzip'
};
module.exports = config;
