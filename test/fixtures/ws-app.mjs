export const title = "My stupid WebSocket app";

export const server = {
	init(){
		console.log("Server initialised");
		this.on("ws:open", ws => {
			console.log(`Client ${ws.id} connected`);
			client.message("Hello, client");
		});
		this.on("ws:close", ws => console.log(`Client ${ws.id} disconnected`));
		this.on("ws:ping",  ws => console.log(`Client ${ws.id} pinged`));
		this.on("ws:pong",  ws => console.log(`Client ${ws.id} ponged`));
		this.on("ws:message", (ws, ...data) => {
			console.log(`Client ${ws.id}: ${data}`);
		});
	},
	
	log(...args){
		console.log(...args);
	},
};

export const client = {
	init(){
		console.log("Client initialised");
		server.log("Hello, server");
	},
	
	message(text){
		const div = document.createElement("div");
		div.textContent = text;
		document.body.appendChild(div);
	},
};
