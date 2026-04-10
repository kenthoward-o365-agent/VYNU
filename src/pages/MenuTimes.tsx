import { useEffect, useState } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Clock, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

interface TimeFrame {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  is_active: boolean;
  display_order: number;
}

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function MenuTimes() {
  const { venue } = useVenue();
  const [frames, setFrames] = useState<TimeFrame[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFrame, setEditingFrame] = useState<TimeFrame | null>(null);
  const [form, setForm] = useState({
    name: "",
    start_time: "06:00",
    end_time: "11:00",
    days_of_week: [0, 1, 2, 3, 4, 5, 6] as number[],
  });

  const fetchFrames = async () => {
    if (!venue) return;
    const { data } = await supabase
      .from("menu_time_frames")
      .select("*")
      .eq("venue_id", venue.id)
      .order("display_order");
    setFrames((data as TimeFrame[]) || []);
  };

  useEffect(() => { fetchFrames(); }, [venue]);

  const openAdd = () => {
    setEditingFrame(null);
    setForm({ name: "", start_time: "06:00", end_time: "11:00", days_of_week: [0, 1, 2, 3, 4, 5, 6] });
    setDialogOpen(true);
  };

  const openEdit = (frame: TimeFrame) => {
    setEditingFrame(frame);
    setForm({
      name: frame.name,
      start_time: frame.start_time,
      end_time: frame.end_time,
      days_of_week: frame.days_of_week,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!venue || !form.name.trim()) return;
    const payload = {
      venue_id: venue.id,
      name: form.name.trim(),
      start_time: form.start_time,
      end_time: form.end_time,
      days_of_week: form.days_of_week,
    };

    if (editingFrame) {
      const { error } = await supabase.from("menu_time_frames").update(payload).eq("id", editingFrame.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Time frame updated");
    } else {
      const { error } = await supabase.from("menu_time_frames").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Time frame created");
    }
    setDialogOpen(false);
    fetchFrames();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("menu_time_frames").update({ is_active: !current }).eq("id", id);
    fetchFrames();
  };

  const deleteFrame = async (id: string) => {
    await supabase.from("menu_time_frames").delete().eq("id", id);
    toast.success("Time frame deleted");
    fetchFrames();
  };

  const toggleDay = (day: number) => {
    setForm((f) => ({
      ...f,
      days_of_week: f.days_of_week.includes(day)
        ? f.days_of_week.filter((d) => d !== day)
        : [...f.days_of_week, day],
    }));
  };

  const formatTime = (t: string) => {
    const [h, m] = t.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${h12}:${m} ${ampm}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Menu Times</h2>
          <p className="text-muted-foreground">Define when menu items are available (e.g. Breakfast, Lunch, Happy Hour)</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Time Frame</Button>
      </div>

      {frames.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No time frames</h3>
            <p className="text-muted-foreground mb-4">Create time frames like Breakfast, Lunch, or Happy Hour to control when items appear on the menu</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {frames.map((frame) => (
            <Card key={frame.id} className={!frame.is_active ? "opacity-60" : ""}>
              <CardContent className="flex items-center gap-4 py-4 px-5">
                <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{frame.name}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatTime(frame.start_time)} – {formatTime(frame.end_time)}
                    {" • "}
                    {frame.days_of_week.length === 7
                      ? "Every day"
                      : frame.days_of_week.map((d) => dayNames[d]).join(", ")}
                  </p>
                </div>
                <Switch
                  checked={frame.is_active}
                  onCheckedChange={() => toggleActive(frame.id, frame.is_active)}
                />
                <Button variant="ghost" size="icon" onClick={() => openEdit(frame)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => deleteFrame(frame.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingFrame ? "Edit Time Frame" : "Add Time Frame"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Name</Label>
              <Input
                placeholder="e.g. Breakfast, Happy Hour"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Start time</Label>
                <Input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">End time</Label>
                <Input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">Days</Label>
              <div className="flex gap-1.5">
                {dayNames.map((d, i) => (
                  <Badge
                    key={i}
                    variant={form.days_of_week.includes(i) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleDay(i)}
                  >{d}</Badge>
                ))}
              </div>
            </div>
            <Button onClick={handleSave} className="w-full" disabled={!form.name.trim()}>
              {editingFrame ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
