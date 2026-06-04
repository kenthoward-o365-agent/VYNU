import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2, PlayCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function ARSettingsTab() {
  const [schedule, setSchedule] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [batchBusy, setBatchBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("ar_dunning_schedules").select("*").eq("is_default", true).single();
    setSchedule(data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("ar_dunning_schedules").update({
      retry_days: schedule.retry_days,
      max_attempts: schedule.max_attempts,
      auto_suspend: schedule.auto_suspend,
      uncollectible_after_attempts: schedule.uncollectible_after_attempts,
      escalate_email: schedule.escalate_email,
      in_app_alert: schedule.in_app_alert,
    }).eq("id", schedule.id);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Settings saved" });
    setSaving(false);
  };

  const runBatch = async (fn: string, dryRun: boolean) => {
    setBatchBusy(fn);
    const { data, error } = await supabase.functions.invoke(fn, { body: { dry_run: dryRun } });
    if (error) toast({ title: "Batch failed", description: error.message, variant: "destructive" });
    else toast({ title: dryRun ? "Dry run complete" : "Batch complete", description: JSON.stringify(data).slice(0, 200) });
    setBatchBusy(null);
  };

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="font-semibold">Dunning policy</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Retry days (comma-separated)</Label>
              <Input
                value={schedule.retry_days.join(",")}
                onChange={(e) => setSchedule({ ...schedule, retry_days: e.target.value.split(",").map(s => parseInt(s.trim()) || 0).filter(Boolean) })}
              />
            </div>
            <div>
              <Label>Max attempts</Label>
              <Input type="number" value={schedule.max_attempts} onChange={(e) => setSchedule({ ...schedule, max_attempts: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>Mark uncollectible after attempts</Label>
              <Input type="number" value={schedule.uncollectible_after_attempts} onChange={(e) => setSchedule({ ...schedule, uncollectible_after_attempts: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={schedule.escalate_email} onCheckedChange={(c) => setSchedule({ ...schedule, escalate_email: c })} />
            <Label>Send escalating emails on each retry</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={schedule.in_app_alert} onCheckedChange={(c) => setSchedule({ ...schedule, in_app_alert: c })} />
            <Label>Create in-app staff alerts</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={schedule.auto_suspend} onCheckedChange={(c) => setSchedule({ ...schedule, auto_suspend: c })} />
            <Label>Auto-suspend venue access on max attempts</Label>
          </div>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save policy"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <h3 className="font-semibold">Manual batch runs</h3>
          <p className="text-xs text-muted-foreground">
            The nightly batch runs automatically at <strong>3:00 AM AEST</strong>.
            Use these buttons to test manually.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" onClick={() => runBatch("ar-generate-invoices", true)} disabled={batchBusy !== null}>
              <PlayCircle className="h-3.5 w-3.5 mr-1" /> Generate invoices (dry run)
            </Button>
            <Button size="sm" onClick={() => runBatch("ar-generate-invoices", false)} disabled={batchBusy !== null}>
              <PlayCircle className="h-3.5 w-3.5 mr-1" /> Generate invoices (live)
            </Button>
            <Button size="sm" variant="outline" onClick={() => runBatch("ar-charge-due-invoices", true)} disabled={batchBusy !== null}>
              <PlayCircle className="h-3.5 w-3.5 mr-1" /> Charge due (dry run)
            </Button>
            <Button size="sm" onClick={() => runBatch("ar-charge-due-invoices", false)} disabled={batchBusy !== null}>
              <PlayCircle className="h-3.5 w-3.5 mr-1" /> Charge due (live)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
