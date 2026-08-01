#!/usr/bin/env node

import fs from "fs";
import {dirname, join, resolve} from "path";
import {fileURLToPath} from "url";
import {extractTypes} from "./to-typescript.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const result = await extractTypes(resolve(dir, "../test/fixtures/comparator.mjs"));
console.log(result);
