"use strict";

const fs           = require("fs");
const {join}       = require("path");
const utilsPath    = join(__dirname, ..."../node_modules/alhadis.utils/lib/text.mjs".split("/"));
const otherUtils   = fs.readFileSync(utilsPath, "utf8").replace(/^export /gm, "");
const deindent     = Function(`return ${otherUtils.match(/^function deindent\b.+?^}/ms)[0]}`)();

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
	 */
	return [...input.matchAll(matchVar)].map(match => {
		const offset = fileOffset + match.index;
		const range = [offset, offset + match[0].length];
		range[0] += match[0].indexOf("@");
		range[1] -= (match[0].match(/(?:(?:\r?\n)[ \t]*\*\/?)+\s*$/) || [""])[0].length;
		const type = resolveType(match[1]);
		const name = match[2];
		const desc = parseDesc(match[3]);
		return {type, name, desc, range};
	});
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
