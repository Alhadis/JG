import assert from "assert";
import {pack, unpack, unpackValue} from "../bin/ws.mjs";

const test = (...args) => assert.deepStrictEqual(unpack(pack(...args)), args);
test(24);
test("foo", 15, 902);
test("foo", /abc/g);
test("foo", /abc|xyz/gimsuy, "bar");
test("bar", {abc: "ABC", xyz: "XYZ", 123: [1, 2, 3]});
test(new Date(), new Date("2020-03-03T00:00:00Z"));
const [invalidDate] = unpack(pack(new Date("?")));
assert.strictEqual(invalidDate.constructor, Date);
assert.strictEqual(invalidDate.toString(), "Invalid Date");
test((2n ** 64n) + 4n, -(2n ** 64n) - 4n);
test(undefined, null, NaN, true, false, Infinity, -Infinity, -0);
test(255, 65535, 4294967289, 2147483645, 9223372036854775807n);
test(-127, -32767, -2147483647, -0x3FFFFFFFFFFFFFFFn);
test(new Uint8Array([20, 0, 1, 4, 64, 127, 255]));
test(new Uint16Array([0, 8, 64, 128, 255, 512, 65530, 65535]));
test(new Uint32Array([0, 1, 10, 64, 256, 1024, 4294967290, 4294967295]));
test(new Int8Array([-20, -1, -2, 0, 1, 2, -127, 127, 65, -50]));
test(new Int16Array([-2, -1, 0, 1, 2, 128, 1024, -1024, 32767, -32767]));
test(new Int32Array([-2147483647, 0, -1024, 1024, 2147483647]));
test(new BigInt64Array([1n, -1024n, -((2n ** 63n) - 1n), (2n ** 63n) - 1n]));
test(new BigUint64Array([1n, (2n ** 63n) - 1n, -1024n, 1024n, -((2n ** 63n) - 1n), 0n, 3n]));
test(new Float32Array([-1024, 1 / 3, 1 / 6, Math.PI]));
test(new Float64Array([-1024, 1 / 3, 1 / 6, Math.PI]));

const error = {name: "TypeError", message: "Cannot unpack empty buffer"};
assert.throws(() => unpackValue(),   error);
assert.throws(() => unpackValue([]), error);
assert.throws(() => unpack([0, 0, 0, 0, 0, 0, 0, 1, 0xFF]), {
	name: "TypeError",
	message: "Unrecognised type identifier: 0xFF",
});
