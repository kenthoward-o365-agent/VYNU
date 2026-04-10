import { useState, useEffect } from "react";
import { useVenue } from "@/contexts/VenueContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MessageSquare, Brain, RotateCcw, Trophy,
  Clock, CloudRain, Users, Star, Lock, Zap, Compass, Save
} from "lucide-react";

interface DinerPersonalisation {
  welcome_message: {
    enabled: boolean;
    templates: {
      default: string;
      tiers: Record<string, string>;
    };
  };
  predictive_dining: {
    enabled: boolean;
    time_based: boolean;
    weather_aware: boolean;
    party_size: boolean;
  };
  order_again: {
    enabled: boolean;
    max_orders: number;
  };
  gamification: {
    enabled: boolean;
    status_badges: boolean;
    secret_menu: boolean;
    early_access: boolean;
    exploration_tracker: boolean;
    unlock_threshold: number;
  };
}

const defaultConfig: DinerPersonalisation = {
  welcome_message: {
    enabled: false,
    templates: {
      default: "Welcome back, {name}! Great to see you again.",
      tiers: {
        Bronze: "Hey {name}, welcome back! You've visited {visits} times.",
        Silver: "Welcome back, {name}! As a Silver member, check out our chef's specials today.",
        Gold: "G'day {name}! As one of our Gold VIPs, we've got something special for you today.",
      },
    },
  },
  predictive_dining: {
    enabled: false,
    time_based: true,
    weather_aware: true,
    party_size: true,
  },
  order_again: {
    enabled: false,
    max_orders: 10,
  },
  gamification: {
    enabled: false,
    status_badges: true,
    secret_menu: true,
    early_access: true,
    exploration_tracker: true,
    unlock_threshold: 5,
  },
};

