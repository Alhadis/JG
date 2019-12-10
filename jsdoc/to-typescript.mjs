import {exec}          from "alhadis.utils";
import {readFileSync}  from "fs";
import {dirname, join} from "path";
import {fileURLToPath} from "url";

export async function extractTypes(inputFile){
	const {doclets} = await loadFile(inputFile);
	const types = [];
	for(const doc of doclets){
		switch(doc.kind){
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

export async function loadFile(path){
	const dir = dirname(fileURLToPath(import.meta.url));
	const result = await exec("jsdoc", ["-c", join(dir, "config.json"), "-X", path]);
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

export function parseProp(obj){
	return (obj.readonly ? "readonly " : "")
		+ obj.name
		+ (obj.optional ? "?" : "")
		+ ": " + parseType(obj.type)
		+ ";";
}

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

export function parseParam(obj, props = null){
	let result = obj.variable
		? ("..." + obj.name)
		: obj.name + (obj.optional ? "?" : "");
	result += ": " + (props
		? `{${props.map(p => parseParam(p)).join("; ")}}`
		: parseType(obj.type, obj.variable));
	return result;
}

export function parseReturnType(obj){
	if(!obj || !obj.returns)
		return (obj && obj.async) ? "Promise<void>" : "void";
	const names = new Set();
	for(const {type} of obj.returns)
		names.add(...type.names);
	let type = names.size ? parseType({names: [...names]}) : "void";
	if(obj.async && !/^Promise</.test(type))
		type = `Promise<${type}>`;
	return type;
}

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
