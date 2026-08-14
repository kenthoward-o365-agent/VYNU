// Single owner of every outbound AI call.
//
// WHY THIS EXISTS
// Twelve edge functions each built their own fetch to
// https://ai.gateway.lovable.dev/v1/chat/completions, each hard-coding the URL,
// the bearer token, a vendor model id, and its own copy of the 429/402 error
// mapping. Migrating providers meant twelve near-identical diffs with twelve
// chances to miss one. This module makes it a single change.
//
// TWO RULES FOR CALLERS
//   1. Ask for a ROLE ("chat", "image"), not a vendor model string. The role →
//      model mapping lives here and only here.
//   2. Never read LOVABLE_API_KEY or the gateway URL directly again.
//
// SWITCHING PROVIDERS
// The defaults below reproduce today's behaviour exactly, so adopting this
// module changes nothing at runtime. To move off Lovable, set env vars — no code
// change:
//
//   AI_GATEWAY_URL   full chat-completions URL of an OpenAI-compatible provider
//   AI_API_KEY       that provider's key (falls back to LOVABLE_API_KEY)
//   AI_MODEL_CHAT / AI_MODEL_CHAT_ADVANCED / AI_MODEL_IMAGE / AI_MODEL_IMAGE_EDIT
//
// A provider that is NOT OpenAI-compatible (e.g. the Anthropic Messages API)
// needs a real adapter inside `aiChat` rather than an env var. That is the one
// place to add it.
//
// Cost note: ai_usage_log prices come from the ai_model_prices table keyed by
// model id. Changing AI_MODEL_* without adding a matching price row silently
// logs every call at zero cost, and platform financials go quietly wrong.

import { logAiUsage, logAiImageUsage } from "./ai-usage.ts";

const DEFAULT_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** Capability a call needs, decoupled from whichever vendor model provides it. */
export type ModelRole = "chat" | "chat-advanced" | "image" | "image-edit";

/** Exactly the models in use before this module existed — do not "tidy" these. */
const DEFAULT_MODELS: Record<ModelRole, string> = {
  "chat": "google/gemini-2.5-flash",
  "chat-advanced": "google/gemini-3-flash-preview",
  "image": "google/gemini-3.1-flash-image-preview",
  "image-edit": "google/gemini-2.5-flash-image",
};

const MODEL_ENV_VAR: Record<ModelRole, string> = {
  "chat": "AI_MODEL_CHAT",
  "chat-advanced": "AI_MODEL_CHAT_ADVANCED",
  "image": "AI_MODEL_IMAGE",
  "image-edit": "AI_MODEL_IMAGE_EDIT",
};

/** Resolves a role to a concrete model id, env override winning. */
export function resolveModel(role: ModelRole): string {
  return Deno.env.get(MODEL_ENV_VAR[role])?.trim() || DEFAULT_MODELS[role];
}

function gatewayUrl(): string {
  return Deno.env.get("AI_GATEWAY_URL")?.trim() || DEFAULT_GATEWAY_URL;
}

function apiKey(): string {
  const key = Deno.env.get("AI_API_KEY")?.trim() || Deno.env.get("LOVABLE_API_KEY")?.trim();
  if (!key) {
    throw new AiError(500, "AI is not configured.", "neither AI_API_KEY nor LOVABLE_API_KEY is set");
  }
  return key;
}

/**
 * An AI call that failed in a way the caller should surface.
 *
 * `publicMessage` is safe to return to a diner or operator. `cause` is for logs
 * only — upstream bodies can carry prompt text and provider internals, so it
 * must never reach a response (see _shared/safe-error.ts for the same rule).
 */
export class AiError extends Error {
  readonly status: number;
  readonly publicMessage: string;

