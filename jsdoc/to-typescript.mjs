import {exec}          from "alhadis.utils";
import {readFileSync}  from "fs";
import {dirname, join} from "path";
import {fileURLToPath} from "url";

/**
 * Extract a list of TypeScript declarations from JSDoc blocks.
 * @param {String} inputFile
 * @return {Promise.<TypeDeclaration[]>}
 * @public
 */
export async function extractTypes(inputFile){
	/**
	 * @typedef  {Object} TypeDeclaration
	 * @property {String} body
	 * @property {String} name
	 * @property {String} type
	 * @property {Object} doclet
	 */
	const {doclets} = await loadFile(inputFile);
	const types = [];
	for(const doc of doclets){
		if(doc.isEnum)
			types.unshift({
				body: `export declare enum ${doc.name} {${parseEnum(doc)}}`,
				name: doc.name,
				type: "enum",
				doclet: doc,
			});
		else switch(doc.kind){
			case "function":
				doc.memberof || types.push({
					body: `export declare function ${doc.name}${parseFunction(doc)};`,
					name: doc.name,
					type: "function",
					doclet: doc,
				});
				break;
			case "constant":
				doc.memberof || types.push({
					body: `export declare const ${parseTypedef(doc, false)}`,
					name: doc.name,
					type: "constant",
					doclet: doc,
				});
				break;
			case "typedef":
				types.unshift({
					body: parseTypedef(doc),
					name: doc.name,
					type: "typedef",
					doclet: doc,
				});
				break;
			case "member":
				if(!doc.memberof && "global" === doc.scope && doc.name === doc.longname)
					types.push({
						body: `export declare let ${parseTypedef(doc, false)}`,
						name: doc.name,
						type: "let",
						doclet: doc,
					});
				break;
		}
	}
	return types;
}


/**
 * Load and parse a file using JSDoc.
 *
 * @param {String} path
 * @param {Boolean} [ignoreErrors=false]
 * @return {{doclets: Object[], source: String}}
 */
export async function loadFile(path, ignoreErrors = false){
	const dir = dirname(fileURLToPath(import.meta.url));
	const result = await exec("jsdoc", ["-c", join(dir, "config.json"), "-X", path]);
	
	// Complain loudly if JSDoc reported an error
	if(!ignoreErrors){
		result.stderr && process.stderr.write(`jsdoc: ${result.stderr}`);
		result.code   && process.exit(result.code);
	}
	
	const source = readFileSync(path, "utf8");
	const doclets = JSON.parse(result.stdout)
		.filter(doc => !doc.undocumented && "package" !== doc.kind)
		.map(doc => {
			// Stupid hack to fix missing info in `export async function…`
			if("function" === doc.kind){
				const {range} = doc.meta;
				const fnDef = source.substring(range[0], range[1]);
				if(/^\s*export\s+async\s/.test(fnDef))
					doc.async = true;
			}
			return doc;
		});
	return {doclets, source};
}


/**
 * Parse an {@link @enum|https://jsdoc.app/tags-enum.html} tag and
 * return the equivalent TypeScript syntax. Note that computed values
 * (such as object expressions) may yield invalid results.
 *
 * @example parseEnum({
 *    isEnum: true,
 *    kind: "member",
 *    name: "States",
 *    type: {names: ["number"]},
 *    properties: [
 *       {name: "ON",  defaultvalue: 1, type: {names: ["number"]}},
 *       {name: "OFF", defaultvalue: 0, type: {names: ["number"]}},
 *    ],
 * }) == "ON = 1, OFF = 0";
 *
 * @param {Object} obj
 * @return {String}
 */
export function parseEnum(obj){
	const props = [];
	for(const prop of obj.properties){
		const {name, defaultvalue, meta} = prop;
		if(!("defaultvalue" in prop))
			throw new TypeError(`Missing value for ${name} in enum ${obj.name}`);
		const isStr = "string" === typeof defaultvalue && "Literal" === meta.code.type;
		const value = isStr ? '"' + defaultvalue + '"' : defaultvalue;
		props.push(`${name} = ${value}`);
	}
	return props.join(", ");
}


/**
 * Parse a {@link @typedef|https://jsdoc.app/tags-typedef.html} tag into
 * a type annotation or type declaration, depending on whether `decl` is
 * enabled.
 *
 * @example <caption>Parsing <code>@typedef {number|string} Numeric</code></caption>
 * const doclet = {
 *    kind: "typedef",
 *    name: "Numeric",
 *    scope: "global",
 *    type: {names: ["number", "string"]},
 * };
 * parseTypedef(doclet, true) == "declare type Numeric = number | string;"
 * parseTypedef(doclet, false) == "Numeric: number | string;"
 * 
 * @param {Object} obj
 * @param {Boolean} [decl=true]
 * @return {String}
 */
