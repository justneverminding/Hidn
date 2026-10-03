import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  anonymousIdentityFromSecret,
  canonicalAnonymousMessage,
  createAnonymousCircuitInput,
  createAnonymousMerkleSnapshot,
  createAnonymousScope,
} from "../src/index";
import { createAnonymousGroth16Proof } from "../src/prover";
import { verifyAnonymousGroth16Proof } from "../src/verifier";

const packageRoot = resolve(import.meta.dirname, "..");
const identity = await anonymousIdentityFromSecret("00000000000000000000000000000000000000000000000000000000000001");
const tree = createAnonymousMerkleSnapshot([identity.commitment]);
const message = canonicalAnonymousMessage("post", "room", "general", "A real local proof.");
const input = createAnonymousCircuitInput(identity.secret, tree.witness(0), createAnonymousScope(), message);
const proof = await createAnonymousGroth16Proof(
  input,
  resolve(packageRoot, "build/hidn_membership_js/hidn_membership.wasm"),
  resolve(packageRoot, "build/hidn_membership_final.zkey"),
);
const verificationKey = JSON.parse(await readFile(resolve(packageRoot, "build/verification_key.json"), "utf8")) as unknown;

if (!await verifyAnonymousGroth16Proof(verificationKey, proof.publicSignals, proof.proof)) {
  throw new Error("The generated anonymous proof did not verify.");
}

const invalidSignals = [...proof.publicSignals];
invalidSignals[2] = invalidSignals[2] === "0" ? "1" : "0";
if (await verifyAnonymousGroth16Proof(verificationKey, invalidSignals, proof.proof)) {
  throw new Error("The verifier accepted a tampered public binding.");
}

console.log("anonymous Groth16 proof verified; tampered binding rejected");
process.exit(0);
