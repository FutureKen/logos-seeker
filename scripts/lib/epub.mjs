/**
 * Minimal read-only zip reader, enough for the calibre-produced EPUBs this
 * pipeline consumes: no runtime dependency, `node:zlib` for the one compression
 * method those files use (deflate) plus stored entries.
 *
 *   const epub = openEpub("Recovery Bible.epub");
 *   epub.names();                  // every entry, in central-directory order
 *   epub.read("text/part0006.html");  // → string (UTF-8)
 *   epub.readBuffer("cover.jpeg");    // → Buffer
 *
 * `openZipBuffer(buf)` does the same for a zip already in memory, which is what
 * the tests use so they need no fixture file on disk.
 */
import fs from "node:fs";
import zlib from "node:zlib";

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

function findEocd(buf) {
  const min = 22;
  if (buf.length < min) throw new Error("not a zip file (too short)");
  const start = Math.max(0, buf.length - 0xffff - min);
  for (let i = buf.length - min; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error("not a zip file (no end-of-central-directory record)");
}

/** @returns {{count: number, size: number, offset: number}} */
function centralDirectory(buf) {
  const eocd = findEocd(buf);
  let count = buf.readUInt16LE(eocd + 10);
  let size = buf.readUInt32LE(eocd + 12);
  let offset = buf.readUInt32LE(eocd + 16);

  // Zip64: the 32-bit fields are saturated and the real values live in the
  // zip64 end-of-central-directory record the locator points at.
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    const locator = eocd - 20;
    if (locator >= 0 && buf.readUInt32LE(locator) === EOCD64_LOCATOR_SIG) {
      const rec = Number(buf.readBigUInt64LE(locator + 8));
      if (buf.readUInt32LE(rec) !== EOCD64_SIG) throw new Error("bad zip64 directory record");
      count = Number(buf.readBigUInt64LE(rec + 32));
      size = Number(buf.readBigUInt64LE(rec + 40));
      offset = Number(buf.readBigUInt64LE(rec + 48));
    }
  }
  return { count, size, offset };
}

/** Open a zip that is already in memory. */
export function openZipBuffer(buf) {
  const { count, offset } = centralDirectory(buf);
  const entries = new Map();
  const order = [];

  let p = offset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new Error(`bad central directory entry at ${p}`);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const entry = { name, method, compressedSize, uncompressedSize, localOffset };
    if (!entries.has(name)) order.push(name);
    entries.set(name, entry);
    p += 46 + nameLen + extraLen + commentLen;
  }

  function readBuffer(name) {
    const e = entries.get(name);
    if (!e) throw new Error(`zip entry not found: ${name}`);
    const lo = e.localOffset;
    if (buf.readUInt32LE(lo) !== LOC_SIG) throw new Error(`bad local header for ${name}`);
    const nameLen = buf.readUInt16LE(lo + 26);
    const extraLen = buf.readUInt16LE(lo + 28);
    const start = lo + 30 + nameLen + extraLen;
    const raw = buf.subarray(start, start + e.compressedSize);
    if (e.method === 0) return Buffer.from(raw);
    if (e.method === 8) return zlib.inflateRawSync(raw);
    throw new Error(`unsupported compression method ${e.method} for ${name}`);
  }

  return {
    names: () => order.slice(),
    has: (name) => entries.has(name),
    entry: (name) => entries.get(name) ?? null,
    readBuffer,
    read: (name) => readBuffer(name).toString("utf8"),
  };
}

/** Open an EPUB (or any zip) from disk. */
export function openEpub(file) {
  if (!fs.existsSync(file)) throw new Error(`EPUB not found: ${file}`);
  return openZipBuffer(fs.readFileSync(file));
}

/**
 * Build a zip in memory (stored or deflated entries). Only used by the tests,
 * but it lives next to the reader so the two stay in step.
 *
 * @param {{name: string, data: string|Buffer, store?: boolean}[]} files
 */
export function makeZipBuffer(files) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), "utf8");
    const store = !!f.store;
    const body = store ? data : zlib.deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOC_SIG, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt32LE(0, 10); // time/date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(CEN_SIG, 0);
    cen.writeUInt16LE(20, 4); // version made by
    cen.writeUInt16LE(20, 6); // version needed
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(store ? 0 : 8, 10);
    cen.writeUInt32LE(0, 12);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(0, 38); // external attrs
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);

    offset += local.length + name.length + body.length;
  }

  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
