import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";

/** Mirrors the key ConsumerOrder writes when an order is placed. */
const lastOrderKey = (venueId?: string, tableId?: string) =>
  `shyndig.lastOrder.${venueId || "_"}.${tableId || "_"}`;

function readPlacedOrderId(venueId?: string, tableId?: string): string | null {
  try {
    return localStorage.getItem(lastOrderKey(venueId, tableId));
  } catch {
    // Private browsing or storage disabled — treated as "unknown" below.
    return null;
  }
}

/**
 * Generic fallback for the operator dashboard. Staff can retry or reload;
 * nothing here is time-critical in the way a diner's order is.
 */
export function AppErrorFallback({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground text-sm">
          This screen ran into a problem and couldn't finish loading. Nothing you
          were working on has been sent.
        </p>
        <div className="flex gap-2 justify-center pt-2">
          <Button variant="outline" onClick={reset}>Try again</Button>
          <Button onClick={() => window.location.reload()}>Reload the page</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Fallback for the diner ordering flow.
 *
 * The one thing a diner needs to know when the screen breaks is whether they
 * have been charged and whether food is coming. Guessing is worse than useless
 * here, so this reads the same localStorage marker ConsumerOrder writes when an
 * order is placed and says only what that supports:
 *
 *   marker present  -> the order reached the venue; the screen failed after
 *   marker absent   -> nothing was submitted, so they can safely start again
 *   storage blocked -> we genuinely do not know, so say so and point at staff
 *
 * Reloading is offered in every case: the marker also drives order recovery on
 * mount, so a reload usually lands the diner back on their live order.
 */
export function ConsumerErrorFallback({ reset }: { error: Error; reset: () => void }) {
  const { venueId, tableId } = useParams<{ venueId: string; tableId: string }>();
  const placedOrderId = readPlacedOrderId(venueId, tableId);

  let storageReadable = true;
  try {
    localStorage.getItem("__probe__");
  } catch {
    storageReadable = false;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="text-3xl" aria-hidden="true">⚠️</div>
        <h1 className="text-lg font-semibold">Something went wrong</h1>

        {!storageReadable ? (
          <p className="text-muted-foreground text-sm">
            We couldn't confirm whether your order was placed. Please reload, and
            if you're still unsure, check with staff before ordering again so you
            aren't charged twice.
          </p>
        ) : placedOrderId ? (
          <>
            <p className="text-sm font-medium text-foreground">
              Your order was placed and the venue has it.
            </p>
            <p className="text-muted-foreground text-sm">
              Only this screen failed. Reload to see its progress — you don't need
              to order again.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">
              Your order has not been placed.
            </p>
            <p className="text-muted-foreground text-sm">
              Nothing has been sent to the venue and you haven't been charged.
              Reload to start again.
            </p>
          </>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Button className="w-full" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <Button variant="ghost" className="w-full" onClick={reset}>
            Try again without reloading
          </Button>
        </div>
      </div>
    </div>
  );
}
