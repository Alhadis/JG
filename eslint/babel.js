// Use Babel for linting projects that leverage stage 3 ECMAScript features
"use strict";

module.exports = {...require("./.eslintrc.json")};
module.exports.parser = "@babel/eslint-parser";
Object.assign(module.exports.parserOptions, {
	requireConfigFile: false,
	babelOptions: {
		babelrc: false,
		configFile: false,
		presets: [["@babel/preset-env", {
			shippedProposals: true,
			bugfixes: true,
			targets: {esmodules: true},
		}]],
	},
});
