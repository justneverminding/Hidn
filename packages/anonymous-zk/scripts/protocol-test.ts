import {
  anonymousBinding,
  anonymousCommitment,
  anonymousIdentityFromRecoveryCode,
  anonymousMessageHash,
  anonymousNullifier,
  canonicalAnonymousMessage,
  createAnonymousIdentity,
  createAnonymousScope,
  createAnonymousCircuitInput,
  type AnonymousMerkleWitness,
} from "../src/index.ts";
import { createAnonymousMerkleSnapshot } from "../src/merkle.ts";

const identity = await createAnonymousIdentity();
const restored = await anonymousIdentityFromRecoveryCode(identity.recoveryCode, identity.alias);
if (restored.secret !== identity.secret || restored.commitment !== identity.commitment) {
  throw new Error("Anonymous recovery did not restore the same local secret.");
}

const other = await createAnonymousIdentity();
const commitments = [identity.commitment, other.commitment].map(BigInt);
const tree = createAnonymousMerkleSnapshot(commitments);
const witness = tree.witness(0);
const message = canonicalAnonymousMessage("post", "room", "general", "A private thought.");
const scope = createAnonymousScope();
const input = createAnonymousCircuitInput(identity.secret, witness, scope, message);

if (input.root !== tree.root.toString(10)) {
  throw new Error("Merkle witness root does not match the tree root.");
}
if (input.nullifier !== anonymousNullifier(identity.secret, scope)) {
  throw new Error("Nullifier derivation is not deterministic.");
}
if (input.binding !== anonymousBinding(input.nullifier, message)) {
  throw new Error("Message binding is not deterministic.");
}
if (anonymousMessageHash(message) === anonymousMessageHash(`${message}!`)) {
  throw new Error("Different action messages produced the same test hash.");
}
if (anonymousCommitment(identity.secret) !== identity.commitment) {
  throw new Error("Commitment derivation is not deterministic.");
}

const invalidWitness: AnonymousMerkleWitness = {
  ...witness,
  pathElements: [...witness.pathElements],
};
invalidWitness.pathElements[0] = identity.commitment;
if (invalidWitness.pathElements.join(",") === witness.pathElements.join(",")) {
  throw new Error("Invalid witness test did not mutate the witness.");
}

console.log("anonymous protocol primitives passed");
