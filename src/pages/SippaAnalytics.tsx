import { useVenue } from "@/contexts/VenueContext";
import OrdrupAnalyticsComponent from "@/components/venue/OrdrupAnalytics";

export default function OrdrupAnalyticsPage() {
  const { venue } = useVenue();
  if (!venue) return null;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Ordrup AI Analytics</h2>
        <p className="text-muted-foreground">Chat performance and conversion insights</p>
      </div>
      <OrdrupAnalyticsComponent venueId={venue.id} />
    </div>
  );
}