  constructor(status: number, publicMessage: string, cause?: string) {
    super(cause ? `${publicMessage} (${cause})` : publicMessage);
    this.name = "AiError";
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

/**
 * Maps an upstream failure to an AiError, preserving the status semantics the
 * twelve call sites already relied on:
 *   429 → rate limited, retry
 *   402 → provider credits exhausted (Lovable-gateway specific; other providers
 *         signal billing differently, so revisit this on migration)
 * anything else → 500 with a generic message, matching the previous behaviour
 * where a thrown Error fell through to each function's catch.
 */
function upstreamError(status: number, body: string): AiError {
  if (status === 429) return new AiError(429, "Rate limited, please try again shortly.", body.slice(0, 200));
  if (status === 402) return new AiError(402, "AI credits exhausted.", body.slice(0, 200));
  return new AiError(500, "AI request failed.", `${status} ${body.slice(0, 500)}`);
}

export interface AiUsageContext {
  venueId: string;
  /** Matches the `feature` values already in ai_usage_log, e.g. "diner_chat". */
  feature: string;
  requestId?: string | null;
  sessionId?: string | null;
  orderId?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface AiChatOptions {
  messages: unknown[];
  /** Defaults to "chat". Ignored when `model` is set. */
  role?: ModelRole;
  /** Escape hatch for a specific model id. Prefer `role`. */
  model?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: unknown[];
  toolChoice?: unknown;
  responseFormat?: unknown;
  /** Gemini-style multimodal output, e.g. ["image", "text"]. */
  modalities?: string[];
  signal?: AbortSignal;
  /**
   * Abort after this many ms, surfacing AiError(504).
   *
   * Deliberately has NO default, so adopting this module changes no existing
   * behaviour. Note that only 1 of the 12 original call sites had a timeout at
   * all — the other 11 can hang until the edge runtime kills them, which for
   * diner-chat means a diner watching a spinner. Giving this a sensible default
   * (~30s for chat) is a worthwhile follow-up once the calls can be tested.
   */
  timeoutMs?: number;
  /** When present, token usage and cost are logged to ai_usage_log. */
  usage?: AiUsageContext;
}

export interface AiChatResult {
  /** Full upstream payload, for callers needing fields not surfaced here. */
  raw: any;
  /** choices[0].message — read `.tool_calls` for tool-using calls. */
  message: any;
  /** choices[0].message.content, or "" when the model returned no text. */
  text: string;
  /** The model actually used, after role/env resolution. */
  model: string;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
}

/**
 * One chat completion. Throws AiError on any non-2xx or unparseable response.
 *
 * Optional fields are omitted from the request body rather than sent as
 * undefined, so the wire format is byte-identical to the hand-rolled calls this
 * replaces.
 */
export async function aiChat(opts: AiChatOptions): Promise<AiChatResult> {
  const model = opts.model || resolveModel(opts.role || "chat");

  const body: Record<string, unknown> = { model, messages: opts.messages };
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.tools !== undefined) body.tools = opts.tools;
  if (opts.toolChoice !== undefined) body.tool_choice = opts.toolChoice;
  if (opts.responseFormat !== undefined) body.response_format = opts.responseFormat;
  if (opts.modalities !== undefined) body.modalities = opts.modalities;

  // A caller signal and a timeout both need to abort the same fetch, so combine
  // them behind one controller rather than making callers choose.
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onCallerAbort, { once: true });
  const timeoutId = opts.timeoutMs !== undefined
    ? setTimeout(() => controller.abort(), opts.timeoutMs)
    : undefined;

  let response: Response;
  try {
    response = await fetch(gatewayUrl(), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof AiError) throw e; // missing key, surfaced by apiKey()
    // A caller-initiated abort is not a timeout — only claim 504 when our own
    // timer fired and the caller's signal is not the one that aborted.
    if (e instanceof Error && e.name === "AbortError") {
      if (opts.timeoutMs !== undefined && !opts.signal?.aborted) {
        throw new AiError(504, "AI request timed out.", `after ${opts.timeoutMs}ms`);
      }
      throw new AiError(499, "AI request cancelled.", "aborted by caller");
    }
    throw new AiError(500, "AI request failed.", `network: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    opts.signal?.removeEventListener("abort", onCallerAbort);
  }

  if (!response.ok) {
    throw upstreamError(response.status, await response.text().catch(() => ""));
  }

  let raw: any;
  try {
    raw = await response.json();
  } catch {
    throw new AiError(500, "AI request failed.", "upstream returned a non-JSON body");
  }

  const message = raw?.choices?.[0]?.message ?? null;
  const usage = raw?.usage ?? null;

  if (opts.usage) {
    // Deliberately awaited: an edge function may be torn down the instant it
    // responds, and a floating insert would be lost. logAiUsage swallows its
    // own errors, so this cannot fail the request.
    await logAiUsage({
      venueId: opts.usage.venueId,
      feature: opts.usage.feature,
      model,
      usage,
      requestId: opts.usage.requestId ?? null,
      sessionId: opts.usage.sessionId ?? null,
      orderId: opts.usage.orderId ?? null,
      meta: opts.usage.meta ?? null,
    });
  }

  return {
    raw,
    message,
    text: typeof message?.content === "string" ? message.content : "",
    model,
    usage,
  };
}

export interface AiImageOptions {
  /** Plain text prompt, or a full multimodal content array for edits. */
  prompt: string | unknown[];
  /** "image" to generate, "image-edit" to transform an input image. */
  role?: Extract<ModelRole, "image" | "image-edit">;
  model?: string;
  signal?: AbortSignal;
  /** See AiChatOptions.timeoutMs — no default. */
  timeoutMs?: number;
  /** When present, per-image cost is logged via logAiImageUsage. */
  usage?: AiUsageContext;
}

export interface AiImageResult {
  /**
   * The generated image as returned by the provider — a data: URI in practice.
   * Callers historically passed this straight through as `generatedImageBase64`,
   * so it is handed back verbatim rather than re-encoded.
   */
  imageUrl: string;
  model: string;
  raw: any;
}

/**
 * Image generation, which this gateway exposes through chat-completions with
 * `modalities: ["image", "text"]` rather than a dedicated images endpoint.
 *
 * Throws AiError(500) when the model returns no image — previously each call
 * site logged and returned its own 500 for this case.
 */
export async function aiImage(opts: AiImageOptions): Promise<AiImageResult> {
  const result = await aiChat({
    messages: [{ role: "user", content: opts.prompt }],
    role: opts.role || "image",
    model: opts.model,
    modalities: ["image", "text"],
    signal: opts.signal,
    timeoutMs: opts.timeoutMs,
    // Images are priced per call, not per token — logged below instead.
  });

  const imageUrl = result.raw?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imageUrl || typeof imageUrl !== "string") {
    throw new AiError(500, "No image returned from AI.", JSON.stringify(result.raw).slice(0, 500));
  }

  if (opts.usage) {
    await logAiImageUsage({
      venueId: opts.usage.venueId,
      feature: opts.usage.feature,
      model: result.model,
      requestId: opts.usage.requestId ?? null,
      sessionId: opts.usage.sessionId ?? null,
      orderId: opts.usage.orderId ?? null,
      meta: opts.usage.meta ?? null,
      images: 1,
    });
  }

  return { imageUrl, model: result.model, raw: result.raw };
}

/**
 * Turns an AiError into the JSON response shape these functions already return.
 * Non-AiError values become a generic 500 — never echo an unknown error body,
 * which may carry prompt content or provider internals.
 */
export function aiErrorResponse(err: unknown, corsHeaders: Record<string, string>): Response {
  const isAi = err instanceof AiError;
  if (!isAi) console.error("[ai] unexpected error:", err);
  return new Response(
    JSON.stringify({ error: isAi ? err.publicMessage : "AI request failed." }),
    {
      status: isAi ? err.status : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
