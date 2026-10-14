import { poseidon1, poseidon2, poseidon16 } from "poseidon-lite";

export const ANONYMOUS_PROTOCOL_VERSION = "hidn-anonymous-groth16-v1";
export const ANONYMOUS_TREE_DEPTH = 20;
export const ANONYMOUS_MESSAGE_CHUNKS = 16;
export const ANONYMOUS_BYTES_PER_CHUNK = 31;
export const ANONYMOUS_MAX_MESSAGE_BYTES = ANONYMOUS_MESSAGE_CHUNKS * ANONYMOUS_BYTES_PER_CHUNK;

// BN128's scalar field. Every value supplied to the circuit must be below it.
export const ANONYMOUS_FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const ANONYMOUS_RECOVERY_PREFIX = "HIDN-ANON-";
const ANONYMOUS_ALIAS_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type AnonymousAction = "post" | "reply" | "reaction" | "report" | "link";

export interface AnonymousIdentity {
  recoveryCode: string;
  secret: string;
  commitment: string;
  alias: string;
  notificationCapability: string;
}

export interface AnonymousMerkleWitness {
  root: string;
  leafIndex: number;
  pathElements: string[];
  pathIndices: number[];
}

export interface AnonymousCircuitInput {
  secret: string;
  root: string;
  pathElements: string[];
  pathIndices: number[];
  scope: string;
  message: string[];
  nullifier: string;
  binding: string;
}

export interface AnonymousProofEnvelope {
  protocol: typeof ANONYMOUS_PROTOCOL_VERSION;
  proof: unknown;
  publicSignals: [string, string, string];
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string, expectedBytes: number): Uint8Array {
  const normalized = value.trim().toLowerCase();
  if (!new RegExp(`^[0-9a-f]{${expectedBytes * 2}}$`).test(normalized)) {
    throw new Error("The anonymous recovery material is not valid hexadecimal.");
  }

  const bytes = new Uint8Array(expectedBytes);
  for (let index = 0; index < expectedBytes; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function randomBytes(byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToField(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) + BigInt(byte);
  }
  return value % ANONYMOUS_FIELD_MODULUS;
}

function secretToField(secret: string): bigint {
  return bytesToField(hexToBytes(secret, 31));
}

function fieldToString(value: bigint): string {
  return normalizeField(value).toString(10);
}

export function normalizeField(value: bigint): bigint {
  const normalized = value % ANONYMOUS_FIELD_MODULUS;
  return normalized >= 0n ? normalized : normalized + ANONYMOUS_FIELD_MODULUS;
}

export function parseField(value: string): bigint {
  if (!/^\d+$/.test(value.trim())) {
    throw new Error("Anonymous field values must be decimal integers.");
  }

  const parsed = BigInt(value.trim());
  if (parsed >= ANONYMOUS_FIELD_MODULUS) {
    throw new Error("Anonymous field value is outside the circuit field.");
  }
  return parsed;
}

export function textToFields(value: string): string[] {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength > ANONYMOUS_MAX_MESSAGE_BYTES) {
    throw new Error(`The anonymous action message must be ${ANONYMOUS_MAX_MESSAGE_BYTES} bytes or fewer.`);
  }

  const fields: string[] = [];
  for (let offset = 0; offset < ANONYMOUS_MAX_MESSAGE_BYTES; offset += ANONYMOUS_BYTES_PER_CHUNK) {
    fields.push(fieldToString(bytesToField(bytes.slice(offset, offset + ANONYMOUS_BYTES_PER_CHUNK))));
  }
  return fields;
}

export function canonicalAnonymousMessage(
  action: AnonymousAction,
  targetType: "thread" | "reply" | "room",
  targetId: string,
  content: string,
  tipAddress = "",
): string {
  const message = [ANONYMOUS_PROTOCOL_VERSION, action, targetType, targetId.trim().toUpperCase(), content.trim()];
  const normalizedTipAddress = tipAddress.trim().toLowerCase();
  if (normalizedTipAddress) {
    // The public destination is bound to the post action for integrity. It is
    // not a privacy mechanism and does not strengthen the ZK proof.
    message.push(normalizedTipAddress);
  }
  return message.join("\n");
}

export function anonymousMessageHash(message: string): bigint {
  return poseidon16(textToFields(message).map((value) => BigInt(value)));
}

export function anonymousCommitment(secret: string): string {
  return fieldToString(poseidon1([secretToField(secret)]));
}

export function anonymousNullifier(secret: string, scope: string): string {
  return fieldToString(poseidon2([secretToField(secret), parseField(scope)]));
}

