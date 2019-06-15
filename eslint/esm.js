// Variant of default config which uses `eslint-plugin-import`
"use strict";

const config = module.exports = {...require("./.eslintrc.json")};

if(!config.plugins)  config.plugins = [];
if(!config.settings) config.settings = {};

config.plugins.push("import");
Object.assign(config.settings, {
	"import/core-modules": ["atom", "electron"],
	"import/extensions":   [".js", ".mjs"],
});
Object.assign(config.rules, {
	"import/default": "error",
	"import/export": "error",
	"import/named": "error",
	"import/no-absolute-path": "error",
	"import/no-cycle": "error",
	"import/no-deprecated": "error",
	"import/no-dynamic-require": "error",
	"import/no-mutable-exports": "error",
	"import/no-self-import": "error",
	"import/no-unresolved": "error",
	"import/no-useless-path-segments": "error",
	"import/no-webpack-loader-syntax": "error",
});
