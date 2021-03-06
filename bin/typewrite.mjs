#!/usr/bin/env node

import fs        from "fs";
import {resolve} from "path";
import {which}   from "alhadis.utils";
import getOpts   from "get-options";
const {options, argv} = getOpts(process.argv.slice(2), {
	"-d, --declare": "[type] [name] [body]",
	"-e, --exclude": "[regexp]",
	"-f, --footer":  "[string]",
	"-h, --header":  "[string]",
	"-s, --sort":    "",
	"    --help":    "",
}, {
	duplicates: "stack",
	noAliasPropagation: "first-only",
	noMixedOrder: true,
	noUndefined: true,
	terminator: "--",
});

options.exclude = makeRegExp(options.exclude);
options.header  = makeString(options.header);
options.footer  = makeString(options.footer);
options.declare = makeArray(options.declare);
options.sort    = !!options.sort;


if(options.help){
	showUsage();
	process.exit(0);
}
if(!argv.length){
	showUsage();
	process.exit(1);
}



(async () => {
	if(!await which("jsdoc")){
		process.stderr.write("typewrite: Required program not found in $PATH: jsdoc\n");
		process.exit(2);
	}
	const {extractTypes} = await import("../jsdoc/to-typescript.mjs");
	
	let exitStatus = 0;
	while(argv.length){
		const path = resolve(argv.shift());
		if(!path || !fs.existsSync(path) || !fs.statSync(path).isFile()){
			process.stderr.write(`typewrite: Not a file: ${path}\n`);
			exitStatus = 1;
			continue;
		}
		let types = new Map((await extractTypes(path))
			.filter(type => !options.exclude.test(type))
			.map(type => [type.name, type.body]));
		for(let [type, name, body, extend] of options.declare){
			[name, ...extend] = name.split(/\s+/);
			types.set(name, `export declare ${type} ${name}`
				+ (extend.length ? ` ${extend.join(" ")}` : "")
				+ ({class: 1, enum: 1, interface: 1}[type]
					? ` { ${body.replace(/^\s*{\s*|\s*}\s*$/g, "")} }`
					: `:${body.replace(/[;\s]+$/, "")};`));
		}
		types = Array.from(types.values());
		options.sort && types.sort();
		
		const outputPath = path.replace(/(?:\.(?:mjs|jsx?))$/i, ".d.ts");
		fs.writeFileSync(outputPath, [
			options.header,
			...types,
			options.footer,
		].join("\n").trim() + "\n");
	}
	process.exit(exitStatus);
})().catch(error => {
	console.error(error);
	process.exit(1);
});

function showUsage(){
	process.stderr.write("Usage: jg typewrite [-s] [-d declare] [-e exclude] [-f footer] [-h header] ...files\n");
	if("win32" !== process.platform)
		process.stderr.write("Run `man jg-typewrite` for full documentation\n");
}


function makeRegExp(input){
	if(!input) return /(?=A)B/;
	if("string" === typeof input)
		return new RegExp(input);
	if(!Array.isArray(input[0]))
		input = [input];
	return new RegExp(input.map(i => i[0]).join("|"));
}

function makeString(input){
	if(!input) return "";
	if(Array.isArray(input))
		input = input.map(i => i.join(" ")).join("\n");
	return input ? String(input).trim() : "";
}

function makeArray(input){
	if(!input) return [];
	if(!Array.isArray(input[0]))
		input = [input];
	return input;
}
