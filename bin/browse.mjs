#!/usr/bin/env node
/**
 * Open a page in a headless browser.
 *
 * Much of this program's logic was distilled from various
 * {@link http://karma-runner.github.io/|Karma} launchers.
 */

import {basename, dirname, join, resolve} from "path";
import {copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from "fs";
import {exec, which} from "alhadis.utils";
import {spawn} from "child_process";
import {fileURLToPath} from "url";
import {tmpdir, EOL} from "os";
import getOpts from "get-options";


// Run if executed directly
const path = fileURLToPath(import.meta.url);
const root = resolve(dirname(path), "..");
(process.argv[1] === path || globalThis.$0 === path) && (async () => {
	const {options, argv} = getOpts(process.argv.slice(2), {
		"-a, --auto":     "",
		"-c, --chrome":   "",
		"-e, --edge":     "",
		"-f, --firefox":  "",
		"-i, --ie":       "",
		"-o, --opera":    "",
		"-s, --safari":   "",
		"-U, --unstable": "",
		"-v, --version":  "",
		"-w, --where":    "",
	}, {noMixedOrder: true, noUndefined: true, terminator: "--"});
	
	let browser = "auto";
	for(const opt in options)
		if(/^(auto|chrome|edge|firefox|ie|opera|safari)$/.test(opt))
			browser = RegExp.$1;
	
	// Print location/version of browser executable
	if(options.where || options.version){
		const path = await find(browser, options.unstable);
		if(!path){
			browser = browser.replace(/^\w(?:e$)?/, s => s.toUpperCase());
			const message = "auto" === browser ? "No browsers available" : `${browser} not found`;
			process.stderr.write(`browse: ${message}\n`);
			process.exit(1);
		}
		process.stdout.write(options.version ? await getVersion(path) : path);
		process.stdout.isTTY && process.stdout.write("\n");
	}
	
	// Open webpage in browser
	else return open(argv[0] || "http://localhost:1337", browser);

})().catch(error => {
	console.error(error);
	process.exit(1);
});


/**
 * Locate the specified browser on the host system.
 *
 * @param {String} browser - Name of the desired browser; "auto" will locate whatever's available.
 * @param {Boolean} [unstable=false] - Check for unstable versions first
 * @return {Promise.<?String>}
 */
export async function find(browser = "auto", unstable = false){
	switch(browser.toLowerCase()){
		case "chrome":  return findChrome(unstable);
		case "edge":    return findEdge();
		case "firefox": return findFirefox(unstable);
		case "ie":      return findIE(unstable);
		case "opera":   return findOpera(unstable);
		case "safari":  return findSafari();
		case "auto":
			const finders = [findChrome, findFirefox, findSafari, findEdge, findOpera, findIE];
			for(const fn of finders){
				const path = await fn(unstable);
				if(path) return path;
			}
			break;
	}
	return null;
}


/**
 * Locate Google Chrome on the host system.
 *
 * @param {Boolean} [unstable=false] - Check for unstable Chrome versions first
 * @return {Promise.<?String>}
 */
export async function findChrome(unstable = false){
	for(const key of ["CHROME_CANARY_BIN", "CHROME_BIN", "CHROMIUM_BIN"].slice(+!unstable))
		if(process.env[key] && existsSync(process.env[key]))
			return process.env[key];

	switch(process.platform){
		case "darwin": {
			const paths = [
				"/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
				"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
				"/Applications/Chromium.app/Contents/MacOS/Chromium",
			];
			unstable || paths.shift();
			for(const path of paths){
				const home = join(process.env.HOME || "/", path);
				if(existsSync(home)) return home;
				if(existsSync(path)) return path;
			}
			break;
		}
		
		case "win32": {
			const suffixes = [
				"\\Google\\Chrome SxS\\Application\\chrome.exe",
				"\\Google\\Chrome\\Application\\chrome.exe",
				"\\Chromium\\Application\\chrome.exe",
			];
			const prefixes = [
				process.env.LOCALAPPDATA,
				process.env.PROGRAMFILES,
				process.env["PROGRAMFILES(X86)"],
			];
			unstable || suffixes.shift();
			for(const suffix of suffixes)
			for(const prefix of prefixes){
				const path = join(prefix, suffix);
				if(existsSync(path))
					return path;
			}
			break;
		}
		
		default: {
			const names = [
				"google-chrome-canary",
				"google-chrome-unstable",
				"google-chrome",
				"google-chrome-stable",
				"chromium-browser",
				"chromium",
			];
			unstable || names.splice(0, 2);
			for(const name of names){
				const path = await which(name);
				if(path) return path;
			}
			break;
		}
	}
	return null;
}


/**
 * Locate Edge on the host system.
 * @return {Promise.<?String>}
 */
export async function findEdge(){
	switch(process.platform){
		case "darwin": {
			const path = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
			const home = join(process.env.HOME || "/", path);
			if(existsSync(home)) return home;
			if(existsSync(path)) return path;
			break;
		}
		case "win32": {
			const path = "C:\\Windows\\SystemApps\\Microsoft.MicrosoftEdge_8wekyb3d8bbwe\\MicrosoftEdge.exe";
			if(existsSync(path)) return path;
			const cmd = "(Get-Command MicrosoftEdge).source";
			const {stdout} = await exec("powershell.exe", ["-command", cmd], null, {windowsHide: true});
			return stdout.trim() || null;
		}
	}
}


/**
 * Locate Firefox on the host system.
 *
 * @param {Boolean} [unstable=false] - Check for unstable Firefox versions first
 * @return {Promise.<?String>}
 */
export async function findFirefox(unstable = false){
	const envVars = ["FIREFOX_NIGHTLY_BIN", "FIREFOX_BIN", "FIREFOX_DEVELOPER_BIN", "FIREFOX_AURORA_BIN"];
	for(const key of envVars.slice(+!unstable))
		if(process.env[key] && existsSync(process.env[key]))
			return process.env[key];
	
	switch(process.platform){
		case "darwin": {
			const names = [
				"FirefoxNightly",
				"Firefox Nightly",
				"Firefox",
				"FirefoxDeveloperEdition",
				"FirefoxAurora",
			];
			unstable || names.splice(0, 2);
			for(const name of names){
				const path = `/Applications/${name}.app/Contents/MacOS/firefox-bin`;
				const home = join(process.env.HOME || "/", path);
				if(existsSync(home)) return home;
				if(existsSync(path)) return path;
			}
			break;
		}
		
		case "win32": {
			const names = [
				"Nightly",
				"Firefox Nightly",
				"Mozilla Firefox",
				"Firefox Developer Edition",
				"Aurora",
			];
			unstable || names.splice(0, 2);
			for(const path of getWin32ProgramPaths())
			for(const name of names){
				const exe = join(path, name, "firefox.exe");
				if(existsSync(exe)) return exe;
			}
			break;
		}
		
		default:
			return which("firefox");
	}
	return null;
}


/**
 * Locate Internet Explorer on the host system.
 * @return {Promise.<?String>}
 */
export async function findIE(){
	for(const prefix of getWin32ProgramPaths()){
		const path = join(prefix, "Internet Explorer", "iexplore.exe");
		if(existsSync(path)) return path;
	}
	return null;
}


/**
 * Locate Opera on the host system.
 * @return {Promise.<?String>}
 */
export async function findOpera(){
	if(process.env.OPERA_BIN)
		return process.env.OPERA_BIN;
	switch(process.platform){
		case "darwin":
			const path = "/Applications/Opera.app/Contents/MacOS/Opera";
			const home = join(process.env.HOME || "/", path);
			if(existsSync(home)) return home;
			if(existsSync(path)) return path;
			break;
		
		case "win32": {
			let path, root;
			for(const prefix of getWin32ProgramPaths()){
				const path = join(prefix, "Opera");
				if(existsSync(path)){
					root = path;
					break;
				}
			}
			if(!root) return null;
			if(existsSync(path = join(root, "opera.exe")))
				return path;
			for(const {name, isDirectory} of readdirSync(root, {withFileTypes: true}))
				if(isDirectory() && existsSync(path = join(root, name, "opera.exe")))
					return path;
			break;
		}
		
		default:
			return which("opera");
	}
	return null;
}


/**
 * Locate Safari on the host system.
 * @return {Promise.<?String>}
 */
export async function findSafari(){
	if(process.env.SAFARI_BIN)
		return process.env.SAFARI_BIN;
	switch(process.platform){
		case "darwin":
			const path = "/Applications/Safari.app/Contents/MacOS/Safari";
			const home = join(process.env.HOME || "/", path);
			if(existsSync(home)) return home;
			if(existsSync(path)) return path;
			break;
		
		case "win32":
			for(const prefix of getWin32ProgramPaths()){
				const path = join(prefix, "Safari", "Safari.exe");
				if(existsSync(path)) return path;
			}
			break;
	}
	return null;
}


/**
 * Resolve a list of program directories for each drive in the user's $Path.
 *
 * Only relevant on Windows.
 *
 * @see {@link https://ss64.com/nt/syntax-variables.html}
 * @example getWin32ProgramPaths() == [
 *    "C:\\Program Files",
 *    "C:\\Program Files (x86)",
 * ];
 * @return {String[]}
 * @internal
 */
export function getWin32ProgramPaths(){
	if(!process.env.Path) return [];
	const results = new Set();
	const drives = new Set(process.env.Path.split(";")
		.map(path => /^[A-Z]:\\/i.test(path) ? RegExp.lastMatch[0] : null)
		.filter(Boolean));
	const names = ["ProgramW6432", "ProgramFiles", "ProgramFiles(x86)", "ProgramFiles(X86)"];
	names.push(...names.map(n => n.toUpperCase()), ...names.map(n => n.toLowerCase()));
	for(const name of names)
		if(process.env[name])
			for(const drive of drives)
				results.add(drive + process.env[name].substr(1));
	return [...results];
}


/**
 * Retrieve a program's version string.
 *
 * @param {String} path
 * @return {Promise.<?String>}
 */
export async function getVersion(path){
	switch(process.platform){
		case "darwin": {
			const plist = /\.app\/$/i.test(path)
				? join(path, "Contents", "Info.plist")
				: join(resolve(dirname(path), ".."), "Info.plist");
			
			if(!existsSync(plist))
				throw new Error("Unable to locate `Info.plist` file");
			
			// Use plistbuddy(8) to read property-list
			if(existsSync("/usr/libexec/Plistbuddy")){
				const cmd = "Print :CFBundleShortVersionString";
				const {stdout} = await exec("/usr/libexec/Plistbuddy", ["-c", cmd, plist]);
				return stdout ? stdout.trim() : null;
			}
			// Last resort; won't work with binary plists
			else{
				const match = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/;
				return (readFileSync(plist, "utf8").match(match) || [])[1] || null;
			}
		}
		
		case "win32": {
			const cmd = `echo (Get-Command "${path}").Version.toString()`;
			const {stdout} = await exec("powershell.exe", ["-command", cmd]);
			return stdout.trim().split(/\r?\n/).filter(Boolean)[0];
		}
		
		default:
			const name = basename(path).replace(/(?<=\S)\.\w+$/, "").toLowerCase();
			return ("firefox" === name
				? ((await exec(path, ["--version"])).stdout).replace(/^(?:Mozilla|Firefox|\s*)*/i, "").trim()
				: /^(?:google-)?chrome(?:-(?:canary|stable|unstable))?$|^chromium$/.test(name)
					? ((await exec(path, ["--version"]).stdout).match(/[\d.]+/) || [])[0]
					:  (await exec(path, ["--version"])).stdout.trim())
				|| null;
	}
}


/**
 * Open a page in the specified browser.
 *
 * If the second parameter is "auto", the first available browser is used.
 *
 * @param {String|URL} url
 * @param {String} [browser="auto"]
 * @return {Promise.<ChildProcess>}
 */
export async function open(url, browser = "auto"){
	switch(browser.toLowerCase()){
		case "chrome":  return openChrome(url);
		case "edge":    return openEdge(url);
		case "firefox": return openFirefox(url);
		case "ie":      return openIE(url);
		case "opera":   return openOpera(url);
		case "safari":  return openSafari(url);
		case "auto":
			for(const open of [openChrome, openFirefox, openSafari, openOpera, openIE])
				try{ return await open(url); }
				catch(e){}
			throw new Error("No browsers available");
		default:
			throw new TypeError(`Unknown browser: "${browser}"`);
	}
}


/**
 * Open a page in Chrome.
 *
 * @see {@link https://peter.sh/experiments/chromium-command-line-switches/}
 * @param {String|URL} url
 * @return {Promise.<ChildProcess>}
 */
export async function openChrome(url){
	const path = await findChrome();
	if(!path) throw new Error("Could not locate Chrome on host system");
	const profile = join(tmpdir(), "jg-browse-chrome");
	const flags = [
		"--headless",
		"--disable-gpu",
		"--disable-dev-shm-usage",
		"--user-data-dir=" + profile,
		"--enable-automation",
		"--no-default-browser-check",
		"--no-first-run",
		"--disable-default-apps",
		"--disable-popup-blocking",
		"--disable-translate",
		"--disable-background-timer-throttling",
		"--disable-renderer-backgrounding",
		"--disable-device-discovery-notifications",
		"--crash-dumps-dir=/tmp",
		"--remote-debugging-port=9222",
	];
	return spawn(path, [...flags, url], {windowsHide: true, stdio: "inherit"});
}


/**
 * Open a page in Edge.
 *
 * @param {String|URL} url
 * @return {Promise.<ChildProcess>}
 */
export async function openEdge(url){
	switch(process.platform){
		case "darwin":
			const path = await findEdge();
			if(!path) throw new Error("Could not locate Edge on host system");
			return spawn(path, [url], {stdio: "inherit"});
		
		case "win32":
			return spawn("powershell.exe", ["-command", [
				`(Start-Process -FilePath "microsoft-edge:${url}")`,
				'(Wait-Process -Name "MicrosoftEdge" -ErrorAction SilentlyContinue)',
			].join("; ")], {windowsHide: true, stdio: "inherit"});
		
		default:
			throw new Error("Microsoft Edge only supported on Windows and macOS");
	}
}


/**
 * Open a page in Firefox.
 *
 * @see {@link https://web.archive.org/web/20210530092017/https://developer.mozilla.org/en-US/docs/Mozilla/Command_Line_Options}
 * @see {@link https://hacks.mozilla.org/2017/12/using-headless-mode-in-firefox/}
 * @see {@link https://wiki.mozilla.org/Platform/Integration/InjectEject/Launcher_Process/}
 * @param {String|URL} url
 * @return {Promise.<ChildProcess>}
 */
export async function openFirefox(url){
	const path = await findFirefox();
	if(!path) throw new Error("Could not locate Firefox on host system");
	const profile = join(tmpdir(), "jg-browse-firefox");
	const flags = [
		"-headless",
		"-marionette",
		"-start-debugger-server", 6000,
		"-new-instance",
		"-allow-downgrade",
		"-profile", profile,
		"-no-remote",
		"-wait-for-browser",
	];
	if(!existsSync(profile)){
		const name = basename(profile);
		+process.env.DEBUG && console.info(`Creating profile "${name}" at ${profile}`);
		const {code, stdout, stderr} = await exec(path, [
			"-headless",
			"-new-instance",
			"-no-remote",
			"-CreateProfile", name + " " + profile]);
		console.log({code, stdout, stderr});
		if(code){
			stderr && console.error(stderr);
			throw new Error(`Firefox exited with code ${code}`);
		}
	}
	copyFileSync(join(root, ..."etc/profiles/firefox-headless.js".split("/")), join(profile, "user.js"));
	const env = {...process.env, MOZ_DEBUG_BROWSER_PAUSE: 0};
	return spawn(path, [...flags, url], {env, windowsHide: true, stdio: "inherit"});
}


/**
 * Open a page in Internet Explorer.
 *
 * @see {@link https://msdn.microsoft.com/en-us/library/hh826025(v=vs.85).aspx}
 * @param {String|URL} url
 * @return {Promise.<ChildProcess>}
 */
export async function openIE(url){
	const path = await findIE();
	if(!path) throw new Error("Could not locate IE on host system");
	const msie = spawn(path, [url], {windowsHide: true, stdio: "inherit"});
	return msie.on("exit", () => spawn("wmic.exe", [
		"Path", "win32_Process", "where",
		`Name="iexplore.exe" and CommandLine Like "%${msie.pid}%"`,
		"call", "Terminate",
	], {windowsHide: true, stdio: "ignore"}));
}


/**
 * Open a page in Opera.
 *
 * @see {@link https://web.archive.org/web/20150317061520/http://www.opera.com/docs/switches/}
 * @param {String|URL} url
 * @return {Promise.<ChildProcess>}
 */
export async function openOpera(url){
	const path = await findOpera();
	if(!path) throw new Error("Could not locate Opera on host system");
	const profile = join(tmpdir(), "jg-browse-opera");
	const release = (await getVersion(path)).split(".").map(Number)[0];
	existsSync(profile) || mkdirSync(profile);
	let flags;
	
	// Presto (pre-Chromium) Opera
	if(release < 13){
		// NB: NFI which INI file's really needed
		const ini1 = join(profile, "opera6.ini");
		const ini2 = join(profile, "operaprefs.ini");
		flags = ["-pd", profile, ..."win32" === process.platform
			? ["/Settings", ini1]
			: ["-nomail"]];
		const prefs = `
			Opera Preferences version 2.1

			[User Prefs]
			Show Default Browser Dialog = 0
			Startup Type = 2
			Home URL = about:blank
			Show Close All But Active Dialog = 0
			Show Close All Dialog = 0
			Show Crash Log Upload Dialog = 0
			Show Delete Mail Dialog = 0
			Show Download Manager Selection Dialog = 0
			Show Geolocation License Dialog = 0
			Show Mail Error Dialog = 0
			Show New Opera Dialog = 0
			Show Problem Dialog = 0
			Show Progress Dialog = 0
			Show Validation Dialog = 0
			Show Widget Debug Info Dialog = 0
			Show Startup Dialog = 0
			Show E-mail Client = 0
			Show Mail Header Toolbar = 0
			Show Setupdialog On Start = 0
			Ask For Usage Stats Percentage = 0
			Enable Usage Statistics = 0
			Disable Opera Package AutoUpdate = 1
			Browser JavaScript = 0

			[Install]
			Newest Used Version = 1.00.0000

			[State]
			Accept License = 1
			Run = 0
		`.replace(/\t+|^\s+/g, "").replace(/\r?\n/g, EOL);
		writeFileSync(ini1, prefs, "utf8");
		writeFileSync(ini2, prefs, "utf8");
	}
	// Modern Opera
	else flags = [
		"--user-data-dir=" + profile,
		"--no-default-browser-check",
		"--no-first-run",
		"--disable-default-apps",
		"--disable-popup-blocking",
		"--disable-translate",
		"--new-window",
	];
	return spawn(path, [...flags, url], {windowsHide: true, stdio: "inherit"});
}


/**
 * Open a page in Safari.
 *
 * @param {String|URL} url
 * @return {Promise.<ChildProcess>}
 */
export async function openSafari(url){
	const path = await findSafari();
	if(!path) throw new Error("Could not locate Safari on host system");
	const redirect = join(tmpdir(), "jg-browse-safari.html");
	const {raw:HTML} = String;
	writeFileSync(redirect, HTML `
		<!DOCTYPE html>
		<html>
			<meta charset="UTF-8"/>
			<body><script>window.location = "${url}";</script></body>
		</html>
	`.replace(/[\t\n]+/g, ""), "utf8");
	return spawn(path, [redirect], {windowsHide: true, stdio: "inherit"});
}
