#!/usr/bin/env node
/**
 * Serve static files from the current working directory.
 *
 * Used for serving files over a local network, chiefly
 * for viewing on mobile devices.
 */

import HTTP    from "http";
import fs      from "fs";
import path    from "path";
import getOpts from "get-options";
import {
	escapeCtrl,
	escapeHTML,
	formatBytes,
	timeSince,
	tildify,
	deindent as HTML,
} from "alhadis.utils";
import {useGracefulQuit} from "./ws.mjs";


// Resolve CLI switches
const {options, argv} = getOpts(process.argv.slice(2), {
	"-I, --no-index":   "",
	"-m, --mount":      "[directory:mount-point]",
	"-p, --port":       "[number=\\d+]",
	"-P, --print-post": "",
	"-t, --trace":      "",
}, {
	duplicates: "stack",
	noAliasPropagation: "first-only",
	noMixedOrder: true,
	noUndefined: true,
	terminator: "--",
});
const cwd       = process.cwd();
const port      = Math.max(+options.port, 0) || 1337;
let root        = path.resolve(argv[0] || cwd);
const noIndex   = !!options.noIndex;
const printPost = !!options.printPost;
const trace     = !!options.trace;


// Configure mount-points
let mounts = new Map();
const mappings = "string" === typeof options.mount ? [options.mount] : options.mount;
for(const mapping of mappings || []){
	if(!mapping[0])
		throw new TypeError("--mount option requires an argument");
	let [to, ...from] = (Array.isArray(mapping) ? mapping : [mapping])[0].split(":");
	to = path.resolve(to);
	if(fs.existsSync(to)){
		from = (from.join(":").replace(/^\/|\/$/g, "")) || path.basename(to);
		console.log(`Mounted: ${tildify(to)} -> /${from}`);
		mounts.set(from, to);
	}
	else throw new Error(`No such file or directory: ${to}`);
}

// Sort mount-points so that longer paths are matched first
mounts = new Map([...mounts].sort(([{length: a}], [{length: b}]) => a > b ? -1 : a < b ? 1 : 0));


// Allow standalone JS files to run in browsers
let wrapperName  = "";
let wrapperPath  = "";
let wrapperIsESM = false;
if(isFile(root) && /\.(m?)js$/i.test(root)){
	wrapperIsESM = !!RegExp.lastParen;
	wrapperName  = path.basename(root);
	wrapperPath  = root;
	root         = cwd;
}

// Otherwise, resolve root directory normally
else if(isDirectory(root))
	process.chdir(root);

else{
	console.error(`Not a directory: ${root}`);
	process.exit(1);
}


