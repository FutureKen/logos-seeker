/**
 * Node-side twin of `src/study/studyCrypto.js`. The implementation is shared
 * verbatim; this module only installs `crypto.webcrypto` on `globalThis` for
 * node versions that do not expose it as a global, so the browser module's
 * `globalThis.crypto` calls work unchanged.
 */
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

export {
  toBase64,
  fromBase64,
  randomSalt,
  deriveKey,
  exportKey,
  importKey,
  encryptJson,
  decryptJson,
  makeVerify,
  checkVerify,
  unlock,
} from "../../src/study/studyCrypto.js";
