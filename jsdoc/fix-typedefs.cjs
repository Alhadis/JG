// FIXME: This. Is. Dumb.
"use strict";

const matchTypedef   = /((?:^|\n)(?:\/\*\*)?\s*\*\s*)@typedef(?:\s+{(.+?)})(?:\s+([^*\s]+))(.*)/gms;
const matchType      = /@type\s*{(.+?)}((?:[^@*]|(?!@\w|\*\/).)*)/gs;

// No, I won't transpile to CommonJS just for this plugin
const {readFileSync} = require("fs");
const {join}         = require("path");
const textUtils      = readFileSync(join(__dirname, ..."../node_modules/alhadis.utils/lib/text.mjs".split("/")), "utf8");
const parsePrimitive = Function("return " + textUtils.match(/^export (function parsePrimitive.+?^})\n/ms)[1])();

module.exports.handlers = {
	beforeParse(event){
		event.source = event.source
			.replace(/\/\*\*((?:[^*]|\*[^/])+)\*\//g, (input, body, index) => {
				if(!(matchTypedef.test(input) && matchType.test(input)))
					return input;
				if(~body.indexOf("\0"))
					throw new Error(`Input contains null-byte at offset ${index}`);
				
				let enumName = "";
				let enumType = "";
				const types = [];
				return "/**" + body
					.replace(/@example(?:(?:[^*@]|(?!@\w|\*\/).)*)/gs, "")
					.replace(/@link/g, "@\0link")
					.replace(/({@link[^}]*@)(typedef|type)(\b[^}]*)}/g, "$1\0$2$3")
					.replace(/(\[[^\[\]]*?@)(typedef|type)(\b[^\[\]]*\]{@link[^}]+})/g, "$1\0$2$3")
					.replace(matchType, (input, name, description) => {
						description = description
							.replace(/^\s*-\s*/, "")
							.replace(/\n\s*\*\s*/g, " ")
							.replace(/@\0/g, "@")
							.trim();
						const parsed = parsePrimitive(name);
						types.push({name, description, type: parsed ? parsed.type.name : name});
						return "";
					})
					.replace(matchTypedef, (input, before, oldTypes, name, after) => {
						enumName = name;
						enumType = splitTypes(oldTypes).sort().join(" | ");
						const hack = ` * @jg-typewrite declare type ${enumName} = ${enumType};`;
						return `${before}@readonly\n${hack}\n * @enum {${
							Array.from(new Set(types.map(x => x.type))).sort().join("|")
						}}${after.replace(/\s*\*\s*$/, "")}`;
					})
					.replace(/@\0/g, "@")
					+ `\n */\nconst ${enumName} = {\n`
					+ types.map(({type, name, description}) => {
						const key = "String" === type && /^.(?!\d)(\w+).$/.test(name)
							? RegExp.lastParen
							: "Number" === type && /^\d/.test(name)
								? name
								: `[${name}]`;
						return `\t/**\n\t * ${description}\n\t * @type {${type}}\n\t */\n\t${key}: ${name},`;
					}).join("\n\n")
					+ "\n};\n";
			});
	},
};

function splitTypes(input){
	return input.trim()
		.replace(/^("|'|`)((?:(?!\1)[^\\]|\\.)*)\1$/s, (_, quote, text) =>
			quote + text.replace(/\|/g, "\0") + quote)
		.split("|")
		.map(x => x.replace(/\0/g, "|"))
		.filter(Boolean);
}
