import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  CreditCard,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  Building2,
  Copy,
} from "lucide-react";

type CaptureMode = "immediate" | "manual";
type MerchantStatus = "pending" | "under_review" | "approved" | "suspended";

interface PaymentConfig {
  id?: string;
  venue_id: string;
  provider: string;
  environment: "test" | "live";
  is_active: boolean;
  capture_mode: CaptureMode;
  statement_descriptor: string;
  country_code: string;
  default_currency: string;
  merchant_status: MerchantStatus;
  merchant_id_ordrpay: string | null;
}

const TEST_CARDS = [
  { type: "Visa", number: "4111 1111 1111 1111", expiry: "03/30", cvc: "737" },
  { type: "Mastercard", number: "5555 3412 4444 1115", expiry: "03/30", cvc: "737" },
  { type: "Amex", number: "3700 0000 0000 002", expiry: "03/30", cvc: "7373" },
  { type: "Visa (3DS2)", number: "4871 0499 9999 0006", expiry: "03/30", cvc: "737" },
  { type: "Declined", number: "4000 0000 0000 0002", expiry: "03/30", cvc: "737" },
];

const STATUS_LABEL: Record<MerchantStatus, string> = {
  pending: "Application not started",
  under_review: "Under review",
  approved: "Approved",
  suspended: "Suspended",
};

const STATUS_VARIANT: Record<MerchantStatus, "secondary" | "default" | "destructive" | "outline"> = {
  pending: "outline",
  under_review: "secondary",
  approved: "default",
  suspended: "destructive",
};

