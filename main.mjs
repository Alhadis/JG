#!/usr/bin/env node

import {createReadStream, statSync, existsSync} from "fs";
import {promisify}     from "util";
import {createServer}  from "http";
import {fileURLToPath} from "url";
import {join, dirname} from "path";
import childProcess    from "child_process";
import {ascii85Decode} from "../Utils/index.mjs";
const execFile = promisify(childProcess.execFile);

const $0  = fileURLToPath(import.meta.url);
const dir = dirname($0);


createServer((request, response) => {
	switch(request.method){
		case "POST": break; // TODO
		case "GET":
			const {url} = request;
			const file = join(dir, "/" === url ? "index.html" : url);
			
			// Block problematic requests like “/../.git”
			if(!file.startsWith(dir + "/"))
				return showError(response, 400, "Bad request");
			
			// No such file
			if(!existsSync(file))
				return file.endsWith("/favicon.ico")
					? sendEmptyFavicon(response)
					: showError(response, 404, "File not found");
			
			// Don't bother listing directories
			const stats = statSync(file);
			if(stats.isDirectory())
				return showError(response, 403, `Access to directory "${file}" denied`);
			
			// Otherwise, serve the requested file
			return sendFile(response, file, stats);
	}
}).listen(1337);
useGracefulQuit();


/**
 * Serve the contents of a file to an HTTP `GET` request.
 * @param {ServerResponse} response
 * @param {String} file
 * @param {fs.Stats} [stats=null]
 *    If filesystem stats are provided, they'll be used to provide
 *    `Content-Length` and `Last-Modified` headers in the response.
 * @param {Number} [code=200]
 * @internal
 */
async function sendFile(response, file, stats = null, code = 200){
	const headers = {
		"Content-Type": getMediaType(file) ?? await scryFileType(file),
		"Cache-Control": "max-age=864000",
	};
	stats && Object.assign(headers, {
		"Content-Length": stats.size,
		"Last-Modified": new Date(stats.mtime).toUTCString(),
	});
	response.writeHead(code, headers);
	await new Promise(resolve => {
		const stream = createReadStream(file);
		stream.on("data", chunk => response.write(chunk));
		stream.on("end", resolve);
	});
	return response.end();
}


/**
 * Satisfy requests for non-existent favicon files by serving an empty ICO file.
 *
 * @uses {@link ascii85Decode}
 * @param {ServerResponse} response
 * @return {ServerResponse}
 * @internal
 */
function sendEmptyFavicon(response){
	response.writeHead(200, {
		"Content-Type":   "image/x-icon",
		"Content-Length": 198,
		"Cache-Control":  "no-cache",
	});
	response.write(Uint8Array.from(ascii85Decode(`
		!!!$"!<<ZB!WW6$!<B>(!!!c7!!"DI!!!Q1!!",A!!!$"!<<*"!!#7azz!!!'#
		zzzzzzzzzzzzzzzzzzz!!*'!!!*'!!!*'!!!*'!!!*'!!!*'!!!*'!!!*'!!!*
		'!!!*'!!!*'!!!*'!!!*'!!!*'!!!*'!!!*'!!!!
	`)));
	return response.end();
}


/**
 * Display an unformatted error message for the user.
 *
 * @param {ServerResponse} response
 * @param {Number} code - HTTP status code
 * @param {String} [message] - Short description of error
 * @internal
 */
function showError(response, code, message = "Error " + code){
	const error = String(message) + "\n";
	response.writeHead(code, {
		"Content-Type":  "text/plain; charset=UTF-8",
		"Content-Length": error.length,
	});
	response.write(error);
	return response.end();
}


/**
 * Hide the ^C echoed to terminal when terminating the process.
 * @param {Function} [fn=null]
 * @return {void}
 */
