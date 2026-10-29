import { gateway } from "ai";
import type { GatewayProviderOptions } from "@ai-sdk/gateway";

/**
 * KI über Vercel AI Gateway (auf Vercel per OIDC, lokal per AI_GATEWAY_API_KEY).
 * Kein Training mit deinen Daten (disallowPromptTraining).
 */
const MODELS = {
  read: { model: "anthropic/claude-sonnet-5.5", fallbacks: ["anthropic/claude-haiku-5.5"] },
  chat: { model: "anthropic/claude-sonnet-5.5", fallbacks: ["anthropic/claude-haiku-5.5"] },
  classify: { model: "anthropic/claude-haiku-5.5", fallbacks: ["google/gemini-3.5-flash"] },
  profile: { model: "anthropic/claude-sonnet-5.5", fallbacks: ["anthropic/claude-haiku-5.5"] },
} as const;

export function aiFor(task: keyof typeof MODELS) {
  const t = MODELS[task];
  return {
    model: gateway(t.model),
    providerOptions: { gateway: { models: [...t.fallbacks], disallowPromptTraining: true, tags: [`task:${task}`] } satisfies GatewayProviderOptions },
  };
}

/** „Heute ist Donnerstag, 29. Oktober 2026 (2026-10-29), deutsche Zeit.“ */
export function todayLine() {
  const now = new Date();
  const long = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const iso = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(now);
  return `HEUTE ist ${long} (${iso}), deutsche Zeit.`;
}
