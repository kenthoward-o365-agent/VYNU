import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { ShieldAlert, CheckCircle2, XCircle, Loader2 } from "lucide-react";

/**
 * INTERNAL — visible only to tabless_admin.
 *
 * Lets a Tab-Less platform admin paste the underlying processor credentials
 * (Adyen test/live API + client keys, merchant account, HMAC) for a venue.
 * These never appear in the venue-facing Settings → Payments tab.
 *
 * Without these, the consumer checkout silently runs in mock mode and
 * "authorises" any order without contacting the processor.
 */
export default function ProcessorCredentialsTab({ venueId }: { venueId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [environment, setEnvironment] = useState<"test" | "live">("test");
  const [merchantStatus, setMerchantStatus] = useState<string>("pending");
  const [merchantAccount, setMerchantAccount] = useState("");
  const [applePayMerchantId, setApplePayMerchantId] = useState("");
  const [googlePayMerchantId, setGooglePayMerchantId] = useState("");
  const [fieldStatus, setFieldStatus] = useState<Record<string, { set: boolean; preview?: string }>>({});

  // Write-only inputs (we never load real values into the UI)
  const [apiKeyTest, setApiKeyTest] = useState("");
  const [apiKeyLive, setApiKeyLive] = useState("");
  const [clientKeyTest, setClientKeyTest] = useState("");
  const [clientKeyLive, setClientKeyLive] = useState("");
  const [hmacKey, setHmacKey] = useState("");

  const callFn = async (action: string, extra: any = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not signed in");
    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-set-payment-credentials`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ venue_id: venueId, action, ...extra }),
      }
    );
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "Request failed");
    return data;
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await callFn("get");
      setEnvironment((data.environment as "test" | "live") || "test");
      setMerchantStatus(data.merchant_status || "pending");
      setMerchantAccount(data.merchant_account || "");
      setApplePayMerchantId(data.apple_pay_merchant_id || "");
      setGooglePayMerchantId(data.google_pay_merchant_id || "");
      setFieldStatus(data.fields || {});
    } catch (err: any) {
      toast({ title: "Failed to load credentials", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (venueId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  const save = async () => {
    setSaving(true);
    try {
      const fields: Record<string, string> = {};
      if (apiKeyTest.trim()) fields.api_key_test = apiKeyTest.trim();
      if (apiKeyLive.trim()) fields.api_key_live = apiKeyLive.trim();
      if (clientKeyTest.trim()) fields.client_key_test = clientKeyTest.trim();
      if (clientKeyLive.trim()) fields.client_key_live = clientKeyLive.trim();
      if (hmacKey.trim()) fields.hmac_key = hmacKey.trim();
      if (merchantAccount.trim()) fields.merchant_account = merchantAccount.trim();
      if (applePayMerchantId.trim()) fields.apple_pay_merchant_id = applePayMerchantId.trim();
      if (googlePayMerchantId.trim()) fields.google_pay_merchant_id = googlePayMerchantId.trim();

      await callFn("set", { fields });
      toast({ title: "Credentials saved" });

      // Clear write-only inputs and re-load mask state
      setApiKeyTest("");
      setApiKeyLive("");
      setClientKeyTest("");
      setClientKeyLive("");
      setHmacKey("");
      await load();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const clearField = async (field: string) => {
    if (!confirm(`Clear ${field}? Payments using this key will stop working.`)) return;
    try {
      await callFn("clear_field", { field });
      toast({ title: `${field} cleared` });
      await load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/adyen-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ action: "test_connection", venue_id: venueId }),
        }
      );
      const data = await resp.json();
      if (data.success) {
        toast({ title: "Connection OK", description: data.message });
      } else {
        toast({ title: "Connection failed", description: data.error || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    }
    setTesting(false);
  };

  const FieldRow = ({
    label,
    fieldKey,
    value,
    onChange,
    placeholder,
    secret = true,
  }: {
    label: string;
    fieldKey: string;
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    secret?: boolean;
  }) => {
    const status = fieldStatus[fieldKey];
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-sm">{label}</Label>
          {status?.set ? (
            <div className="flex items-center gap-2">
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Set {status.preview}
              </Badge>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => clearField(fieldKey)}>
                Clear
              </Button>
            </div>
          ) : (
            <Badge variant="outline" className="gap-1">
              <XCircle className="h-3 w-3" /> Not set
            </Badge>
          )}
        </div>
        <Input
          type={secret ? "password" : "text"}
          placeholder={status?.set ? "Enter new value to replace" : placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-sm"
          autoComplete="off"
        />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="border-warning/40 bg-warning/5">
        <CardContent className="pt-4 flex gap-3 text-sm">
          <ShieldAlert className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Internal credentials — Tab-Less staff only</p>
            <p className="text-muted-foreground">
              These configure the underlying payment processor for this venue. Without them, the
              consumer checkout runs in <strong>simulated mode</strong> and never charges any card.
              Values are masked once saved — paste new values to overwrite.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Environment</CardTitle>
          <CardDescription>Currently: <strong>{environment.toUpperCase()}</strong> · merchant status: <strong>{merchantStatus}</strong></CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm">Merchant account</Label>
            <Input
              placeholder="e.g. OrdrPaymentsAUECOM"
              value={merchantAccount}
              onChange={(e) => setMerchantAccount(e.target.value)}
              className="font-mono text-sm mt-1.5"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The processor's merchant account name (not the venue's name).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test credentials</CardTitle>
          <CardDescription>Used while environment = test. Required for the real test Drop-in to render.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow label="API key (test)" fieldKey="api_key_test" value={apiKeyTest} onChange={setApiKeyTest} placeholder="AQEy…" />
          <FieldRow label="Client key (test)" fieldKey="client_key_test" value={clientKeyTest} onChange={setClientKeyTest} placeholder="test_…" secret={false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live credentials</CardTitle>
          <CardDescription>Used when environment is switched to live (only after merchant approval).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow label="API key (live)" fieldKey="api_key_live" value={apiKeyLive} onChange={setApiKeyLive} placeholder="AQEy…" />
          <FieldRow label="Client key (live)" fieldKey="client_key_live" value={clientKeyLive} onChange={setClientKeyLive} placeholder="live_…" secret={false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhooks & wallets</CardTitle>
          <CardDescription>Optional — required for production wallet payments and webhook signature verification.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow label="HMAC key" fieldKey="hmac_key" value={hmacKey} onChange={setHmacKey} placeholder="hex…" />
          <Separator />
          <div>
            <Label className="text-sm">Apple Pay merchant ID</Label>
            <Input
              placeholder="merchant.com.ordrpayments"
              value={applePayMerchantId}
              onChange={(e) => setApplePayMerchantId(e.target.value)}
              className="font-mono text-sm mt-1.5"
            />
          </div>
          <div>
            <Label className="text-sm">Google Pay merchant ID</Label>
            <Input
              placeholder="BCR2DN4T…"
              value={googlePayMerchantId}
              onChange={(e) => setGooglePayMerchantId(e.target.value)}
              className="font-mono text-sm mt-1.5"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 pb-12">
        <Button onClick={save} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : "Save credentials"}
        </Button>
        <Button variant="outline" onClick={testConnection} disabled={testing}>
          {testing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Testing</> : "Test connection"}
        </Button>
      </div>
    </div>
  );
}
