#!/usr/bin/env node

import HTTP from "http";
import {join} from "path";
import {fileURLToPath, pathToFileURL} from "url";
import {RPCSession} from "./ws.mjs";
import getOpts from "get-options";


// Run if executed directly
const path = fileURLToPath(import.meta.url);
(process.argv[1] === path || globalThis.$0 === path) && (async () => {
	
	// TODO: Add switch to `./browse.mjs' for specifying debugging port
	const {options, argv} = getOpts(process.argv.slice(2), {
		"-K, --kill": "",
		"-p, --port": "[number=\\d+]",
		"-r, --root": "[directory]",
	}, {noMixedOrder: true, noUndefined: true, terminator: "--"});
	
	const results = await collectChromeCoverage({
		urls:  argv.length > 0 ? argv : ["http://localhost:1337/"],
		port:  options.port || 9222,
		close: options.kill,
	});
	remapURLs(results, options.root);
	process.stdout.write(JSON.stringify(results, null, "\t") + "\n");
	process.exit();
	
})().catch(error => {
	console.error(error);
	process.exit(1);
});


/**
 * Collect block-coverage in Chrome using the DevTools protocol.
 *
 * @see {@link https://chromedevtools.github.io/devtools-protocol}
 * @param {Object}  args       - Object keyed with the following arguments:
 * @param {Boolean} args.close - Terminate Chrome when finished
 * @param {Number}  args.port  - Remote debugging port
 * @param {URLs}    args.urls  - List of URLs to profile
 * @return {Promise.<ScriptCoverage[]>}
 */
export async function collectChromeCoverage({close, port, urls} = {}){
	urls = (Array.isArray(urls) ? urls : [urls]).map(x => new URL(x));
	
	const devURL = Object.assign(new URL(urls[0]), {pathname: "/json/list", port});
	const list   = await loadJSON(devURL);
	const target = list.find(x => "page" === x.type);
	const ws     = new RPCSession(target.webSocketDebuggerUrl);
	ws.version   = null; // XXX: Remove `jsonrpc` field; CDP doesn't use it
	await ws.openPromise;
	
	// Start interacting with Chrome
	await ws.sendCmd("Profiler.enable");
	await ws.sendCmd("Page.enable");
	await ws.sendCmd("Profiler.startPreciseCoverage", {callCount: true, detailed: true});
	for(const url of urls){
		process.stderr.write(`Navigating to ${url}\n`);
		ws.sendCmd("Page.navigate", {url});
		await ws.waitFor("Page.loadEventFired");
	}
	const results = await ws.sendCmd("Profiler.takePreciseCoverage");
	await ws.sendCmd("Profiler.stopPreciseCoverage");
	await close ? ws.sendCmd("Browser.close") : ws.close(1000);
	return results;
}


/**
 * Load and parse a resource as JSON.
 * @param {String|URL} url
 * @return {Promise.<Object>}
 * @internal
 */
export async function loadJSON(url){
	return new Promise((resolve, reject) => {
		let data = "";
		HTTP.get(url, response => {
			if(response.statusCode >= 400)
				return reject(response.statusCode);
			response.setEncoding("utf8");
			response.on("data", chunk => data += chunk);
			response.on("end", () => resolve(JSON.parse(data)));
		}).on("error", reject);
	});
}


/**
 * Map HTTP(S) addresses to their corresponding filesystem paths.
 *
 * @example remapURLs(results, "/Users/john/Desktop");
 * @param {ScriptCoverage[]} input
 * @param {String} to
 * @return {void}
 * @internal
 */
export function remapURLs({result}, to){
	if(!to) return;
	for(const item of result){
		let url;
		try{ url = new URL(item.url); }
		catch(e){ continue; }
		const {protocol, pathname} = url;
		item.url = ("file:" !== protocol
			? pathToFileURL(join(to, pathname))
			: item.url).toString();
	}
}


/**
 * One or more URLs to load and collect coverage for.
 * @typedef {String|URL|Array<String|URL>} URLs
 */

/**
 * Coverage data for a JavaScript resource.
 * @typedef  {Object} ScriptCoverage
 * @property {String} scriptID
 * @property {String} url
 * @property {FunctionCoverage[]} functions
 */

/**
 * Coverage data for a JavaScript function.
 * @typedef  {Object} FunctionCoverage
 * @property {String} functionName
 * @property {CoverageRange[]} ranges
 * @property {Boolean} isBlockCoverage
 */

/**
 * Coverage data for a source range.
 * @typedef  {Object} CoverageRange
 * @property {Number} startOffset
 * @property {Number} endOffset
 * @property {Number} count
 */
