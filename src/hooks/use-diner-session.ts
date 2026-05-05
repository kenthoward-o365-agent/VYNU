import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseDinerSessionArgs {
  venueId?: string;
  tableId?: string | null;
  dinerId?: string | null;
  sessionMode?: string | null;
  idleMinutes?: number; // before the modal appears
  graceSeconds?: number; // modal countdown
  onSessionEnd?: (reason: "idle_timeout" | "manual_close") => void;
}

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"];

export function useDinerSession({
  venueId,
  tableId,
  dinerId,
  sessionMode,
  idleMinutes = 10,
  graceSeconds = 60,
  onSessionEnd,
}: UseDinerSessionArgs) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showIdleModal, setShowIdleModal] = useState(false);
  const [graceLeft, setGraceLeft] = useState(graceSeconds);
  const idleTimerRef = useRef<number | null>(null);
  const graceTimerRef = useRef<number | null>(null);
  const lastPingRef = useRef<number>(0);
  const endedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  // Create session row on mount
  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("diner_web_sessions")
        .insert({
          venue_id: venueId,
          table_id: tableId ?? null,
          diner_id: dinerId ?? null,
          session_mode: sessionMode ?? null,
          user_agent: navigator.userAgent.slice(0, 255),
        })
        .select("id")
        .single();
      if (cancelled || error || !data) return;
      setSessionId(data.id);
      sessionIdRef.current = data.id;
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only on venue/table mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, tableId]);

  const clearIdleTimer = () => {
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  };
  const clearGraceTimer = () => {
    if (graceTimerRef.current) {
      window.clearInterval(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  };

  const armIdleTimer = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      setGraceLeft(graceSeconds);
      setShowIdleModal(true);
    }, idleMinutes * 60 * 1000);
  }, [idleMinutes, graceSeconds]);

  const pingActivity = useCallback(async () => {
    if (!sessionIdRef.current || endedRef.current) return;
    const now = Date.now();
    if (now - lastPingRef.current < 15_000) return; // throttle
    lastPingRef.current = now;
    await supabase
      .from("diner_web_sessions")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", sessionIdRef.current)
      .is("ended_at", null);
  }, []);

  const endSession = useCallback(
    async (reason: "idle_timeout" | "manual_close" | "ordered") => {
      if (endedRef.current || !sessionIdRef.current) return;
      endedRef.current = true;
      clearIdleTimer();
      clearGraceTimer();
      setShowIdleModal(false);
      await supabase
        .from("diner_web_sessions")
        .update({ ended_at: new Date().toISOString(), end_reason: reason })
        .eq("id", sessionIdRef.current)
        .is("ended_at", null);
      if (reason !== "ordered") onSessionEnd?.(reason);
    },
    [onSessionEnd],
  );

  // Activity listeners
  useEffect(() => {
    if (!sessionId) return;
    const onActivity = () => {
      if (showIdleModal || endedRef.current) return;
      pingActivity();
      armIdleTimer();
    };
    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, onActivity, { passive: true }),
    );
    armIdleTimer();
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
      clearIdleTimer();
    };
  }, [sessionId, showIdleModal, armIdleTimer, pingActivity]);

  // Grace-period countdown
  useEffect(() => {
    if (!showIdleModal) return;
    clearGraceTimer();
    graceTimerRef.current = window.setInterval(() => {
      setGraceLeft((s) => {
        if (s <= 1) {
          clearGraceTimer();
          endSession("idle_timeout");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return clearGraceTimer;
  }, [showIdleModal, endSession]);

  // Tab-close beacon
  useEffect(() => {
    if (!sessionId) return;
    const onLeave = () => {
      if (endedRef.current) return;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-session-ping`;
      const blob = new Blob(
        [JSON.stringify({ session_id: sessionId, end_reason: "tab_closed" })],
        { type: "application/json" },
      );
      try {
        navigator.sendBeacon(url, blob);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [sessionId]);

  // Funnel markers
  const markAddToCart = useCallback(async (cartValueCents?: number) => {
    if (!sessionIdRef.current || endedRef.current) return;
    const patch: Record<string, unknown> = {
      items_added_count: undefined,
    };
    // Use raw RPC-style increment via two calls would be heavy; do a fetch + update in one round-trip.
    const { data: row } = await supabase
      .from("diner_web_sessions")
      .select("first_add_to_cart_at, items_added_count, cart_value_peak_cents")
      .eq("id", sessionIdRef.current)
      .maybeSingle();
    if (!row) return;
    const update: Record<string, unknown> = {
      items_added_count: (row.items_added_count ?? 0) + 1,
    };
    if (!row.first_add_to_cart_at) update.first_add_to_cart_at = new Date().toISOString();
    if (cartValueCents != null && cartValueCents > (row.cart_value_peak_cents ?? 0)) {
      update.cart_value_peak_cents = cartValueCents;
    }
    delete patch.items_added_count;
    await supabase
      .from("diner_web_sessions")
      .update(update)
      .eq("id", sessionIdRef.current);
  }, []);

  const markCheckout = useCallback(async () => {
    if (!sessionIdRef.current || endedRef.current) return;
    await supabase
      .from("diner_web_sessions")
      .update({ reached_checkout_at: new Date().toISOString() })
      .eq("id", sessionIdRef.current)
      .is("reached_checkout_at", null);
  }, []);

  const markOrderPlaced = useCallback(async (orderId: string) => {
    if (!sessionIdRef.current || endedRef.current) return;
    endedRef.current = true;
    clearIdleTimer();
    clearGraceTimer();
    await supabase
      .from("diner_web_sessions")
      .update({
        order_placed_at: new Date().toISOString(),
        order_id: orderId,
        ended_at: new Date().toISOString(),
        end_reason: "ordered",
      })
      .eq("id", sessionIdRef.current);
  }, []);

  const stayActive = useCallback(() => {
    setShowIdleModal(false);
    pingActivity();
    armIdleTimer();
  }, [pingActivity, armIdleTimer]);

  const endNow = useCallback(() => endSession("manual_close"), [endSession]);

  return {
    sessionId,
    showIdleModal,
    graceLeft,
    stayActive,
    endNow,
    markAddToCart,
    markCheckout,
    markOrderPlaced,
  };
}
