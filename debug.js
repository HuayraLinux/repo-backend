var enabled = require('./config.js').DEBUG;
var stacktrace = require('stacktrace-js');
var format = require('util').format;
var basename = require('path').basename;

function dummy() {
}

if(enabled) {
	module.exports = function gen_logger(namespace) {
		function logger() {
			var now = (new Date()).toISOString();
			var args = Array.prototype.slice.call(arguments);
			var stack = stacktrace.getSync();
			var log_format = "[%s/%s/%s %s:%s] %s";
			var caller = stack[1]; /* stack[0] es logger */
			var f = caller.functionName;
			var file = basename(caller.fileName); /* Muestro únicamente el nombre del archivo */
			var line = caller.lineNumber;
			var args_format = args[0];
			var args_args = args.slice(1);
			var string = format(log_format, now, namespace, f, file, line, args_format);

			if(args_args.length > 0) {
				console.log.apply(console, [string].concat(args_args));
			} else {
				console.log(string);
			}
		}

		return logger;
	};
} else {
	module.exports = function dummy_logger() {
		return dummy;
	};
}
