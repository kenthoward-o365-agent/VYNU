import { useEffect, useState, useCallback, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, X } from "lucide-react";
import {
  COPILOT_WALKTHROUGH_EVENT,
  getWalkthrough,
  type Walkthrough,
  type WalkthroughStep,
} from "./walkthroughs";
import { cn } from "@/lib/utils";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;

function useTargetRect(selector: string | undefined, deps: unknown[]): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    let cancelled = false;
    let raf = 0;
    let attempts = 0;

    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        // Try to make sure it's visible
        el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else if (attempts < 40) {
        attempts++;
        raf = window.setTimeout(measure, 100) as unknown as number;
      } else {
        setRect(null);
      }
    };

    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      cancelled = true;
      window.clearTimeout(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, ...deps]);

  return rect;
}

function computeTooltipPos(
  rect: Rect | null,
  placement: WalkthroughStep["placement"],
): { top: number; left: number; arrow: "top" | "bottom" | "left" | "right" } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const W = 320;
  const H = 180;
  if (!rect) {
    return { top: vh / 2 - H / 2, left: vw / 2 - W / 2, arrow: "top" };
  }
  const spaceRight = vw - (rect.left + rect.width);
  const spaceLeft = rect.left;
  const spaceBottom = vh - (rect.top + rect.height);

  let p = placement && placement !== "auto" ? placement : "auto";
  if (p === "auto") {
    if (spaceRight > W + 24) p = "right";
    else if (spaceLeft > W + 24) p = "left";
    else if (spaceBottom > H + 24) p = "bottom";
    else p = "top";
  }

  switch (p) {
    case "right":
      return {
        top: Math.max(12, Math.min(vh - H - 12, rect.top + rect.height / 2 - H / 2)),
        left: Math.min(vw - W - 12, rect.left + rect.width + 16),
        arrow: "left",
      };
    case "left":
      return {
        top: Math.max(12, Math.min(vh - H - 12, rect.top + rect.height / 2 - H / 2)),
        left: Math.max(12, rect.left - W - 16),
        arrow: "right",
      };
    case "top":
      return {
        top: Math.max(12, rect.top - H - 16),
        left: Math.max(12, Math.min(vw - W - 12, rect.left + rect.width / 2 - W / 2)),
        arrow: "bottom",
      };
    case "bottom":
    default:
      return {
        top: Math.min(vh - H - 12, rect.top + rect.height + 16),
        left: Math.max(12, Math.min(vw - W - 12, rect.left + rect.width / 2 - W / 2)),
        arrow: "top",
      };
  }
}

export default function WalkthroughPlayer() {
  const [walkthrough, setWalkthrough] = useState<Walkthrough | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const stepStartedAt = useRef(0);

  // Listen for global start events
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      const w = id ? getWalkthrough(id) : undefined;
      if (!w) return;
      setWalkthrough(w);
      setStepIndex(0);
      stepStartedAt.current = Date.now();
    };
    window.addEventListener(COPILOT_WALKTHROUGH_EVENT, handler);
    return () => window.removeEventListener(COPILOT_WALKTHROUGH_EVENT, handler);
  }, []);

  const step = walkthrough?.steps[stepIndex];

  // Navigate if step's route differs
  useEffect(() => {
    if (!step) return;
    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
    }
    stepStartedAt.current = Date.now();
  }, [step, navigate, location.pathname]);

  // Wait for nav to settle before measuring the next selector
  const onCorrectRoute = !step?.route || location.pathname === step.route;
  const rect = useTargetRect(onCorrectRoute ? step?.selector : undefined, [stepIndex, walkthrough?.id]);

  const close = useCallback(() => {
    setWalkthrough(null);
    setStepIndex(0);
  }, []);

  const next = useCallback(() => {
    if (!walkthrough) return;
    if (stepIndex >= walkthrough.steps.length - 1) {
      close();
    } else {
      setStepIndex((i) => i + 1);
    }
  }, [walkthrough, stepIndex, close]);

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  if (!walkthrough || !step) return null;

  const total = walkthrough.steps.length;
  const isLast = stepIndex === total - 1;
  const tip = computeTooltipPos(rect, step.placement);

  return createPortal(
    <div className="fixed inset-0 z-[9990] pointer-events-none">
      {/* Backdrop with cutout */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
        <defs>
          <mask id="copilot-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - PAD}
                y={rect.top - PAD}
                width={rect.width + PAD * 2}
                height={rect.height + PAD * 2}
                rx="10"
                ry="10"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(8, 10, 24, 0.62)"
          mask="url(#copilot-spotlight-mask)"
        />
      </svg>

      {/* Highlight ring (decorative, sits over the cutout) */}
      {rect && (
        <div
          className="absolute rounded-[10px] ring-2 ring-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.25),0_0_30px_hsl(var(--primary)/0.55)] animate-pulse pointer-events-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className={cn(
          "absolute w-[320px] rounded-xl border border-border bg-background shadow-2xl p-4 pointer-events-auto",
          "animate-in fade-in zoom-in-95",
        )}
        style={{ top: tip.top, left: tip.left }}
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-primary">
            CoPilot · Step {stepIndex + 1} of {total}
          </div>
          <button
            onClick={close}
            aria-label="Close walkthrough"
            className="text-muted-foreground hover:text-foreground -mt-1 -mr-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h4 className="text-sm font-semibold text-foreground mb-1">{step.title}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">{step.body}</p>

        {!rect && onCorrectRoute && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2">
            Can't find that control on screen — you may already be past this step, or the menu is collapsed.
          </p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {walkthrough.steps.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === stepIndex ? "w-4 bg-primary" : "w-1.5 bg-muted",
                )}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            {stepIndex > 0 && (
              <Button size="sm" variant="ghost" onClick={prev} className="h-7 px-2 text-xs">
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </Button>
            )}
            <Button size="sm" onClick={next} className="h-7 px-2.5 text-xs">
              {isLast ? "Done" : (<>Next <ChevronRight className="h-3.5 w-3.5" /></>)}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