export function anonymousBinding(nullifier: string, message: string): string {
  return fieldToString(poseidon2([parseField(nullifier), anonymousMessageHash(message)]));
}

export function createAnonymousScope(): string {
  return fieldToString(bytesToField(randomBytes(31)));
}

/** A scope fixed to one target, so a member's nullifier repeats only when the
 * same member acts on the same target twice (one like per member per post),
 * while actions on different targets stay unlinkable. */
export function anonymousTargetScope(action: AnonymousAction, targetType: "thread" | "reply" | "room", targetId: string): string {
  return fieldToString(anonymousMessageHash(`hidn-scope-v1\n${action}\n${targetType}\n${targetId.trim().toUpperCase()}`));
}

/** A fresh notification key for one post or reply. Each piece of content gets
 * its own, so the server cannot group a member's posts by a shared key. */
export function createNotificationCapability(): string {
  return bytesToHex(randomBytes(32));
}

export function createAnonymousAlias(): string {
  const bytes = randomBytes(5);
  let alias = "ANON-";
  for (const byte of bytes) {
    alias += ANONYMOUS_ALIAS_ALPHABET[byte % ANONYMOUS_ALIAS_ALPHABET.length];
  }
  return alias;
}

export function recoveryCodeForSecret(secret: string): string {
  const bytes = hexToBytes(secret, 31);
  const groups = bytesToHex(bytes).toUpperCase().match(/.{1,8}/g) ?? [];
  return `${ANONYMOUS_RECOVERY_PREFIX}${groups.join("-")}`;
}

export function secretFromRecoveryCode(recoveryCode: string): string {
  const normalized = recoveryCode.trim().toUpperCase();
  if (!normalized.startsWith(ANONYMOUS_RECOVERY_PREFIX)) {
    throw new Error("Anonymous recovery key must start with HIDN-ANON-.");
  }

  const hex = normalized.slice(ANONYMOUS_RECOVERY_PREFIX.length).replace(/[\s-]/g, "");
  return bytesToHex(hexToBytes(hex, 31));
}

export async function deriveNotificationCapability(secret: string): Promise<string> {
  const material = new TextEncoder().encode(`hidn-anonymous-notifications-v1:${secret}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", material);
  return bytesToHex(new Uint8Array(digest));
}

/** The key that opens a member's link inbox. It is derived from the recovery
 * secret, so the same inbox opens on any device the member returns on, but
 * it shares nothing with the commitment or notification keys. */
export async function deriveLinkInboxKey(secret: string): Promise<string> {
  const material = new TextEncoder().encode(`hidn-link-inbox-v1:${secret}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", material);
  return bytesToHex(new Uint8Array(digest));
}

export async function createAnonymousIdentity(): Promise<AnonymousIdentity> {
  const secret = bytesToHex(randomBytes(31));
  return anonymousIdentityFromSecret(secret);
}

export async function anonymousIdentityFromRecoveryCode(
  recoveryCode: string,
  alias = createAnonymousAlias(),
): Promise<AnonymousIdentity> {
  return anonymousIdentityFromSecret(secretFromRecoveryCode(recoveryCode), alias);
}

export async function anonymousIdentityFromSecret(
  secret: string,
  alias = createAnonymousAlias(),
): Promise<AnonymousIdentity> {
  const normalizedSecret = bytesToHex(hexToBytes(secret, 31));
  return {
    recoveryCode: recoveryCodeForSecret(normalizedSecret),
    secret: normalizedSecret,
    commitment: anonymousCommitment(normalizedSecret),
    alias,
    notificationCapability: await deriveNotificationCapability(normalizedSecret),
  };
}

export function createAnonymousCircuitInput(
  secret: string,
  witness: AnonymousMerkleWitness,
  scope: string,
  message: string,
): AnonymousCircuitInput {
  const normalizedSecret = fieldToString(bytesToField(hexToBytes(secret, 31)));
  const nullifier = anonymousNullifier(secret, parseField(scope).toString(10));
  const binding = anonymousBinding(nullifier, message);
  if (witness.pathElements.length !== ANONYMOUS_TREE_DEPTH || witness.pathIndices.length !== ANONYMOUS_TREE_DEPTH) {
    throw new Error("The anonymous Merkle witness has the wrong depth.");
  }

  return {
    secret: normalizedSecret,
    pathElements: witness.pathElements,
    pathIndices: witness.pathIndices,
    scope: parseField(scope).toString(10),
    message: textToFields(message),
    root: parseField(witness.root).toString(10),
    nullifier,
    binding,
  };
}

export function publicSignalsFromCircuitInput(input: AnonymousCircuitInput): [string, string, string] {
  return [input.root, input.nullifier, input.binding];
}
