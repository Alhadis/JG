#!/usr/bin/env node
"use strict";

const getOpts = require("get-options");
const {join}  = require("path");
const {readdirSync} = require("fs");

const {options, argv} = getOpts(process.argv.slice(2), {
	"-v, --version": "",
	"-h, --help": "",
	"-p, --print-path": "",
	"-i, --in-place-edit": "[pattern=\\S+]",
});

// Show installed version, then terminate
if(options.version){
	const {version} = require("./package.json");
	process.stdout.write(version + "\n");
	process.exit(0);
}

// Print a terse usage summary, then terminate
if(options.help){
	showUsage();
	process.exit(0);
}

// Switches which are aliases/shorthand of subcommands
if(options.inPlaceEdit)    argv.unshift("edit", "-i");
else if(options.printPath) argv.unshift("path");


// Not enough arguments
if(!argv.length){
	process.stdout.write("fatal: no subcommand specified.\n");
	showUsage();
	process.exit(1);
}

// Specified command doesn't exist in `./bin` subdirectory
let path = join(__dirname, "bin");
const subcmd = argv.shift();
if(!readdirSync(path).includes(subcmd)){
	process.stderr.write(`fatal: unrecognised subcommand: "${subcmd}"\n`);
	process.exit(1);
}

path = join(path, subcmd);
process.argv = [process.execPath, path, ...argv];
global.$0 = path;
require(path);


function showUsage(){
	process.stdout.write([
		"Usage: jg subcommand [...args]",
		"       jg [-i|--in-place-edit regexp] [...files]",
		"       jg [-h|--help]",
		"       jg [-v|--version]",
	].join("\n") + "\n");
	if("win32" !== process.platform)
		process.stdout.write("\nRun `man jg' for full documentation.\n");
}
