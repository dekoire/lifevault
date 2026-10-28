import { gateway } from "ai";
import type { GatewayProviderOptions } from "@ai-sdk/gateway";

/**
 * KI über Vercel AI Gateway (auf Vercel per OIDC, lokal per AI_GATEWAY_API_KEY).
 * Kein Training mit deinen Daten (disallowPromptTraining).
 */
const MODELS = {
  read: { model: "anthropic/claude-sonnet-5.5", fallbacks: ["anthropic/claude-haiku-5.5"] },
  chat: { model: "anthropic/claude-sonnet-5.5", fallbacks: ["anthropic/claude-haiku-5.5"] },
} as const;

export function aiFor(task: keyof typeof MODELS) {
  const t = MODELS[task];
  return {
    model: gateway(t.model),
    providerOptions: { gateway: { models: [...t.fallbacks], disallowPromptTraining: true, tags: [`task:${task}`] } satisfies GatewayProviderOptions },
  };
}
