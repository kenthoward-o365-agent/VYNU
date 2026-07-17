import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listVenues from "./tools/list-venues";
import listOrders from "./tools/list-orders";
import getMenu from "./tools/get-menu";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "hl-ordernow-mcp",
  title: "H&L OrderNOW",
  version: "0.1.0",
  instructions:
    "Tools for H&L OrderNOW venue operators. Use `list_venues` to discover venues the signed-in user manages, `get_menu` to read a venue's menu, and `list_orders` to inspect recent orders. All calls act as the authenticated user and respect the app's row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listVenues, getMenu, listOrders],
});
