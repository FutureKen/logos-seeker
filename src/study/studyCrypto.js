/**
 * Study-data encryption. Web Crypto only, no dependencies, so the exact same
 * module runs in the browser and (re-exported by `scripts/lib/studyCrypto.mjs`)
 * in the node data pipeline.
 *
 * At rest every `book.json` / `{chapter}.json` is `{v:1, iv, ct}` where `ct` is
 * AES-GCM(key, UTF-8 JSON). The key is PBKDF2-SHA-256 of the password with the
 * salt + iteration count published in `data/study/index.json`; decrypting that
 * file's `verify` blob *is* the password check — no password hash is stored.
 */

const subtle = () => {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error("Web Crypto is unavailable");
  return c.subtle;
};

const VERIFY_PLAINTEXT = "logos-seeker-study";
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Bytes → standard base64. Works without `btoa` (node) and without Buffer. */
export function toBase64(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < b.length ? B64[(n >> 6) & 63] : "=";
    out += i + 2 < b.length ? B64[n & 63] : "=";
  }
  return out;
}

/** Standard base64 → Uint8Array. Throws on malformed input. */
export function fromBase64(str) {
  const s = String(str).replace(/[\s=]+$/g, "").replace(/\s+/g, "");
  if (/[^A-Za-z0-9+/]/.test(s)) throw new Error("invalid base64");
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const c = [0, 1, 2, 3].map((k) => (i + k < s.length ? B64.indexOf(s[i + k]) : -1));
    const n = (c[0] << 18) | (c[1] << 12) | (Math.max(c[2], 0) << 6) | Math.max(c[3], 0);
    out[o++] = (n >> 16) & 255;
    if (c[2] >= 0) out[o++] = (n >> 8) & 255;
    if (c[3] >= 0) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

/** 16 random bytes as base64 — the KDF salt published in index.json. */
export function randomSalt(len = 16) {
  const b = new Uint8Array(len);
  globalThis.crypto.getRandomValues(b);
  return toBase64(b);
}

/**
 * PBKDF2-SHA-256 → extractable AES-GCM 256 key.
 * @param {string} password
 * @param {Uint8Array|string} saltBytes raw bytes or a base64 string
 */
export async function deriveKey(password, saltBytes, iter = 200000) {
  const salt = typeof saltBytes === "string" ? fromBase64(saltBytes) : new Uint8Array(saltBytes);
  const material = await subtle().importKey(
    "raw",
    new TextEncoder().encode(String(password)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle().deriveKey(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

/** Raw key bytes as base64 (what `localStorage["ls-study-key"]` holds). */
export async function exportKey(key) {
  return toBase64(new Uint8Array(await subtle().exportKey("raw", key)));
}

/** Inverse of {@link exportKey}. */
export async function importKey(base64) {
  return subtle().importKey("raw", fromBase64(base64), { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptBytes(plain, key) {
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv }, key, plain);
  return { iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

async function decryptBytes(blob, key) {
  const iv = fromBase64(blob.iv);
  const ct = fromBase64(blob.ct);
  return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv }, key, ct));
}

/** @returns {{v:1, iv:string, ct:string}} */
export async function encryptJson(obj, key) {
  const plain = new TextEncoder().encode(JSON.stringify(obj));
  return { v: 1, ...(await encryptBytes(plain, key)) };
}

/** Throws when the key is wrong or the ciphertext was tampered with. */
export async function decryptJson(blob, key) {
  if (!blob || typeof blob.iv !== "string" || typeof blob.ct !== "string") {
    throw new Error("not an encrypted blob");
  }
  const bytes = await decryptBytes(blob, key);
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** The blob stored as `index.json.verify`. */
export async function makeVerify(key) {
  return encryptBytes(new TextEncoder().encode(VERIFY_PLAINTEXT), key);
}

/** True when `key` decrypts `verify` to the expected sentinel. */
export async function checkVerify(verify, key) {
  if (!verify || !key) return false;
  try {
    const bytes = await decryptBytes(verify, key);
    return new TextDecoder().decode(bytes) === VERIFY_PLAINTEXT;
  } catch {
    return false;
  }
}

/**
 * Derive a key from `password` using the manifest's `kdf` block and check it
 * against the manifest's `verify` blob.
 * @returns {Promise<CryptoKey|null>} null when the password is wrong.
 */
export async function unlock(password, index) {
  if (!index || !index.kdf || !index.kdf.salt) return null;
  const key = await deriveKey(password, index.kdf.salt, index.kdf.iter || 200000);
  return (await checkVerify(index.verify, key)) ? key : null;
}
