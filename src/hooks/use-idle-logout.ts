import { useEffect, useRef, useState, useCallback } from "react";

interface Options {
  /** Total idle time before logout in seconds (default: 15 min — PCI DSS 8.1.8). */
  idleSeconds?: number;
  /** How long the warning modal is shown before forced logout (default: 60s). */
  warningSeconds?: number;
  /** Called when user is forcibly logged out. */
  onTimeout: () => void;
  /** Disable the timer (e.g., on auth pages). */
  enabled?: boolean;
}

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
  "visibilitychange",
];

/**
 * Tracks user activity and triggers a logout after a period of inactivity.
 * Shows a warning modal for the final `warningSeconds` of the idle window.
 * Defaults follow PCI DSS / SOC 2 guidance (15-minute idle session timeout).
 */
export function useIdleLogout({
  idleSeconds = 15 * 60,
  warningSeconds = 60,
  onTimeout,
  enabled = true,
}: Options) {
  const [warningOpen, setWarningOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(warningSeconds);
  const lastActivityRef = useRef<number>(Date.now());
  const intervalRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    lastActivityRef.current = Date.now();
    setWarningOpen(false);
    setSecondsLeft(warningSeconds);
  }, [warningSeconds]);

  useEffect(() => {
    if (!enabled) return;

    const handleActivity = () => {
      // Don't auto-reset if warning is showing — user must click "I'm still here"
      if (!warningOpen) lastActivityRef.current = Date.now();
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handleActivity, { passive: true })
    );

    intervalRef.current = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      const idleSec = Math.floor(idleMs / 1000);
      const remaining = idleSeconds - idleSec;

      if (remaining <= 0) {
        setWarningOpen(false);
        onTimeout();
        return;
      }
      if (remaining <= warningSeconds) {
        setWarningOpen(true);
        setSecondsLeft(remaining);
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, handleActivity)
      );
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [enabled, idleSeconds, warningSeconds, warningOpen, onTimeout]);

  return {
    warningOpen,
    secondsLeft,
    warningSeconds,
    reset,
    endNow: onTimeout,
  };
}
