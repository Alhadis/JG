#!/usr/bin/env node
// <!DOCTYPE html><html><body><script type="module">
import {isBrowser, bitmapToRGBA} from "../../node_modules/alhadis.utils/index.mjs";

const w = 25;
const h = 25;
const rgba = bitmapToRGBA([
	0b0000000000000000000000000,
	0b0111111111111111000000000,
	0b0111111111111111000000000,
	0b0110000000001111000000000,
	0b0110000000001111000000000,
	0b0110000000001111000000000,
	0b0110000000001111000000000,
	0b0111111111001111000000000,
	0b0111111111001111000000000,
	0b0111111111001111000000000,
	0b0000011111001111000000000,
	0b0000011111001111000000000,
	0b0000011111001111000000000,
	0b0000011111001111000000000,
	0b0000011111001111000000000,
	0b0000011111001111000000000,
	0b0000011111001111111100000,
	0b0000011111001111111100000,
	0b0000011111001111111100000,
	0b0000011111001111111100000,
	0b0000000000001111111100000,
	0b0000000000001111111100000,
	0b0000000000001111111100000,
	0b0000000000000000000000000,
	0b1111111111111111111111111,
], w, h, 0xFF0000FF);

if(isBrowser()){
	for(const el of [document.documentElement, document.body]){
		el.style.boxSizing = "border-box";
		el.style.padding   = 0;
		el.style.margin    = 0;
		el.style.fontSize  = 0;
	}
	
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	canvas.style.width = "100vmin";
	canvas.style.imageRendering = "pixelated";
	document.body.appendChild(canvas);
	
	const ctx = canvas.getContext("2d");
	const img = new ImageData(rgba, canvas.width, canvas.height);
	ctx.imageSmoothingEnabled = false;
	ctx.putImageData(img, 0, 0);
}
else{
	const {length} = rgba;
	for(let i = 0; i < length; i += 4){
		const [r, g, b, a] = rgba.slice(i, i + 4);
		if(i && !(i % w))
			process.stdout.write("\n");
		process.stdout.write(a ? `\x1B[38;2;${r};${g};${b}m\x1B[7m.\x1B[0m` : ".");
	}
	process.stdout.write("\n");
}
// </script></body></html>
