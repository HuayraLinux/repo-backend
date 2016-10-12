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

module.exports.object_valuemap = function object_valuemap(obj, f) {
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

module.exports.object_filter = function object_filter(obj, cb) {
	var rval = {};

	for(var key in obj) {
		if(cb(obj[key], key)) {
			rval[key] = obj[key];
		}
	}

	return rval;
};

module.exports.object_merge = function object_merge(dest, orig) {
	for(var key in orig) {
		dest[key] = orig[key];
	}

	return dest;
};

module.exports.get_field = function get_field(field) {
	return function getter(obj) {
		return obj[field];
	};
};

module.exports.Waiter = function Waiter(cb, cb_this, args) {
	if(!(this instanceof Waiter)) {
		return new Waiter(cb, cb_this, args);
	}

	if(cb) {
		this.set_cb(cb, cb_this, args);
	}

	this._waits = [];
};

module.exports.Waiter.prototype = {
	/* Returns a callback that waits */
	wait: function wait() {
		var self = this;
		var wait = {
			done: false,
			called: function called(called) {
				wait.done = true;
				wait.arguments = arguments;

				if(self.cb && self._waits.every(is_fullfiled)) {
					self.cb(self._waits);
				}
			}
		};

		function is_fullfiled(wait) {
			return wait.done;
		}

		this._waits.push(wait);

		return wait.called;
	},

	set_cb: function set_cb(cb, cb_this, args) {

		function is_fullfiled(wait) {
			return wait.done;
		}

		if(cb_this || args) {
			this.cb = cb.bind.apply(cb, [cb_this].concat(args));
		} else {
			this.cb = cb;
		}

		if(this._waits.every(is_fullfiled)) {
			this.cb(this._waits);
		}
	}
};