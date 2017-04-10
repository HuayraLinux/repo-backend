const text = require('fs').readFileSync('paquetes', 'utf8');
const list = text.split('\n');

// Timing: ~50ms
function search(term) {
	var result = [];
	var match;
	const regexp = RegExp(`.*(${term}).*`, 'g');
	while(match = regexp.exec(text)) {
		result.push(match[0]);
	}
	return result;
}

// Timing: ~20ms
function naivesearch(term) {
	return list.filter(function(paquete) {
		return paquete.search(term) != -1
	});
}

// Timing: ~15ms
function matchsearch(term) {
	const regexp = RegExp(`.*${term}.*`, 'g');
	return text.match(regexp);
}
const start = process.hrtime();
search('ssl');
search('huayra-');
console.log(process.hrtime(start)); // Log passed time
const naivestart = process.hrtime();
naivesearch('ssl');
naivesearch('huayra-');
console.log(process.hrtime(naivestart)); // Log passed time
const matchstart = process.hrtime();
matchsearch('ssl');
matchsearch('huayra-');
console.log(process.hrtime(matchstart)); // Log passed time
