#!/usr/bin/env node

import HTTP from "http";
import EventEmitter from "events";
import {fileURLToPath} from "url";
import {
	clamp,
	utf8Decode,
	utf8Encode,
	wsDecodeFrame,
	wsEncodeFrame,
	wsHandshake,
} from "alhadis.utils";


// Run if executed directly
const path = fileURLToPath(import.meta.url);
(process.argv[1] === path || globalThis.$0 === path) && (async () => {
	await Promise.resolve(); // TDZ hack
	
	const port = +process.argv[2] || 1338;
	const server = new Server();
	server.listen(port);
	console.log(`[PID: ${process.pid}] WebSocket server listening on port ${port}`);
	
})().catch(error => {
	console.error(error);
	process.exit(1);
});


/**
 * Handler for a single WebSocket connection.
 * @class
 */
export class Channel extends EventEmitter{
	#maxSize      = Number.MAX_SAFE_INTEGER;
	#closed       = false;
	#sendPromise  = null;
	frameBuffer   = [];
	inputBuffer   = [];
	inputPending  = false;
	inputType     = "binary";
	outputBuffer  = [];
	outputPending = false;
	
	/**
	 * Create a new WebSocket connection.
	 *
	 * @param {net.Socket} socket
	 * @constructor
	 */
	constructor(socket){
		super();
		this.socket = socket;
		this.socket.on("data", this.readBytes.bind(this));
	}
	
	
	/**
	 * Whether or not the client has disconnected.
	 *
	 * @property {Boolean} closed
	 * @readonly
	 */
	get closed(){
		return this.#closed;
	}
	
	
	/**
	 * Maximum payload-length permitted for any single data frame.
	 *
	 * @property {Number} maxSize
	 * @default Number.MAX_SAFE_INTEGER
	 */
	get maxSize(){
		return this.#maxSize;
	}
	set maxSize(to){
		this.#maxSize = clamp(~~Number(to), 1, Number.MAX_SAFE_INTEGER);
	}
	
	
	/**
	 * Terminate the connection.
	 *
	 * @param {Number} [code=1000]
	 * @param {String} [reason=""]
	 * @return {Promise<void>}
	 */
	async close(code = 1000, reason = ""){
		if(this.#closed) return;
		this.#closed = true;
		const payload = code ? [code >> 8 & 255, code & 255, ...utf8Decode(reason)] : [];
		this.socket.write(wsEncodeFrame({opcode: 0x08, isFinal: true, payload}));
		this.emit("ws:close", code, reason);
		return new Promise(done => this.socket.end(done));
	}
	
	
	/**
	 * Handle raw bytes sent from the client.
	 *
	 * @param {Buffer} data
	 * @return {void}
	 */
	readBytes(data){
		if(this.#closed) return;
		this.frameBuffer.push(...data);
		const {frames, trailer} = decode(this.frameBuffer);
		this.frameBuffer = trailer;
		for(const frame of frames)
			this.readFrame(frame);
	}
	
	
	/**
	 * Process a decoded WebSocket frame.
	 *
	 * @param {WSFrame} frame
	 * @return {void}
	 */
	readFrame(frame){
		if(this.#closed) return;
		switch(frame.opname){
			case "ping": this.emit("ws:ping", frame); return this.pong();
			case "pong": this.emit("ws:pong", frame); return;
			case "binary":
			case "text":
				if(this.inputBuffer.length)
					this.emit("ws:incomplete-message", this.inputBuffer, this.inputType);
				this.inputBuffer = [...frame.payload];
				this.inputType = frame.opname;
				break;
			case "continue":
				if(!this.inputPending) return; // Not expecting any data
				this.inputBuffer = this.inputBuffer.concat(frame.payload);
				break;
			case "close":
				this.#closed = true;
				if(frame.payload.length){
					const code = (255 & frame.payload[0]) << 8 | 255 & frame.payload[1];
					const reason = utf8Encode(frame.payload.slice(2));
					this.emit("ws:close", code, reason);
				}
				else this.emit("ws:close");
		}
		
		// Data frame
		if(frame.opcode < 0x08){
			if(frame.isFinal){
				const message = "text" === this.inputType
					? utf8Encode(this.inputBuffer)
					: Buffer.from(this.inputBuffer);
				this.inputBuffer = [];
				this.inputPending = false;
				this.emit("ws:message", message);
			}
			else this.inputPending = true;
		}
	}
	
	
	/**
	 * Send arbitrary data to the client.
	 *
	 * @param {FrameData|WSFrame[]} data - Message to transmit
	 * @param {Boolean} [raw=false] - Treat input as pre-encoded frames
	 * @return {void}
	 */
	send(data, raw = false){
		if(this.#closed) return;
		this.outputBuffer.push(...raw ? data : encode(data, this.maxSize));
		this.sendNext();
	}
	
	
	/**
	 * Send the next pending data-frame.
	 *
	 * @internal
	 * @return {Promise<void>}
	 */
	async sendNext(){
		if(this.#closed) return;
		await this.#sendPromise;
		const frame = this.outputBuffer.shift();
		if(!frame) return;
		await (this.#sendPromise = new Promise(resolve =>
			this.socket.write(frame, null, resolve)));
		this.outputBuffer.length && this.sendNext();
	}
	
	
	/**
	 * Send a "ping" frame to the client.
	 * @return {void}
	 */
	ping(){
		if(this.#closed) return;
		const frame = wsEncodeFrame({isFinal: true, opcode: 0x09});
		this.socket.write(frame);
	}
	
	
	/**
	 * Send a "pong" frame to the client.
	 * @return {void}
	 */
	pong(){
		if(this.#closed) return;
		const frame = wsEncodeFrame({isFinal: true, opcode: 0x0A});
		this.socket.write(frame);
	}
}


/**
 * A WebSocket-only webserver.
 * @class
 */
export class Server extends HTTP.Server{
	channels = new Map();
	
	/**
	 * Initialise a new WebSocket server.
	 * @constructor
	 */
	constructor(){
		super();
		this.on("request", this.handleRequest.bind(this));
	}
	
	
	/**
	 * Iterate through all open channels.
	 * @return {MapIterator}
	 */
	[Symbol.iterator](){
		return this.channels.values();
	}
	
	
	/**
	 * Close all open channels, then shutdown the server.
	 *
	 * @param {Number} [code=1001]
	 * @param {String} [reason=""]
	 * @return {Promise<void>}
	 */
	async close(code = 1001, reason = ""){
		for(const channel of this)
			await channel.close(code, reason);
		return new Promise(done => super.close(done));
	}
	
	
	/**
	 * Respond to an incoming request.
	 *
	 * @param {HTTP.IncomingMessage} request
	 * @param {HTTP.ServerResponse} response
	 * @return {Promise<void>}
	 */
	async handleRequest(request, response){
		if(!this.listening) return;
		if(!isHandshake(request)){
			response.writeHead(400, {"Content-Type": "text/plain; charset=UTF-8"});
			response.write("Not a WebSocket handshake");
			response.end();
		}
		else if(!this.isConnected(request)){
			const accept = wsHandshake(request.headers["sec-websocket-key"]);
			response.writeHead(101, {
				"Sec-WebSocket-Accept": accept,
				Connection: "Upgrade",
				Upgrade: "websocket",
			});
			response.end();
			this.upgrade(request);
		}
	}
	
	
	/**
	 * Determine if a client has a WebSocket connection open.
	 *
	 * @param {HTTP.IncomingMessage|net.Socket} client
	 * @return {Boolean}
	 */
	isConnected(client){
		if(client instanceof HTTP.IncomingMessage)
			client = client.socket;
		return this.channels.has(client);
	}
	
	
	/**
	 * Broadcast a message to all open channels.
	 *
	 * @param {FrameData} data
	 * @return {void}
	 */
	send(data){
		data = encode(data);
		for(const channel of this)
			channel.send(data, true);
	}
	
	
	/**
	 * Establish a WebSocket connection with a client.
	 *
	 * @emits ws:open
	 * @param {HTTP.IncomingMessage} request
	 * @return {Channel}
	 */
	upgrade({socket}){
		const channel = new Channel(socket);
		this.channels.set(socket, channel);
		channel.id = this.channels.size;
		this.emit("ws:open", channel);
		for(const event of "close incomplete-message message ping pong".split(" "))
			channel.on(`ws:${event}`, (...args) => this.emit(`ws:${event}`, channel, ...args));
		channel.once("ws:close", () => {
			this.channels.delete(socket);
			channel.removeAllListeners();
		});
		return channel;
	}
}


/**
 * Determine if an incoming request is attempting a WebSocket handshake.
 * @param {IncomingMessage} request
 * @return {Boolean}
 */
export function isHandshake(request){
	return request
		&& request.httpVersion >= 1.1
		&& request.headers
		&& request.headers["sec-websocket-key"]
		&& "websocket" === request.headers.upgrade
		&& "Upgrade"   === request.headers.connection
		&& "GET"       === request.method;
}


/**
 * Decode a byte-stream as a sequence of WebSocket frames.
 * @param {Number[]} data
 * @return {{frames: WSFrame[], trailer: Number[]}}
 */
export function decode(data){
	const frames = [];
	let frame;
	do{
		frame = wsDecodeFrame(data);
		if(BigInt(frame.payload.length) < frame.length)
			break;
		data = frame.trailer;
		frames.push(frame);
	} while(data.length);
	for(const frame of frames)
		frame.trailer = [];
	return {frames, trailer: data};
}


/**
 * Encode a message as a sequence of data frames.
 * @param {FrameData} data
 * @param {Number} [maxSize=Infinity]
 * @return {WSFrame[]}
 */
export function encode(data, maxSize = Infinity){
	let opcode = 0x02;
	if("string" === typeof data){
		data = utf8Decode(data);
		opcode = 0x01;
	}
	else data = [...data];
	const frames = [];
	do{
		frames.push(wsEncodeFrame({
			payload: data.splice(0, maxSize),
			isFinal: !data.length,
			opcode,
		}));
		opcode = 0x00;
	} while(data.length > 0);
	return frames;
}


/**
 * Content to encode for a data frame.
 * @typedef {String|Uint8Array|Buffer} FrameData
 */
