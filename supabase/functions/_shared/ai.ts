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
// The Anthropic (Claude) provider has a real adapter at the bottom of this
// file — the Messages API is not OpenAI-compatible, so env vars alone cannot
// reach it. Activate with AI_PROVIDER=anthropic + ANTHROPIC_API_KEY; tune the
// model per role with the same AI_MODEL_* vars (claude-* ids only). Image
// roles always stay on the gateway — Claude does not generate images.
//
// Cost note: ai_usage_log prices come from the ai_model_prices table keyed by
// model id. Changing AI_MODEL_* without adding a matching price row silently
// logs every call at zero cost, and platform financials go quietly wrong.

import Anthropic from "npm:@anthropic-ai/sdk@0.117.1";
import { logAiUsage, logAiImageUsage } from "./ai-usage.ts";

const DEFAULT_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

/**
 * Provider switch. Set AI_PROVIDER=anthropic (plus ANTHROPIC_API_KEY) in
 * Supabase secrets to serve all *chat* roles through the Claude Messages API.
 * Unset, everything stays on the OpenAI-compatible gateway exactly as before.
 *
 * Image roles ("image", "image-edit") ALWAYS use the gateway path: Claude does
 * not generate images, so those stay on the Gemini image models regardless of
 * provider.
 */
function anthropicEnabled(): boolean {
  return (
    Deno.env.get("AI_PROVIDER")?.trim().toLowerCase() === "anthropic" &&
    !!Deno.env.get("ANTHROPIC_API_KEY")?.trim()
  );
}

/**
 * Model for a chat role under the anthropic provider. The same AI_MODEL_* env
 * vars apply, but only claude-* values are honoured — a leftover Gemini id
 * must not be sent to the Messages API. Default claude-opus-5 for both chat
 * tiers; tune per role via env (e.g. AI_MODEL_CHAT=claude-haiku-4-5 for the
 * high-volume diner path) after reviewing real spend in ai_usage_log.
 */
function resolveAnthropicModel(role: ModelRole): string {
  const envVal = Deno.env.get(MODEL_ENV_VAR[role])?.trim();
  if (envVal?.startsWith("claude-")) return envVal;
  return "claude-opus-5";
}

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

/**
 * Whether the gateway path (image roles, and chat when Anthropic is off) has a
 * key at all. Image features should fail fast with a clear config error rather
 * than march a whole batch of items into per-item "AI is not configured"
 * failures — that read as "finished but generated nothing" in the UI.
 */
