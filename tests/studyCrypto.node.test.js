// @vitest-environment node
// The pipeline imports the crypto through scripts/lib/studyCrypto.mjs, which
// installs node's webcrypto on globalThis; prove the same API works there.
import { describe, it, expect } from "vitest";
import {
  deriveKey,
  encryptJson,
  decryptJson,
  makeVerify,
  unlock,
  randomSalt,
  exportKey,
  importKey,
} from "../scripts/lib/studyCrypto.mjs";

const PASSWORD = "fixture-password";
const ITER = 1000;

describe("studyCrypto under node", () => {
  it("round-trips a study file and validates the password", async () => {
    const salt = randomSalt();
    const key = await deriveKey(PASSWORD, salt, ITER);
    const index = { kdf: { salt, iter: ITER }, verify: await makeVerify(key) };

    const file = { schema: 1, book: 1, chapter: 1, en: { verses: {} } };
    const blob = await encryptJson(file, key);
    expect(blob).toMatchObject({ v: 1 });

    const unlocked = await unlock(PASSWORD, index);
    expect(unlocked).not.toBeNull();
    expect(await decryptJson(blob, unlocked)).toEqual(file);

    expect(await unlock("nope", index)).toBeNull();
  });

  it("keys survive an export/import round trip", async () => {
    const key = await deriveKey(PASSWORD, randomSalt(), ITER);
    const back = await importKey(await exportKey(key));
    const blob = await encryptJson({ n: 42 }, key);
    expect(await decryptJson(blob, back)).toEqual({ n: 42 });
  });

  it("a key derived from a different password cannot decrypt", async () => {
    const salt = randomSalt();
    const key = await deriveKey(PASSWORD, salt, ITER);
    const wrong = await deriveKey("other", salt, ITER);
    const blob = await encryptJson({ n: 1 }, key);
    await expect(decryptJson(blob, wrong)).rejects.toThrow();
  });
});
