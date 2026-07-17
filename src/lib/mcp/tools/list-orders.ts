import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_orders",
  title: "List recent orders",
  description: "List recent orders for a venue the signed-in user can access.",
  inputSchema: {
    venue_id: z.string().uuid().describe("Venue ID to list orders for."),
    limit: z.number().int().min(1).max(100).optional().describe("Max orders to return (default 20)."),
    status: z.string().optional().describe("Optional status filter (e.g. 'placed', 'in_progress', 'completed')."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ venue_id, limit, status }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("orders")
      .select("id, status, total_amount, created_at, table_id, diner_id")
      .eq("venue_id", venue_id)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { orders: data ?? [] },
    };
  },
});
