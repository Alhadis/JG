"use strict";

const fs           = require("fs");
const {join}       = require("path");
const {inspect}    = require("util");
const textUtils    = importESMUtils("text");
const [isBrowser]  = importESMUtils("misc", ["isBrowser"]);
const {deindent, parsePrimitive} = textUtils;

const matchTypedef = makeTagExpr("typedef");
const matchVar     = makeTagExpr(["var", "member"], {global: true});

module.exports = {
	matchTypedef,
	matchVar,
	makeTagExpr,
	parseDesc,
	parseTypedef,
	parseVars,
	resolveType,
	joinTypes,
	uniq,
	log,
	makeField,
	offsetToPoint,
};


/**
 * Generate a {@link RegExp} to match stuff like this:
 *
 * @param {String|String[]} names
 * @param {Object}  [options={}]
 * @param {Boolean} [options.hasType=true]
 * @param {Boolean} [options.hasName=true]
 * @return {RegExp}
 */
function makeTagExpr(names, {hasType = true, hasName = true, global = false} = {}){
	names = "string" === typeof names ? [names] : names;
	let tag = "(?:^|\\r?\\n)(?:\\s*\\*)\\s*@" + (names.length > 1 ? `(?:${names.join("|")})` : names[0]);
	if(hasType || hasName) tag += "\\s+";
	if(hasType)            tag += "{(.+?)}\\s*";
	if(hasName)            tag += "((?:[^*\\s]|\\*(?!\\/))+)";
	
	const descStart = /[ \t]+(?=\S)(?:[^\r\n*]|\*(?!\/))+/;
	const descLine  = /\s*(?:\r?\n(?!\s*\*\s*@)(?:[ \t]*\*(?!\/))?\s*(?!@)(?:[^@*\s]|[ \t]|\*(?!\/)|(?<={)@(?:link|tutorial)\b)*)+/;
	const desc      = `${descStart.source}(?:${descLine.source})?|${descLine.source}`;
	return new RegExp(`${tag}(${desc})?`, "s" + (global ? "g" : ""));
}


/**
 * “Flatten” a (possibly multiline) description of a symbol.
 * @param {String} input
 * @return {String}
 */
function parseDesc(input){
	if(!input) return input;
	return deindent(input.replace(/^[ \t]*-\s*/, "").replace(/^[ \t]*\*/gm, ""));
}


/**
 * Parse a {@link https://jsdoc.app/tags-typedef.html|@typedef} tag into an object.
 * @param {String} input
 * @param {Number} [fileOffset=0]
 * @return {ParsedTypedef}
 */
function parseTypedef(input, fileOffset = 0){
	/**
	 * @typedef  {Object} ParsedTypedef
	 * @property {Function|String} type
	 * @property {String} name
	 * @property {String} desc
	 * @property {Number[]} range
	 */
	const match = input.match(matchTypedef);
	if(!match) return null;
	const offset = fileOffset + match.index;
	const range = [offset, offset + match[0].length];
	range[0] += match[0].indexOf("@");
	range[1] -= (match[0].match(/(?:(?:\r?\n)[ \t]*\*\/?)+\s*$/) || [""])[0].length;
	const type = resolveType(match[1]);
	const name = match[2];
	const desc = parseDesc(match[3]);
	return {type, name, desc, range};
}


/**
 * Parse {@link https://jsdoc.app/tags-member.html|@var} tags into objects.
 * @param {String} input
 * @param {Number} [fileOffset=0]
 * @return {ParsedVar[]}
 */
function parseVars(input, fileOffset = 0){
	/**
	 * @typedef  {Object} ParsedVar
	 * @property {Function|String} type
	 * @property {String} name
	 * @property {String} desc
	 * @property {Number[]} range
	 * @property {*} [defaultValue]
	 */
	return [...input.matchAll(matchVar)].map(match => {
		const offset = fileOffset + match.index;
		const range = [offset, offset + match[0].length];
		range[0] += match[0].indexOf("@");
		range[1] -= (match[0].match(/(?:(?:\r?\n)[ \t]*\*\/?)+\s*$/) || [""])[0].length;
		return {
			defaultValue: extractVarDefault(match) ?? undefined,
			type: resolveType(match[1]),
			name: match[2],
			desc: parseDesc(match[3]),
			range,
		};
	});
}

/**
 * Clean up parsed data from a var-tag that improperly used default-value syntax.
 *
 * This is caused by treating {@linkcode @var|https://jsdoc.app/tags-member} tags
 * like {@linkcode @param|https://jsdoc.app/tags-param} tags in that enclosing the
 * name in [squareBrackets="with-an-optional-default-value"], but with a different
 * intent.
 *
 * @param {String[]} input
 *   The array being parsed to create a {@link ParsedVar}. If the input suffers
 *   from the JSDoc abuse described above, the input's contents are modified in-place.
 * @return {*}
 * @api private
 */
function extractVarDefault(input){
	const name = input[2];
	const desc = input[3];
	if(!name.startsWith("[") || name.includes("]"))
		return null;

	// Find the terminating closing bracket
	const unquoted = /^\s*=\s*(?<unquoted>[^"'\[\]\s]+)[ \t]*\]/d;
	const quoted   = /^\s*=\s*(?<quote>"|')(?<quoted>(?:(?!\k<quote>)[^\\]|\\.)*)\k<quote>[ \t]*\]/d;
	const match    = desc.match(unquoted) || desc.match(quoted);
	if(match){
		const vd = match[0].trim().replace(/^=\s*|\s*\]$/g, "");
		input[2] = input[2].slice(1);
		input[3] = input[3].slice(match[0].length);
		return (parsePrimitive(vd) ?? {value: vd}).value;
	}

	// Nothing to extract
	return null;
}


/**
 * Resolve a reference to a named constructor class.
 * @param {String} name - Name of class
 * @return {Function|String}
 */
function resolveType(name){
	return "function" === typeof globalThis[name]
		? globalThis[name]
		: name;
}


/**
 * Produce a union-type annotation from {@link ParsedVar} objects.
 *
 * @example joinTypes([
 *    {type: String, name: "foo", desc: ""},
 *    {type: Number, name: "bar", desc: ""},
 * ]) == "Number|String";
 *
 * @param {ParsedVar} types
 * @return {String}
 */
function joinTypes(types){
	types = types.map(({type}) => "function" === typeof type ? type.name : String(type));
	return uniq(types).sort().join("|");
}


/**
 * Filter duplicate values from a list.
 * @param {Array} input
 * @return {Array}
 */
function uniq(input){
	return Array.from(new Set(input));
}


/**
 * Print coloured, formatted messages to standard error.
 *
 * This function is needed because {@linkcode console.log|console.log()}
 * writes to standard output, which would disrupt JSDoc's JSON output.
 *
 * NOTE: If running in a browser or browser-like environment (like Electron),
 * this function merely invokes the WHATWG Console method of the same name.
 * There's obviously no standard output/error streams to care about.
 *
 * @param {*} [values]
 * @return {void}
 */
function log(...values){
	if(!values.length) return;
	if(isBrowser())
		return console.log(...values);
	
	const opts = {
		colors: process.stderr.isTTY,
		maxArrayLength: Infinity,
		showHidden: false,
		depth: null,
	};
	values = values.map(value =>
		"string" === typeof value ? value : inspect(value, opts)
	).join(" ").replace(/^(?:  )+/gm, s => "\t".repeat(s.length / 2));
	if(!values.endsWith("\n"))
		values += "\n";
	process.stderr.write(values);
}


/**
 * Generate a commented object member from a {@link ParsedVar|parsed @var tag}.
 * @todo Make this work with values that aren't strings or numbers.
 * @param {ParsedVar} input
 * @return {String}
 */
function makeField({type, name, desc}){
	const key   = type.name || type;
	const value = type(name);
	const jsdoc = desc
		? `/**\n${desc.replace(/^/gm, "\t * ")}\n\t * @type {${key}}\n\t */`
		: `/** @type {${key}} */`;
	return `\t${jsdoc}\n\t${value}: ${JSON.stringify(value)},`;
}


/**
 * Convert an absolute byte-offset to line/column numbers.
 *
 * @param {Number} offset
 * @param {String} input
 * @param {Number} [indexOrigin=1]
 * @return {Point}
 */
function offsetToPoint(offset, input, indexOrigin = 1){
	/**
	 * @typedef  {Object} Point
	 * @property {Number} line
	 * @property {Number} column
	 */
	const before = input.substring(0, offset);
	const eol = /\r?\n|\r/g;
	return {
		line: (before.match(eol) || []).length + indexOrigin,
		column: before.split(eol).pop().length + indexOrigin,
	};
}


/**
 * Synchronously import functions exported by a named library in the
 * [general-purpose utilities library]{@link https://github.com/Alhadis/Utils}.
 *
 * @param {String} lib - Name of an `.mjs` file (sans extension) located in the module's `lib` directory.
 * @param {String[]} [members=[]]
 *    An array of functions to import, which are returned as an array of functions in their order of appearancee.
 *    If empty, a null-prototype and sealed object is returned that includes all named exports from the file.
 * @return {Object|Function[]}
 * @api private
 */
function importESMUtils(lib, members = []){
	const utilsPath  = join(__dirname, ...`../node_modules/alhadis.utils/lib/${lib}.mjs`.split("/"));
	const otherUtils = fs.readFileSync(utilsPath, "utf8").replace(/^export /gm, "");
	if("string" === typeof members && members)
		members = [members];
	if(members.length){
		const results = [];
		for(const name of new Set(members)){
			const regex = new RegExp(String.raw `^function\*? ${name}\b.+?^\}`, "ms");
			results.push(Function(`return ${otherUtils.match(regex)[0]}`)());
		}
		return results;
	}
	else{
		const results = {__proto__: null};
		for(const fn of otherUtils.matchAll(/^function\*? (?!\d)(\w+)\b.+?^\}/gms))
			results[fn[1]] = Function(`return ${fn[0]}`)();
		return Object.seal(results);
	}
}
