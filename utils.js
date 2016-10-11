module.exports.array_iterator = function array_iterator(array) {
	array = array_clone(array).reverse();

	return function pop_value() {
		return array.pop();
	};
};

module.exports.array_clone = function array_clone(array) {
	return array.concat([]);
};

module.exports.format_map = function format_map(string, map) {
	function get_param(match, param) {
		return map[param];
	}

	return string.replace(/<([^<>]+)>/g, get_param);
};

module.exports.object_map = function object_map(obj, f) {
	var rval = {};

	for(var key in obj) {
		rval[key] = f(obj[key], key);
	}
	return rval;
};

module.exports.object_flatmap = function object_flatmap(obj, f) {
	var rval = [];

	for(var key in obj) {
		rval.push(f(obj[key], key));
	}
	return rval;
};

module.exports.regex_fold = function regex_fold(regex, string, f, initial_value) {
	var match = regex.exec(string);
	var accumulator = initial_value;

	while(match) {
		accumulator = f(accumulator, match);
		match = regex.exec(string);
	}
	return accumulator;
};

module.exports.object_values = function object_values(obj) {
	function get_field(field) {
		return obj[field];
	}

	return Object.keys(obj).map(get_field);
};

module.exports.get_field = function get_field(field) {
	return function getter(obj) {
		return obj[field];
	};
};
