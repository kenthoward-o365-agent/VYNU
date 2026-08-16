import { useVenue } from "@/contexts/VenueContext";
import SippaAnalyticsComponent from "@/components/venue/SippaAnalytics";

export default function SippaAnalyticsPage() {
  const { venue } = useVenue();
  if (!venue) return null;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Vee AI Analytics</h2>
        <p className="text-muted-foreground">Chat performance and conversion insights</p>
      </div>
      <SippaAnalyticsComponent venueId={venue.id} />
    </div>
  );
}
