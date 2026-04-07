import { Button } from "@/components/ui/button";
import { MapPin, Utensils } from "lucide-react";

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
      <div className="bg-card rounded-2xl border border-border p-6 mb-8 w-full max-w-xs">
        <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Your Table</p>
        <p className="text-4xl font-bold text-primary">{tableNumber}</p>
      </div>

      {/* CTA */}
      <Button onClick={onStart} size="lg" className="w-full max-w-xs h-14 text-lg rounded-2xl">
        Start Ordering
      </Button>

      <p className="text-muted-foreground text-xs mt-4">
        Powered by <span className="font-semibold text-primary">Tab-Less</span>
      </p>
    </div>
  );
};

export default VenueLanding;
