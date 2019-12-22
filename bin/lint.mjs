#!/usr/bin/env node

import fs              from "fs";
import {spawn}         from "child_process";
import {resolve}       from "path";
import {fileURLToPath} from "url";
import getPath         from "./path.mjs";
import getOpts         from "get-options";
import {findBasePath, ls, which, splitStrings} from "alhadis.utils";

const JS_EXT = /\.(?:mjs|jsx?)$/i;
const TS_EXT = /\.tsx?$/i;
const CS_EXT = /\.(?:cson|coffee)$/i;

// Run linters if loading file directly
const path = fileURLToPath(import.meta.url);
if(process.argv[1] === path || globalThis.$0 === path){
	const {options, argv} = getOpts(process.argv.slice(2), {
		"-j, --js": "",
		"-t, --ts": "",
		"-C, --ignore-config": "",
		"-c, --coffee": "",
		"-E, --eslint-options": "[opts]",
		"-q, --no-echo": "",
	}, {noMixedOrder: true, noUndefined: true, terminator: "--"});
	argv.length || argv.push(".");
	lint(argv, options);
}


export async function lint(paths, options = {}){
	options = {...options}; // Avoid modifying by reference
	paths = paths.filter(Boolean);
	
	// Enable everything if a specific language/linter wasn't given
	if(!(options.js || options.ts || options.coffee))
		Object.assign(options, {js: true, ts: true, coffee: true});
	Object.defineProperty(options, "cs", {value: options.coffee});
	
	if(+process.env.DEBUG)
		console.log("Linting with options", options);
	
	const files = new Map();
	const maps = await Promise.all(paths.map(path => ls(resolve(path), {
		ignore: /(?:^|[\\/])(?:\.git|node_modules)$/i,
		recurse: -1,
	})));
	for(const map of maps)
		for(const [key, value] of map)
			files.set(key, value);

	// Stuff we can lint with different NPM linters
	const js = [];
	const ts = [];
	const coffee = [];

	for(const [path, stats] of files){
		if(!stats.isFile()) continue;
		else if(JS_EXT.test(path)) options.js && js.push(path);
		else if(TS_EXT.test(path)) options.ts && ts.push(path);
		else if(CS_EXT.test(path)) options.cs && coffee.push(path);
		
		// Identify executables without file extensions
		else if(0o111 & stats.mode){
			let data = Buffer.alloc(80);
			const fd = fs.openSync(path, "r");
			const bytesRead = fs.readSync(fd, data, 0, 80, 0);
			data = (bytesRead < data.length ? data.slice(0, bytesRead) : data).toString();
			fs.closeSync(fd);
			
			const regex = /^#!(?:(?:\s*\S*\/|\s*(?=perl6?))(\S+))(?:(?:\s+\S+=\S*)*\s+(\S+))?/;
			const match = data.match(regex);
			if(null !== match){
				const interpreter = "env" === match[1]
					? (match[2] || "").split("/").pop()
					:  match[1];
				switch(interpreter){
					case "node":   options.js && js.push(path);     break;
					case "tsc":    options.ts && ts.push(path);     break;
					case "coffee": options.cs && coffee.push(path); break;
				}
			}
		}
	}
	
	// Ensure all required dependencies are available
	const missing = [];
	if(js.length     && !await which("eslint"))     missing.push("eslint");
	if(ts.length     && !await which("tslint"))     missing.push("tslint");
	if(coffee.length && !await which("coffeelint")) missing.push("coffeelint");
	if(missing.length){
		const names = missing.join(", ");
		process.stderr.write([
			`lint: Required linters not found in $PATH: ${names}`,
			`Run \`npm install --global ${names}\`, then try again\n`,
		].join("\n\n"));
		process.exit(1);
	}
	
	let code = 0;
	if(js.length)     (code = await lintJavaScript(js, options))       && process.exit(code);
	if(ts.length)     (code = await lintTypeScript(ts, options))       && process.exit(code);
	if(coffee.length) (code = await lintCoffeeScript(coffee, options)) && process.exit(code);
}


/**
 * Execute a command by name.
 *
 * @param {String}   cmd - Executable's name
 * @param {String[]} args - Arguments list
 * @param {Object}  [options] - Hash containing additional options
 * @param {Boolean} [options.echo=false] - Echo command to stderr
 * @param {String}  [options.stdio="inherit"] - I/O specifier
 * @return {Number} Resolves with the command's exit code.
 * @internal
 */
