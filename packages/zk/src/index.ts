import { schnorr } from "@noble/curves/secp256k1.js";

export const ZK_PROTOCOL_VERSION = "hidn-schnorr-v1";

const RECOVERY_PREFIX = "HIDN-";
const SECRET_KEY_BYTES = 32;
const PUBLIC_KEY_BYTES = 32;
const PROOF_BYTES = 64;

export interface ZkCredential {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  recoveryCode: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string, expectedBytes: number): Uint8Array {
  if (!new RegExp(`^[0-9a-f]{${expectedBytes * 2}}$`, "i").test(value)) {
    throw new Error("The proof material is not valid hexadecimal.");
  }

  const bytes = new Uint8Array(expectedBytes);
  for (let index = 0; index < expectedBytes; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function recoveryCodeForSecret(secretKey: Uint8Array): string {
  const hex = bytesToHex(secretKey).toUpperCase();
  const groups = hex.match(/.{1,8}/g) ?? [];
  return `${RECOVERY_PREFIX}${groups.join("-")}`;
}

function secretFromRecoveryCode(recoveryCode: string): Uint8Array {
  const normalized = recoveryCode.trim().toUpperCase();
  if (!normalized.startsWith(RECOVERY_PREFIX)) {
    throw new Error("Recovery code must start with HIDN-.");
  }

  const hex = normalized.slice(RECOVERY_PREFIX.length).replace(/[\s-]/g, "");
  return hexToBytes(hex, SECRET_KEY_BYTES);
}

export function generateZkCredential(): ZkCredential {
  const secretKey = schnorr.utils.randomSecretKey();
  const publicKey = schnorr.getPublicKey(secretKey);
  return {
    secretKey,
    publicKey,
    recoveryCode: recoveryCodeForSecret(secretKey),
  };
}

export function credentialFromRecoveryCode(recoveryCode: string): ZkCredential {
  const secretKey = secretFromRecoveryCode(recoveryCode);
  const publicKey = schnorr.getPublicKey(secretKey);
  return {
    secretKey,
    publicKey,
    recoveryCode: recoveryCodeForSecret(secretKey),
  };
}

export function publicKeyToHex(publicKey: Uint8Array): string {
  if (publicKey.byteLength !== PUBLIC_KEY_BYTES) {
    throw new Error("The credential commitment must be 32 bytes.");
  }

  return bytesToHex(publicKey);
}

export function buildZkChallengeMessage(username: string, challengeId: string, challenge: string): string {
  return [
    ZK_PROTOCOL_VERSION,
    username.trim().toUpperCase(),
    challengeId.trim(),
    challenge.trim(),
  ].join("\n");
}

export function createZkProof(secretKey: Uint8Array, message: string): string {
  if (secretKey.byteLength !== SECRET_KEY_BYTES) {
    throw new Error("The recovery secret must be 32 bytes.");
  }

  return bytesToHex(schnorr.sign(textBytes(message), secretKey));
}

export function isValidZkPublicKey(publicKeyHex: string): boolean {
  try {
    const publicKey = hexToBytes(publicKeyHex.trim().toLowerCase(), PUBLIC_KEY_BYTES);
    schnorr.utils.lift_x(BigInt(`0x${bytesToHex(publicKey)}`));
    return true;
  } catch {
    return false;
  }
}

export function verifyZkProof(publicKeyHex: string, proofHex: string, message: string): boolean {
  try {
    if (!isValidZkPublicKey(publicKeyHex)) {
      return false;
    }

    const publicKey = hexToBytes(publicKeyHex.trim().toLowerCase(), PUBLIC_KEY_BYTES);
    const proof = hexToBytes(proofHex.trim().toLowerCase(), PROOF_BYTES);
    return schnorr.verify(proof, textBytes(message), publicKey);
  } catch {
    return false;
  }
}
