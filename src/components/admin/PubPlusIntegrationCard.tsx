import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Beer, ExternalLink, Lock } from "lucide-react";

/**
 * Placeholder for a future two-way integration with the ALH Pub+ API.
 * Intentionally inert: no credentials, no network calls, no database writes.
 */
export default function PubPlusIntegrationCard() {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Beer className="h-4 w-4 text-primary" />
              Pub+ (ALH)
              <Badge variant="outline">Planned — not connected</Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              Loyalty / rewards integration · pubplus · api key
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <p>Intended two-way sync with the ALH Pub+ platform:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Member identity match — link an OrderNOW diner to their existing Pub+ membership.</li>
            <li>Points balance sync — earnings from OrderNOW orders posted to Pub+ and back.</li>
            <li>Reward redemption — pub+ coins issued or burned against the Pub+ ledger.</li>
          </ul>
          <p>
            Until then, OrderNOW runs its own group-wide Pub+-style program: diners simply sign in at
            the table — no app download and no barcode scan.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">API base URL</Label>
            <Input disabled placeholder="https://api.pubplus.com.au/v1" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Partner / merchant ID</Label>
            <Input disabled placeholder="Provided by ALH" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">API key</Label>
            <Input disabled type="password" placeholder="Stored as a backend secret" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" disabled>
            <Lock className="h-3 w-3 mr-1" />
            Connect (awaiting ALH credentials)
          </Button>
          <a
            href="https://www.pubplus.com.au/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            pubplus.com.au <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
