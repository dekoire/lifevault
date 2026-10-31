"use client";
import { useEffect, useRef } from "react";

/**
 * Animierter KI-Avatar „Nova“ (Entwurf aus Claude Design, Palette „Aurora“, Gesicht „Kapseln“): weiche Farbblasen mit
 * Verläufen in Lila, Blau, Grün und Pink, vorne eine Blase von Dunkelblau über Pink zu Mint; zwei Augen, die blinzeln und
 * dem Zeiger folgen. Zustände: idle (ruhig, Blasen lebhaft), listen (Schallwellen nach außen), think (Blick nach oben,
 * kreisende bunte Leuchtpunkte), speak (Mund bewegt sich).
 * Gleiche Zeichnung auf hellem und dunklem Grund. Auf Canvas; läuft nur, solange er sichtbar ist, und steht still bei
 * „Bewegung reduzieren“. Maße, die im Entwurf in Pixeln stehen (Punkte, Mund, Schatten), wachsen hier mit der Größe.
 */
export type AiAvatarState = "idle" | "listen" | "think" | "speak";

const PAL = ["#7C4DFF", "#2E8BFF", "#1FD9A0", "#FF5FC8"];
// Nachdenken: jeder Punkt aus vier weichen Farbflecken
const THINK = ["#0B1F8A", "#E0337A", "#1FD9A0", "#7C4DFF"];
const rgba = (h: string, a: number) => `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;

export function AiAvatar({ size = 36, state = "idle", gaze, className = "", label }: { size?: number; state?: AiAvatarState; /** Blickrichtung (-1..1) statt Zeiger, z. B. auf den Text, den man gerade tippt */ gaze?: [number, number]; className?: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const gazeRef = useRef(gaze);
  gazeRef.current = gaze;

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const s = { amp: 0.035, speed: 0.6, gx: 0, gy: 0, tx: 0, ty: 0, blink: 1, nextBlink: 2, blinkT: undefined as number | undefined, mouth: 0, ring: 0, think: 0, bs: 0, ph: 0, bph: 0 };
    let off: HTMLCanvasElement | undefined, lay: HTMLCanvasElement | undefined;

    const draw = (t: number, dt: number) => {
      const dpr = Math.min(3, window.devicePixelRatio || 1), W = size, H = size;
      if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const m = stateRef.current, k = 1 - Math.pow(0.002, dt);
      const talk = m === "speak" ? Math.abs(Math.sin(t * 9) * Math.sin(t * 3.7 + 1)) : 0;
      const hear = m === "listen" ? (Math.sin(t * 4.1) * 0.5 + 0.5) * (Math.sin(t * 1.7 + 2) * 0.5 + 0.5) : 0;
      const tgtAmp = { idle: 0.035, listen: 0.075 + hear * 0.05, think: 0.06, speak: 0.05 + talk * 0.09 }[m];
      const tgtSpeed = { idle: 0.6, listen: 1.9, think: 2.2, speak: 1.4 }[m];
      s.amp += (tgtAmp - s.amp) * k;
      s.speed += (tgtSpeed - s.speed) * k;
      s.mouth += ((m === "speak" ? talk : 0) - s.mouth) * Math.min(1, dt * 18);
      s.think += ((m === "think" ? 1 : 0) - s.think) * k;
      s.ring += ((m === "listen" ? 1 : 0) - s.ring) * k;
      const g = gazeRef.current;
      const lookX = m === "think" ? 0.55 : g ? g[0] : s.tx, lookY = m === "think" ? -0.6 : g ? g[1] : s.ty;
      const ke = 1 - Math.pow(1e-7, dt);
      s.gx += (lookX - s.gx) * ke;
      s.gy += (lookY - s.gy) * ke;
      s.nextBlink -= dt;
      if (s.nextBlink <= 0) { s.blinkT = 0; s.nextBlink = Math.random() < 0.25 ? 0.25 : 1 + Math.random() * 1.6; }
      if (s.blinkT !== undefined) {
        s.blinkT += dt;
        const p = s.blinkT / 0.16;
        s.blink = p < 1 ? Math.abs(1 - 2 * p) : 1;
        if (p >= 1) s.blinkT = undefined;
      }

      const cx = W / 2, cy = H / 2, R = W * 0.28 * (1 + Math.sin(t * 1.3) * 0.012 + s.ring * (Math.sin(t * 3.2) * 0.02 + hear * 0.025));
      s.bs += ((m === "idle" ? 1 : 0) - s.bs) * k;
      s.ph += dt * s.speed;
      s.bph += dt * (s.speed + s.bs * (2.2 - s.speed));
      const ph = s.ph;

      // Zuhören: weiche Schallwellen in vier Richtungen, weichgezeichnet
      if (s.ring > 0.01) {
        off ??= document.createElement("canvas");
        if (off.width !== c.width) { off.width = c.width; off.height = c.height; }
        const o = off.getContext("2d");
        if (o) {
          o.setTransform(dpr, 0, 0, dpr, 0, 0);
          o.clearRect(0, 0, W, H);
          o.lineCap = "round";
          [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach((dir, side) => {
            for (let w = 0; w < 4; w++) {
              const p = (t * 0.45 + w / 4) % 1;
              const base = R * (1.12 + p * 0.65), span = 0.62 - p * 0.1;
              const col = PAL[1 + ((w + side) % 2)];
              const seg = 24;
              const pt = (u: number) => {
                const ang = dir + (u - 0.5) * 2 * span;
                const r = base + Math.sin(u * Math.PI * 4 - t * 5 + w) * R * 0.03 * (1 - p * 0.5);
                return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r];
              };
              for (let i = 0; i < seg; i++) {
                const u0 = i / seg, u1 = (i + 1) / seg;
                const taper = Math.sin(((u0 + u1) / 2) * Math.PI);
                const [x0, y0] = pt(u0), [x1, y1] = pt(u1);
                o.beginPath();
                o.moveTo(x0, y0);
                o.lineTo(x1, y1);
                o.lineWidth = (2 + taper * 4 * (1 - p)) * Math.min(1, W / 200);
                o.strokeStyle = rgba(col, taper * Math.sin(p * Math.PI) * 0.75 * s.ring);
                o.stroke();
              }
            }
          });
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.filter = `blur(${Math.round(W * 0.008 * dpr)}px)`;
          ctx.drawImage(off, 0, 0);
          ctx.restore();
        }
      }

      const blob = (g: CanvasRenderingContext2D, rad: number, amp: number, offset: number, fill: CanvasGradient, P = ph) => {
        g.beginPath();
        for (let i = 0; i <= 140; i++) {
          const a = (i / 140) * Math.PI * 2;
          const n = Math.sin(a * 3 + P + offset) * 0.5 + Math.sin(a * 5 - P * 1.3 + offset * 2) * 0.3 + Math.sin(a * 2 + P * 0.7 - offset) * 0.4;
          const r = rad * (1 + n * amp);
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.closePath();
        g.fillStyle = fill;
        g.fill();
      };
      // Pink hinten und zart, Lila, Grün, vorne die dreifarbige Blase; jede mit Verlauf, der sich dreht, und zum Rand
      // weich ausgeblendet (eigene Ebene). Im Ruhezustand bewegen sich die hinteren Blasen schneller.
      lay ??= document.createElement("canvas");
      if (lay.width !== c.width) { lay.width = c.width; lay.height = c.height; }
      const lx = lay.getContext("2d");
      if (lx)
        [3, 0, 2, 1].forEach((i) => {
          const lp = i === 1 ? ph : s.bph, la = i === 1 ? s.amp : s.amp + s.bs * (0.06 - s.amp);
          const ox = Math.cos(lp * 0.5 + i * 2.1) * R * 0.18, oy = Math.sin(lp * 0.6 + i * 2.1) * R * 0.18;
          const al = i === 0 ? 0.85 : i === 3 ? 0.22 : i === 2 ? 1 : 0.85;
          const next = ({ 0: 1, 1: 2, 2: 0, 3: 0 } as Record<number, number>)[i];
          const ang = lp * 0.4 + i * 1.6, gx0 = Math.cos(ang) * R, gy0 = Math.sin(ang) * R;
          const lg = lx.createLinearGradient(cx + ox - gx0, cy + oy - gy0, cx + ox + gx0, cy + oy + gy0);
          if (i === 1) {
            lg.addColorStop(0, rgba("#0B1F8A", 0.65 * al));
            lg.addColorStop(0.5, rgba("#E0337A", 0.62 * al));
            lg.addColorStop(1, rgba("#8FF5C4", 0.6 * al));
          } else {
            lg.addColorStop(0, rgba(PAL[i], 0.95 * al));
            lg.addColorStop(1, rgba(PAL[next], 0.95 * al));
          }
          lx.setTransform(dpr, 0, 0, dpr, 0, 0);
          lx.globalCompositeOperation = "source-over";
          lx.clearRect(0, 0, W, H);
          blob(lx, R * (i === 0 ? 1.06 : i === 3 ? 1.03 : i === 2 ? 1.02 : 0.9), la * (1 + i * 0.4), i * 1.7, lg, lp);
          const mk = lx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, R * 1.15);
          mk.addColorStop(0, "rgba(0,0,0,1)");
          mk.addColorStop(0.7, "rgba(0,0,0,0.8)");
          mk.addColorStop(1, "rgba(0,0,0,0)");
          lx.globalCompositeOperation = "destination-in";
          lx.fillStyle = mk;
          lx.fillRect(0, 0, W, H);
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(lay!, 0, 0);
          ctx.restore();
        });
      const sh = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, 0, cx - R * 0.35, cy - R * 0.45, R * 0.7);
      sh.addColorStop(0, "rgba(255,255,255,0.14)");
      sh.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalCompositeOperation = "source-over";
      blob(ctx, R * 0.98, s.amp, 0, sh);

      // Nachdenken: drei leuchtende, bunt schimmernde Punkte kreisen
      if (s.think > 0.01)
        for (let i = 0; i < 3; i++) {
          const a = t * 2.4 + i * ((Math.PI * 2) / 3);
          const dx = cx + Math.cos(a) * R * 1.65, dy = cy + Math.sin(a) * R * 1.65, dr = R * 0.1;
          THINK.forEach((col, j) => {
            const o = t * 1.8 + j * 1.57 + i;
            const px = dx + Math.cos(o) * dr * 0.25, py = dy + Math.sin(o) * dr * 0.25;
            const gd = ctx.createRadialGradient(px, py, 0, px, py, dr);
            gd.addColorStop(0, rgba(col, 0.6 * s.think));
            gd.addColorStop(0.8, rgba(col, 0.45 * s.think));
            gd.addColorStop(1, rgba(col, 0));
            ctx.fillStyle = gd;
            ctx.beginPath();
            ctx.arc(px, py, dr, 0, Math.PI * 2);
            ctx.fill();
          });
        }

      const ex = cx + s.gx * R * 0.22, ey = cy - R * 0.08 + s.gy * R * 0.18;
      const ew = R * 0.13, eh = R * 0.3 * Math.max(0.08, s.blink) * (1 - s.think * 0.35), gap = R * 0.2;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(10,6,30,0.15)";
      ctx.shadowBlur = Math.max(1, W * 0.01);
      [-1, 1].forEach((d) => { ctx.beginPath(); ctx.roundRect(ex + d * gap - ew / 2, ey - eh / 2, ew, eh, ew / 2); ctx.fill(); });
      if (s.mouth > 0.02) {
        const mw = R * 0.22, mh = Math.max(W * 0.006, R * 0.14 * s.mouth);
        ctx.beginPath();
        ctx.roundRect(ex - mw / 2, ey + R * 0.3 - mh / 2, mw, mh, mh / 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    };

    if (still) {
      draw(0, 1);
      return;
    }
    // Blick folgt dem Zeiger (kleine Avatare: schon auf ein paar Hundert Pixel Abstand voll zur Seite)
    const onMove = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      s.tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / Math.max(240, r.width * 0.8)));
      s.ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / Math.max(240, r.height * 0.8)));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    let raf = 0, last = performance.now(), t = Math.random() * 10, visible = true;
    const loop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      t += dt;
      draw(t, dt);
      raf = requestAnimationFrame(loop);
    };
    const run = () => { if (!raf && visible && document.visibilityState === "visible") { last = performance.now(); raf = requestAnimationFrame(loop); } };
    const pause = () => { cancelAnimationFrame(raf); raf = 0; };
    // nur zeichnen, solange er im Bild ist und die App vorne
    const io = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) run(); else pause(); });
    io?.observe(c);
    const onVis = () => (document.visibilityState === "visible" ? run() : pause());
    document.addEventListener("visibilitychange", onVis);
    draw(t, 0.016);
    run();
    return () => { pause(); io?.disconnect(); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pointermove", onMove); };
  }, [size]);

  return (
    <span className={`relative inline-grid shrink-0 place-items-center ${className}`} style={{ width: size, height: size }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <canvas ref={ref} style={{ width: size, height: size, display: "block" }} />
    </span>
  );
}
