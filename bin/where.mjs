#!/usr/bin/env node

import {lstatSync}     from "fs";
import {dirname, join} from "path";
import {createRequire} from "module";
import {fileURLToPath} from "url";

const require = createRequire(import.meta.url);
const path    = fileURLToPath(import.meta.url);


// Allow use from command-line
if(process.argv[1] === path || globalThis.$0 === path){
	let quiet = false;
	(async () => {
		const {default: getOpts} = await import("get-options");
		const {options, argv} = getOpts(process.argv.slice(2), {
			"-d, --dir": "path",
			"-q, --quiet": "",
			"-s, --shell": "",
		}, {
			noMixedOrder: true,
			noUndefined: true,
			terminator: "--",
		});
		quiet = options.quiet;
		const {dir = process.cwd(), shell} = options;
		
		let status = 0;
		for(const arg of argv){
			const path = await findModule(arg, dir);
			null !== path
				? quiet || shell
					? printShellVariable(arg, path)
					: process.stdout.write(path + "\n")
				: status = 1;
		}
		process.exit(status);
	})().catch(error => {
		quiet || console.error(error);
		process.exit(1);
	});
}


/**
 * Resolve the path to an installed NPM module.
 *
 * Returns `null` if the module isn't installed or can't be located.
 *
 * @example await findModule("mocha") == "/usr/local/lib/node_modules/mocha";
 * @param {String} name
 * @param {String} [relativeTo = process.cwd()]
 * @return {?String}
 */
export async function findModule(name, relativeTo = process.cwd()){
	// Search locally
	try{
		const path = require.resolve(name + "/package.json", {paths: [relativeTo]});
		return dirname(path);
	}
	catch(e){}
	
	// Search globally
	const root = await findNPMRoot();
	if(!root) return null; // Shouldn't happen
	const path = join(root, name);
	try{
		if(lstatSync(path).isDirectory())
			return path;
	}
	catch(e){}
	return null;
}


/**
 * Return the path for globally-installed NPM modules.
 * @return {String}
 */
export async function findNPMRoot(){
	const {cached} = findNPMRoot;
	if(cached) return cached;
	const {exec}   = await import("alhadis.utils");
	const {stdout} = await exec("npm", ["root", "-g"]);
	return findNPMRoot.cached = stdout.trim();
}


/**
 * Write a POSIX-shell variable assignment to stdout.
 *
 * @param {String} name
 * @param {String} value
 * @return {void}
 */
export function printShellVariable(name, value){
	name  = String(name).toLowerCase().replace(/\W+/g, "");
	value = String(value).replace(/'/g, "'\\''");
	if(/^\d/.test(name)) name = `_${name}`;
	process.stdout.write(`${name}='${value}'\n`);
}
