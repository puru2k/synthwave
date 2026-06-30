// Minimal, dependency-free ZIP writer (STORE method, no compression).
// Good enough to bundle a handful of small text artifacts into one archive.

interface ZipEntry {
  name: string;
  content: string;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (~c) >>> 0;
}

const push16 = (arr: number[], v: number) => arr.push(v & 0xff, (v >>> 8) & 0xff);
const push32 = (arr: number[], v: number) =>
  arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);

export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const crc = crc32(data);

    // Local file header
    const lfh: number[] = [];
    push32(lfh, 0x04034b50);
    push16(lfh, 20); // version needed
    push16(lfh, 0); // flags
    push16(lfh, 0); // method = store
    push16(lfh, 0); // mod time
    push16(lfh, 0); // mod date
    push32(lfh, crc);
    push32(lfh, data.length); // compressed size
    push32(lfh, data.length); // uncompressed size
    push16(lfh, nameBytes.length);
    push16(lfh, 0); // extra len
    for (const b of nameBytes) lfh.push(b);

    local.push(...lfh);
    for (const b of data) local.push(b);

    // Central directory record
    push32(central, 0x02014b50);
    push16(central, 20); // version made by
    push16(central, 20); // version needed
    push16(central, 0); // flags
    push16(central, 0); // method
    push16(central, 0); // mod time
    push16(central, 0); // mod date
    push32(central, crc);
    push32(central, data.length);
    push32(central, data.length);
    push16(central, nameBytes.length);
    push16(central, 0); // extra
    push16(central, 0); // comment
    push16(central, 0); // disk number
    push16(central, 0); // internal attrs
    push32(central, 0); // external attrs
    push32(central, offset); // local header offset
    for (const b of nameBytes) central.push(b);

    offset += lfh.length + data.length;
  }

  const end: number[] = [];
  push32(end, 0x06054b50);
  push16(end, 0); // disk number
  push16(end, 0); // disk with central dir
  push16(end, entries.length); // entries on this disk
  push16(end, entries.length); // total entries
  push32(end, central.length); // central dir size
  push32(end, offset); // central dir offset
  push16(end, 0); // comment length

  const out = new Uint8Array(local.length + central.length + end.length);
  out.set(local, 0);
  out.set(central, local.length);
  out.set(end, local.length + central.length);
  return new Blob([out], { type: "application/zip" });
}
