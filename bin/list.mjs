#!/usr/bin/env node

import {join, resolve} from "path";
import {fileURLToPath} from "url";
import {escapeRegExp} from "alhadis.utils";
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
	
	// Construct a RegExp to match desired file extensions
	let exts = null;
	if(options.extensions){
		exts = options.extensions.split(/[.,\s]+/);
		exts = [...new Set(exts.filter(Boolean).sort())].map(escapeRegExp);
		exts = new RegExp(`\\.(?:${exts.join("|")})$`, "i");
	}
	
	// Resolve search-paths
	let paths = [...new Set(argv.map(path => resolve(path)))];
	let status = 0;
	
	// Filter out invalid paths
	if(paths.length){
		paths = paths.filter(path => {
			if(!fs.existsSync(path) || !fs.statSync(path).isDirectory()){
				process.stderr.write(`list: Not a directory: ${path}\n`);
				status = 2;
				return false;
			}
			return true;
		});
	}
	// Default to current working directory if no paths were specified
	else paths.push(process.cwd());
	
	Promise.all(paths.map(path => findFiles(path, options.ignore)))
		.then(searches => {
			let paths = new Set();
			for(const search of searches)
				for(const path of search.keys())
					paths.add(path);
			paths = [...paths];
			
			// Filter out files which don't match requested extension(s)
			if(exts) paths = paths.filter(path => exts.test(path));
			
			// Terminate with an error code if nothing matched
			if(!paths.length)
				return process.exit(1);
			
			process.stdout.write(paths.join(options[0] ? "\0" : "\n"));
			process.stdout.isTTY && process.stdout.write("\n");
			process.exit(status);
		}).catch(error => {
			console.error(error);
			process.exit(2);
		});
}

export async function findFiles(path, ignorePattern = /(?:^|[\\/])(?:\.git|node_modules)$/i){
	path = resolve(path || process.cwd());
	const files = await ls(path);
	const searches = [];
	for(const [path, stats] of files)
		if(stats.isDirectory() && !ignorePattern.test(path))
			searches.push(findFiles(path));
	
	await Promise.all(searches).then(results => {
		for(const map of results)
			for(const [path, stats] of map)
				files.set(path, stats);
	});
	return files;
}

export async function ls(path){
	const files = await new Promise((resolve, reject) => {
		fs.readdir(path, (error, list) => error
			? reject(error)
			: resolve(list));
	});
	return new Map([...await Promise.all(
		files.map(file => new Promise((resolve, reject) => {
			file = join(path, file);
			fs.lstat(file, (error, stats) => error
				? reject(error)
				: resolve([file, stats]));
		})),
	)]);
}
