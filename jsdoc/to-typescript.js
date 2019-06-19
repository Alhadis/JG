#!/usr/bin/env node
"use strict";

// Usage: `jg -p jsdoc/to-typescript.js` /path/to/library.mjs

const {join} = require("path");
const {exec} = require("alhadis.utils");
const {readFileSync} = require("fs");

loadFile(process.argv[2]).then(doclets => {
	const chunks = [];
	for(const doc of doclets){
		switch(doc.kind){
			case "function":
				if(!doc.memberof)
					chunks.push(parseFunction(doc));
				break;
			case "typedef":
				chunks.unshift(parseTypedef(doc));
				break;
		}
	}
	process.stdout.write(chunks.join("\n") + "\n");
});

async function loadFile(path){
	const result = await exec("jsdoc", ["-c", join(__dirname, "config.json"), "-X", path]);
	const source = readFileSync(path, "utf8");
	return JSON.parse(result.stdout)
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
}

function parseTypedef(obj){
	const isObject = /^Object(?:$|[.<])/i;
	const hasProps = obj.properties && obj.properties.length;
	
	if(hasProps && obj.type.names.some(n => isObject.test(n))){
		obj.type.names = obj.type.names.filter(n => !isObject.test(n));
		const props = obj.properties.map(parseProp).join(" ");
		return `declare type ${obj.name} = `
			+ (obj.type.names.length ? parseType(obj.type) + " | " : "")
			+ `{${props.replace(/;$/, "")}};`;
	}
	let type = parseType(obj.type);
	if("number[]" === type && hasProps)
		type = `[${new Array(obj.properties.length).fill("number").join(", ")}]`;
	return `declare type ${obj.name} = ${type};`
}

function parseProp(obj){
	return (obj.readonly ? "readonly " : "")
		+ obj.name
		+ (obj.optional ? "?" : "")
		+ ": " + parseType(obj.type)
		+ ";";
}

function parseFunction(obj, exported = true){
	const nested = {};
	const params = obj.params.map(arg => {
		if(/^([^.]+)\.(.+)/.test(arg.name)){
			(nested[RegExp.$1] = nested[RegExp.$1] || []).push(arg);
			arg.name = RegExp.$2
			return null;
		}
		return arg;
	}).filter(Boolean);
	return (exported ? "export declare " : "declare ")
		+ `function ${obj.name}(`
		+ params.map(arg => parseParam(arg, nested[arg.name])).join(", ")
		+ `): ${parseReturnType(obj)};`;
}

function parseParam(obj, props = null){
	let result = obj.variable
		? ("..." + obj.name)
		: obj.name + (obj.optional ? "?" : "");
	result += ": " + (props
		? `{${props.map(p => parseParam(p)).join(", ")}}`
		: parseType(obj.type, obj.variable));
	return result;
}

function parseReturnType(obj){
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

function parseType(obj, variadic = false){
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
