#!/usr/bin/env node

import {createReadStream, statSync, existsSync, openSync, writeSync, closeSync} from "fs";
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
		case "POST":
			const file = join(dir, "posted-data");
			return writeBodyToFile(file, request, response);

		case "GET": {
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
 * Write the body of a POST request to a file.
 *
 * @param {String} path
 * @param {IncomingMessage} request
 * @param {ServerResponse} response
 * @param {Boolean} [append=false]
 * @internal
 */
async function writeBodyToFile(path, request, response, append = false){
	const fd = openSync(path, append ? "a" : "w");
	const totalSize = await new Promise(resolve => {
		let bytesWritten = 0;
		request.on("readable", () => {
			const chunk = request.read();
			if(null === chunk)
				return resolve(bytesWritten);
			bytesWritten += writeSync(fd, chunk, 0, chunk.byteLength);
		});
	});
	closeSync(fd);
	const text = `${totalSize} byte(s) written to ${path}\n`;
	response.writeHead(201, {
		"Content-Type": "text/plain; charset=utf-8",
		"Content-Length": text.length,
	});
	response.write(text);
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
		"3g2": "video/3gpp2",
		"3gp": "video/3gpp",
		"3gpp": "video/3gpp",
		"7z":  "application/x-7z-compressed",
		aac:   "audio/aac",
		abw:   "application/x-abiword",
		ai:    "application/pdf",
		apk:   "application/vnd.android.package-archive",
		apng:  "image/apng",
		arc:   "application/x-freearc",
		arj:   "application/x-arj",
		art:   "image/x-jg",
		au:    "audio/basic",
		avi:   "video/x-msvideo",
		avif:  "image/avif",
		azw:   "application/vnd.amazon.ebook",
		bin:   "application/octet-stream",
		bmp:   "image/bmp",
		bson:  "application/bson",
		bz:    "application/x-bzip",
		bz2:   "application/x-bzip2",
		caf:   "audio/x-caf",
		cat:   "application/octet-stream",
		cbor:  "application/cbor",
		cda:   "application/x-cdf",
		cur:   "image/x-icon",
		djv:   "image/vnd.djvu",
		djvu:  "image/vnd.djvu",
		doc:   "application/msword",
		docx:  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		eot:   "application/vnd.ms-fontobject",
		epub:  "application/epub+zip",
		exe:   "application/vnd.microsoft.portable-executable",
		flac:  "audio/flac",
		gif:   "image/gif",
		gz:    "application/gzip",
		gzip:  "application/gzip",
		icc:   "application/vnd.iccprofile",
		icm:   "application/vnd.iccprofile",
		ico:   "image/x-icon",
		jar:   "application/java-archive",
		jfif:  "image/jpeg",
		jpeg:  "image/jpeg",
		jpg:   "image/jpeg",
		jng:   "image/x-jng",
		jxl:   "image/jxl",
		kmz:   "application/vnd.google-earth.kmz",
		m4a:   "audio/mp4",
		m4b:   "audio/mp4",
		m4p:   "audio/mp4",
		m4r:   "audio/mp4",
		m4v:   "video/mp4",
		mid:   "audio/midi",
		midi:  "audio/midi",
		mka:   "audio/x-matroska",
		mkv:   "video/x-matroska",
		mng:   "video/x-mng",
		mov:   "video/quicktime",
		mp2:   "audio/mpeg",
		mp3:   "audio/mpeg",
		mp4:   "video/mp4",
		mpeg:  "video/mpeg",
		mpega: "audio/mpeg",
		mpga:  "audio/mpeg",
		mpkg:  "application/vnd.apple.installer+xml",
		odg:   "application/vnd.oasis.opendocument.graphics",
		odp:   "application/vnd.oasis.opendocument.presentation",
		ods:   "application/vnd.oasis.opendocument.spreadsheet",
		odt:   "application/vnd.oasis.opendocument.text",
		oga:   "audio/ogg",
		ogv:   "video/ogg",
		ogg:   "application/ogg",
		ogx:   "application/ogg",
		opus:  "audio/ogg",
		otf:   "font/otf",
		pcx:   "image/x-pcx",
		pdf:   "application/pdf",
		pjp:   "image/jpeg",
		pjpeg: "image/jpeg",
		png:   "image/png",
		ppt:   "application/vnd.ms-powerpoint",
		pptx:  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		rar:   "application/vnd.rar",
		stl:   "model/stl",
		swf:   "application/vnd.adobe.flash.movie",
		tar:   "application/x-tar",
		tga:   "image/x-tga",
		tgz:   "application/gzip",
		tiff:  "image/tiff",
		tif:   "image/tiff",
		ts:    "video/mp2t",
		ttc:   "font/collection",
		ttf:   "font/ttf",
		vsd:   "application/vnd.visio",
		wasm:  "application/wasm",
		wav:   "audio/wave",
		weba:  "audio/webm",
		webm:  "video/webm",
		webp:  "image/webp",
		woff:  "font/woff",
		woff2: "font/woff2",
		xbm:   "image/x-xbitmap",
		xcf:   "image/x-xcf",
		xls:   "application/vnd.ms-excel",
		xlsx:  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		xpi:   "application/x-xpinstall",
		xpm:   "image/x-xpixmap",
		yuv:   "video/x-raw-yuv",
		z:     "application/x-compress",
		zip:   "application/zip",
	};
	const text = {
		afm:         "application/x-font-afm",
		appcache:    "text/cache-manifest",
		astro:       "text/jsx",
		atom:        "application/atom+xml",
		ccxml:       "application/ssml+xml",
		cdxml:       "application/vnd.chemdraw+xml",
		chem:        "text/troff",
		cjs:         "text/javascript",
		cml:         "chemical/x-cml",
		coffee:      "text/coffeescript",
		csh:         "application/x-csh",
		cson:        "text/coffeescript",
		css:         "text/css",
		csv:         "text/csv",
		cts:         "application/typescript",
		dae:         "model/vnd.collada+xml",
		diff:        "text/x-diff",
		dtd:         "application/xml-dtd",
		ehtm:        "text/html",
		ehtml:       "text/html",
		el:          "application/emacs-lisp",
		eml:         "message/rfc822",
		ent:         "application/xml-external-parsed-entity",
		eps:         "application/postscript; charset=iso-8859-1",
		epsi:        "application/postscript; charset=iso-8859-1",
		geojson:     "application/geo+json",
		glif:        "application/xml",
		glsl:        "text/x-glsl",
		gml:         "application/gml+xml",
		gpx:         "application/gpx+xml",
		grxml:       "application/ssml+xml",
		htm:         "text/html",
		html:        "text/html",
		ical:        "text/calendar",
		icalendar:   "text/calendar",
		ics:         "text/calendar",
		ifb:         "text/calendar",
		js:          "text/javascript",
		jsm:         "text/javascript",
		jsx:         "text/javascript",
		json:        "application/json",
		json5:       "application/json5",
		jsonc:       "application/jsonc",
		jsonl:       "application/x-ndjson",
		jsonld:      "application/ld+json",
		jsonseq:     "application/json-seq",
		kml:         "application/vnd.google-earth.kml+xml",
		less:        "text/x-less",
		m3u:         "application/vnd.apple.mpegurl",
		m3u8:        "application/vnd.apple.mpegurl",
		map:         "application/json",
		markdown:    "text/markdown",
		mermaid:     "application/vnd.mermaid",
		md:          "text/markdown",
		mediawiki:   "text/x-wiki",
		meta4:       "application/metalink4+xml",
		mkd:         "text/markdown",
		mjs:         "text/javascript",
		mmd:         "application/vnd.mermaid",
		mml:         "application/mathml+xml",
		mod:         "application/xml-dtd",
		mtl:         "model/mtl",
		mts:         "application/typescript",
		musicxml:    "application/vnd.recordare.musicxml+xml",
		n3:          "text/n3",
		nq:          "application/n-quads",
		nt:          "application/n-triples",
		njk:         "text/html",
		obj:         "model/obj",
		owl:         "application/owl+xml",
		owx:         "application/owl+xml",
		pac:         "application/x-ns-proxy-autoconfig",
		patch:       "text/x-patch",
		php:         "application/x-httpd-php",
		pfa:         "application/postscript; charset=us-ascii",
		ps:          "application/postscript; charset=iso-8859-1",
		pic:         "text/troff",
		plist:       "application/xml",
		rdf:         "application/rdf+xml",
		ris:         "application/x-research-info-systems",
		rnc:         "application/relax-ng-compact-syntax",
		rng:         "application/xml",
		rq:          "application/sparql-query",
		rss:         "application/atom+xml",
		rtf:         "text/richtext",
		roff:        "text/troff",
		sass:        "text/x-sass",
		scss:        "text/x-scss",
		sgml:        "text/sgml",
		sgm:         "text/sgml",
		sh:          "application/x-sh",
		shtm:        "text/html",
		shtml:       "text/html",
		soap:        "application/soap+xml",
		srt:         "application/x-subrip",
		ssml:        "application/ssml+xml",
		stm:         "text/html",
		svelte:      "text/html",
		svg:         "image/svg+xml",
		tex:         "application/x-tex",
		tmlanguage:  "application/xml",
		toml:        "application/toml",
		topojson:    "application/geo+json",
		tsx:         "text/tsx",
		tsv:         "text/tab-separated-values",
		ttl:         "text/turtle",
		ttml:        "application/ttml+xml",
		txt:         "text/plain",
		uri:         "text/uri-list",
		uris:        "text/uri-list",
		vcard:       "text/vcard",
		vcf:         "text/vcard",
		vtt:         "text/vtt",
		vto:         "text/html",
		vento:       "text/html",
		vue:         "text/x-vue",
		vxml:        "application/ssml+xml",
		webmanifest: "application/manifest+json",
		wiki:        "text/x-wiki",
		wikitext:    "text/x-wiki",
		yaml:        "application/yaml",
		yml:         "application/yaml",
		x3d:         "model/x3d+xml",
		xaml:        "application/xaml+xml",
		xbl:         "application/xml",
		xht:         "application/xhtml+xml",
		xhtm:        "application/xhtml+xml",
		xhtml:       "application/xhtml+xml",
		xlf:         "application/xliff+xml",
		xml:         "application/xml",
		xsl:         "application/xslt+xml",
		xslt:        "application/xslt+xml",
		xspf:        "application/xspf+xml",
		xsd:         "application/xml",
		xul:         "application/vnd.mozilla.xul+xml",
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
