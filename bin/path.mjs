#!/usr/bin/env node

import {existsSync}    from "fs";
import {join, resolve} from "path";
import {fileURLToPath} from "url";

const path     = fileURLToPath(import.meta.url);
const ROOT_DIR = join(path, "..", "..");

// Allow use from command-line
if(process.argv[1] === path || globalThis.$0 === path){
	const args = process.argv.slice(2);
	args.length || args.push("");
	let paths = args.map(arg => getPath(arg));
	const status = paths.includes(null);
	
	// Emit result(s)
	paths = paths.filter(Boolean);
	if(paths.length){
		process.stdout.write(paths.join("\n"));
		if(process.stdout.isTTY)
			process.stdout.write("\n");
	}
	process.exit(status);
}


/**
 * Resolve the absolute path of a file within `jg`'s installation path.
 *
 * Shorthands are supported for various linter configs, to
 * facilitate brevity in build-scripts or makefiles.
 *
 * @example getPath("eslint") == "/path/to/jg/eslint/.eslintrc.json";
 * @param {String} filename
 * @return {String|null} An absolute path if the file exists; otherwise, null.
 * @public
 */
export default function getPath(filename){
	
	// Shorthand: ESLint
	let match = filename.match(/^\.?eslint(?:rc|[-/]?config)?(\/atom\/?)?(?:\.json)?$/i);
	if(null !== match){
		const file = match[1] ? "atom.js" : ".eslintrc.json";
		return resolve(join(ROOT_DIR, "eslint", file));
	}
	
	// Shorthand: TSLint
	match = filename.match(/^\.?tslint(?:rc|[-/]?config)?(?:\.json)?$/i);
	if(null !== match)
		return resolve(join(ROOT_DIR, "etc", "tslint.json"));

	// Shorthand: CoffeeLint
	match = filename.match(/^\.?coffeelint(?:rc|[-/]?config)?(?:\.json)?$/i);
	if(null !== match)
		return resolve(join(ROOT_DIR, "etc", "coffeelint.json"));
	
	// Shorthand: JSDoc config
	match = filename.match(/^\.?jsdoc(?:rc)?\.(?:conf|json|cfg)$/i);
	if(null !== match)
		return resolve(join(ROOT_DIR, "jsdoc", "config.json"));
	
	const result = filename
		? resolve(join(ROOT_DIR, filename))
		: resolve(ROOT_DIR);
	
	if(existsSync(result))
		return result;
	
	process.stderr.write(`No such file: ${filename}\n`);
	return null;
}