export function useGracefulQuit(fn = null){
	if(!process.stdin.isTTY) return;
	const halt = () => {
		if("function" === typeof fn) fn();
		process.stdin.setRawMode(false);
		process.exit(0);
	};
	process.on("SIGTTIN", () => {});
	process.on("SIGTTOU", () => {});
	try{ process.stdin.setRawMode(true); }
	catch(e){ return; }
	process.stdin.on("data", data => {
		switch(data[0]){
			case 0x03: case 0x04: halt(); break;
			case 0x1A: process.kill(process.pid, "SIGTSTP");
		}
	});
	process.on("beforeExit", () => process.stdin.setRawMode(false));
	process.on("SIGINT", halt);
	process.on("SIGTERM", halt);
}


/**
 * Consult file(1)'s magic to identify the subject's filetype.
 *
 * @example scryFileType("./sound.wav") === "audio/x-wav; charset=binary";
 * @param {String} file
 * @return {String}
 * @public
 */
export async function scryFileType(file){
	const {stdout} = await execFile("file", ["--brief", "--mime", file]);
	return stdout.trim() || "application/octet-stream";
}


/**
 * Determine the correct content-type to serve for a filename.
 *
 * @example getMediaType("/tmp/image.jpg") === "image/jpeg";
 * @param {String} file
 * @return {String}
 * @public
 */
export function getMediaType(file){
	
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
		avif:  "image/avif",
		apng:  "image/apng",
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
		jxl:   "image/jxl",
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
		pcx:   "image/x-pcx",
		pdf:   "application/pdf",
		png:   "image/png",
		tga:   "image/x-tga",
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
		xbm:   "image/x-xbitmap",
		xcf:   "image/x-xcf",
		xpm:   "image/x-xpixmap",
	};
	const text = {
		appcache:    "text/cache-manifest",
		atom:        "application/atom+xml",
		chem:        "text/troff",
		cjs:         "text/javascript",
		css:         "text/css",
		dtd:         "application/xml-dtd",
		ent:         "application/xml-external-parsed-entity",
		eps:         "application/postscript; charset=iso-8859-1",
		epsi:        "application/postscript; charset=iso-8859-1",
		geojson:     "application/geo+json",
		htm:         "text/html",
		html:        "text/html",
		js:          "text/javascript",
		json:        "application/json",
		jsonld:      "application/ld+json",
		m3u:         "application/vnd.apple.mpegurl",
		m3u8:        "application/vnd.apple.mpegurl",
		map:         "application/json",
		markdown:    "text/markdown",
		md:          "text/markdown",
		mkd:         "text/markdown",
		mjs:         "text/javascript",
		pfa:         "application/postscript; charset=us-ascii",
		ps:          "application/postscript; charset=iso-8859-1",
		pic:         "text/troff",
		plist:       "text/xml",
		rnc:         "application/relax-ng-compact-syntax",
		rng:         "text/xml",
		rss:         "application/atom+xml",
		rtf:         "text/richtext",
		roff:        "text/troff",
		sgml:        "text/sgml",
		sgm:         "text/sgml",
		svg:         "image/svg+xml",
		tmlanguage:  "text/xml",
		topojson:    "application/geo+json",
		tsv:         "text/tab-separated-values",
		txt:         "text/plain",
		vcard:       "text/vcard",
		vcf:         "text/vcard",
		vtt:         "text/vtt",
		webmanifest: "application/manifest+json",
		yaml:        "text/x-yaml",
		yml:         "text/x-yaml",
		xhtm:        "application/xhtml+xml",
		xhtml:       "application/xhtml+xml",
		xml:         "text/xml",
		xsl:         "application/xslt+xml",
		xslt:        "application/xslt+xml",
		xsd:         "text/xml",
	};
	let [extension] = file.match(/(?<=\.)[-\w]+$/) || [];
	if(extension){
		extension = extension.toLowerCase();
		let type = binary[extension] || text[extension];
		if(type && !/; *charset=([A-Z0-9!#$%&'+-^_`{}~]+)/i.test(type))
			type += `; charset=${extension in binary ? "binary" : "utf-8"}`;
		return type;
	}
}
