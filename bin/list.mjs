#!/usr/bin/env node

import {resolve} from "path";
import {fileURLToPath} from "url";
import {escapeRegExp, ls} from "alhadis.utils";
import getOpts from "get-options";
import fs from "fs";

// Allow command-line use if needed
const path = fileURLToPath(import.meta.url);
if(process.argv[1] === path || globalThis.$0 === path){
	const {options, argv} = getOpts(process.argv.slice(2), {
		"-e, --extensions": "[list]",
		"-i, --ignore": "[pattern]",
		"-0": "",
	}, {noMixedOrder: true, noUndefined: true, terminator: "--"});
	
	findFiles(argv, options).then(paths => {
		// Terminate with an error code if nothing matched
		paths.length || process.exit(1);
		process.stdout.write(paths.join(options[0] ? "\0" : "\n"));
		process.stdout.isTTY && process.stdout.write("\n");
	}).catch(error => {
		console.error(error);
		process.exit(2);
	});
}


/**
 * Recursively list files in one or more directories.
 *
 * @example await findFiles("/path/to/search", {extensions: "htm,html,shtml"});
 * @param {String} paths - Directories to search
 * @param {Object} [options={}] - Hash of search options
 * @param {FileExtensions} [options.extensions]
 *    Return only those results that match one of the specified file extensions.
 * @param {String|RegExp} [options.ignore=/(?:^|[\\/])(?:\.git|node_modules)$/i]
 *    Exclude files whose path matches the given pattern. String values are converted
 *    to regular expressions, with modifiers specified in a leading `(?…)` group that's
 *    stripped before the conversion to a RegExp.
 * @return {Promise<String[]>}
 */
export async function findFiles(paths, options = {}){
	const exts = buildExtensionPattern(options.extensions);
	const ignore = options.ignore
		? regexFromString(options.ignore)
		: /(?:^|[\\/])(?:\.git|node_modules)$/i;
	paths = resolvePaths(paths);
	paths = await ls(paths, {filter: exts, ignore, recurse: -1});
	return [...paths.keys()];
}


/**
 * Construct a RegExp to match one or more file extensions.
 * @example buildExtensionPattern("js,mjs,cjs") == /\.(?:cjs|js|mjs)$/i;
 * @param {FileExtensions} exts - List of extensions to match case-insensitively
 * @return {?RegExp} - A regular expression, or `null` if called with empty input.
 * @internal
 */
export function buildExtensionPattern(exts){
	if(!exts || !exts.length) return null;
	exts = "string" === typeof exts
		? exts.trim().split(/[.,\s]+/)
		: exts.map(s => `${s}`.replace(/^\.+/, ""));
	exts = [...new Set(exts.filter(Boolean).sort())].map(escapeRegExp);
	return new RegExp(`\\.(?:${exts.join("|")})$`, "i");
}


/**
 * Construct a regular expression from a string representation.
 * @example regexFromString("(?gi)abc") == /abc/gi;
 * @param {String} input
 * @return {RegExp}
 * @internal
 */
export function regexFromString(input){
	if(input instanceof RegExp) return input;
	input = `${input}`;
	let flags = "[dgimsuvy]";
	flags = new RegExp(String.raw `^\(\?(${flags}*-${flags}+|${flags}+)\)`).exec(input);
	if(flags){
		input = input.slice(flags[0].length);
		const [enable = "", disable = ""] = flags[1].split("-");
		flags = {__proto__: null};
		for(const flag of enable)  flags[flag] = true;
		for(const flag of disable) delete flags[flag];
		flags = Object.keys(flags).join("");
	}
	else flags = "";
	return new RegExp(input, flags);
}


/**
 * Resolve list of directory paths to search.
 * @param {String|String[]} paths
 * @return {String[]}
 * @internal
 */
export function resolvePaths(paths){
	paths = "string" === typeof paths
		? [resolve(path)]
		: [...new Set(paths.map(path => resolve(path)))];

	// Default to current working directory if no paths were specified
	if(!paths.length) return [process.cwd()];

	// Otherwise, filter out invalid paths
	return paths.filter(path => {
		if(!fs.existsSync(path) || !fs.statSync(path).isDirectory()){
			process.stderr.write(`list: Not a directory: ${path}\n`);
			process.exitCode = 2;
			return false;
		}
		return true;
	});
}


/**
 * @typedef {String|String[]} FileExtensions
 * @description
 *    List of file extensions, specified with or without leading dots.
 *
 *    If passed as a string, the value is split by consecutive runs of
 *    dots, commas, and whitespace. Otherwise, when passed as an array,
 *    each entry of the list is stringified and trimmed of leading dots.
 */
