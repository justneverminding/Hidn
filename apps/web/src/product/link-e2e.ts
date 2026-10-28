// End-to-end encryption for private-link messages and notifications.
//
// Each link has an ECDH P-256 key pair. The public half is stored with the
// link so senders can encrypt to it. The private half is stored too, but only
// after being wrapped with an AES-GCM key derived from the member's recovery
// secret, which never leaves the browser: any device holding the HIDN key can
// unwrap it, and the server never can.
//
// A message is sealed with a fresh one-time key pair: ECDH with the link's
// public key, HKDF-SHA-256, then AES-256-GCM. The text is padded to a fixed
// size first, so the ciphertext length says nothing about the message.
// Everything here is the browser's built-in WebCrypto; no extra library.

const subtle = globalThis.crypto.subtle;
const CURVE: EcKeyGenParams = { name: "ECDH", namedCurve: "P-256" };
const SEALED_PREFIX = "e2e1:";
/** 500 characters is at most 1,500 bytes of UTF-8, plus a 2-byte length. */
const PADDED_SIZE = 1536;
const WRAP_INFO = "hidn-link-e2e-wrap-v1";
const SEAL_INFO = "hidn-link-e2e-seal-v1";

export interface LinkKeyMaterial {
  /** Raw P-256 public key, base64url. Shared with senders. */
  publicKey: string;
  /** IV and AES-GCM-wrapped PKCS#8 private key, base64url. Only the owner can open it. */
  wrappedKey: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Bytes = Uint8Array<ArrayBuffer>;

function fromBase64Url(value: string): Bytes {
  const normal = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normal + "=".repeat((4 - (normal.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

async function hkdfAesKey(material: ArrayBuffer | Bytes, info: string, salt: Bytes, usages: KeyUsage[]): Promise<CryptoKey> {
  const base = await subtle.importKey("raw", material, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode(info) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

/** The key that wraps the link's private key, from the recovery secret (never sent anywhere). */
function wrappingKey(secret: string): Promise<CryptoKey> {
  return hkdfAesKey(new TextEncoder().encode(secret), WRAP_INFO, new Uint8Array(32), ["encrypt", "decrypt"]);
}

/** Makes a new key pair for a link and wraps its private half for the owner. */
export async function createLinkKeyMaterial(secret: string): Promise<LinkKeyMaterial> {
  const pair = await subtle.generateKey(CURVE, true, ["deriveBits"]) as CryptoKeyPair;
  const publicRaw = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
  const privatePkcs8 = new Uint8Array(await subtle.exportKey("pkcs8", pair.privateKey));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv, additionalData: publicRaw }, await wrappingKey(secret), privatePkcs8));
  privatePkcs8.fill(0);
  return { publicKey: toBase64Url(publicRaw), wrappedKey: toBase64Url(concat(iv, wrapped)) };
}

/** Unwraps the link's private key on the owner's device. Throws if the secret doesn't match. */
export async function openLinkPrivateKey(secret: string, material: LinkKeyMaterial): Promise<CryptoKey> {
  const publicRaw = fromBase64Url(material.publicKey);
  const packed = fromBase64Url(material.wrappedKey);
  const pkcs8 = await subtle.decrypt({ name: "AES-GCM", iv: packed.slice(0, 12), additionalData: publicRaw }, await wrappingKey(secret), packed.slice(12));
  return subtle.importKey("pkcs8", pkcs8, CURVE, false, ["deriveBits"]);
}

function pad(text: string, size = PADDED_SIZE): Bytes {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > size - 2) throw new Error("That message is too long.");
  const out = new Uint8Array(size);
  out[0] = bytes.length >> 8;
  out[1] = bytes.length & 0xff;
  out.set(bytes, 2);
  crypto.getRandomValues(out.subarray(2 + bytes.length));
  return out;
}

function unpad(bytes: Uint8Array): string {
  const length = (bytes[0] << 8) | bytes[1];
  if (length > bytes.length - 2) throw new Error("This message is damaged.");
  return new TextDecoder().decode(bytes.subarray(2, 2 + length));
}

/** Seals text to a P-256 public key with a fresh one-time key. Only the private key's holder can open it. */
export async function sealText(recipientPublicKey: string, text: string, info = SEAL_INFO, size = PADDED_SIZE): Promise<string> {
  const recipientRaw = fromBase64Url(recipientPublicKey);
  const recipient = await subtle.importKey("raw", recipientRaw, CURVE, false, []);
  const ephemeral = await subtle.generateKey(CURVE, true, ["deriveBits"]) as CryptoKeyPair;
  const ephemeralRaw = new Uint8Array(await subtle.exportKey("raw", ephemeral.publicKey));
  const shared = await subtle.deriveBits({ name: "ECDH", public: recipient }, ephemeral.privateKey, 256);
  const key = await hkdfAesKey(shared, info, concat(ephemeralRaw, recipientRaw), ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, pad(text, size)));
  return SEALED_PREFIX + toBase64Url(concat(ephemeralRaw, iv, sealed));
}

/** Opens text sealed by sealText, with the matching private key. */
export async function openText(privateKey: CryptoKey, recipientPublicKey: string, sealedText: string, info = SEAL_INFO): Promise<string> {
  if (!sealedText.startsWith(SEALED_PREFIX)) throw new Error("This isn't encrypted.");
  const packed = fromBase64Url(sealedText.slice(SEALED_PREFIX.length));
  const ephemeralRaw = packed.slice(0, 65);
  const iv = packed.slice(65, 77);
  const ephemeral = await subtle.importKey("raw", ephemeralRaw, CURVE, false, []);
  const shared = await subtle.deriveBits({ name: "ECDH", public: ephemeral }, privateKey, 256);
  const key = await hkdfAesKey(shared, info, concat(ephemeralRaw, fromBase64Url(recipientPublicKey)), ["decrypt"]);
  return unpad(new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv }, key, packed.slice(77))));
}

/** Encrypts a message to a link's public key. Only that link's owner can read the result. */
export function sealLinkMessage(recipientPublicKey: string, text: string): Promise<string> {
  return sealText(recipientPublicKey, text);
}

/** Decrypts a sealed message with the link's private key, on the owner's device. */
export function openLinkMessage(privateKey: CryptoKey, recipientPublicKey: string, sealedText: string): Promise<string> {
  return openText(privateKey, recipientPublicKey, sealedText);
}

/** A key pair kept whole in this browser (base64url raw public key and PKCS#8 private key). */
export async function createSealKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await subtle.generateKey(CURVE, true, ["deriveBits"]) as CryptoKeyPair;
  return {
    publicKey: toBase64Url(new Uint8Array(await subtle.exportKey("raw", pair.publicKey))),
    privateKey: toBase64Url(new Uint8Array(await subtle.exportKey("pkcs8", pair.privateKey))),
  };
}

export function importSealPrivateKey(privateKey: string): Promise<CryptoKey> {
  return subtle.importKey("pkcs8", fromBase64Url(privateKey), CURVE, false, ["deriveBits"]);
}

/** Notifications use their own label and a smaller fixed size. */
export const NOTIFICATION_SEAL_INFO = "hidn-notification-e2e-v1";
export const NOTIFICATION_SEAL_SIZE = 256;

export function isSealedLinkMessage(text: string): boolean {
  return text.startsWith(SEALED_PREFIX);
}
