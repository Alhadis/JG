/**
 * @fileoverview
 *    Conventional Commit linter configuration. This isn't a tool that I use,
 *    although others might. However, this config was only written because I
 *    found myself jotting down what would be my preferred settings as I was
 *    perusing CommitLint's documentation out of sleep-deprived curiosity.
 * @see {@link https://commitlint.js.org/reference/configuration.html}
 */
const MANREF = new RegExp(String.raw `
	(?<topic>[^:\s()<>/"'\`{}!&*\#?\\]+)
	\(
	(?<section>[0-9](?![0-9])|(?:[lnop]|tcl)(?=[/)]))
	(?<group>[a-z_0-9:/]*?(?:/(?!/)[-a-z_0-9:./]+)?)
	\)
`.trim().replace(/\n\t+/g, ""), "i");

export default {
	rules: {
		"breaking-change-exclamation-mark": 0,
		"subject-empty":          [2, "always"],
		"scope-empty":            [2, "always"],
		"type-empty":             [2, "always"],
		"header-case":            [2, "always", ["camel-case", "sentence-case", "pascal-case", "upper-case"]],
		"header-tense":           [2, "present-imperative"],
		"header-trim":            [2, "always"],
		"header-full-stop":       [2, "never", "."],
		"header-max-length":      [2, "always", 72],
		"body-leading-blank":     [2, "always"],
		"body-max-line-length":   [2, "always", 72],
		"footer-max-line-length": [2, "always", 72],
		"footer-leading-blank":   0,
	},
	plugins: [{
		rules: {
			["manref-rule"](parsed){
				let match;
				MANREF.lastIndex = 0;
				while(match = MANREF.exec(parsed)){
					const {index} = match;
					[match] = match;
					if(index <= 0) continue;
					const before = parsed[index - 1];
					const after  = parsed[index + match.length];
					if("`" === before && "`'".includes(after)
					|| "“" === before && "”" === after
					|| "‘" === before && "’" === after)
						return [false, "man(1) page references should not be quoted"];
				}
				return [true];
			},
		},
	}]
};
