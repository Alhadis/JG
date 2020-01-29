#!/usr/bin/env node

import fs from "fs";
import getOpts from "get-options";
import {expandEscapes, readStdin, nerf} from "alhadis.utils";

const {options, argv} = getOpts(process.argv.slice(2), {
	"-b, --backup": "[suffix]",
	"-i, --in-place-edit": "",
}, {noMixedOrder: true, noUndefined: true, terminator: "--"});

const {search, replace} = parseRegExp(argv.shift());


// Read from standard input
if(!process.stdin.isTTY)
	readStdin().then(input =>
		process.stdout.write(input.replace(search, replace)));

// Read/write from/to a list of files
else if(argv.length){
	let status = 0;
	const readFile = nerf(fs.readFileSync);
	for(const path of argv){
		let file = readFile(path, "utf8");
		
		// Unable to open file
		if(undefined === file){
			console.error(readFile.lastError);
			status = 1;
			continue;
		}
		
		file = file.replace(search, replace);
		if(!options.inPlaceEdit)
			process.stdout.write(file);

		// Only write back to file if something changed
		else if(search.didReplace){
			// Make a backup first
			if(options.backup){
				const backup = path + options.backup;
				fs.existsSync(backup) && fs.unlinkSync(backup);
				fs.renameSync(path, backup);
			}
			fs.writeFileSync(path, file, "utf8");
		}
	}
	process.exit(status);
}

// Nothing to do here
else{
	process.stderr.write("edit: No files or input passed\n");
	process.exit(1);
}



/**
 * Split a sed(1)-like “/search/replace/” pattern into a {@link RegExp} and {@link String}, respectively.
 *
 * A leading `s` is stripped to lessen risk of confusion with sed(1)'s “substitute” command.
 *
 * @example parseRegExp("/foo/bar/i") == {search: /foo/i, replace: "bar"};
 * @throws {TypeError} Raises an exception for malformed patterns.
 * @param {String} input
 * @return {{search: RegExp, replace: String}}
 */
export function parseRegExp(input){
	const match = input.match(/^s?(.)((?:[^\\]|\\.)+)\1((?:[^\\]|\\.)+)\1([gimsuy]*)$/);
	if(!input) throw new TypeError("edit: No pattern provided");
	if(!match) throw new TypeError(`edit: Unable to parse regexp: ${input}`);
	
	const search  = new RegExp(match[2], match[4]);
	const replace = expandEscapes(match[3], true);
	
	search.didReplace = false;
	search[Symbol.replace] = function(...args){
		const result = RegExp.prototype[Symbol.replace].apply(this, args);
		this.didReplace = args[0] !== result;
		return result;
	};
	
	return {search, replace};
}
