#!/usr/bin/env node

import getOpts from "get-options";
import {dirname, join} from "path";
import {fileURLToPath} from "url";
import {readFileSync, readdirSync} from "fs";

let {options, argv} = getOpts(process.argv.slice(2), {
	"-v, --version": "",
	"-h, --help": "",
	"-L": "[exts=\\S+]",
	"-l, --list": "[exts=\\S+]",
	"-p, --print-path": "",
	"-i, --in-place-edit": "[pattern=\\S+]",
}, {noMixedOrder: true, noUndefined: true, terminator: "--"});

// Show installed version, then terminate
if(options.version){
	const {version} = JSON.parse(readFileSync("./package.json", "utf8"));
	process.stdout.write(version + "\n");
	process.exit(0);
}

// Print a terse usage summary, then terminate
if(options.help){
	showUsage();
	process.exit(0);
}

// `-L` is an alias for `-l -0`
if("L" in options)
	options.list = options.L;


// Switches which are aliases/shorthand of subcommands
if(options.inPlaceEdit)    argv.unshift("edit", "-i");
else if(options.printPath) argv.unshift("path");

// Process arguments of `jg -l` shorthand
else if("list" in options){
	if(!options.list){
		showUsage();
		process.exit(1);
	}
	const opts = [];
	const exts = [options.list];
	options.L && opts.push("-0");
	for(const arg of argv.slice())
		("-" === arg[0] ? opts : exts).push(arg);
	argv = ["list", "-e", exts.join(","), ...opts];
	+process.env.DEBUG && console.warn("jg: Permuted arguments: ", argv);
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
let path = join(dirname(fileURLToPath(import.meta.url)), "bin");
const subcmd = argv.shift().replace(/(?:\.m?js)?$/i, ".mjs");
if(!readdirSync(path).includes(subcmd)){
	process.stderr.write(`fatal: unrecognised subcommand: "${subcmd}"\n`);
	process.exit(1);
}

path = join(path, subcmd);
process.argv = [process.execPath, path, ...argv];
globalThis.$0 = path;
import(path).catch(e => {
	console.error(e);
	process.exit(1);
});


function showUsage(){
	process.stdout.write([
		"Usage: jg subcommand [...args]",
		"       jg [-l|--list] ...exts",
		"       jg [-i|--in-place-edit regexp] [...files]",
		"       jg [-h|--help]",
		"       jg [-v|--version]",
	].join("\n") + "\n");
	if("win32" !== process.platform)
		process.stdout.write("\nRun `man jg' for full documentation.\n");
}