export function parseTypedef(obj, decl = true){
	const isObject = /^Object(?:$|[.<])/i;
	const hasProps = obj.properties && obj.properties.length;
	if(!obj.type){
		if(obj.returns) obj.type = "Function";
		else throw new TypeError(`Doclet for "${obj.name}" lacks type information`);
	}
	if(hasProps && obj.type.names.some(n => isObject.test(n))){
		obj.type.names = obj.type.names.filter(n => !isObject.test(n));
		const props = obj.properties.map(parseProp).join(" ");
		const type = (obj.type.names.length ? parseType(obj.type) + " | " : "") + `{${props.replace(/;$/, "")}};`;
		return decl
			? `declare type ${obj.name} = ${type}`
			: `${obj.name}: ${type}`;
	}
	let type = parseType(obj.type);
	if("number[]" === type && hasProps)
		type = `[${new Array(obj.properties.length).fill("number").join(", ")}]`;
	else if("Function" === type && obj.params)
		type = parseFunction(obj, " => ");
	return decl
		? `declare type ${obj.name} = ${type};`
		: `${obj.name}: ${type};`;
}


/**
 * Parse a {@link @property|https://jsdoc.app/tags-property.html} tag into an
 * annotated object member.
 *
 * @example parseProp({name: "foo", type: {names: ["String"]}}) == "foo: string;";
 * @param {Object} obj
 * @return {String}
 */
export function parseProp(obj){
	return (obj.readonly ? "readonly " : "")
		+ obj.name
		+ (obj.optional ? "?" : "")
		+ ": " + parseType(obj.type)
		+ ";";
}


/**
 * Parse a function and annotate its parameters and return-type.
 *
 * @example <caption>Parsing <code>function doStuff(foo, bar)</code></caption>
 * const doclet = {
 *    kind: "function",
 *    name: "doStuff",
 *    params: [
 *       {type: {names: ["Boolean"]}, name: "foo"},
 *       {type: {names: ["Boolean"]}, name: "bar"},
 *    ],
 *    returns: [{type: {names: ["String"]}}],
 *    scope: "global",
 * };
 * parseFunction(doclet)         == "(foo: boolean, bar: boolean): string";
 * parseFunction(doclet, " => ") == "(foo: boolean, bar: boolean) => string";
 *
 * @param {Object} obj
 * @param {String} [sep=": "]
 * @return {String}
 */
export function parseFunction(obj, sep = ": "){
	const nested = {};
	const params = (obj.params || []).map(arg => {
		if(/^([^.]+)\.(.+)/.test(arg.name)){
			(nested[RegExp.$1] = nested[RegExp.$1] || []).push(arg);
			arg.name = RegExp.$2;
			return null;
		}
		return arg;
	}).filter(Boolean).map(arg => parseParam(arg, nested[arg.name]));
	return `(${params.join(", ")})${sep + parseReturnType(obj)}`;
}


/**
 * Parse a function parameter.
 *
 * @example parseParam(jsdoc("@param {?Array.<String>} foo")) == "foo?: string[]";
 * @param {Object} obj
 * @param {?Object[]} [props=null]
 * @return {String}
 */
export function parseParam(obj, props = null){
	let result = obj.variable
		? ("..." + obj.name)
		: obj.name + (obj.optional || obj.nullable ? "?" : "");
	result += ": " + (props
		? `{${props.map(p => parseParam(p)).join("; ")}}`
		: parseType(obj.type, obj.variable));
	return result;
}


/**
 * Parse a function's return type.
 *
 * @example <caption>Parsing <code>@return {Number[]|String}</code></caption>
 * parseReturnType({
 *    async: true,
 *    kind: "function",
 *    name: "loadString",
 *    returns: [{type: {names: ["Array.<Number>", "String"]}}],
 * }) == "Promise<number[] | string>";
 *
 * @param {Object}
 * @return {String}
 */
export function parseReturnType(obj){
	if(!obj || !obj.returns)
		return (obj && obj.async) ? "Promise<void>" : "void";
	const names = new Set();
	for(const {type} of obj.returns)
		type.names.map(name => names.add(name));
	let type = names.size ? parseType({names: [...names]}) : "void";
	if(obj.async && !/^Promise</.test(type))
		type = `Promise<${type}>`;
	return type;
}


/**
 * Parse a JSDoc {@link @type|https://jsdoc.app/tags-type.html} tag
 * and return the equivalent TypeScript syntax.
 *
 * @example parseType(jsdoc("@type Array.<Boolean>")) == "boolean[]";
 * @param {Object} obj
 * @param {Boolean} [variadic=false]
 * @return {String}
 */
export function parseType(obj, variadic = false){
	if("string" === typeof obj)
		return parseType({names: [obj]}, variadic);
	const primitives = /(?<!\$)\b(?:Boolean|Number|String|Object|Symbol|Null|Undefined)(?!\$)\b/gi;
	return obj.names.map(name => {
		if(/^Array\.?<([^<>]+)>$/i.test(name))
			name = RegExp.$1 + "[]";
		name = name
			.replace(primitives, s => s.toLowerCase())
			.replace(/\bfunction\b/g, "Function")
			.replace(/\*/g, "any")
			.replace(/\.</g, "<")
			.replace(/^Promise$/, "$&<any>")
			.replace(/^Object<([^,<>]+),\s*([^<>]+)>/gi, (_k, $1, $2) =>
				`{[key: ${parseType($1)}]: ${parseType($2)}}`)
			.replace(/^Array(?=$|\[)/g, "any[]")
			.replace(/^Function\(\)\[\]/g, "Array<Function>")
			.replace(/^Map$/, "Map<any, any>")
			.replace(/^WeakMap$/, "WeakMap<object, any>")
			.replace(/^WeakSet$/, "WeakSet<object>");
		if(variadic) name += "[]";
		return name;
	}).join(" | ");
}
