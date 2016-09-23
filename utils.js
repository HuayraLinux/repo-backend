module.exports.array_iterator = function array_iterator(array) {
	array = array_clone(array).reverse();
	return function() {
		return array.pop();
	}
}

module.exports.array_clone = function array_clone(array) {
	return array.concat([]);
}

module.exports.format = function format(string) {
	var args = Array.prototype.slice.call(arguments, 1);
	return string.replace(/%s/g, array_iterator(args));
}

module.exports.format_map = function format_map(string, map) {
	function get_param(match, param) {
		return map[param];
	}
	return string.replace(/<([^<>]+)>/g, get_param);
}

module.exports.object_map = function object_map(obj, f) {
	var rval = {};
	for(key in obj) {
		rval[key] = f(obj[key], key);
	}
	return rval;
}