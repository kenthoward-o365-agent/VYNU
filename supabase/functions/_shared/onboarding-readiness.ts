// Shared readiness computation for the Self Onboard agent.
// One source of truth used by onboarding-readiness, onboarding-chat (tool), and onboarding-go-live.

export type StageStatus = "done" | "in_progress" | "todo" | "n_a";

export interface ReadinessStage {
  id: string;
  title: string;
  blocker: boolean;
  status: StageStatus;
  detail: string;
  deep_link?: string;
}

export interface ReadinessResult {
  venue_id: string;
  stages: ReadinessStage[];
  blockers_total: number;
  blockers_done: number;
  score: number;            // 0-100
  ready_to_go_live: boolean;
  is_live: boolean;
  status: "in_progress" | "completed" | "dismissed";
  pos_choice: string | null;
}

export async function computeReadiness(sb: any, venueId: string): Promise<ReadinessResult> {
  const [venueRes, stateRes, menuCatRes, menuItemRes, modCatRes, tablesRes, taxRes,
    payRes, posRes, aiRes, staffRes, testRunRes] = await Promise.all([
    sb.from("venues").select("id,name,address,phone,timezone,logo_url,is_live").eq("id", venueId).maybeSingle(),
    sb.from("venue_onboarding_state").select("*").eq("venue_id", venueId).maybeSingle(),
    sb.from("menu_categories").select("id", { count: "exact", head: true }).eq("venue_id", venueId),
    sb.from("menu_items").select("id,price", { count: "exact" }).eq("venue_id", venueId).limit(50),
    sb.from("modifier_categories").select("id", { count: "exact", head: true }).eq("venue_id", venueId),
    sb.from("tables").select("id", { count: "exact", head: true }).eq("venue_id", venueId),
    sb.from("venue_taxes").select("id", { count: "exact", head: true }).eq("venue_id", venueId).eq("is_active", true),
    sb.from("venue_payment_config").select("merchant_status,is_active,environment").eq("venue_id", venueId).maybeSingle(),
    sb.from("venue_pos_integrations").select("pos_provider,connection_status,auto_push_orders").eq("venue_id", venueId).maybeSingle(),
    sb.from("venue_ai_config").select("agent_name,opening_message,venue_context").eq("venue_id", venueId).maybeSingle(),
    sb.from("venue_staff").select("id", { count: "exact", head: true }).eq("venue_id", venueId).eq("is_active", true),
    sb.from("onboarding_test_runs").select("passed,ran_at").eq("venue_id", venueId).order("ran_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const venue = venueRes.data;
  const state = stateRes.data;
  const menuItemsCount = menuItemRes.count ?? 0;
  const menuItemsPriced = (menuItemRes.data ?? []).filter((m: any) => Number(m.price) > 0).length;
  const posChoice: string | null = state?.pos_choice ?? null;
  const requiresPosPush = posChoice === "push_to_hl";

  const stages: ReadinessStage[] = [
    {
      id: "venue_details",
      title: "Venue details",
      blocker: true,
      status: venue?.name && venue?.address && venue?.phone && venue?.timezone ? "done" : "todo",
      detail: venue?.address ? `${venue.name} — ${venue.address}` : "Add address, phone, timezone.",
      deep_link: "/settings",
    },
    {
      id: "menu",
      title: "Menu (≥ 1 category, ≥ 5 priced items)",
      blocker: true,
      status: (menuCatRes.count ?? 0) > 0 && menuItemsPriced >= 5 ? "done" :
              (menuCatRes.count ?? 0) > 0 || menuItemsCount > 0 ? "in_progress" : "todo",
      detail: `${menuCatRes.count ?? 0} categories • ${menuItemsPriced}/${menuItemsCount} items with price`,
      deep_link: "/menu",
    },
    {
      id: "modifiers",
      title: "Modifiers (recommended)",
      blocker: false,
      status: (modCatRes.count ?? 0) > 0 ? "done" : "todo",
      detail: `${modCatRes.count ?? 0} modifier groups`,
      deep_link: "/modifiers",
    },
    {
      id: "tables",
      title: "Tables + QR codes",
      blocker: true,
      status: (tablesRes.count ?? 0) >= 1 ? "done" : "todo",
      detail: `${tablesRes.count ?? 0} tables`,
      deep_link: "/tables",
    },
    {
      id: "taxes",
      title: "Taxes (GST)",
      blocker: true,
      status: (taxRes.count ?? 0) >= 1 ? "done" : "todo",
      detail: (taxRes.count ?? 0) >= 1 ? "Tax configured" : "Add at least one tax (AU GST is 10% inclusive).",
      deep_link: "/settings",
    },
    {
      id: "payments",
      title: "H&L Pay onboarding",
      blocker: true,
      status: payRes.data?.merchant_status === "approved" && payRes.data?.is_active ? "done" :
              payRes.data ? "in_progress" : "todo",
      detail: payRes.data ? `Status: ${payRes.data.merchant_status}` : "Submit H&L Pay onboarding.",
      deep_link: "/settings/payments",
    },
    {
      id: "pos_choice",
      title: "POS strategy decision",
      blocker: true,
      status: posChoice ? "done" : "todo",
      detail: posChoice === "ornow_only"
        ? "Manage orders in H&L OrderNOW (no POS push)."
        : posChoice === "push_to_hl"
        ? "Push orders to H&L Exceed POS."
        : posChoice === "other_pos"
        ? "Other POS — manage orders in H&L OrderNOW."
        : "Decide where orders are managed.",
      deep_link: "/settings/integrations",
    },
    {
      id: "pos_connection",
      title: "H&L Exceed POS connection",
      blocker: requiresPosPush,
      status: !requiresPosPush ? "n_a" :
              posRes.data?.connection_status === "connected" ? "done" :
              posRes.data ? "in_progress" : "todo",
      detail: !requiresPosPush ? "Not required for your POS choice."
        : posRes.data?.connection_status === "connected" ? "Connected. Auto-push: " + (posRes.data.auto_push_orders ? "on" : "off")
        : "Add H&L credentials and test the connection.",
      deep_link: "/settings/integrations",
    },
    {
      id: "ai_config",
      title: "AI agent personality",
      blocker: true,
      status: aiRes.data?.agent_name && aiRes.data?.opening_message && (aiRes.data?.venue_context ?? "").length > 20 ? "done" :
              aiRes.data ? "in_progress" : "todo",
      detail: aiRes.data?.agent_name ? `Agent: ${aiRes.data.agent_name}` : "Name your AI agent and add venue context.",
      deep_link: "/settings/ai",
    },
    {
      id: "staff",
      title: "Staff invited",
      blocker: false,
      status: (staffRes.count ?? 0) >= 2 ? "done" : (staffRes.count ?? 0) >= 1 ? "in_progress" : "todo",
      detail: `${staffRes.count ?? 0} active staff`,
      deep_link: "/staff",
    },
    {
      id: "test_run",
      title: "End-to-end test order",
      blocker: true,
      status: testRunRes.data?.passed ? "done" : testRunRes.data ? "in_progress" : "todo",
      detail: testRunRes.data?.passed ? "Test passed." : "Run a scan → order → pay → kitchen → refund test.",
    },
  ];

  const blockers = stages.filter((s) => s.blocker && s.status !== "n_a");
  const blockersDone = blockers.filter((s) => s.status === "done").length;
  const score = blockers.length === 0 ? 100 : Math.round((blockersDone / blockers.length) * 100);

  return {
    venue_id: venueId,
    stages,
    blockers_total: blockers.length,
    blockers_done: blockersDone,
    score,
    ready_to_go_live: blockersDone === blockers.length,
    is_live: !!venue?.is_live,
    status: (state?.status as any) ?? "in_progress",
    pos_choice: posChoice,
  };
}
