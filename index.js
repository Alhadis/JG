#!/usr/bin/env node
"use strict";

const getOpts = require("get-options");
const {join}  = require("path");
const {readdirSync} = require("fs");

let {options, argv} = getOpts(process.argv.slice(2), {
	"-v, --version": "",
	"-h, --help": "",
	"-l, --list": "[exts=\\S+]",
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

// Process arguments of `jg -l` shorthand
else if(options.list){
	const opts = [];
	const exts = [options.list];
	for(const arg of argv.slice())
		("-" === arg[0] ? opts : exts).push(arg);
	argv = ["list", "-e", exts.join(","), ...opts];
}

// Not enough arguments
if(!argv.length){
	process.stdout.write("fatal: no subcommand specified.\n");
	showUsage();
	process.exit(1);
}

// Tolerate `ls` as an alias of `list`; it's too easily confused
if("ls" === argv[0]) argv[0] = "list";

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
		"       jg [-l|--list] exts",
		"       jg [-i|--in-place-edit regexp] [...files]",
		"       jg [-h|--help]",
		"       jg [-v|--version]",
	].join("\n") + "\n");
	if("win32" !== process.platform)
		process.stdout.write("\nRun `man jg' for full documentation.\n");
}
