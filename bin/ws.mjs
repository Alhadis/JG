#!/usr/bin/env node

import HTTP from "http";
import EventEmitter from "events";
import {fileURLToPath} from "url";
import {
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
	server.listen(port)
		.on("ws:message", ({id}, msg) => console.log(`Client #${id}: ${msg}`))
		.on("ws:ping",    ({id}) => console.log(`Client #${id}: PING`))
		.on("ws:pong",    ({id}) => console.log(`Client #${id}: PONG`))
		.on("ws:open",    ({id}) => console.log(`Client #${id} connected`))
		.on("ws:close",   ({id}, code, reason) => {
			let message = `Client #${id} disconnected`;
			if(code){
				reason = reason ? ": " + reason : "";
				message += ` (${code}${reason})`;
			}
			console.log(message);
		});
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
	#closed     = false;
	inputBuffer = [];
	inputType   = "binary";
	pendingData = false;
	
	/**
	 * Create a new WebSocket connection.
	 *
	 * @param {net.Socket} socket
	 * @constructor
	 */
	constructor(socket){
		super();
		this.socket = socket;
		this.socket.on("data", this.receive.bind(this));
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
	 * Handle a frame sent from the client.
	 *
	 * @param {Buffer} data
	 * @return {void}
	 */
	receive(data){
		if(this.#closed) return;
		data = wsDecodeFrame(data);
		switch(data.opname){
			case "ping": this.emit("ws:ping", data); return this.pong();
			case "pong": this.emit("ws:pong", data); return;
			case "binary":
			case "text":
				if(this.inputBuffer.length)
					this.emit("ws:incomplete-message", this.inputBuffer, this.inputType);
				this.inputBuffer = [];
				this.inputType = data.opname;
				this.inputBuffer.push(...data.payload);
				break;
			case "continue":
				if(!this.pendingData) return; // Not expecting any data
				this.inputBuffer.push(...data.payload);
				break;
			case "close":
				this.#closed = true;
				if(data.payload.length){
					const code = (255 & data.payload[0]) << 8 | 255 & data.payload[1];
					const reason = utf8Encode(data.payload.slice(2));
					this.emit("ws:close", code, reason);
				}
				else this.emit("ws:close");
		}
		
		// Data frame
		if(data.opcode < 0x08){
			if(data.isFinal){
				const message = "text" === this.inputType
					? utf8Encode(this.inputBuffer)
					: Buffer.from(this.inputBuffer);
				this.inputBuffer = [];
				this.pendingData = false;
				this.emit("ws:message", message);
			}
			else this.pendingData = true;
		}
	}
	
	
	/**
	 * Send arbitrary data to the client.
	 *
	 * @param {String|Uint8Array|Buffer} data
	 * @return {void}
	 */
	send(data){
		if(this.#closed) return;
		let type = "binary";
		if("string" === typeof data){
			data = utf8Decode(data);
			type = "text";
		}
		this.socket.write(wsEncodeFrame({
			isFinal: true,
			payload: data,
			opcode: "binary" === type ? 0x02 : 0x01,
		}));
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
	connections = new Map();
	
	/**
	 * Initialise a new WebSocket server.
	 * @constructor
	 */
	constructor(){
		super();
		this.on("request", this.handleRequest.bind(this));
	}
	
	
	/**
	 * Respond to an incoming request.
	 *
	 * @param {HTTP.IncomingMessage} request
	 * @param {HTTP.ServerResponse} response
	 * @return {void}
	 */
	async handleRequest(request, response){
		if(!isHandshake(request)){
			response.writeHead(400, {"Content-Type": "text/plain; charset=UTF-8"});
			response.write("Not a WebSocket handshake");
			response.end();
		}
		else if(!this.isConnected(request)){
			this.upgrade(request);
			const accept = wsHandshake(request.headers["sec-websocket-key"]);
			response.writeHead(101, {
				"Sec-WebSocket-Accept": accept,
				Connection: "Upgrade",
				Upgrade: "websocket",
			});
			response.end();
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
		return this.connections.has(client);
	}
	
	
	/**
	 * Establish a WebSocket connection with a client.
	 *
	 * @emits ws:open
	 * @param {HTTP.IncomingMessage} request
	 * @return {Channel}
	 */
	upgrade({socket, headers}){
		const channel = new Channel(socket);
		this.connections.set(socket, channel);
		channel.id = this.connections.size;
		this.emit("ws:open", channel);
		for(const event of "close incomplete-message message ping pong".split(" "))
			channel.on(`ws:${event}`, (...args) => this.emit(`ws:${event}`, channel, ...args));
		channel.once("ws:close", () => {
			this.connections.delete(socket);
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
