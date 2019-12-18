#!/usr/bin/env node

import {readFileSync} from "fs";
import {vlqDecode, vlqEncode} from "alhadis.utils";

let input = JSON.parse(readFileSync(process.argv.slice(2)[0], "utf8"));
input = parseMappings(input);
input = dedupeMappings(input);
loadSegments(input);
console.log(input);


/**
 * Replace identical mapping-points with references to a shared instance.
 * @param  {Object[]} list
 * @return {Object[]}
 * @internal
 */
export function dedupeMappings(list){
	const inputs  = Object.create(null);
	const outputs = Object.create(null);
	list = list.map(x => ({...x})); // Don't mutate input
	for(const mapping of list){
		const {input, output} = mapping;
		const inputKey  = [input.file,  input.line,  input.column].join(":");
		const outputKey = [output.file, output.line, output.column].join(":");
		inputs[inputKey]   ? mapping.input  = inputs[inputKey]   : inputs[inputKey]   = input;
		outputs[outputKey] ? mapping.output = outputs[outputKey] : outputs[outputKey] = output;
	}
	return list;
}


/**
 * Load a file's contents from disk, reusing an earlier result if possible.
 * @example <caption>Structure of returned object</caption>
 *    loadFile("foo.js") => {
 *       path: "foo.js",
 *       lines: ["#!/usr/bin/env node", "'use strict';", "etc();"],
 *    };
 * @param {String} path - Pathname of file to load
 * @return {{path: String, lines: String[]}}
 * @internal
 */
export function loadFile(path){
	const cache = loadFile.cache = loadFile.cache || new Map();
	if(cache.has(path))
		return cache.get(path);
	const data = readFileSync(path, "utf8");
	const file = {
		path,
		lines: data.split(/\r?\n|\r/),
		slice(from, to){
			if(to[0] < from[0] || to[0] === from[0] && to[1] < from[1])
				[from, to] = [to, from];
			if(from[0] === to[0])
				return this.lines[from[0]].slice(from[1], to[1]);
			const output = this.lines.slice(from[0], to[0] + 1);
			output[0] = output[0].slice(from[1]);
			output[output.length - 1] = output[output.length - 1].slice(0, to[1]);
			return output.join("\n");
		},
	};
	Object.defineProperty(file, "slice", {enumerable: false});
	cache.set(path, file);
	return file;
}


/**
 * Load the text-content for each segment of a mapping list.
 * @param {Object[]} list
 * @return {Object[]}
 * @internal
 */
export function loadSegments(list){
	const loaded = new WeakSet();
	let prevInput, prevOutput;
	for(const mapping of list){
		const {input, output} = mapping;
		if(null != prevInput && !loaded.has(prevInput)){
			const file = loadFile(prevInput.file);
			const from = [prevInput.line, prevInput.column];
			const to   = [input.line,     input.column];
			prevInput.text = file.slice(from, to);
			loaded.add(prevInput);
		}
		if(null != prevOutput && !loaded.has(prevOutput)){
			const file = loadFile(prevOutput.file);
			const from = [prevOutput.line, prevOutput.column];
			const to   = [output.line,     output.column];
			prevOutput.text = file.slice(from, to);
			loaded.add(prevOutput);
		}
		prevInput  = input;
		prevOutput = output;
	}
	return list;
}


/**
 * Extract and expand a list of mappings from V3 source-map data.
 *
 * @example <caption>Structure of returned object</caption>
 *    let map = JSON.parse(fs.readFileSync("bar.js.map"));
 *    parseMappings(map) => [{
 *       {input:  {line: 0, column: 0, file: "foo.js"}},
 *       {output: {line: 0, column: 0, file: "bar.js"}},
 *    },{
 *       {input:  {line: 2, column: 5, file: "foo.js"}},
 *       {output: {line: 2, column: 8, file: "bar.js"}},
 *    }];
 * @param {Object} map
 * @return {Object[]}
 * @internal
 */
export function parseMappings(map){
	const mappings = [];
	let inputLine, inputColumn, inputFile, outputLine = 0, outputColumn;
	for(const mapping of map.mappings.split(";")){
		for(const segment of mapping.split(",")){
			if(segment){
				const data   = vlqDecode(segment);
				inputLine    = null == inputLine    ? data[2] : inputLine    + data[2];
				inputColumn  = null == inputColumn  ? data[3] : inputColumn  + data[3];
				inputFile    = null == inputFile    ? data[1] : inputFile    + data[1];
				outputColumn = null == outputColumn ? data[0] : outputColumn + data[0];
				mappings.push({
					input:  {line: inputLine,  column: inputColumn,  file: map.sources[inputFile]},
					output: {line: outputLine, column: outputColumn, file: map.file},
				});
			}
		}
		++outputLine;
		outputColumn = 0;
	}
	return mappings;
}


/**
 * Collate the input/output mappings into a single-level array.
 *
 * Assumes a unidirectional relationship between output objects
 * and their parent (input) objects.
 *
 * @param {Object[]} map
 * @return {Object[]}
 * @internal
 */
export function unifyMappings(list){
	const unified = new Map();
	for(const mapping of list){
		const {input, output} = mapping;
		unified.has(input)
			? unified.get(input).add(output)
			: unified.set(input, new Set([output]));
	}
	const results = [];
	for(const [input, output] of unified)
		results.push({...input, output: [...output].sort((a, b) => {
			// Don't assume output tokens are in any particular order
			if(a.file !== b.file) return a.file.localeCompare(b.file);
			if(a.line < b.line)     return -1;
			if(a.line > b.line)     return +1;
			if(a.column < b.column) return -1;
			if(a.column > b.column) return +1;
			return 0;
		})});
	return results;
}
