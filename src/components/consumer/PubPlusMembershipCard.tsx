import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Beer, Camera, Coins, Link2, RefreshCw, Unlink, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  /** Diner profile id — the card renders nothing when signed out. */
  dinerId: string | null;
  /** Venue group that owns the Pub+ program. */
  groupId: string | null;
}

interface MemberLink {
  id: string;
  identity_value: string;
  points_balance: number;
  status: string;
  ee_wallet_id: string | null;
  last_synced_at: string | null;
}

interface Integration {
  enabled: boolean;
}

/**
 * Lets a diner attach their existing physical Pub+ card to their OrderNOW
 * profile. Once linked, points from OrderNOW orders are posted straight to
 * their Eagle Eye (Pub+) wallet — no barcode scan at the bar.
 */
export default function PubPlusMembershipCard({ dinerId, groupId }: Props) {
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [link, setLink] = useState<MemberLink | null>(null);
  const [entering, setEntering] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!groupId || !dinerId) return;
    void (async () => {
      const [{ data: cfg }, { data: existing }] = await Promise.all([
        (supabase as any).from("pubplus_integrations").select("enabled").eq("group_id", groupId).maybeSingle(),
        (supabase as any)
          .from("pubplus_member_links")
          .select("id, identity_value, points_balance, status, ee_wallet_id, last_synced_at")
          .eq("diner_id", dinerId)
          .eq("group_id", groupId)
          .maybeSingle(),
      ]);
      setIntegration((cfg as Integration) ?? null);
      setLink(existing && (existing as MemberLink).status === "linked" ? (existing as MemberLink) : null);
    })();
  }, [groupId, dinerId]);

  useEffect(() => () => stopScan(), []);

  function stopScan() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  async function startScan() {
    const Detector = (window as any).BarcodeDetector;
    if (!Detector) {
      toast.info("Camera scanning isn't supported on this device — type the number instead.");
      setEntering(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScanning(true);
      setTimeout(async () => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const detector = new Detector({
          formats: ["code_128", "ean_13", "code_39", "qr_code", "itf"],
        });
        const tick = async () => {
          if (!streamRef.current || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes?.length) {
              const raw = String(codes[0].rawValue ?? "").trim();
              if (raw) {
                stopScan();
                setValue(raw);
                await submit(raw);
                return;
              }
            }
          } catch { /* frame not ready */ }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, 50);
    } catch {
      toast.error("Couldn't open the camera. Type your card number instead.");
      setEntering(true);
    }
  }

  async function submit(identityValue?: string) {
    const v = (identityValue ?? value).trim();
    if (!v || !groupId) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("pubplus-air", {
      body: { action: "link", group_id: groupId, identity_value: v },
    });
    setBusy(false);
    if (error) {
      toast.error("We couldn't link that card. Check the number and try again.");
      return;
    }
    const res = data as any;
    if (res?.ok === false) {
      toast.error(res.message ?? "Couldn't link that Pub+ card.");
      return;
    }
    setLink({
      id: res?.link?.id ?? "new",
      identity_value: v,
      points_balance: res?.points_balance ?? 0,
      status: "linked",
      ee_wallet_id: res?.wallet_id ?? null,
      last_synced_at: new Date().toISOString(),
    });
    setEntering(false);
    setValue("");
    toast.success(
      res?.simulated
        ? "Pub+ card saved — points will sync once ALH switch the integration on."
        : "Pub+ card linked! Your points now land straight on your Pub+ balance.",
    );
  }

  async function refresh() {
    if (!groupId) return;
    setBusy(true);
    const { data } = await supabase.functions.invoke("pubplus-air", {
      body: { action: "balance", group_id: groupId },
    });
    setBusy(false);
    const res = data as any;
    if (res?.ok) {
      setLink((l) => (l ? { ...l, points_balance: res.points_balance ?? l.points_balance } : l));
      toast.success("Balance updated");
    } else {
      toast.error(res?.message ?? "Couldn't refresh right now");
    }
  }

  async function unlink() {
    if (!groupId) return;
    setBusy(true);
    await supabase.functions.invoke("pubplus-air", { body: { action: "unlink", group_id: groupId } });
    setBusy(false);
    setLink(null);
    toast.success("Pub+ card removed");
  }

  if (!dinerId || !groupId || !integration) return null;

  return (
    <Card className="border-primary/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Beer className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm leading-tight">Pub+ membership</p>
              <p className="text-xs text-muted-foreground">
                {link ? "Linked to your ALH Pub+ card" : "Already a Pub+ member? Link your card."}
              </p>
            </div>
          </div>
          {link && <Badge variant="secondary">Linked</Badge>}
        </div>

        {link ? (
          <>
            <div className="rounded-xl bg-muted/50 p-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Card number</p>
                <p className="font-mono text-sm">{link.identity_value}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Points</p>
                <p className="font-semibold text-lg flex items-center gap-1 justify-end">
                  <Coins className="h-4 w-4 text-primary" />
                  {link.points_balance.toLocaleString()}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              No need to scan at the bar — anything you order here is posted to your Pub+ balance automatically.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={refresh} disabled={busy}>
                <RefreshCw className={`h-3 w-3 mr-1 ${busy ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button size="sm" variant="ghost" onClick={unlink} disabled={busy}>
                <Unlink className="h-3 w-3 mr-1" />
                Remove
              </Button>
            </div>
          </>
        ) : scanning ? (
          <div className="space-y-2">
            <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
              <div className="absolute inset-x-6 top-1/2 h-0.5 bg-primary/80" />
            </div>
            <Button size="sm" variant="ghost" className="w-full" onClick={stopScan}>
              <X className="h-3 w-3 mr-1" /> Cancel scan
            </Button>
          </div>
        ) : entering ? (
          <div className="space-y-2">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="numeric"
              placeholder="Card number under the barcode"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => submit()} disabled={busy || !value.trim()}>
                {busy ? "Linking…" : "Link card"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEntering(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={startScan}>
              <Camera className="h-3 w-3 mr-1" />
              Scan my card
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setEntering(true)}>
              <Link2 className="h-3 w-3 mr-1" />
              Enter number
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