export default function PaymentSettingsTab({ venueId }: { venueId: string }) {
  const [config, setConfig] = useState<PaymentConfig>({
    venue_id: venueId,
    provider: "ordrpayments",
    environment: "test",
    is_active: false,
    capture_mode: "immediate",
    statement_descriptor: "",
    country_code: "AU",
    default_currency: "AUD",
    merchant_status: "pending",
    merchant_id_ordrpay: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [availableMethods, setAvailableMethods] = useState<string[] | null>(null);

  useEffect(() => {
    fetchConfig();
  }, [venueId]);

  const fetchConfig = async () => {
    setLoading(true);
    // Use SECURITY DEFINER RPC: returns non-secret fields only.
    // Raw API/HMAC/client keys are no longer readable via the Data API.
    let { data } = await supabase.rpc("get_venue_payment_config_meta" as any, {
      _venue_id: venueId,
      _provider: "ordrpayments",
    });

    if (!data) {
      // Legacy provider name fallback (internal only — never shown)
      const { data: legacyData } = await supabase.rpc("get_venue_payment_config_meta" as any, {
        _venue_id: venueId,
        _provider: "adyen",
      });
      data = legacyData;
    }

    if (data) {
      const d = data as any;
      setConfig({
        id: d.id,
        venue_id: d.venue_id,
        provider: d.provider,
        environment: d.environment,
        is_active: d.is_active,
        capture_mode: (d.capture_mode as CaptureMode) || "immediate",
        statement_descriptor: d.statement_descriptor || "",
        country_code: d.country_code || "AU",
        default_currency: d.default_currency || "AUD",
        merchant_status: (d.merchant_status as MerchantStatus) || "pending",
        merchant_id_ordrpay: d.merchant_id_ordrpay || null,
      });
    }
    setLoading(false);
  };


  const save = async () => {
    if (config.statement_descriptor.length > 22) {
      toast.error("Statement descriptor must be 22 characters or fewer");
      return;
    }
    setSaving(true);
    const payload: any = {
      venue_id: venueId,
      provider: "ordrpayments",
      environment: config.environment,
      is_active: config.is_active,
      capture_mode: config.capture_mode,
      statement_descriptor: config.statement_descriptor || null,
      country_code: config.country_code,
      default_currency: config.default_currency,
    };

    // Snapshot the previous state (for PCI audit log) before writing
    const { data: prev } = await supabase
      .from("venue_payment_config" as any)
      .select("environment,is_active,capture_mode,statement_descriptor,country_code,default_currency")
      .eq("venue_id", venueId)
      .eq("provider", "ordrpayments")
      .maybeSingle();

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

    if (error) {
      toast.error(error.message);
    } else {
      // PCI DSS Req 10 — write per-field audit rows
      try {
        const { data: sess } = await supabase.auth.getSession();
        const actorId = sess?.session?.user?.id ?? null;
        const actorEmail = sess?.session?.user?.email ?? null;
        const action = config.id ? "update" : "create";
        const tracked: (keyof typeof payload)[] = [
          "environment",
          "is_active",
          "capture_mode",
          "statement_descriptor",
          "country_code",
          "default_currency",
        ];
        const rows = tracked
          .filter((k) => String((prev as any)?.[k] ?? "") !== String((payload as any)[k] ?? ""))
          .map((k) => ({
            venue_id: venueId,
            actor_id: actorId,
            actor_email: actorEmail,
            action,
            field: String(k),
            old_value: (prev as any)?.[k] == null ? null : String((prev as any)[k]),
            new_value: payload[k] == null ? null : String(payload[k]),
            user_agent: navigator.userAgent,
          }));
        if (rows.length > 0) {
          await supabase.from("payment_config_audit" as any).insert(rows);
        }
      } catch (e) {
        console.warn("[PCI audit] failed to record audit entries", e);
      }
      toast.success("H&L Pay settings saved");
    }
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
        setTestResult({
          success: true,
          message: result.message || "H&L Pay connection verified successfully.",
        });
        const methodTypes = (result.methods || []).map((m: any) => m.type);
        setAvailableMethods(methodTypes);
      } else {
        setTestResult({ success: false, message: result.error || "Connection failed" });
        setAvailableMethods(null);
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    }
    setTesting(false);
  };

  const startOnboarding = () => {
    toast.info("H&L Pay merchant onboarding is coming soon. Our team will be in touch.");
  };

  const copyMerchantId = () => {
    if (config.merchant_id_ordrpay) {
      navigator.clipboard.writeText(config.merchant_id_ordrpay);
      toast.success("Merchant ID copied");
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Loading payment settings...</p>;
  }

  const isMockMode = config.environment === "test";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Status Banner */}
      <Card
        className={
          config.is_active
            ? "border-green-500/30 bg-green-500/5"
            : "border-amber-500/30 bg-amber-500/5"
        }
      >
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
                    ? "H&L Pay active in TEST mode"
                    : "H&L Pay active — LIVE transactions"
                  : "H&L Pay not enabled"}
              </p>
              <p className="text-xs text-muted-foreground">
                {config.is_active
                  ? isMockMode
                    ? "Simulated payments — use test cards below to verify your flow."
                    : "Live payment processing — real transactions will be charged."
                  : "Enable H&L Pay below to accept payments from diners."}
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                config.environment === "live"
                  ? "border-red-500/50 text-red-500"
                  : "border-blue-500/50 text-blue-500"
              }
            >
              {config.environment.toUpperCase()}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* H&L Pay Merchant Account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            H&L Pay Merchant Account
          </CardTitle>
          <CardDescription>
            H&L Pay handles your merchant account, funding, statements, and chargebacks.
            No third-party processor accounts to manage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Application status</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Set automatically by the H&L Pay underwriting team.
              </p>
            </div>
            <Badge variant={STATUS_VARIANT[config.merchant_status]}>
              {STATUS_LABEL[config.merchant_status]}
            </Badge>
          </div>

          <Separator />

          <div>
            <Label>H&L Pay Merchant ID</Label>
            <div className="flex items-center gap-2 mt-1.5">
              <Input
                value={config.merchant_id_ordrpay || "—"}
                readOnly
                className="font-mono text-sm bg-muted"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={copyMerchantId}
                disabled={!config.merchant_id_ordrpay}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Issued once your application is approved.
            </p>
          </div>

          {config.merchant_status !== "approved" && (
            <Button onClick={startOnboarding} variant="default">
              {config.merchant_status === "pending" ? "Start onboarding" : "Continue application"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Payment Behaviour */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Behaviour
          </CardTitle>
          <CardDescription>
            Control how H&L Pay processes payments at this venue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Environment Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Mode</Label>
              <p className="text-xs text-muted-foreground">
                {config.environment === "test"
                  ? "Test mode — use cards from the Knowledge Base, no real charges"
                  : "Live mode — real transactions will be processed"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-sm ${
                  config.environment === "test"
                    ? "text-blue-500 font-medium"
                    : "text-muted-foreground"
                }`}
              >
                Test
              </span>
              <Switch
                checked={config.environment === "live"}
                onCheckedChange={(checked) =>
                  setConfig((c) => ({ ...c, environment: checked ? "live" : "test" }))
                }
              />
              <span
                className={`text-sm ${
                  config.environment === "live"
                    ? "text-red-500 font-medium"
                    : "text-muted-foreground"
                }`}
              >
                Live
              </span>
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

          <Separator />

          {/* Capture mode */}
          <div className="space-y-1.5">
            <Label>Capture mode</Label>
            <Select
              value={config.capture_mode}
              onValueChange={(v) =>
                setConfig((c) => ({ ...c, capture_mode: v as CaptureMode }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immediate">Immediate — charge when order is placed</SelectItem>
                <SelectItem value="manual">Manual — authorise now, capture later</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Manual capture lets you authorise the diner's card now and capture funds when the
              order is fulfilled.
            </p>
          </div>

          {/* Statement descriptor */}
          <div className="space-y-1.5">
            <Label htmlFor="statement-descriptor">Statement descriptor</Label>
            <Input
              id="statement-descriptor"
              value={config.statement_descriptor}
              onChange={(e) =>
                setConfig((c) => ({ ...c, statement_descriptor: e.target.value.slice(0, 22) }))
              }
              maxLength={22}
              placeholder="YOUR VENUE NAME"
            />
            <p className="text-xs text-muted-foreground">
              What appears on your diner's bank statement — max 22 characters (
              {config.statement_descriptor.length}/22)
            </p>
          </div>

          {/* Country & Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Select
                value={config.country_code}
                onValueChange={(v) => setConfig((c) => ({ ...c, country_code: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AU">Australia</SelectItem>
                  <SelectItem value="NZ">New Zealand</SelectItem>
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="GB">United Kingdom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Default currency</Label>
              <Select
                value={config.default_currency}
                onValueChange={(v) => setConfig((c) => ({ ...c, default_currency: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUD">AUD</SelectItem>
                  <SelectItem value="NZD">NZD</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
            <Button variant="outline" onClick={testConnection} disabled={testing}>
              <ShieldCheck className="h-4 w-4 mr-2" />
              {testing ? "Testing..." : "Test H&L Pay connection"}
            </Button>
          </div>

          {testResult && (
            <div
              className={`rounded-lg p-3 text-sm flex items-center gap-2 ${
                testResult.success
                  ? "bg-green-500/10 text-green-600"
                  : "bg-red-500/10 text-red-600"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              {testResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wallets status — Apple Pay / Google Pay */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-5 w-5" />
            Wallets & Methods
          </CardTitle>
          <CardDescription>
            Wallets let diners pay with one tap using cards stored in Apple Wallet or Google Pay —
            works for guests too.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {availableMethods === null ? (
            <p className="text-sm text-muted-foreground">
              Run <span className="font-medium">Test H&L Pay connection</span> above to detect
              which payment methods are enabled on your account.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div
                className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
                  availableMethods.includes("scheme")
                    ? "bg-green-500/10 text-green-600"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {availableMethods.includes("scheme") ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <span>Cards</span>
              </div>
              <div
                className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
                  availableMethods.includes("applepay")
                    ? "bg-green-500/10 text-green-600"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {availableMethods.includes("applepay") ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <span>Apple Pay</span>
              </div>
              <div
                className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
                  availableMethods.includes("googlepay")
                    ? "bg-green-500/10 text-green-600"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {availableMethods.includes("googlepay") ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <span>Google Pay</span>
              </div>
            </div>
          )}
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Apple Pay domain verification — automatic.</span>{" "}
              H&L Pay handles the verification file for every venue. Apple Pay only renders on
              Safari; Google Pay only on Chrome/Android — that's a browser/OS requirement.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Test Cards Reference */}
      {config.environment === "test" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test Card Numbers</CardTitle>
            <CardDescription>
              Use these cards in test mode — payments are simulated, no real charges
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {TEST_CARDS.map((card) => (
                <div
                  key={card.number}
                  className="flex items-center justify-between text-sm bg-muted/50 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs w-24 justify-center">
                      {card.type}
                    </Badge>
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
