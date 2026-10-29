/**
 * Foto → Scan, ganz im Browser: Blatt erkennen (heller Bereich vor dunklerem Hintergrund),
 * prüfen, ob es gut eingerahmt ist, perspektivisch geradeziehen und als „Scan“ aufhellen (Schwarz-Weiß).
 */
type Pt = { x: number; y: number };
/** normales Canvas (OffscreenCanvas liefert in manchen Browsern leere Pixel) */
const canvas = (w: number, h: number) => Object.assign(document.createElement("canvas"), { width: w, height: h });
const ctx = (c: HTMLCanvasElement) => c.getContext("2d", { willReadFrequently: true })!;
export type ScanQuality = { ok: boolean; note: string };
export type ScanResult = { file: File; url: string; quality: ScanQuality };

/** Otsu-Schwelle über ein Graustufen-Histogramm */
function otsu(gray: Uint8ClampedArray) {
  const h = new Array(256).fill(0);
  for (const v of gray) h[v]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * h[i];
  let sumB = 0, wB = 0, best = 0, t = 127;
  for (let i = 0; i < 256; i++) {
    wB += h[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += i * h[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  return { t, separation: best / (total * total * 255 * 255) };
}

/** Vier Ecken des Blatts in Bildkoordinaten (oder null) + Qualität */
function detect(bmp: ImageBitmap): { corners: Pt[] | null; quality: ScanQuality } {
  const W = 360, s = W / bmp.width, H = Math.round(bmp.height * s);
  const c = canvas(W, H), g = ctx(c);
  g.drawImage(bmp, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const gray = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) gray[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0;
  const { t, separation } = otsu(gray);
  // größte zusammenhängende helle Fläche (das Papier)
  const seen = new Uint8Array(W * H);
  let bestPix: number[] = [];
  for (let start = 0; start < W * H; start++) {
    if (seen[start] || gray[start] <= t) continue;
    const pix: number[] = [], stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!; pix.push(p);
      const x = p % W, y = (p / W) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
        if (q >= 0 && !seen[q] && gray[q] > t) { seen[q] = 1; stack.push(q); }
      }
    }
    if (pix.length > bestPix.length) bestPix = pix;
  }
  const area = bestPix.length / (W * H);
  if (area < 0.12 || separation < 0.02) return { corners: null, quality: { ok: false, note: "Blatt nicht klar erkennbar – auf dunklem Untergrund fotografieren" } };
  // Ecken: Extrempunkte von x+y und x−y
  let tl = { x: 0, y: 0, v: Infinity }, br = { x: 0, y: 0, v: -Infinity }, tr = { x: 0, y: 0, v: -Infinity }, bl = { x: 0, y: 0, v: Infinity };
  for (const p of bestPix) {
    const x = p % W, y = (p / W) | 0;
    if (x + y < tl.v) tl = { x, y, v: x + y };
    if (x + y > br.v) br = { x, y, v: x + y };
    if (x - y > tr.v) tr = { x, y, v: x - y };
    if (x - y < bl.v) bl = { x, y, v: x - y };
  }
  // minimal nach innen, damit kein dunkler Rand vom Untergrund bleibt
  const cx = (tl.x + tr.x + br.x + bl.x) / 4, cy = (tl.y + tr.y + br.y + bl.y) / 4;
  const corners = [tl, tr, br, bl].map((p) => ({ x: (p.x + (cx - p.x) * 0.015) / s, y: (p.y + (cy - p.y) * 0.015) / s }));
  const m = 0.015;
  const touching = [tl, tr, br, bl].some((p) => p.x <= W * m || p.x >= W * (1 - m) || p.y <= H * m || p.y >= H * (1 - m));
  const quality: ScanQuality = touching ? { ok: false, note: "Eine Ecke ist abgeschnitten – etwas weiter weg halten" }
    : area < 0.3 ? { ok: false, note: "Blatt ist klein im Bild – näher herangehen" }
    : { ok: true, note: "Gut eingerahmt" };
  return { corners, quality };
}

/** Homographie: Zielrechteck → Quellviereck (8 Unbekannte, Gauß) */
function homography(src: Pt[], w: number, h: number) {
  const dst = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = dst[i], { x: u, y: v } = src[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let k = col; k < 9; k++) A[r][k] -= f * A[col][k];
    }
  }
  return A.map((r, i) => r[8] / r[i]); // a..h
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Foto verarbeiten: geradeziehen (falls Blatt erkannt) und als Scan aufhellen */
export async function scanPhoto(file: File, opts: { flatten?: boolean; bw?: boolean } = {}): Promise<ScanResult> {
  const bmp = await createImageBitmap(file);
  const { corners, quality } = detect(bmp);
  // Quelle ggf. begradigen
  let outW = bmp.width, outH = bmp.height;
  const src = canvas(bmp.width, bmp.height), sg = ctx(src);
  sg.drawImage(bmp, 0, 0);
  const sd = sg.getImageData(0, 0, bmp.width, bmp.height);
  let out: ImageData;
  if (opts.flatten !== false && corners) {
    const w = Math.max(dist(corners[0], corners[1]), dist(corners[3], corners[2]));
    const h = Math.max(dist(corners[0], corners[3]), dist(corners[1], corners[2]));
    const k = Math.min(1, 2200 / Math.max(w, h));
    outW = Math.round(w * k); outH = Math.round(h * k);
    const [a, b, c, d2, e, f, g2, h2] = homography(corners, outW, outH);
    out = new ImageData(outW, outH);
    const S = sd.data, O = out.data, SW = bmp.width, SH = bmp.height;
    for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
      const den = g2 * x + h2 * y + 1;
      const u = Math.min(SW - 1, Math.max(0, Math.round((a * x + b * y + c) / den)));
      const v = Math.min(SH - 1, Math.max(0, Math.round((d2 * x + e * y + f) / den)));
      const si = (v * SW + u) * 4, oi = (y * outW + x) * 4;
      O[oi] = S[si]; O[oi + 1] = S[si + 1]; O[oi + 2] = S[si + 2]; O[oi + 3] = 255;
    }
  } else {
    const k = Math.min(1, 2200 / Math.max(outW, outH));
    if (k < 1) { outW = Math.round(outW * k); outH = Math.round(outH * k); }
    const t = canvas(outW, outH); ctx(t).drawImage(bmp, 0, 0, outW, outH);
    out = ctx(t).getImageData(0, 0, outW, outH);
  }
  if (opts.bw !== false) {
    // Scan-Look: Graustufen, Hintergrund (Schatten, Papierfarbe) herausrechnen, Kontrast anheben
    const bg = canvas(Math.max(1, outW >> 4), Math.max(1, outH >> 4)), bgc = ctx(bg);
    const tmp = canvas(outW, outH); ctx(tmp).putImageData(out, 0, 0);
    bgc.filter = "blur(2px)";
    bgc.drawImage(tmp, 0, 0, bg.width, bg.height);
    const big = canvas(outW, outH), bigc = ctx(big);
    bigc.imageSmoothingQuality = "high";
    bigc.drawImage(bg, 0, 0, outW, outH);
    const B = bigc.getImageData(0, 0, outW, outH).data, O = out.data;
    for (let i = 0; i < O.length; i += 4) {
      const l = O[i] * 0.299 + O[i + 1] * 0.587 + O[i + 2] * 0.114;
      const bl = B[i] * 0.299 + B[i + 1] * 0.587 + B[i + 2] * 0.114 || 1;
      let v = Math.min(1, l / bl);           // 1 = Papier
      v = v > 0.88 ? 1 : Math.pow(v / 0.88, 1.8); // Papier weiß, Schrift kräftig
      const o = Math.round(v * 255);
      O[i] = O[i + 1] = O[i + 2] = o;
    }
  }
  const oc = canvas(outW, outH); ctx(oc).putImageData(out, 0, 0);
  const blob = await new Promise<Blob>((ok, no) => oc.toBlob((b) => (b ? ok(b) : no(new Error("Bild"))), "image/jpeg", 0.85));
  const name = file.name.replace(/\.[^.]+$/, "") + " (Scan).jpg";
  const res = new File([blob], name, { type: "image/jpeg" });
  return { file: res, url: URL.createObjectURL(res), quality };
}
