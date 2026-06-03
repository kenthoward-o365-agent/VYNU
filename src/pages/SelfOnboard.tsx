import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, MoreVertical, Sparkles, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChecklistPane } from "@/components/onboarding/ChecklistPane";
import { OnboardingChat } from "@/components/onboarding/OnboardingChat";
import { useOnboardingReadiness } from "@/components/onboarding/useOnboardingReadiness";

export default function SelfOnboard() {
  const navigate = useNavigate();
  const { venue } = useVenue();
  const { data, refresh, setData } = useOnboardingReadiness(venue?.id);
  const [externalPrompt, setExternalPrompt] = useState<{ text: string; nonce: number } | null>(null);
  const [goingLive, setGoingLive] = useState(false);
  const [confirmGoLive, setConfirmGoLive] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const askAgent = useCallback((stageId: string) => {
    const stage = data?.stages.find((s) => s.id === stageId);
    if (!stage) return;
    setExternalPrompt({ text: `Help me complete: ${stage.title}`, nonce: Date.now() });
  }, [data]);

  async function goLive() {
    if (!venue?.id) return;
    setGoingLive(true);
    try {
      const { data: r, error } = await supabase.functions.invoke("onboarding-go-live", {
        body: { venue_id: venue.id },
      });
      if (error) throw error;
      setCelebrate(true);
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Could not go live");
    } finally {
      setGoingLive(false);
      setConfirmGoLive(false);
    }
  }

  async function dismiss() {
    if (!venue?.id) return;
    await supabase.from("venue_onboarding_state").upsert({
      venue_id: venue.id, status: "dismissed", dismissed_at: new Date().toISOString(),
    }, { onConflict: "venue_id" });
    toast.success("Self Onboard hidden. You can reopen it any time from Settings.");
    navigate("/dashboard");
  }

  if (!venue) {
    return <div className="p-10 text-center text-muted-foreground">No venue selected.</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <Sparkles className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <h1 className="text-base font-semibold text-foreground">Self Onboard — {venue.name}</h1>
          <p className="text-xs text-muted-foreground">Take this venue live with the help of your AI specialist.</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => refresh()}>Refresh checklist</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setConfirmDismiss(true)}>Hide Self Onboard</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[minmax(320px,40%)_1fr] overflow-hidden">
        <div className="hidden md:block overflow-hidden">
          {data ? (
            <ChecklistPane
              data={data}
              goingLive={goingLive}
              onGoLive={() => setConfirmGoLive(true)}
              onAskAgent={askAgent}
            />
          ) : (
            <div className="p-6 text-muted-foreground text-sm">Loading checklist…</div>
          )}
        </div>
        <div className="overflow-hidden">
          <OnboardingChat
            venueId={venue.id}
            externalPrompt={externalPrompt}
            onReadinessUpdate={(r) => setData(r)}
          />
        </div>
      </div>

      <AlertDialog open={confirmGoLive} onOpenChange={setConfirmGoLive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Go live with {venue.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This switches the venue from test mode to live. Diners scanning your QR codes will be able to order and pay for real.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={goLive}>Go live</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDismiss} onOpenChange={setConfirmDismiss}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hide Self Onboard?</AlertDialogTitle>
            <AlertDialogDescription>
              We'll hide the button from the top bar. You can reopen the agent any time from Settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep showing</AlertDialogCancel>
            <AlertDialogAction onClick={dismiss}>Hide</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={celebrate} onOpenChange={setCelebrate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <PartyPopper className="h-5 w-5 text-primary" /> You're live!
            </AlertDialogTitle>
            <AlertDialogDescription>
              {venue.name} is now live. Diners can scan QR codes and place real orders.
              We've hidden the Self Onboard button — you can reopen the agent from Settings any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => navigate("/dashboard")}>Take me to the dashboard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
