import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { CreditCard, ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";

interface PaymentConfig {
  id?: string;
  venue_id: string;
  provider: string;
  environment: "test" | "live";
  is_active: boolean;
}

const TEST_CARDS = [
  { type: "Visa", number: "4111 1111 1111 1111", expiry: "03/30", cvc: "737" },
  { type: "Mastercard", number: "5555 3412 4444 1115", expiry: "03/30", cvc: "737" },
  { type: "Amex", number: "3700 0000 0000 002", expiry: "03/30", cvc: "7373" },
  { type: "Visa (3DS2)", number: "4871 0499 9999 0006", expiry: "03/30", cvc: "737" },
  { type: "Declined", number: "4000 0000 0000 0002", expiry: "03/30", cvc: "737" },
];

export default function PaymentSettingsTab({ venueId }: { venueId: string }) {
  const [config, setConfig] = useState<PaymentConfig>({
    venue_id: venueId,
    provider: "ordrpayments",
    environment: "test",
    is_active: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchConfig();
  }, [venueId]);

  const fetchConfig = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("venue_payment_config" as any)
      .select("*")
      .eq("venue_id", venueId)
      .eq("provider", "ordrpayments")
      .maybeSingle();

    if (!data) {
      // Also check for legacy "adyen" provider
      const { data: legacyData } = await supabase
        .from("venue_payment_config" as any)
        .select("*")
        .eq("venue_id", venueId)
        .eq("provider", "adyen")
        .maybeSingle();
      if (legacyData) {
        const d = legacyData as any;
        setConfig({
          id: d.id,
          venue_id: d.venue_id,
          provider: d.provider,
          environment: d.environment,
          is_active: d.is_active,
        });
        setLoading(false);
        return;
      }
    }

    if (data) {
      const d = data as any;
      setConfig({
        id: d.id,
        venue_id: d.venue_id,
        provider: d.provider,
        environment: d.environment,
        is_active: d.is_active,
      });
    }
    setLoading(false);
  };

  const save = async () => {
    setSaving(true);
    const payload: any = {
      venue_id: venueId,
      provider: "ordrpayments",
      environment: config.environment,
      is_active: config.is_active,
    };

    let error;
    if (config.id) {
      ({ error } = await supabase
        .from("venue_payment_config" as any)
        .update(payload)
        .eq("id", config.id));
    } else {
      const { data, error: insertErr } = await supabase
        .from("venue_payment_config" as any)
        .insert(payload)
        .select()
        .single();
      error = insertErr;
      if (data) setConfig((c) => ({ ...c, id: (data as any).id }));
    }

    if (error) toast.error(error.message);
    else toast.success("Payment settings saved");
    setSaving(false);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/adyen-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            action: "test_connection",
            venue_id: venueId,
          }),
        }
      );
      const result = await resp.json();
      if (resp.ok && result.success) {
        setTestResult({ success: true, message: "OrdrPayments connection verified successfully." });
      } else {
        setTestResult({ success: false, message: result.error || "Connection failed" });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    }
    setTesting(false);
  };

  if (loading) {
    return <p className="text-muted-foreground">Loading payment settings...</p>;
  }

  const isMockMode = config.environment === "test";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Status Banner */}
      <Card className={config.is_active ? "border-green-500/30 bg-green-500/5" : "border-amber-500/30 bg-amber-500/5"}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            {config.is_active ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            )}
            <div className="flex-1">
              <p className="font-medium text-sm">
                {config.is_active
                  ? isMockMode
                    ? "OrdrPayments active in TEST mode"
                    : "OrdrPayments active — LIVE transactions"
                  : "OrdrPayments not enabled"}
              </p>
              <p className="text-xs text-muted-foreground">
                {config.is_active
                  ? isMockMode
                    ? "Simulated payments — use test cards below to verify your flow."
                    : "Live payment processing — real transactions will be charged."
                  : "Enable OrdrPayments below to accept payments from diners."}
              </p>
            </div>
            <Badge variant="outline" className={config.environment === "live" ? "border-red-500/50 text-red-500" : "border-blue-500/50 text-blue-500"}>
              {config.environment.toUpperCase()}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            OrdrPayments Configuration
          </CardTitle>
          <CardDescription>
            Built-in payment processing by Ordrup. No third-party accounts or API keys needed — we handle everything for you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Environment Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Environment</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {config.environment === "test"
                  ? "Test mode — use test card numbers below, no real charges"
                  : "Live mode — real transactions will be processed"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${config.environment === "test" ? "text-blue-500 font-medium" : "text-muted-foreground"}`}>Test</span>
              <Switch
                checked={config.environment === "live"}
                onCheckedChange={(checked) =>
                  setConfig((c) => ({ ...c, environment: checked ? "live" : "test" }))
                }
              />
              <span className={`text-sm ${config.environment === "live" ? "text-red-500 font-medium" : "text-muted-foreground"}`}>Live</span>
            </div>
          </div>

          <Separator />

          {/* Enable Payments */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Payments</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {config.environment === "test"
                  ? "Enable test payments — simulated transactions for testing your ordering flow"
                  : "Turn on to accept real payments from diners at this venue"}
              </p>
            </div>
            <Switch
              checked={config.is_active}
              onCheckedChange={(checked) => setConfig((c) => ({ ...c, is_active: checked }))}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
            <Button
              variant="outline"
              onClick={testConnection}
              disabled={testing}
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              {testing ? "Testing..." : "Test Connection"}
            </Button>
          </div>

          {testResult && (
            <div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${testResult.success ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
              {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {testResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Cards Reference */}
      {config.environment === "test" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test Card Numbers</CardTitle>
            <CardDescription>Use these cards in test mode — payments are simulated, no real charges</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {TEST_CARDS.map((card) => (
                <div key={card.number} className="flex items-center justify-between text-sm bg-muted/50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs w-24 justify-center">{card.type}</Badge>
                    <code className="text-xs font-mono">{card.number}</code>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground text-xs">
                    <span>Exp: {card.expiry}</span>
                    <span>CVC: {card.cvc}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(card.number.replace(/\s/g, ""));
                        toast.success(`${card.type} number copied`);
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
