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
  name: "get_menu",
  title: "Get menu",
  description: "Fetch menu categories and items for a venue.",
  inputSchema: {
    venue_id: z.string().uuid().describe("Venue ID whose menu to fetch."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ venue_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const [{ data: categories, error: cErr }, { data: items, error: iErr }] = await Promise.all([
      sb.from("menu_categories").select("id, name, display_order").eq("venue_id", venue_id).order("display_order"),
      sb.from("menu_items").select("id, name, description, price, category_id, is_available").eq("venue_id", venue_id).order("name"),
    ]);
    if (cErr) return { content: [{ type: "text", text: cErr.message }], isError: true };
    if (iErr) return { content: [{ type: "text", text: iErr.message }], isError: true };
    const menu = { categories: categories ?? [], items: items ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(menu, null, 2) }],
      structuredContent: menu,
    };
  },
});