export function gatewayConfigured(): boolean {
  return !!(Deno.env.get("AI_API_KEY")?.trim() || Deno.env.get("LOVABLE_API_KEY")?.trim());
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
  // Image-modality calls stay on the gateway (see anthropicEnabled docs).
  if (!opts.modalities?.includes("image") && anthropicEnabled()) {
    return await anthropicChat(opts);
  }

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

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic (Claude) provider adapter
//
// The nine chat call sites speak the OpenAI chat-completions shape — messages
// with a "tool" role, assistant messages carrying `tool_calls`, tools wrapped
// in {type:"function", function:{...}}. The Claude Messages API uses a
// different wire format (top-level system, tool_use/tool_result content
// blocks, input_schema tools), so this adapter translates BOTH directions and
// call sites never change: aiChat() returns the same AiChatResult either way,
// and a tool loop that pushes `ai.message` back into history round-trips
// cleanly because that message is already in OpenAI form.
//
// Deliberate choices, documented once:
//  * temperature is DROPPED — current Claude models (Opus 5 / Sonnet 5) reject
//    sampling params with a 400; behaviour is steered by prompting instead.
//  * max_tokens is floored at 4096 — thinking is on by default on Claude Opus 5
//    and counts against max_tokens, so a tight text budget (diner-chat passes
//    500) would truncate mid-answer.
//  * forced tool_choice sends thinking:{type:"disabled"} — forced tool use and
//    thinking are incompatible, and the response is a guaranteed tool_use
//    block, so disabled-thinking's text-instead-of-tool-call failure mode
//    cannot occur here.
//  * responseFormat {type:"json_object"} becomes a system-prompt instruction —
//    it is schema-less, and both callers already parse leniently.
// ─────────────────────────────────────────────────────────────────────────────

/** OpenAI-style multimodal content part → Anthropic content block. */
function toAnthropicUserBlock(part: any): any {
  if (part?.type === "text") return { type: "text", text: part.text };
  if (part?.type === "image_url") {
    const url: string = part.image_url?.url ?? "";
    const dataMatch = url.match(/^data:([^;]+);base64,(.*)$/s);
    if (dataMatch) {
      const [, mediaType, data] = dataMatch;
      if (mediaType === "application/pdf") {
        return { type: "document", source: { type: "base64", media_type: mediaType, data } };
      }
      return { type: "image", source: { type: "base64", media_type: mediaType, data } };
    }
    return { type: "image", source: { type: "url", url } };
  }
  // Unknown part — stringify rather than drop, so nothing silently vanishes.
  return { type: "text", text: JSON.stringify(part) };
}

/**
 * OpenAI-style message list → { system, messages } for the Messages API.
 * - system-role entries concatenate into the top-level system string
 * - assistant tool_calls become tool_use blocks
 * - consecutive "tool" results merge into ONE user turn of tool_result blocks
 *   (the Messages API expects all results for a turn together)
 */
function toAnthropicMessages(input: any[]): { system: string; messages: any[] } {
  const systemParts: string[] = [];
  const out: any[] = [];
  let pendingToolResults: any[] | null = null;

  const flushToolResults = () => {
    if (pendingToolResults?.length) out.push({ role: "user", content: pendingToolResults });
    pendingToolResults = null;
  };

  for (const m of input) {
    if (m.role === "system") {
      flushToolResults();
      systemParts.push(typeof m.content === "string" ? m.content : JSON.stringify(m.content));
      continue;
    }
    if (m.role === "tool") {
      (pendingToolResults ??= []).push({
        type: "tool_result",
        tool_use_id: m.tool_call_id,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      });
      continue;
    }
    flushToolResults();
    if (m.role === "assistant") {
      const blocks: any[] = [];
      if (typeof m.content === "string" && m.content) blocks.push({ type: "text", text: m.content });
      for (const call of m.tool_calls ?? []) {
        let args: unknown = {};
        try { args = JSON.parse(call.function?.arguments || "{}"); } catch { /* keep {} */ }
        blocks.push({ type: "tool_use", id: call.id, name: call.function?.name, input: args });
      }
      if (blocks.length) out.push({ role: "assistant", content: blocks });
      continue;
    }
    // user
    const content = Array.isArray(m.content) ? m.content.map(toAnthropicUserBlock) : m.content;
    out.push({ role: "user", content });
  }
  flushToolResults();
  return { system: systemParts.join("\n\n"), messages: out };
}

async function anthropicChat(opts: AiChatOptions): Promise<AiChatResult> {
  const model =
    opts.model?.startsWith("claude-") ? opts.model : resolveAnthropicModel(opts.role || "chat");

  const { system, messages } = toAnthropicMessages(opts.messages as any[]);
  let systemPrompt = system;
  if ((opts.responseFormat as any)?.type === "json_object") {
    systemPrompt += "\n\nRespond with a single valid JSON object and nothing else — no prose, no markdown fences.";
  }

  const tools = (opts.tools as any[] | undefined)?.map((t) => ({
    name: t.function?.name ?? t.name,
    description: t.function?.description ?? t.description,
    input_schema: t.function?.parameters ?? t.input_schema,
  }));

  const tc = opts.toolChoice as any;
  const toolChoice =
    tc === "auto" ? { type: "auto" as const }
    : tc?.type === "function" && tc.function?.name ? { type: "tool" as const, name: tc.function.name }
    : undefined;
  const forcedTool = toolChoice?.type === "tool";

  // Same combined caller-signal + timeout handling as the gateway path.
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onCallerAbort, { once: true });
  const timeoutId = opts.timeoutMs !== undefined
    ? setTimeout(() => controller.abort(), opts.timeoutMs)
    : undefined;

  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

  let response: Anthropic.Message;
  try {
    response = await client.messages.create(
      {
        model,
        max_tokens: Math.max(opts.maxTokens ?? 8192, 4096),
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages,
        ...(tools?.length ? { tools } : {}),
        ...(toolChoice ? { tool_choice: toolChoice } : {}),
        ...(forcedTool ? { thinking: { type: "disabled" as const } } : {}),
      },
      { signal: controller.signal },
    );
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      const status = e.status ?? 500;
      if (status === 429) throw new AiError(429, "Rate limited, please try again shortly.", `anthropic ${status}`);
      throw new AiError(500, "AI request failed.", `anthropic ${status} ${String(e.message).slice(0, 300)}`);
    }
    if (e instanceof Error && e.name === "AbortError") {
      if (opts.timeoutMs !== undefined && !opts.signal?.aborted) {
        throw new AiError(504, "AI request timed out.", `after ${opts.timeoutMs}ms`);
      }
      throw new AiError(499, "AI request cancelled.", "aborted by caller");
    }
    throw new AiError(500, "AI request failed.", `anthropic network: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    opts.signal?.removeEventListener("abort", onCallerAbort);
  }

  // ---- translate the response back to the OpenAI shape call sites consume ----
  const textParts: string[] = [];
  const toolCalls: any[] = [];
  for (const block of response.content) {
    if (block.type === "text") textParts.push(block.text);
    else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: { name: block.name, arguments: JSON.stringify(block.input) },
      });
    }
    // thinking blocks are omitted-by-default and never surfaced to callers
  }

  const finishReason =
    response.stop_reason === "tool_use" ? "tool_calls"
    : response.stop_reason === "max_tokens" ? "length"
    : "stop";

  const usage = {
    prompt_tokens: response.usage.input_tokens,
    completion_tokens: response.usage.output_tokens,
    total_tokens: response.usage.input_tokens + response.usage.output_tokens,
  };

  const message = {
    role: "assistant",
    content: textParts.join("") || null,
    ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
  };

  if (opts.usage) {
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
    raw: { choices: [{ message, finish_reason: finishReason }], usage, model: response.model },
    message,
    text: textParts.join(""),
    model,
    usage,
  };
}