// Initialise server
const server = HTTP.createServer(async (request, response) => {
	const escape = input => escapeCtrl(input, {
		before: "\x1B[7m",
		after: "\x1B[27m",
		named: true,
		caret: true,
	});
	
	// Trace incoming requests to standard output
	if(trace){
		const {method, rawHeaders, httpVersion, url} = request;
		console.log(escape(`${method} ${url} HTTP/${httpVersion}`));
		for(let i = 0; i < rawHeaders.length; i += 2)
			console.log(escape(rawHeaders.slice(i, i + 2).join(": ")));
		console.log("");
	}
	
	if(printPost && "POST" === request.method)
		console.log(escape(await receive(request)));
	
	// Return an HTML wrapper for JS files loaded as root
	const url = request.url.replace(/\?.*$/, "");
	if(wrapperPath && ("/" === url || wrapperPath === path.join(root, url))){
		const type = wrapperIsESM ? ' type="module"' : "";
		const file = fs.readFileSync(wrapperPath, "utf8").replace(/^#![^\n]*\n?/, "");
		const html = /^\s*\/\/\s*<!DOCTYPE\s+html[^>]*>[^\n]+\n?/i.test(file)
			? file.replace(/^\s*\/{2,}bin\/sh[ \t][^\n]*\n?/, "")
				.replace(/^\s*\/\/\s*/, "")
				.replace(/\n\s*\/\/\s*(?=<\/script>)/i, "\n")
			: HTML`
			<!DOCTYPE html>
			<html lang="en-AU">
			<head>
				<meta charset="utf-8" />
				<title>${wrapperName}</title>
				<style>*{tab-size: 4;}</style>
			</head><body><script${type}>${file}</script></body></html>
		`.trim().replace(/^\t+(?=<[/\w])/gm, "");
		response.writeHead(200, {
			"Content-Type": "text/html; charset=UTF-8",
			"Last-Modified": new Date(fs.lstatSync(wrapperPath).mtime).toUTCString(),
		});
		response.write(html);
		return response.end();
	}
	
	const {file, redirect, stats, html} = await getFileForURL(request.url);

	// Arbitrary HTML
	if(html){
		response.writeHead(200, {"Content-Type": "text/html; charset=UTF-8"});
		response.write(html);
		return response.end();
	}

	// File not found
	if(!file){
		response.writeHead(404, {"Content-Type": "text/plain; charset=UTF-8"});
		response.write("File not found\n");
		return response.end();
	}

	// Redirect
	if(redirect){
		response.writeHead(301, {Location: redirect});
		return response.end();
	}

	response.writeHead(200, {
		"Content-Type": getContentType(file),
		"Cache-Control": "max-age=864000",
		"Content-Length": stats.size,
		"Last-Modified": new Date(stats.mtime).toUTCString(),
	});
	if("GET" === request.method)
		await send(file, response);
	
	response.end();
});

server.listen(port);
console.log(`[PID: ${process.pid}] Serving files from ${tildify(root)} on port ${port}`);
noIndex   && console.log("--no-index passed: directory indexes will not be displayed");
printPost && console.log("--print-post enabled: POST bodies will be echoed to stdout");
trace     && console.log("--trace enabled: incoming requests will be echoed to stdout");
useGracefulQuit();


/**
 * Derive a file's content-type from its file extension.
 *
 * @param {String} file
 * @return {String}
 */
function getContentType(file){
	
	// Preprocessing to minimise the size of the MIME-type maps below
	if(/\.(?:[1-9](?![0-9])[a-z_0-9]*|0p|n|man|mdoc)(?:\.in)?$/i.test(file)
	|| /(?:^|[./])(?:mandoc|me|mmn|mmt|ms|mom|nr|[ng]?roff?|t)$/i.test(file)
	|| /(?:^|[./])(tmac|tmac-u|tr|(?:eqn|troff)(?:rc(?:-end)?)?)$/i.test(file))
		file = "a.roff";
	else file = file
		.replace(/\.(?:sublime|json)(?=-tmlanguage$)/i, ".")
		.replace(/\.(?:sublime-)?syntax$/i, ".yml");
	
	const binary = {
		ai:    "application/pdf",
		apng:  "image/png",
		bmp:   "image/bmp",
		cat:   "application/octet-stream",
		djvu:  "image/vnd.djvu",
		djv:   "image/vnd.djvu",
		eot:   "application/vnd.ms-fontobject",
		flac:  "audio/flac",
		gif:   "image/gif",
		ico:   "image/x-icon",
		jpeg:  "image/jpeg",
		jpg:   "image/jpeg",
		mid:   "audio/midi",
		midi:  "audio/midi",
		mka:   "audio/x-matroska",
		mkv:   "video/x-matroska",
		mp3:   "audio/mpeg",
		mp4:   "video/mp4",
		oga:   "audio/ogg",
		ogv:   "video/ogg",
		ogg:   "application/ogg",
		otf:   "font/otf",
		pdf:   "application/pdf",
		png:   "image/png",
		tiff:  "image/tiff",
		tif:   "image/tiff",
		ttc:   "font/collection",
		ttf:   "font/ttf",
		wasm:  "application/wasm",
		wav:   "audio/x-wav",
		webm:  "video/webm",
		webp:  "image/webp",
		woff:  "font/woff",
		woff2: "font/woff2",
		xcf:   "image/x-xcf",
	};
	const text = {
		appcache:    "text/cache-manifest",
		chem:        "text/troff",
		cjs:         "text/javascript",
		css:         "text/css",
		eps:         "application/postscript",
		epsi:        "application/postscript",
		htm:         "text/html",
		html:        "text/html",
		js:          "text/javascript",
		json:        "application/json",
		map:         "application/json",
		markdown:    "text/markdown",
		md:          "text/markdown",
		mkd:         "text/markdown",
		mjs:         "text/javascript",
		pfa:         "application/postscript",
		ps:          "application/postscript",
		pic:         "text/troff",
		plist:       "text/xml",
		rtf:         "text/richtext",
		roff:        "text/troff",
		sgml:        "text/sgml",
		sgm:         "text/sgml",
		svg:         "image/svg+xml",
		tmlanguage:  "text/xml",
		tsv:         "text/tab-separated-values",
		txt:         "text/plain",
		vtt:         "text/vtt",
		webmanifest: "application/manifest+json",
		yaml:        "text/x-yaml",
		yml:         "text/x-yaml",
		xml:         "text/xml",
	};
	const defaultType = "text/plain";
	if(/\.([-\w]+)$/.test(file)){
		const type = RegExp.lastParen.toLowerCase();
		return binary[type]
			? `${binary[type]}`
			: `${text[type] || defaultType}; charset=UTF-8`;
	}
	return defaultType + "; charset=UTF-8";
}


/**
 * Map the URL of an HTTP request to a local filesystem path.
 *
 * @example <caption>List of all possible properties</caption>
 * getFileForURL("/dir/") == {
 *    file: "/root/dir/index.html",
 *    redirect: "http://go.to/this.instead",
 *    stats: fs.Stats {…},
 * }
 * @param {String} input
 * @return {Object}
 */
async function getFileForURL(input){
	input = input
		.replace(/^\/+/, "")
		.replace(/\?.+$/, "");
	
	let file = path.join(root, input);
	let mounted = false;
	for(const [from] of mounts)
		if(input === from || input.startsWith(from + "/")){
			file = path.join(mounts.get(from), input.substring(from.length));
			mounted = true;
			break;
		}
	
	if(!fs.existsSync(file)){
		console.log("No such file: " + file);
		return {};
	}

	const stats = fs.lstatSync(file);
	if(stats.isFile(file))
		return {file, stats};

	if(stats.isSymbolicLink(file)){
		if(mounted){
			file = fs.realpathSync(file);
			return {file, stats: fs.lstatSync(file)};
		}
		else{
			const parent = path.dirname(file);
			const realPath = fs.readlinkSync(file);
			return getFileForURL(path.resolve(parent, realPath));
		}
	}

	if(stats.isDirectory(file)){
		
		// Enforce trailing slashes in URLs
		if(!/\/$/.test(input) && input)
			return {file, stats, redirect: input + "/"};
		
		for(let index of ["index.htm", "index.html"]){
			index = path.join(file, index);
			if(fs.existsSync(index))
				return {file: index, stats: fs.lstatSync(index)};
		}
		
		// Generate an HTML directory listing
		if(!noIndex)
			return {html: await makeIndex(file)};
	}

	return {};
}


/**
 * Send a file in response to an HTTP request.
 *
 * @param {String} file
 * @param {ServerResponse} response
 * @return {Promise}
 */
async function send(file, response){
	return new Promise(resolve => {
		const stream = fs.createReadStream(file);
		stream.on("data", chunk => response.write(chunk));
		stream.on("end", resolve);
	});
}


/**
 * Receive data submitted with an HTTP request.
 *
 * @param {IncomingMessage}
 * @return {Promise}
 */
async function receive(request){
	return new Promise(resolve => {
		const chunks = [];
		request.on("readable", () => {
			const chunk = request.read();
			null !== chunk
				? chunks.push(chunk)
				: resolve(Buffer.concat(chunks).toString("utf8"));
		});
	});
}


/**
 * Return true if a path points to a filesystem directory.
 *
 * @example isDirectory("/tmp") === true;
 * @param {String} path
 * @param {Boolean} [followSymlinks=false]
 * @return {Boolean}
 */
function isDirectory(path, followSymlinks = false){
	return fs.existsSync(path) && (
		followSymlinks ? fs.statSync : fs.lstatSync
	)(path).isDirectory();
}


/**
 * Return true if a path points to a "regular" file.
 *
 * @example isDirectory("/dev/null") === false;
 * @param {String} path
 * @param {Boolean} [followSymlinks=false]
 * @return {Boolean}
 */
function isFile(path, followSymlinks = false){
	return fs.existsSync(path) && (
		followSymlinks ? fs.statSync : fs.lstatSync
	)(path).isFile();
}


/**
 * Generate an HTML listing of serve-able files in a directory.
 *
 * @param {String} dir
 * @return {String}
 */
async function makeIndex(dir){
	const files = fs.readdirSync(dir).map(name => {
		const absdir = path.join(dir, name);
		const stats = fs.lstatSync(absdir);
		if(!stats.isFile() && !stats.isDirectory() && !stats.isSymbolicLink())
			return null;
		name = escapeHTML(name);
		let type = "";
		if(stats.isFile())              type = {icon: "📄", name: "File"};
		else if(stats.isSymbolicLink()) type = {icon: "🔗", name: "Link"};
		else if(stats.isDirectory())    type = {icon: "📁", name: "Directory"}, name += "/";
		return Object.assign(stats, {path: absdir, name, type});
	}).filter(Boolean).sort((a, b) => {
		if(a.isDirectory() && b.isFile()) return -1;
		if(b.isFile() && a.isDirectory()) return  1;
		if(a.name < b.name) return -1;
		if(b.name > a.name) return  1;
		return 0;
	});
	
	// Prepend containing directory
	files.unshift(Object.assign(fs.lstatSync(dir), {
		path: dir,
		name: "..",
		type: {
			icon: "📁",
			name: "Directory",
		},
	}));
	
	const title = `Index of ${escapeHTML(dir)}`;
	return HTML`
		<!DOCTYPE html>
		<html lang="en-AU">
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="initial-scale=1, minimum-scale=1" />
			<title>${title}</title>
			<style>
				*    { box-sizing: border-box; tab-size: 4; }
				html { font-family: Cambria, serif; }
				a    { display: block; padding: .5em; }
				th   { border-bottom: 1px solid #aaa; }
				td:first-child { text-align: center; }
				td:nth-child(2) ~ *{
					padding-left:  .5em;
					padding-right: .5em;
					white-space: nowrap;
				}
				@media (max-width: 25em){
					h1{ font-size: 1.35em; }
				}
			</style>
		</head>
		<body>
			<h1>${title.replace(/\//g, "/<wbr/>")}</h1>
			<table>
				<thead>
					<tr>
						<th>Type</th>
						<th>Name</th>
						<th>Size</th>
						<th>Date Modified</th>
					</tr>
				</thead>
				<tbody>${files.map(file => HTML`
					<tr>
						<td title="${file.type.name}">${file.type.icon}</td>
						<td><a href="${file.name}">${file.name}</a></td>
						<td>${formatBytes(file.size)}</td>
						<td><time datetime="${file.mtime.toISOString()}">${timeSince(file.mtime)}</time></td>
					</tr>
				`).join("")}</tbody>
			</table>
		</body>
		</html>
	`.replace(/(<time\s+datetime="([^"]+)")\s*>/gi, '$1 title="$2">');
}
