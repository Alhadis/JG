"use strict";

const fs   = require("fs");
const link = require("../bin/link");

describe("bin/link", () => {
	const tmp = __dirname + "/fixtures/tmp";
	
	before("Setting up test environment", () => {
		fs.mkdirSync(tmp + "/foo");
		fs.mkdirSync(tmp + "/bar");
		touch(tmp + "/bar/existing-name");
	});
	
	function touch(path){
		fs.closeSync(fs.openSync(path, "a+"));
		expect(fs.existsSync(path)).to.be.true;
		expect(fs.lstatSync(path).isFile()).to.be.true;
	}
	
	describe("resolveTarget()", () => {
		const {resolveTarget} = link;
		when("targeting a directory", () =>
			it("resolves to a path directly inside it", () =>
				resolveTarget(`${tmp}/foo`, `${tmp}/bar`)
				.should.equal(`${tmp}/bar/foo`)));
		
		when("targeting a path with a specific filename", () => {
			when("the filename doesn't exist", () =>
				it("uses its basename", () =>
					resolveTarget(`${tmp}/foo`, `${tmp}/bar/new-name`)
					.should.equal(`${tmp}/bar/new-name`)));
			
			when("the filename does exist", () =>
				it("uses it so the file can be overwritten", () =>
					resolveTarget(`${tmp}/foo`, `${tmp}/bar/existing-name`)
					.should.equal(`${tmp}/bar/existing-name`)));
		});
		
		when("targeting a path that doesn't exist", () => {
			it("checks if its parent directory does", () =>
				resolveTarget(`${tmp}/foo`, `${tmp}/bar/qux`)
				.should.equal(`${tmp}/bar/qux`));
			
			when("the parent is a non-directory entity", () =>
				it("throws an exception", () => {
					const fn = () => resolveTarget(`${tmp}/foo`, `${tmp}/bar/existing-name/qux`);
					fn.should.throw(Error, `Not a directory: ${tmp}/bar/existing-name`);
				}));
			
			when("there is no parent directory", () => {
				it("creates one", () => {
					`${tmp}/qux`     .should.not.existOnDisk;
					`${tmp}/qux/qul` .should.not.existOnDisk;
					resolveTarget(`${tmp}/foo`, `${tmp}/qux/qul`).should.equal(`${tmp}/qux/qul`);
					`${tmp}/qux/qul` .should.not.existOnDisk;
					`${tmp}/qux`     .should.existOnDisk.and.be.a.directory;
				});
				
				it("creates missing ancestors too", () => {
					`${tmp}/a`         .should.not.existOnDisk;
					`${tmp}/a/b`       .should.not.existOnDisk;
					`${tmp}/a/b/b`     .should.not.existOnDisk;
					`${tmp}/a/b/b/c`   .should.not.existOnDisk;
					`${tmp}/a/b/b/c/d` .should.not.existOnDisk;
					resolveTarget(`${tmp}/foo`, `${tmp}/a/b/b/c/d`).should.equal(`${tmp}/a/b/b/c/d`);
					`${tmp}/a/b/b/c/d` .should.not.existOnDisk;
					`${tmp}/a/b/b/c`   .should.existOnDisk.and.be.a.directory;
					`${tmp}/a/b/b`     .should.existOnDisk.and.be.a.directory;
					`${tmp}/a/b`       .should.existOnDisk.and.be.a.directory;
					`${tmp}/a`         .should.existOnDisk.and.be.a.directory;
				});
			});
		});
	});
});
