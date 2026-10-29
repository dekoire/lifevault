import { gateway } from "ai";
import type { GatewayProviderOptions } from "@ai-sdk/gateway";

/**
 * KI über Vercel AI Gateway (auf Vercel per OIDC, lokal per AI_GATEWAY_API_KEY).
 * Kein Training mit deinen Daten (disallowPromptTraining).
 */
export const MODELS = {
  // Auslesen läuft für jede Datei – günstiges Modell (ca. 20× billiger als Sonnet), liest PDFs und Fotos zuverlässig
  read: { model: "anthropic/claude-haiku-5.5", fallbacks: ["google/gemini-3.1-flash-lite"] },
  chat: { model: "anthropic/claude-sonnet-5.5", fallbacks: ["anthropic/claude-haiku-5.5"] },
  classify: { model: "anthropic/claude-haiku-5.5", fallbacks: ["google/gemini-3.1-flash-lite"] },
  profile: { model: "anthropic/claude-haiku-5.5", fallbacks: ["google/gemini-3.1-flash-lite"] },
  mail: { model: "anthropic/claude-haiku-5.5", fallbacks: ["google/gemini-2.5-flash-lite"] },
} as const;
export type AiTask = keyof typeof MODELS;

/** Vom Admin gewählte Modelle (app_settings.ai_models), kurz zwischengespeichert – gelten für alle Nutzer */
let chosen: Partial<Record<AiTask, string>> = {};
let loadedAt = 0;
const MODEL_ID = /^[a-z0-9-]+\/[a-z0-9.\-]+$/i;
type Reader = { from: (t: string) => { select: (c: string) => { eq: (k: string, v: number) => { maybeSingle: () => PromiseLike<{ data: { ai_models?: unknown } | null }> } } } };
export async function loadAiSettings(sb: unknown) {
  if (Date.now() - loadedAt < 60_000) return;
  try {
    const { data } = await (sb as Reader).from("app_settings").select("ai_models").eq("id", 1).maybeSingle();
    const raw = (data?.ai_models ?? {}) as Record<string, unknown>;
    chosen = Object.fromEntries(Object.entries(raw).filter(([k, v]) => k in MODELS && typeof v === "string" && MODEL_ID.test(v))) as typeof chosen;
    loadedAt = Date.now();
  } catch { /* Standard behalten */ }
}

export function aiFor(task: AiTask) {
  const t = MODELS[task];
  const model = chosen[task] ?? t.model;
  // Standardmodell bleibt Ausweichmodell, falls das gewählte ausfällt
  const fallbacks = [...new Set([...(model !== t.model ? [t.model] : []), ...t.fallbacks])].filter((m) => m !== model);
  return {
    model: gateway(model),
    providerOptions: { gateway: { models: fallbacks, disallowPromptTraining: true, tags: [`task:${task}`] } satisfies GatewayProviderOptions },
  };
}

/** „Heute ist Donnerstag, 29. Oktober 2026 (2026-10-29), deutsche Zeit.“ */
export function todayLine() {
  const now = new Date();
  const long = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const iso = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(now);
  return `HEUTE ist ${long} (${iso}), deutsche Zeit.`;
}
