import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { MapPin, Utensils, Gift, UserPlus, LogIn } from "lucide-react";
import LandingSectionRenderer from "@/components/landing-editor/LandingSectionRenderer";
import type { LandingSection } from "@/components/landing-editor/types";
import SessionModeChooser, { type SessionMode } from "./SessionModeChooser";

interface VenueLandingProps {
  venue: {
    id?: string;
    name: string;
    venue_type: string;
    logo_url?: string | null;
    address?: string | null;
    city?: string | null;
    landing_page_html?: string | null;
  };
  tableNumber: string;
  tableId?: string | null;
  sessionMode: SessionMode | null;
  onModeSelect: (mode: SessionMode, sessionId?: string, displayName?: string) => void;
  onStart: () => void;
  onSignup: () => void;
  onSignin: () => void;
}

function tryParseJsonSections(raw: string): LandingSection[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) return parsed;
  } catch {}
  return null;
}

function InlineActions({ onStart, onSignup, onSignin }: { onStart: () => void; onSignup: () => void; onSignin: () => void }) {
  return (
    <div className="px-6 py-6">
      <div className="max-w-xs mx-auto space-y-3">
        <Button onClick={onStart} size="lg" className="w-full h-12 text-sm rounded-2xl">
          Continue as Guest
        </Button>
        <Button
          variant="outline"
          className="w-full h-12 text-sm rounded-2xl border-primary/30 text-primary hover:bg-primary/10"
          onClick={onSignup}
        >
          <UserPlus className="h-4 w-4 mr-2" />
          Sign up & earn rewards
        </Button>
        <Button
          variant="ghost"
          className="w-full h-12 text-sm rounded-2xl text-muted-foreground hover:text-primary"
          onClick={onSignin}
        >
          <LogIn className="h-4 w-4 mr-2" />
          Already have an account? Sign in
        </Button>
      </div>
    </div>
  );
}

const VenueLanding = ({
  venue,
  tableNumber,
  tableId,
  sessionMode,
  onModeSelect,
  onStart,
  onSignup,
  onSignin,
}: VenueLandingProps) => {
  const showChooser = !!(venue.id && tableId) && sessionMode === null;

  const ChooserOrActions = () => {
    if (showChooser) {
      return (
        <SessionModeChooser
          venueId={venue.id!}
          tableId={tableId!}
          tableNumber={tableNumber}
          onSelect={onModeSelect}
        />
      );
    }
    return <InlineActions onStart={onStart} onSignup={onSignup} onSignin={onSignin} />;
  };

  if (venue.landing_page_html) {
    const sections = tryParseJsonSections(venue.landing_page_html);

    if (sections) {
      const filteredSections = sections.filter((s) => s.type !== "table-display");
      const heroIndex = filteredSections.findIndex((s) => s.type === "hero");

      return (
        <div className="min-h-screen relative">
          <LandingSectionRenderer
            sections={filteredSections}
            tableNumber={tableNumber}
            inlineActionsAfterIndex={heroIndex >= 0 ? heroIndex : 0}
            inlineActions={<ChooserOrActions />}
          />
          <p className="text-center text-white/40 text-xs py-4">
            Powered by <span className="font-semibold text-white/60">H&L OrderNOW</span>
          </p>
        </div>
      );
    }

    const processedHtml = venue.landing_page_html.replace(/\{\{TABLE\}\}/g, tableNumber);
    return (
      <div className="min-h-screen relative">
        <div dangerouslySetInnerHTML={{ __html: processedHtml }} />
        <ChooserOrActions />
      </div>
    );
  }

  // Default landing page
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12 text-center">
      <div className="mb-8">
        {venue.logo_url ? (
          <img src={venue.logo_url} alt={venue.name} className="w-24 h-24 rounded-2xl object-cover shadow-lg" />
        ) : (
          <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center shadow-lg">
            <Utensils className="h-10 w-10 text-primary" />
          </div>
        )}
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-2">{venue.name}</h1>
      <p className="text-muted-foreground text-sm capitalize mb-1">{venue.venue_type}</p>
      {(venue.address || venue.city) && (
        <p className="text-muted-foreground text-xs flex items-center gap-1 mb-8">
          <MapPin className="h-3 w-3" />
          {[venue.address, venue.city].filter(Boolean).join(", ")}
        </p>
      )}

      <ChooserOrActions />

      {!showChooser && (
        <div className="bg-accent/50 rounded-2xl border border-primary/20 p-4 mt-6 w-full max-w-xs">
          <div className="flex items-center gap-2 mb-2">
            <Gift className="h-5 w-5 text-primary" />
            <p className="text-sm font-semibold text-foreground">Earn rewards</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Sign up for our loyalty program and earn points with every order.
          </p>
        </div>
      )}
      <p className="text-muted-foreground text-xs mt-4">
        No account needed · Powered by <span className="font-semibold text-primary">H&L OrderNOW</span>
      </p>
    </div>
  );
};

export default VenueLanding;
