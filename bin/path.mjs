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
	process.exit(+status);
}


/**
 * Resolve the absolute path of a file within `jg`'s installation path.
 *
 * Shorthands are supported for various linter configs, to
 * facilitate brevity in build-scripts or makefiles.
 *
 * @example getPath("eslint") == "/path/to/jg/eslint/.eslintrc.json";
 * @param {String} filename
 * @return {?String} An absolute path if the file exists; otherwise, null.
 * @public
 */
export default function getPath(filename){
	
	// ESLint
	let match = filename.match(/^\.?eslint(?:rc|[-/]?config)?\/?(?:\b(atom|babel|mw)(?:\.js)?\/?|(?:\.json)|(es5|typescript(?:\.full)?)(?:\.json)?)?$/i);
	if(null !== match){
		const file = match[1] ? `${match[1]}.js` : match[2] ? `${match[2]}.json` : ".eslintrc.json";
		return resolve(join(ROOT_DIR, "eslint", file));
	}
	
	// TSLint (now ESLint with TypeScript-specific config)
	match = filename.match(/^\.?tslint(?:rc|[-/]?config)?(?:\.json)?$/i);
	if(null !== match)
		return resolve(join(ROOT_DIR, "eslint", "typescript.full.json"));

	// CoffeeLint
	match = filename.match(/^\.?coffeelint(?:rc|[-/]?config)?(?:\.json)?$/i);
	if(null !== match)
		return resolve(join(ROOT_DIR, "etc", "coffeelint.json"));
	
	// JSDoc
	match = filename.match(/^\.?jsdoc(?:rc)?\.?(?:conf|json|cfg)?$/i);
	if(null !== match)
		return resolve(join(ROOT_DIR, "jsdoc", "config.json"));
	
	// Clang-format
	match = filename.match(/^\.?(?:clang|llvm)(?:-?(?:format|fmt))?$/i);
	if(null !== match)
		return resolve(join(ROOT_DIR, "etc", ".clang-format"));

	// Prettier
	match = filename.match(/^\.?(?:prettier|pretty)(?:rc)?\.?(?:json)?$/i);
	if(null !== match)
		return resolve(join(ROOT_DIR, "etc", ".prettierrc.json"));
	
	// Dprint
	match = filename.match(/^\.?dprint\.?(?:json)?$/i);
	if(null !== match)
		return resolve(join(ROOT_DIR, "etc", "dprint.json"));
	
	// Rustfmt
	match = filename.match(/^\.?rust[_-]?(?:fmt|format)\.?(?:toml|json|ya?ml)?$/i);
	if(null !== match)
		return resolve(join(ROOT_DIR, "etc", "rustfmt.toml"));
	
	// Headless Firefox profile
	match = filename.match(/(?:^|\/)(?:etc\/)?(?:profiles?\/)?firefox[-_]?(?:headless|profile)?(?:\.?m?js)?$|^ff$/i);
	if(null !== match)
		return resolve(join(ROOT_DIR, "etc", "profiles", "firefox-headless.js"));
	
	// Wrapper/front-end
	match = filename.match(/^\.?index\.?(?:[cmt]?js)?$|^(?:entry|main|self)$/);
	if(null !== match)
		return resolve(join(ROOT_DIR, "index.mjs"));
	
	// No argument: Installation directory
	if(!filename)
		return resolve(ROOT_DIR);
	
	for(let path of [filename, `bin/${filename}`])
		if(existsSync(path = resolve(join(ROOT_DIR, path)))
		|| existsSync(path += ".mjs"))
			return path;
	
	process.stderr.write(`No such file: ${filename}\n`);
	return null;
}
