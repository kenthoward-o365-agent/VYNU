import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { CreditCard, Eye, EyeOff, ShieldCheck, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";

interface PaymentConfig {
  id?: string;
  venue_id: string;
  provider: string;
  environment: "test" | "live";
  api_key_test: string;
  api_key_live: string;
  merchant_account: string;
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
    provider: "adyen",
    environment: "test",
    api_key_test: "",
    api_key_live: "",
    merchant_account: "",
    is_active: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTestKey, setShowTestKey] = useState(false);
  const [showLiveKey, setShowLiveKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchConfig();
  }, [venueId]);

  const fetchConfig = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("venue_payment_config" as any)
      .select("*")
      .eq("venue_id", venueId)
      .eq("provider", "adyen")
      .maybeSingle();

    if (data) {
      const d = data as any;
      setConfig({
        id: d.id,
        venue_id: d.venue_id,
        provider: d.provider,
        environment: d.environment,
        api_key_test: d.api_key_test || "",
        api_key_live: d.api_key_live || "",
        merchant_account: d.merchant_account || "",
        is_active: d.is_active,
      });
    }
    setLoading(false);
  };

  const save = async () => {
    setSaving(true);
    const payload: any = {
      venue_id: venueId,
      provider: "adyen",
      environment: config.environment,
      api_key_test: config.api_key_test || null,
      api_key_live: config.api_key_live || null,
      merchant_account: config.merchant_account || null,
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
        setTestResult({ success: true, message: "Connection successful! Adyen API is reachable." });
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

  const activeKey = config.environment === "test" ? config.api_key_test : config.api_key_live;
  const hasActiveKey = !!activeKey;

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
                  ? `Payments active in ${config.environment.toUpperCase()} mode`
                  : "Payments not enabled"}
              </p>
              <p className="text-xs text-muted-foreground">
                {config.is_active
                  ? config.environment === "test"
                    ? "Using Adyen test environment — no real charges"
                    : "Using Adyen LIVE environment — real transactions"
                  : "Configure your Adyen credentials below to enable payments"}
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
            Adyen Configuration
          </CardTitle>
          <CardDescription>
            Connect your Adyen merchant account to accept payments.{" "}
            <a
              href="https://docs.adyen.com/get-started-with-adyen/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Adyen docs <ExternalLink className="h-3 w-3" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Merchant Account */}
          <div>
            <Label>Merchant Account</Label>
            <Input
              value={config.merchant_account}
              onChange={(e) => setConfig((c) => ({ ...c, merchant_account: e.target.value }))}
              placeholder="YourMerchantAccount"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Found in your Adyen Customer Area under Account → Merchant accounts
            </p>
          </div>

          <Separator />

          {/* Environment Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Environment</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {config.environment === "test"
                  ? "Test mode — use test card numbers below"
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

          {/* Test API Key */}
          <div>
            <Label>Test API Key</Label>
            <div className="relative mt-1">
              <Input
                type={showTestKey ? "text" : "password"}
                value={config.api_key_test}
                onChange={(e) => setConfig((c) => ({ ...c, api_key_test: e.target.value }))}
                placeholder="AQE..."
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowTestKey(!showTestKey)}
              >
                {showTestKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Generate in Adyen Customer Area → Developers → API credentials → Generate API key (Test)
            </p>
          </div>

          {/* Live API Key */}
          <div>
            <Label>Live API Key</Label>
            <div className="relative mt-1">
              <Input
                type={showLiveKey ? "text" : "password"}
                value={config.api_key_live}
                onChange={(e) => setConfig((c) => ({ ...c, api_key_live: e.target.value }))}
                placeholder="AQE..."
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowLiveKey(!showLiveKey)}
              >
                {showLiveKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Generate in Adyen Customer Area → Developers → API credentials → Generate API key (Live)
            </p>
          </div>

          {/* Activate Payments */}
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Payments</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Turn on to accept payments from diners at this venue
              </p>
            </div>
            <Switch
              checked={config.is_active}
              onCheckedChange={(checked) => setConfig((c) => ({ ...c, is_active: checked }))}
              disabled={!hasActiveKey || !config.merchant_account}
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
              disabled={testing || !hasActiveKey || !config.merchant_account}
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
            <CardDescription>Use these card numbers in test mode — no real charges</CardDescription>
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
