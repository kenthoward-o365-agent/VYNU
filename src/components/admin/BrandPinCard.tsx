import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { Brand } from "@/lib/white-label";

export default function BrandPinCard({ venueId }: { venueId: string }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: bs }, { data: v }] = await Promise.all([
        supabase.from("white_label_brands").select("*").order("is_default", { ascending: false }).order("name"),
        supabase.from("venues").select("white_label_brand_id").eq("id", venueId).maybeSingle(),
      ]);
      setBrands((bs as unknown as Brand[]) ?? []);
      setCurrent(((v as any)?.white_label_brand_id) ?? "__default__");
    })();
  }, [venueId]);

  const save = async () => {
    setSaving(true);
    const value = current === "__default__" ? null : current;
    const { error } = await supabase.from("venues").update({ white_label_brand_id: value } as any).eq("id", venueId);
    setSaving(false);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Brand updated", description: "New QR codes will use this brand's host. Existing QR stickers are unchanged." });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>White Label Brand</CardTitle>
        <CardDescription>Pin this venue to a specific tenant brand. Newly generated QR codes will use that brand's consumer host. Existing printed QR stickers continue to work on their original URL.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={current} onValueChange={setCurrent}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__">Platform default</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name} {b.consumer_host ? `(${b.consumer_host})` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save brand"}</Button>
      </CardContent>
    </Card>
  );
}
