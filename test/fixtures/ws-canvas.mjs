export const server = {
	init(){
		this.on("ws:open",  ws => console.log(`Client ${ws.id} connected`));
		this.on("ws:close", ws => console.log(`Client ${ws.id} disconnected`));
		this.on("ws:ping",  ws => console.log(`Client ${ws.id} pinged`));
		this.on("ws:pong",  ws => console.log(`Client ${ws.id} ponged`));
	},
	
	async loadImage(path){
		const {readFileSync} = await import("fs");
		const data = readFileSync(path);
		client.addImage(data);
	},
	
	async saveImageFile(data, type, filename){
		console.log(`Image received (${data.length} bytes, MIME type ${type})`);
		const {writeFileSync} = await import("fs");
		const {resolve} = await import("path");
		writeFileSync(filename = resolve(filename), data, {encoding: null});
		console.log(`Saved to ${filename}`);
		process.exit(0);
	},
};


export const client = {
	init(){
		this.drawSample();
		this.saveCanvas();
	},
	
	addImage(data){
		data = data.map(byte => encodeURIComponent(String.fromCharCode(byte)));
		const img = document.createElement("img");
		img.src = "data:image/png;" + data;
		document.body.appendChild(img);
	},
	
	drawSample(){
		const canvas = document.createElement("canvas");
		canvas.width = 500;
		canvas.height = 500;
		document.body.appendChild(canvas);
		globalThis.canvas = canvas;

		const ctx = canvas.getContext("2d");
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.strokeStyle = "#f00";
		ctx.lineWidth = 5;
		ctx.beginPath();
		ctx.lineTo(50,  50);
		ctx.lineTo(300, 50);
		ctx.lineTo(300, 450);
		ctx.lineTo(400, 450);
		ctx.closePath();
		ctx.stroke();
	},
	
	async saveCanvas(type = "image/png"){
		const data = await new Promise(resolve => {
			globalThis.canvas.toBlob(async blob => resolve(await blob.arrayBuffer()), type);
		}).catch(e => console.error(e));
		return server.saveImageFile(data, type, "my-crappy-drawing.png");
	},
};
