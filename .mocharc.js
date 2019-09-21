"use strict";

module.exports = {
	ui: "bdd",
	spec: ["test/*-spec.js"],
	require: [
		"chai/register-assert",
		"chai/register-expect",
		"chai/register-should",
		"chinotto/register",
		"mocha-when/register",
	],
};
