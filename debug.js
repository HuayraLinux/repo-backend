var enabled = require('./config.js').DEBUG;

if(enabled) {
	module.exports = function gen_logger(namespace) {
		return console.log.bind(console, '[DEBUG: ' + namespace + ']');
	}
} else {
	module.exports = function dummy_logger() {
		return function dummy() {};
	}
}