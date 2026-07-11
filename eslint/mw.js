// Config for linting ResourceLoader-friendly MediaWiki scripts
"use strict";

module.exports = {...require("./es5.json")};

if(!module.exports.env)     module.exports.env = {};
if(!module.exports.globals) module.exports.globals = {};

// We're validating ES5 source that runs in modern browsers.
// So enabling 2024-era JavaScript globals makes sense here.
module.exports.env.es2024  = true;
module.exports.env.jquery  = true;
module.exports.env.browser = true;
Object.assign(module.exports.globals, {
	mediaWiki:           false,
	mw:                  false,
	OO:                  false,
	ve:                  false,
	Geo:                 false,
	importScript:        false,
	importScriptURI:     false,
	importStylesheet:    false,
	importStylesheetURI: false,
	pluralRuleParser:    false,
	addOnloadHook:       false,
	insertBanner:        false,
	hideBanner:          false,
	cancelBanner:        false,
	isBannerCanceled:    false,
	toggleNotice:        false,
});
