import { Button } from "@/components/ui/button";
import { MapPin, Utensils, Gift, UserPlus } from "lucide-react";

interface VenueLandingProps {
  venue: {
    name: string;
    venue_type: string;
    logo_url?: string | null;
    address?: string | null;
    city?: string | null;
  };
  tableNumber: string;
  onStart: () => void;
}

const VenueLanding = ({ venue, tableNumber, onStart }: VenueLandingProps) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12 text-center">
      {/* Venue Logo / Icon */}
      <div className="mb-8">
        {venue.logo_url ? (
          <img
            src={venue.logo_url}
            alt={venue.name}
            className="w-24 h-24 rounded-2xl object-cover shadow-lg"
          />
        ) : (
          <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center shadow-lg">
            <Utensils className="h-10 w-10 text-primary" />
          </div>
        )}
      </div>

      {/* Venue Info */}
      <h1 className="text-3xl font-bold tracking-tight mb-2">{venue.name}</h1>
      <p className="text-muted-foreground text-sm capitalize mb-1">{venue.venue_type}</p>
      {(venue.address || venue.city) && (
        <p className="text-muted-foreground text-xs flex items-center gap-1 mb-8">
          <MapPin className="h-3 w-3" />
          {[venue.address, venue.city].filter(Boolean).join(", ")}
        </p>
      )}

      {/* Table Info */}
      <div className="bg-card rounded-2xl border border-border p-6 mb-6 w-full max-w-xs">
        <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Your Table</p>
        <p className="text-4xl font-bold text-primary">{tableNumber}</p>
      </div>

      {/* Loyalty Signup Prompt */}
      <div className="bg-accent/50 rounded-2xl border border-primary/20 p-4 mb-6 w-full max-w-xs">
        <div className="flex items-center gap-2 mb-2">
          <Gift className="h-5 w-5 text-primary" />
          <p className="text-sm font-semibold text-foreground">Earn rewards</p>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Sign up for our loyalty program and earn points with every order.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => {
            // For now just proceed — profile tab handles signup
            onStart();
          }}
        >
          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
          Sign up & start ordering
        </Button>
      </div>

      {/* Guest CTA */}
      <Button onClick={onStart} size="lg" className="w-full max-w-xs h-14 text-lg rounded-2xl">
        Continue as Guest
      </Button>

      <p className="text-muted-foreground text-xs mt-4">
        No account needed · Powered by <span className="font-semibold text-primary">Tab-Less</span>
      </p>
    </div>
  );
};

export default VenueLanding;
