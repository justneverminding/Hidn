import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { ModuleBuilder } = require("wasmbuilder");
const { buildBn128 } = require("wasmcurves");

const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), "../wasm/bn128.wasm");
const moduleBuilder = new ModuleBuilder();

// Keep this identical to ffjavascript's BN128 runtime construction. The
// resulting module is bound to the Worker so verification never needs to
// compile WASM at request time.
moduleBuilder.setMemory(25);
buildBn128(moduleBuilder);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.from(moduleBuilder.build()));
console.log(`Wrote ${outputPath}`);