export default function DinerPreferences() {
  const { venue } = useVenue();
  const [config, setConfig] = useState<DinerPersonalisation>(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!venue) return;
    const settings = (venue as any).settings as Record<string, any> | null;
    if (settings?.diner_personalisation) {
      setConfig({ ...defaultConfig, ...settings.diner_personalisation });
    }
  }, [venue]);

  const update = (patch: Partial<DinerPersonalisation>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const save = async () => {
    if (!venue) return;
    setSaving(true);
    const existingSettings = ((venue as any).settings as Record<string, any>) || {};
    const { error } = await supabase
      .from("venues")
      .update({ settings: { ...existingSettings, diner_personalisation: config } as any })
      .eq("id", venue.id);
    setSaving(false);
    if (error) {
      toast.error("Failed to save preferences");
    } else {
      toast.success("Diner preferences saved");
      setDirty(false);
    }
  };

  const previewWelcome = (template: string) =>
    template
      .replace("{name}", "Kent")
      .replace("{tier}", "Gold")
      .replace("{visits}", "23");

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Diner Personalisation</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Configure how returning diners are greeted and engaged when they log in.
          </p>
        </div>
        <Button onClick={save} disabled={saving || !dirty} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* ── A. Personalised Welcome Message ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Personalised Welcome Message</CardTitle>
                <CardDescription>
                  Greet returning diners by name and loyalty tier when they log in.
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={config.welcome_message.enabled}
              onCheckedChange={(enabled) =>
                update({ welcome_message: { ...config.welcome_message, enabled } })
              }
            />
          </div>
        </CardHeader>
        {config.welcome_message.enabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Default Template</Label>
              <Textarea
                value={config.welcome_message.templates.default}
                onChange={(e) =>
                  update({
                    welcome_message: {
                      ...config.welcome_message,
                      templates: { ...config.welcome_message.templates, default: e.target.value },
                    },
                  })
                }
                placeholder="Welcome back, {name}!"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Merge fields: <code className="text-primary">{"{name}"}</code>{" "}
                <code className="text-primary">{"{tier}"}</code>{" "}
                <code className="text-primary">{"{visits}"}</code>
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Preview</p>
              <p className="text-sm text-foreground italic">
                {previewWelcome(config.welcome_message.templates.default)}
              </p>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" /> Tier-Specific Templates
              </Label>
              {Object.entries(config.welcome_message.templates.tiers).map(([tier, template]) => (
                <div key={tier} className="space-y-1">
                  <Label className="text-xs">{tier}</Label>
                  <Textarea
                    value={template}
                    onChange={(e) => {
                      const tiers = { ...config.welcome_message.templates.tiers, [tier]: e.target.value };
                      update({
                        welcome_message: {
                          ...config.welcome_message,
                          templates: { ...config.welcome_message.templates, tiers },
                        },
                      });
                    }}
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground italic">
                    {previewWelcome(template)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── B. Predictive Dining ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brain className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Predictive Dining</CardTitle>
                <CardDescription>
                  AI predicts what the diner wants based on context — not just past orders.
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={config.predictive_dining.enabled}
              onCheckedChange={(enabled) =>
                update({ predictive_dining: { ...config.predictive_dining, enabled } })
              }
            />
          </div>
        </CardHeader>
        {config.predictive_dining.enabled && (
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-sm text-foreground italic">
                "Welcome back, Kent — want your usual Friday night order?"
              </p>
            </div>

            <div className="space-y-3">
              {[
                {
                  key: "time_based" as const,
                  label: "Time-Based Suggestions",
                  desc: "Adapt recommendations to lunch vs dinner habits",
                  icon: Clock,
                },
                {
                  key: "weather_aware" as const,
                  label: "Weather-Aware Suggestions",
                  desc: "Rain → comfort food, hot day → lighter items",
                  icon: CloudRain,
                },
                {
                  key: "party_size" as const,
                  label: "Party Size Detection",
                  desc: "Detect group size via order behaviour or device count",
                  icon: Users,
                },
              ].map(({ key, label, desc, icon: Icon }) => (
                <div key={key} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                  <Switch
                    checked={config.predictive_dining[key]}
                    onCheckedChange={(val) =>
                      update({ predictive_dining: { ...config.predictive_dining, [key]: val } })
                    }
                  />
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              AI builds a "likely basket" before the diner even browses the menu.
            </p>
          </CardContent>
        )}
      </Card>

      {/* ── C. Order Again ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RotateCcw className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Order Again</CardTitle>
                <CardDescription>
                  Show a quick-reorder button for the diner's previous orders.
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={config.order_again.enabled}
              onCheckedChange={(enabled) =>
                update({ order_again: { ...config.order_again, enabled } })
              }
            />
          </div>
        </CardHeader>
        {config.order_again.enabled && (
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Label className="whitespace-nowrap">Past orders to show</Label>
              <Input
                type="number"
                min={1}
                max={25}
                className="w-20"
                value={config.order_again.max_orders}
                onChange={(e) =>
                  update({ order_again: { ...config.order_again, max_orders: Number(e.target.value) || 10 } })
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Diners see their most recent orders in date order and can place the same order with one tap.
            </p>
          </CardContent>
        )}
      </Card>

      {/* ── D. Gamification ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trophy className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Gamification</CardTitle>
                <CardDescription>
                  Subtle, status-driven features that encourage exploration and repeat visits.
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={config.gamification.enabled}
              onCheckedChange={(enabled) =>
                update({ gamification: { ...config.gamification, enabled } })
              }
            />
          </div>
        </CardHeader>
        {config.gamification.enabled && (
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {[
                {
                  key: "status_badges" as const,
                  label: "Status Badges",
                  desc: '"Top 10% guest" — subtle recognition for loyal diners',
                  icon: Star,
                },
                {
                  key: "secret_menu" as const,
                  label: "Secret Menu Items",
                  desc: "Unlock hidden dishes at certain tiers or visit counts",
                  icon: Lock,
                },
                {
                  key: "early_access" as const,
                  label: "Early Access Dishes",
                  desc: "Preview new items before they're on the public menu",
                  icon: Zap,
                },
                {
                  key: "exploration_tracker" as const,
                  label: "Exploration Tracker",
                  desc: '"You\'ve tried 8/12 chef specials" — drives menu exploration',
                  icon: Compass,
                },
              ].map(({ key, label, desc, icon: Icon }) => (
                <div key={key} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                  <Switch
                    checked={config.gamification[key]}
                    onCheckedChange={(val) =>
                      update({ gamification: { ...config.gamification, [key]: val } })
                    }
                  />
                </div>
              ))}
            </div>

            <Separator />

            <div className="flex items-center gap-4">
              <Label className="whitespace-nowrap">Unlock after</Label>
              <Input
                type="number"
                min={1}
                max={100}
                className="w-20"
                value={config.gamification.unlock_threshold}
                onChange={(e) =>
                  update({
                    gamification: {
                      ...config.gamification,
                      unlock_threshold: Number(e.target.value) || 5,
                    },
                  })
                }
              />
              <span className="text-sm text-muted-foreground">visits</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Minimum visits before gamification features unlock for a diner.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
