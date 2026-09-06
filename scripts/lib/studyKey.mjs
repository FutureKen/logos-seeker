/**
 * Shared key handling for the study-data builders.
 *
 * The salt and verification blob live in `<dir>/index.json`. The first builder
 * to run creates that file (random salt, `verify` = AES-GCM of a fixed string);
 * later runs — English, Chinese, index — reuse the same salt so every file in
 * the directory decrypts with one key. The password itself is never written.
 *
 *   const { key, index } = await getStudyKey("public/data/study", process.env.STUDY_PASSWORD);
 */
import fs from "node:fs";
import path from "node:path";
import {
  deriveKey,
  randomSalt,
  fromBase64,
  makeVerify,
  checkVerify,
} from "./studyCrypto.mjs";

export const VERIFY_TEXT = "logos-seeker-study";
export const DEFAULT_ITER = 200000;

export function readIndex(dir) {
  const file = path.join(dir, "index.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

export function writeIndex(dir, index) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(index, null, 2) + "\n");
}

/**
 * Return `{ key, index }` for `dir`, creating `index.json` with a fresh salt
 * and verify blob when it does not exist yet. Throws when the password does not
 * match an existing manifest, so a builder can never write files that the rest
 * of the directory cannot decrypt.
 */
export async function getStudyKey(dir, password) {
  if (!password) {
    throw new Error("Study password required: set STUDY_PASSWORD or pass --password");
  }
  let index = readIndex(dir);
  if (!index || !index.kdf) {
    const salt = randomSalt();
    const key = await deriveKey(password, fromBase64(salt), DEFAULT_ITER);
    index = {
      schema: 1,
      version: "dev",
      layout: "chapter",
      kdf: { salt, iter: DEFAULT_ITER },
      verify: await makeVerify(key),
      books: {},
      totalBytes: 0,
      ...(index || {}),
    };
    writeIndex(dir, index);
    return { key, index };
  }
  const key = await deriveKey(password, fromBase64(index.kdf.salt), index.kdf.iter || DEFAULT_ITER);
  if (!(await checkVerify(index.verify, key))) {
    throw new Error(`Wrong study password for ${path.join(dir, "index.json")}`);
  }
  return { key, index };
}

/** Command-line helper: `--password x` or `--password=x`, else the env var. */
export function passwordFromArgs(argv, env = process.env) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--password") return argv[i + 1];
    if (argv[i].startsWith("--password=")) return argv[i].slice(11);
  }
  return env.STUDY_PASSWORD || null;
}
