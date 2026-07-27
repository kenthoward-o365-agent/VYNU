import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { computeReadiness } from "../_shared/onboarding-readiness.ts";

const LOVABLE_API_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------- Tool definitions ----------
const tools = [
  {
    type: "function",
    function: {
      name: "get_readiness",
      description: "Refresh and return the current onboarding readiness checklist for this venue.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "set_venue_details",
      description: "Update basic venue details. Only provided fields will be updated.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          address: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          postcode: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          timezone: { type: "string" },
          venue_type: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_tables_bulk",
      description: "Create multiple tables for the venue. Skips duplicates by table_number.",
      parameters: {
        type: "object",
        properties: {
          tables: {
            type: "array",
            items: {
              type: "object",
              properties: {
                table_number: { type: "string" },
                zone: { type: "string" },
                capacity: { type: "number" },
              },
              required: ["table_number"],
            },
          },
        },
        required: ["tables"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_tax",
      description: "Add a tax rate. Australian default is GST 10% inclusive.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          rate: { type: "number", description: "Percent value, e.g. 10 for 10%." },
          inclusive: { type: "boolean" },
        },
        required: ["name", "rate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_ai_config",
      description: "Configure the AI agent personality shown to diners.",
      parameters: {
        type: "object",
        properties: {
          agent_name: { type: "string" },
          opening_message: { type: "string" },
          tone: { type: "string", enum: ["aussie", "british", "north_american"] },
          venue_context: { type: "string", description: "Free-text background about the venue used to ground diner answers." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_pos_choice",
      description: "Record the venue's POS strategy decision.",
      parameters: {
        type: "object",
        properties: {
          choice: { type: "string", enum: ["ornow_only", "push_to_hl", "other_pos"] },
          pos_vendor: { type: "string", description: "Vendor name if known (e.g. 'H&L Exceed', 'Lightspeed', 'Square')." },
        },
        required: ["choice"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "toggle_auto_push_orders",
      description: "Enable or disable automatic order push to the connected H&L Exceed POS.",
      parameters: {
        type: "object",
        properties: { enabled: { type: "boolean" } },
        required: ["enabled"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_test_run",
      description: "Record the result of an end-to-end test order run.",
      parameters: {
        type: "object",
        properties: {
          passed: { type: "boolean" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                step: { type: "string" },
                passed: { type: "boolean" },
                evidence: { type: "string" },
              },
              required: ["step", "passed"],
            },
          },
        },
        required: ["passed", "steps"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_onboarding_complete",
      description: "Mark onboarding as completed and hide the Self Onboard button.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "dismiss_onboarding",
      description: "Hide the Self Onboard button without marking complete. User can reopen from Settings.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ---------- Tool runner ----------
async function runTool(
  sb: any,
  venueId: string,
  userId: string,
  name: string,
  args: any,
): Promise<any> {
  switch (name) {
    case "get_readiness": {
      return await computeReadiness(sb, venueId);
    }
    case "set_venue_details": {
      const allowed = ["name", "address", "city", "state", "postcode", "phone", "email", "timezone", "venue_type"];
      const patch: Record<string, any> = {};
      for (const k of allowed) if (args[k] !== undefined) patch[k] = args[k];
      if (Object.keys(patch).length === 0) return { ok: false, error: "No fields to update." };
      const { error } = await sb.from("venues").update(patch).eq("id", venueId);
      return error ? { ok: false, error: error.message } : { ok: true, updated: Object.keys(patch) };
    }
    case "add_tables_bulk": {
      const rows = (args.tables || []).map((t: any) => ({
        venue_id: venueId,
        table_number: String(t.table_number),
        zone: t.zone ?? null,
        capacity: t.capacity ?? 4,
      }));
      if (rows.length === 0) return { ok: false, error: "No tables provided." };
      const { data, error } = await sb.from("tables")
        .upsert(rows, { onConflict: "venue_id,table_number", ignoreDuplicates: true })
        .select("id,table_number");
      return error ? { ok: false, error: error.message } : { ok: true, created: data?.length ?? 0, total_requested: rows.length };
    }
    case "add_tax": {
      const { error } = await sb.from("venue_taxes").insert({
        venue_id: venueId,
        name: args.name,
        rate: args.rate,
        is_inclusive: args.inclusive ?? true,
        is_active: true,
      });
      return error ? { ok: false, error: error.message } : { ok: true };
    }
    case "set_ai_config": {
      const patch: Record<string, any> = { venue_id: venueId };
      for (const k of ["agent_name", "opening_message", "tone", "venue_context"]) {
        if (args[k] !== undefined) patch[k] = args[k];
      }
      const { error } = await sb.from("venue_ai_config").upsert(patch, { onConflict: "venue_id" });
      return error ? { ok: false, error: error.message } : { ok: true };
    }
    case "set_pos_choice": {
      const { error } = await sb.from("venue_onboarding_state").upsert({
        venue_id: venueId,
        pos_choice: args.choice,
        pos_vendor: args.pos_vendor ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "venue_id" });
      return error ? { ok: false, error: error.message } : { ok: true };
    }
    case "toggle_auto_push_orders": {
      const { data: existing } = await sb.from("venue_pos_integrations").select("id").eq("venue_id", venueId).maybeSingle();
      if (!existing) return { ok: false, error: "No POS integration configured yet." };
      const { error } = await sb.from("venue_pos_integrations")
        .update({ auto_push_orders: !!args.enabled })
        .eq("venue_id", venueId);
      return error ? { ok: false, error: error.message } : { ok: true, enabled: !!args.enabled };
    }
    case "record_test_run": {
      const { error } = await sb.from("onboarding_test_runs").insert({
        venue_id: venueId,
        passed: !!args.passed,
        steps: args.steps ?? [],
      });
      return error ? { ok: false, error: error.message } : { ok: true };
    }
    case "mark_onboarding_complete": {
      const now = new Date().toISOString();
      const { error } = await sb.from("venue_onboarding_state").upsert({
        venue_id: venueId, status: "completed", completed_at: now, updated_at: now,
      }, { onConflict: "venue_id" });
      return error ? { ok: false, error: error.message } : { ok: true };
    }
    case "dismiss_onboarding": {
      const now = new Date().toISOString();
      const { error } = await sb.from("venue_onboarding_state").upsert({
        venue_id: venueId, status: "dismissed", dismissed_at: now, updated_at: now,
      }, { onConflict: "venue_id" });
      return error ? { ok: false, error: error.message } : { ok: true };
    }
  }
  return { ok: false, error: `Unknown tool: ${name}` };
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { venue_id, message, history = [] } = await req.json();
    if (!venue_id || !message) {
      return new Response(JSON.stringify({ error: "venue_id and message required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auth = req.headers.get("Authorization") ?? "";
    const sbUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: userRes } = await sbUser.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userRes.user.id;
    const { data: isManager } = await sbUser.rpc("is_venue_manager", { _user_id: userId, _venue_id: venue_id });
    if (!isManager) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Snapshot readiness for grounding
    const readiness = await computeReadiness(sb, venue_id);

    const systemPrompt = `You are H&L OrderNOW's onboarding specialist for hospitality venues in Australia.
Your job: take this venue live as quickly, accurately, and confidently as possible — answering any question along the way so they don't need to contact support.

CURRENT VENUE READINESS (score ${readiness.score}/100, ${readiness.blockers_done}/${readiness.blockers_total} blockers done):
${readiness.stages.map((s) => `- [${s.status}] ${s.title} — ${s.detail}${s.blocker ? " (blocker)" : ""}`).join("\n")}
POS choice: ${readiness.pos_choice ?? "not yet decided"}

OPERATING RULES:
- Be warm, direct, and concise. Use plain English; assume the user runs a venue, not an IT department.
- Pick the highest-impact incomplete blocker and guide them through it next.
- When you need information from the user, ask ONE question at a time.
- Use tools to actually do things (update venue, add tables/taxes, configure AI, record decisions, push test results). Confirm in chat what you did.
- For POS choice, ask: "Will you manage orders inside H&L OrderNOW, or push them to your POS?" Default to ornow_only when unsure. Only choose push_to_hl when the venue confirms they run H&L Exceed.
- For tables, accept loose input like "12 tables, 1-10 floor, P1-P2 patio" — parse it and use add_tables_bulk.
- Australian default tax is GST 10% inclusive. Offer it as a one-tap accept.
- Never ask for, store, or echo H&L POS client_secret or shared_secret in chat. Direct the user to Settings → Integrations → H&L POS → Configure for those, then come back and run the test order.
- Markdown is fine. Keep replies under ~120 words unless explaining a concept.
- If the user asks how something works (refunds, throttling, QR codes, H&L Pay), answer clearly and link them with a short markdown link to the relevant settings/page.
- When all blockers are done, congratulate them and offer to hide the Self Onboard button via mark_onboarding_complete.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ];

    // Persist the user message
    await sb.from("onboarding_chat_messages").insert({
      venue_id, user_id: userId, role: "user", parts: [{ type: "text", text: message }],
    });

    // Tool-calling loop (up to 6 iterations)
    const toolEvents: any[] = [];
    let assistantText = "";

    for (let i = 0; i < 6; i++) {
      const resp = await fetch(LOVABLE_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          tools,
          tool_choice: "auto",
          temperature: 0.4,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        if (resp.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (resp.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        throw new Error(`AI gateway ${resp.status}: ${errText}`);
      }

      const data = await resp.json();
      const choice = data.choices?.[0];
      const msg = choice?.message;
      if (!msg) break;

      messages.push(msg);

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) {
        assistantText = msg.content ?? "";
        break;
      }

      for (const call of toolCalls) {
        let args: any = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* noop */ }
        const result = await runTool(sb, venue_id, userId, call.function.name, args);
        toolEvents.push({ name: call.function.name, args, result });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }

      if (choice.finish_reason === "stop") {
        assistantText = msg.content ?? "";
        break;
      }
    }

    if (!assistantText) {
      assistantText = "Done.";
    }

    // Final readiness after tool calls (if any tools mutated state)
    const finalReadiness = toolEvents.length > 0
      ? await computeReadiness(sb, venue_id)
      : readiness;

    await sb.from("onboarding_chat_messages").insert({
      venue_id, user_id: userId, role: "assistant",
      parts: [{ type: "text", text: assistantText }, ...(toolEvents.length ? [{ type: "tools", events: toolEvents }] : [])],
    });

    return new Response(JSON.stringify({
      reply: assistantText,
      tool_events: toolEvents,
      readiness: finalReadiness,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("onboarding-chat error", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
