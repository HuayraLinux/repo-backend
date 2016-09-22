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