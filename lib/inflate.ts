/**
 * Kleiner DEFLATE-Entpacker (RFC 1950/1951) ohne Abhängigkeiten, synchron, für Browser und Server.
 * Nur für die Sicherheitsprüfung von PDFs (komprimierte Objekt-Bereiche). Mit Obergrenze gegen „Zip-Bomben“:
 * bei mehr als `limit` Bytes oder kaputten Daten kommt undefined zurück.
 */
const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

type Huff = { counts: Uint16Array; symbols: Uint16Array };
function build(lengths: ArrayLike<number>, n: number): Huff {
  const counts = new Uint16Array(16);
  const symbols = new Uint16Array(n);
  for (let i = 0; i < n; i++) counts[lengths[i]]++;
  counts[0] = 0;
  const offs = new Uint16Array(16);
  for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
  for (let i = 0; i < n; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
  return { counts, symbols };
}

class Bad extends Error {}

export function inflate(data: Uint8Array, limit = 8 * 1024 * 1024): Uint8Array | undefined {
  let pos = 0;
  let bit = 0;
  let bits = 0;
  let out = new Uint8Array(Math.min(limit, Math.max(1024, data.length * 4)));
  let len = 0;
  const need = (k: number) => {
    while (bits < k) {
      if (pos >= data.length) throw new Bad();
      bit |= data[pos++] << bits;
      bits += 8;
    }
  };
  const take = (k: number) => {
    if (!k) return 0;
    need(k);
    const v = bit & ((1 << k) - 1);
    bit >>>= k;
    bits -= k;
    return v;
  };
  const put = (b: number) => {
    if (len >= out.length) {
      if (out.length >= limit) throw new Bad();
      const n = new Uint8Array(Math.min(limit, out.length * 2));
      n.set(out);
      out = n;
    }
    out[len++] = b;
  };
  const decode = (h: Huff) => {
    let code = 0, first = 0, index = 0;
    for (let l = 1; l < 16; l++) {
      code |= take(1);
      const c = h.counts[l];
      if (code - c < first) return h.symbols[index + (code - first)];
      index += c;
      first = (first + c) << 1;
      code <<= 1;
    }
    throw new Bad();
  };
  try {
    // zlib-Kopf (PDF FlateDecode) überspringen, wenn vorhanden
    if (data.length > 2 && (data[0] & 0x0f) === 8 && ((data[0] << 8) | data[1]) % 31 === 0) pos = 2;
    let last = 0;
    while (!last) {
      last = take(1);
      const type = take(2);
      if (type === 0) {
        bit = 0;
        bits = 0;
        if (pos + 4 > data.length) throw new Bad();
        const n = data[pos] | (data[pos + 1] << 8);
        pos += 4;
        if (pos + n > data.length) throw new Bad();
        for (let i = 0; i < n; i++) put(data[pos++]);
        continue;
      }
      let lit: Huff, dist: Huff;
      if (type === 1) {
        const l = new Uint8Array(288);
        l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
        lit = build(l, 288);
        dist = build(new Uint8Array(30).fill(5), 30);
      } else if (type === 2) {
        const nlen = take(5) + 257, ndist = take(5) + 1, ncode = take(4) + 4;
        const cl = new Uint8Array(19);
        for (let i = 0; i < ncode; i++) cl[CLORDER[i]] = take(3);
        const clh = build(cl, 19);
        const lens = new Uint8Array(nlen + ndist);
        for (let i = 0; i < nlen + ndist; ) {
          const sym = decode(clh);
          if (sym < 16) lens[i++] = sym;
          else {
            let rep = 0, val = 0;
            if (sym === 16) { if (!i) throw new Bad(); val = lens[i - 1]; rep = 3 + take(2); }
            else if (sym === 17) rep = 3 + take(3);
            else rep = 11 + take(7);
            if (i + rep > nlen + ndist) throw new Bad();
            while (rep--) lens[i++] = val;
          }
        }
        lit = build(lens.subarray(0, nlen), nlen);
        dist = build(lens.subarray(nlen), ndist);
      } else throw new Bad();
      for (;;) {
        const sym = decode(lit);
        if (sym < 256) put(sym);
        else if (sym === 256) break;
        else {
          const s = sym - 257;
          if (s >= 29) throw new Bad();
          const n = LBASE[s] + take(LEXT[s]);
          const d = decode(dist);
          if (d >= 30) throw new Bad();
          const back = DBASE[d] + take(DEXT[d]);
          if (back > len) throw new Bad();
          for (let i = 0; i < n; i++) put(out[len - back]);
        }
      }
    }
    return out.subarray(0, len);
  } catch {
    return undefined;
  }
}
