#!/usr/bin/env node
"use strict";

const getOpts = require("get-options");
const {join}  = require("path");
const {spawn} = require("child_process");
const {readdirSync} = require("fs");
let {options, argv} = getOpts(process.argv.slice(2), {
	"-v, --version": "",
	"-h, --help": "",
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

// Make sure native modules are supported before attempting to execute
const [major, minor] = process.version.replace(/^v/, "").split(".").map(Number);
if(major < 8 || (8 === major && minor < 5)){
	process.stderr.write("fatal: Node.js v8.5.0 or later is required to run.\n");
	process.exit(1);
}

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
argv = ["--", path, ...argv];
needsESMFlag() && argv.unshift("--experimental-modules");
spawn(process.execPath, argv, {windowsHide: true, stdio: "inherit"});



function needsESMFlag(){
	const flags = process.allowedNodeEnvironmentFlags;
	return "object" !== typeof flags || flags.has("--experimental-modules");
}


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