export async function run(cmd, args, options = {}){
	const {stdio = "inherit"} = options;
	options.noEcho || process.stderr.write(`${cmd} ${args.join(" ")}\n`);
	const proc = spawn(cmd, args, {windowsHide: true, stdio});
	const code = await new Promise((resolve, reject) => {
		proc.on("close", code => resolve(code));
		proc.on("error", error => reject(error));
	});
	return code;
}


/**
 * Run `eslint` on the specified file paths.
 *
 * @param {String[]} files - Resolved pathnames
 * @param {Object} options - Options hash
 * @return {Number} Exit code returned by ESLint
 * @internal
 */
export async function lintJavaScript(files, options){
	const args = ["--ext", "mjs,js", "--", ...resolveFileList(files, /\.(?:mjs|jsx?)$/i)];
	let linked = false;
	let stats = null;
	
	// Stubborn hack to force ESLint v6+ to work when run globally
	if(!fs.existsSync("node_modules")){
		const cwd = process.cwd();
		stats = Object.assign(fs.statSync(cwd), {path: cwd});
		linked = resolve("node_modules");
		const source = resolve(path, "..", "..", "node_modules");
		+process.env.DEBUG && console.log(`Linking: ${source} -> ${linked}`);
		fs.symlinkSync(source, linked);
	}
	
	// Ignore whatever ESLint configs are in the working directory
	if(options.ignoreConfig){
		args.unshift("--config", getPath(".eslintrc.json"));
		args.unshift("--resolve-plugins-relative-to", getPath("."));
		delete options.ignoreConfig;
	}
	
	// Otherwise, test if ESLint can find a config file
	else if(2 === await run("eslint", ["--print-config", "-"], {...options, stdio: "ignore"})){
		const configFile = getPath(".eslintrc.json");
		+process.env.DEBUG && console.log(`Can't find config. Using ${configFile}`);
		args.unshift("--config", configFile);
	}
	
	// Lastly, allow arbitrary options to be passed directly to ESLint
	if(options.eslintOptions){
		const extraOpts = splitStrings(options.eslintOptions);
		+process.env.DEBUG && console.log(`Prepending options: ${extraOpts}`);
		args.unshift(...extraOpts);
	}
	const code = await run("eslint", args, options);
	if(linked){
		+process.env.DEBUG && console.log(`Unlinking: ${linked}`);
		fs.unlinkSync(linked);
		fs.utimesSync(stats.path, stats.atime, stats.mtime);
	}
	return code;
}


/**
 * Run `tslint` on the root directory enclosing each specified pathname.
 *
 * @example lintTypeScript("/foo/bar", "/foo/baz") => `tslint --project /foo`;
 * @param {String[]} files - Resolved pathnames
 * @param {Object} options - Options hash
 * @return {Number} Exit code reported by TSLint
 * @internal
 */
export async function lintTypeScript(files, options){
	const configFile = getPath("tslint.json");
	const args = ["-c", configFile, ...files];
	return run("tslint", args, options);
}


/**
 * Run `coffeelint` on the specified file paths.
 *
 * NOTE: Avoid passing directories which contain `node_modules`
 * folders; CoffeeLint won't ignore them by default. Provide a
 * list of specific file paths instead.
 *
 * @param {String[]} files - Resolved pathnames
 * @param {Object} options - Options hash
 * @return {Number} Exit code reported by CoffeeLint
 * @internal
 */
export async function lintCoffeeScript(files, options){
	const configFile = getPath("coffeelint.json");
	const args = ["-q", "--ext", "cson", "-f", configFile, ...files];
	return run("coffeelint", args, options);
}


/**
 * Reduce a list of files to a common root directory.
 *
 * Filenames which don't end in an extension matched by `extMatch`
 * are included as-is; it's assumed these are executables without
 * an extension that would be recognised by the respective linter.
 *
 * @param {String[]} paths
 * @param {RegExp} extMatch
 * @internal
 */
export function resolveFileList(paths, extMatch){
	const noExt = [];
	const hasExt = [];
	for(const path of paths)
		extMatch.test(path) ? hasExt.push(path) : noExt.push(path);
	
	let list = [];
	if(hasExt.length) list.push(findBasePath(hasExt));
	if(noExt.length)  list.push(...noExt);
	const cwd = process.cwd().replace(/([/\\^$*+?{}[\]().|])/g, "\\$1");
	const cwdExpr = new RegExp(`^${cwd}/?`, "i");
	
	// Optimise
	list = list.map(path => path.replace(cwdExpr, "") || ".");
	list = Array.from(new Set(list));
	return list;
}
