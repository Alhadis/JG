"use strict";

const typeDefs = new Map();
const {
	parseTypedef,
	parseVars,
	joinTypes,
	matchTypedef,
	matchVar,
	makeField,
	offsetToPoint,
} = require("./utils.cjs");

module.exports.handlers = {
	beforeParse(event){
		event.source = event.source
			.replace(/\/\*\*((?:[^*]|\*(?!\/))+)\*\//g, (match, body, offset, input) => {
				const typedef = parseTypedef(match, offset);
				const vars    = parseVars(match, offset);
				if(typedef && vars.length){
					const range = [offset, offset + match.length];
					const {line, column} = offsetToPoint(offset, input);
					const {name} = typedef;
					const type = joinTypes(vars);
					typeDefs.set(name, {typedef, vars, range, line, column, file: event.filename});
					return "/**"
						+ body.replace(matchTypedef, ` @enum {${type}}\n`).replace(matchVar, "")
						+ "\n @flatten"
						+ "\n */"
						+ `\nconst ${name} = {\n`
						+ vars.map(makeField).join("\n\n")
						+ "\n};";
				}
				return match;
			});
	},
};
