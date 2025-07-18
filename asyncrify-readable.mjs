#!/usr/bin/env node

async function* readLines(source = process.stdin, separator = "\n"){
	let buffered, lineNumber = 0;
	separator = Buffer.from(separator);
	
	while(true){
		let chunk = await new Promise((resolve, reject) => {
			const cleanUp = () => {
				source.off("error",    onError);
				source.off("readable", onReadable);
			};
			const onError = error => {
				cleanUp();
				reject(error);
			};
			const onReadable = () => {
				cleanUp();
				resolve(source.read());
			};
			source.once("error",    onError);
			source.once("readable", onReadable);
		});
		if(null === chunk){
			if(buffered) yield Object.assign(buffered, {
				interrupted: true,
				number: ++lineNumber,
			});
			return;
		}
		if(buffered){
			chunk = Buffer.concat(buffered, chunk);
			buffered = null;
		}
		const {length} = chunk;
		let index, offset = 0;
		while(-1 !== (index = chunk.indexOf(separator, offset))){
			yield Object.assign(chunk.slice(offset, index), {
				interrupted: false,
				number: ++lineNumber,
			});
			offset = index + separator.length;
		}
		if(offset < length)
			buffered = chunk.slice(offset);
	}
}


new Promise(async (resolve, reject) => {
	for await(const line of readLines(process.stdin, "\x85")){
		process.stdout.write(`Line #${line.number}: ${line}`);
		if(!line.interrupted)
			process.stdout.write("\n");
	}
	
}).then(data => {
	
}).catch(err => {
	process.error(err);
	process.exit(1);
});
