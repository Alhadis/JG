#!/usr/bin/env node

import {resolve} from "path";
import {escapeRegExp, ls} from "alhadis.utils";
import getOpts from "get-options";
import fs from "fs";

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

ls(paths, {
	filter: exts,
	ignore: options.ignore || /(?:^|[\\/])(?:\.git|node_modules)$/i,
	recurse: -1,
}).then(result => {
	const paths = [...result.keys()];
	
	// Terminate with an error code if nothing matched
	if(!paths.length)
		return process.exit(1);
	
	process.stdout.write(paths.join(options[0] ? "\0" : "\n"));
	process.stdout.isTTY && process.stdout.write("\n");
	process.on("beforeExit", () => process.exit(status));
}).catch(error => {
	console.error(error);
	process.exit(2);
});
