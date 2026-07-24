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
		"-m, --match": "[pattern]",
		"-0": "",
	}, {
		duplicates: "stack",
		noAliasPropagation: "first-only",
		noMixedOrder: true,
		noUndefined: true,
		terminator: "--",
	});
	
	// Handle repeated options
	if(Array.isArray(options[0]))
		options[0] = true;
	if(Array.isArray(options.extensions))
		options.extensions = options.extensions.join(",");
	
	findFiles(argv, options).then(paths => {
		// Terminate with an error code if nothing matched
		paths.length || process.exit(process.exitCode || 1);
		process.stdout.write(paths.join(options[0] ? "\0" : "\n"));
		process.stdout.isTTY && process.stdout.write("\n");
	}).catch(error => {
		console.error(error);
		process.exit(3);
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
 * @param {FilenamePatterns} [options.ignore=/(?:^|[\\/])(?:\.git|node_modules)$/i]
 *    Exclude files whose path matches the given pattern.
 * @return {Promise<String[]>}
 */
export async function findFiles(paths, options = {}){
	const exts = buildExtensionPattern(options.extensions);
	const match = combinePatterns(options.match);
	return [...(await ls(resolvePaths(paths), {
		filter: combinePatterns([exts, match], true),
		ignore: combinePatterns(options.ignore || /(?:^|[\\/])(?:\.git|node_modules)$/i),
		recurse: -1,
	})).keys()];
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
 * Combine multiple path-matching pattern(s) into a single expression or callback.
 * @param {FilenamePatterns} input
 * @param {Boolean} [matchAll=false]
 *    If true, then multiple regular expressions produce a predicate that
 *    only returns true if every expression matches the input. Normally,
 *    predicates only require at least one expression to match.
 * @return {?RegExp|Function}
 *    If multiple regular expressions were produced, the return value is a
 *    predicate function that returns true if one of the patterns match;
 *    otherwise, a single regular expression is returned if input wasn't
 *    empty, and `null` if it was.
 * @internal
 */
export function combinePatterns(input, matchAll = false){
	if(input instanceof RegExp) return input;
	if(!input) return null;
	if(!Array.isArray(input))
		input = [input];
	input = input.map(obj =>
		"function" === typeof obj && Symbol.iterator in obj
			? [...obj]
			: regexFromString(obj)
	).flat().filter(Boolean);
	switch(input.length){
		case 0: return null;
		case 1: return input[0];
		default:
			const fn = matchAll
				? path => input.every(x => x.test(path))
				: path => input. some(x => x.test(path));
			fn[Symbol.iterator] = function*(){ yield* input; };
			return fn;
	}
}


/**
 * Construct a regular expression from a string representation.
 * @example regexFromString("(?gi)abc") == /abc/gi;
 * @param {String} input
 * @return {?RegExp} A regular expression, or `null` if input was a falsey value.
 * @internal
 */
export function regexFromString(input){
	if(input instanceof RegExp) return input;
	if(!input) return null;
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

/**
 * @typedef {RegExp|String|RegExp[]|String[]} FilenamePatterns
 * @description
 *    One or more patterns designed to match part of a file path.
 *
 *    String values are converted to regular expressions, with modifiers specified
 *    in a leading `(?…)` group that's stripped from the value that forms the body
 *    of the RegExp.
 *
 *    Multiple regular expressions produce a predicate function that returns true
 *    if one of the expressions matches the callback's argument. This is used for
 *    the `filter` option of the {@linkcode ls|ls()} function.
 */
