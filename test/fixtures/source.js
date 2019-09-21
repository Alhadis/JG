"use strict";

import("fs").then(fs => {
	console.log(typeof fs);
});

// ForOfStatement
for(const z of [9, 8, 7])
for(const y of [6, 5, 4])
for(const x of [3, 2, 1]){
	console.log(z + y + x);
}

// ForInStatement
for(const z in {a: 1, b: 2, c: 3})
for(const y in {a: 4, b: 5, c: 6})
for(const x in {a: 7, b: 8, c: 9}){
	console.log(z + y + x);
}

// ForStatement
for(let x = 0; x < 256; ++x)
for(let y = 0; y < 256; ++y)
for(let z = 0; z < 256; ++z){
	console.log(x + y + z);
}

// WhileStatement
let x, y, z;
while(x = [1, 2, 3].pop())
while(y = [4, 5, 6].pop())
while(z = [7, 8, 9].pop()){
	console.log(x + y + z);
}
