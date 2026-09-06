// Browser side (jsdom) — see studyCrypto.node.test.js for the node twin.
import { describe, it, expect } from "vitest";
import {
  deriveKey,
  encryptJson,
  decryptJson,
  makeVerify,
  checkVerify,
  randomSalt,
  exportKey,
  importKey,
  toBase64,
  fromBase64,
  unlock,
} from "../src/study/studyCrypto.js";

// Throwaway credentials — never the real study password.
const PASSWORD = "fixture-password";
const ITER = 1000; // keep the suite fast; production uses 200_000

async function keyFor(password = PASSWORD, salt = "AAAAAAAAAAAAAAAAAAAAAA==") {
  return deriveKey(password, salt, ITER);
}

describe("base64 helpers", () => {
  it("round-trips arbitrary bytes", () => {
    for (const len of [0, 1, 2, 3, 4, 17, 64]) {
      const b = new Uint8Array(len).map((_, i) => (i * 37 + 11) & 255);
      expect(Array.from(fromBase64(toBase64(b)))).toEqual(Array.from(b));
    }
  });

  it("rejects non-base64 input", () => {
    expect(() => fromBase64("not base64!!")).toThrow();
  });
});

describe("encryptJson / decryptJson", () => {
  it("round-trips an object", async () => {
    const key = await keyFor();
    const obj = { schema: 1, book: 1, en: { verses: { 1: { m: [{ l: "1a", p: 0 }] } } } };
    const blob = await encryptJson(obj, key);
    expect(blob.v).toBe(1);
    expect(typeof blob.iv).toBe("string");
    expect(typeof blob.ct).toBe("string");
    expect(fromBase64(blob.iv)).toHaveLength(12);
    expect(await decryptJson(blob, key)).toEqual(obj);
  });

  it("throws when the ciphertext is tampered with", async () => {
    const key = await keyFor();
    const blob = await encryptJson({ a: 1 }, key);
    const bytes = fromBase64(blob.ct);
    bytes[0] ^= 0xff;
    await expect(decryptJson({ ...blob, ct: toBase64(bytes) }, key)).rejects.toThrow();
  });

  it("throws on a non-blob argument", async () => {
    const key = await keyFor();
    await expect(decryptJson({ nope: true }, key)).rejects.toThrow(/encrypted blob/);
  });

  it("uses a fresh IV per file", async () => {
    const key = await keyFor();
    const a = await encryptJson({ a: 1 }, key);
    const b = await encryptJson({ a: 1 }, key);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });
});

describe("verify blob", () => {
  it("checkVerify accepts the right key and rejects a wrong one", async () => {
    const key = await keyFor();
    const other = await keyFor("some-other-password");
    const verify = await makeVerify(key);
    expect(await checkVerify(verify, key)).toBe(true);
    expect(await checkVerify(verify, other)).toBe(false);
  });
});

describe("unlock", () => {
  it("returns a usable key for the right password and null for a wrong one", async () => {
    const salt = randomSalt();
    const key = await deriveKey(PASSWORD, salt, ITER);
    const index = { kdf: { salt, iter: ITER }, verify: await makeVerify(key) };

    const good = await unlock(PASSWORD, index);
    expect(good).not.toBeNull();
    const blob = await encryptJson({ ok: true }, key);
    expect(await decryptJson(blob, good)).toEqual({ ok: true });

    expect(await unlock("wrong-password", index)).toBeNull();
  });

  it("returns null when the manifest has no kdf block", async () => {
    expect(await unlock(PASSWORD, {})).toBeNull();
  });
});

describe("exportKey / importKey", () => {
  it("round-trips a key through base64", async () => {
    const key = await keyFor();
    const raw = await exportKey(key);
    expect(fromBase64(raw)).toHaveLength(32);
    const back = await importKey(raw);
    const blob = await encryptJson({ hello: "world" }, key);
    expect(await decryptJson(blob, back)).toEqual({ hello: "world" });
  });
});

describe("randomSalt", () => {
  it("produces 16 distinct bytes by default", async () => {
    const a = randomSalt();
    expect(fromBase64(a)).toHaveLength(16);
    expect(a).not.toBe(randomSalt());
  });
});
