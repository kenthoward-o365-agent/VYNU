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
  Clock, CloudRain, Users, Star, Lock, Zap, Compass, Save,
  Sparkles, ShoppingCart, RefreshCw
} from "lucide-react";

interface UpsellConfig {
  enabled: boolean;
  contextual_pairing: boolean;
  addon_prompts: boolean;
  cart_suggestions: boolean;
  reorder_prompts: boolean;
  reorder_window_minutes: number;
}

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
  upsell: UpsellConfig;
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
  upsell: {
    enabled: true,
    contextual_pairing: true,
    addon_prompts: true,
    cart_suggestions: true,
    reorder_prompts: true,
    reorder_window_minutes: 30,
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
      setConfig((prev) => ({ ...prev, ...settings.diner_personalisation }));
    }
    if (settings?.upsell) {
      setConfig((prev) => ({ ...prev, upsell: { ...defaultConfig.upsell, ...settings.upsell } }));
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
    const { upsell, ...dinerConfig } = config;
    const { error } = await supabase
      .from("venues")
      .update({ settings: { ...existingSettings, diner_personalisation: dinerConfig, upsell } as any })
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
                  Greet returning diners with a personalised message based on their loyalty tier when they open the ordering experience. Messages can include their name, tier level, and visit count using merge fields. Each loyalty tier (Bronze, Silver, Gold) can have its own tailored greeting to make higher-tier guests feel recognised.
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
                  Go beyond "previous orders" — Shyndig AI predicts what the diner actually wants right now. It analyses time of day (lunch vs dinner habits), weather conditions (comfort food on rainy days, lighter dishes when it's hot), and party size behaviour to build a "likely basket" before the diner even browses. Returning diners see instant suggestions like "Want your usual Friday night order?" — increasing speed to order and average ticket value.
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
                  desc: "Learns each diner's ordering patterns by time of day — suggests lighter meals at lunch and heartier dishes at dinner. Adapts to weekday vs weekend habits automatically.",
                  icon: Clock,
                },
                {
                  key: "weather_aware" as const,
                  label: "Weather-Aware Suggestions",
                  desc: "Integrates local weather data to adjust recommendations. Rainy days promote soups, warm drinks, and comfort food. Hot days surface salads, cold beverages, and lighter fare.",
                  icon: CloudRain,
                },
                {
                  key: "party_size" as const,
                  label: "Party Size Detection",
                  desc: "Detects group size via concurrent device count or order behaviour (e.g. multiple separate items). Suggests sharing plates, platters, or bottles for larger groups to increase per-table spend.",
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
                  When a returning diner opens the ordering experience, they're presented with a "Order Again" button showing their most recent past orders in date order. One tap re-adds the entire order to their cart — reducing friction and speeding up repeat visits. Ideal for regulars who tend to order the same meals.
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
                  Not cheesy — subtle and status-driven. Reward your most loyal diners with exclusive perks that encourage exploration and repeat visits. Features are designed for adults: think private club vibes, not arcade points. Diners unlock benefits based on visit frequency and spending behaviour.
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
                  desc: "Recognise your top diners with subtle status indicators like \"Top 10% guest\" or \"Regular\". Badges appear in the diner's profile and welcome message — making them feel valued without being over the top. Drives emotional loyalty and word-of-mouth.",
                  icon: Star,
                },
                {
                  key: "secret_menu" as const,
                  label: "Secret Menu Items",
                  desc: "Unlock hidden dishes that only appear for diners who reach a certain tier or visit count. Creates exclusivity and gives loyal guests something to talk about — \"Have you tried their secret burger?\" Perfect for building a cult following.",
                  icon: Lock,
                },
                {
                  key: "early_access" as const,
                  label: "Early Access Dishes",
                  desc: "Let your top-tier diners preview and order new menu items before they go live for everyone else. Creates a VIP experience and gives you real feedback from your most engaged guests before a full rollout.",
                  icon: Zap,
                },
                {
                  key: "exploration_tracker" as const,
                  label: "Exploration Tracker",
                  desc: "Shows diners their progress through your menu — e.g. \"You've tried 8/12 chef specials\". Gamifies menu discovery and encourages diners to branch out from their usual order, increasing exposure to higher-margin items.",
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

      {/* ── E. AI Upsell Engine ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">AI Upsell Engine</CardTitle>
                <CardDescription>
                  Automatically suggest complementary items, add-ons, and reorder prompts to increase average order value. Every suggestion feels helpful, never pushy — guests can dismiss with one tap.
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={config.upsell.enabled}
              onCheckedChange={(enabled) =>
                update({ upsell: { ...config.upsell, enabled } })
              }
            />
          </div>
        </CardHeader>
        {config.upsell.enabled && (
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {[
                {
                  key: "contextual_pairing" as const,
                  label: "Contextual Pairing",
                  desc: "When a guest adds an item, suggest a complementary pairing — steak → red wine, coffee → pastry. The AI learns from your menu categories and descriptions.",
                  icon: Sparkles,
                },
                {
                  key: "addon_prompts" as const,
                  label: "Add-on Prompts",
                  desc: "After item selection, prompt upgrades or small extras — \"Add a side of chips for $5?\" or \"Make it a large for $2 more?\" Brief and dismissible.",
                  icon: ShoppingCart,
                },
                {
                  key: "cart_suggestions" as const,
                  label: "Smart Cart Suggestions",
                  desc: "When the guest opens their cart, show 1–2 low-friction additions at the bottom — a side, dessert, or extra drink with image and price. One tap to add.",
                  icon: Zap,
                },
                {
                  key: "reorder_prompts" as const,
                  label: "Reorder Prompts",
                  desc: "For returning guests, gently prompt \"Another round?\" with their previous drink order pre-filled after a configurable time window.",
                  icon: RefreshCw,
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
                    checked={config.upsell[key]}
                    onCheckedChange={(val) =>
                      update({ upsell: { ...config.upsell, [key]: val } })
                    }
                  />
                </div>
              ))}
            </div>

            <Separator />

            <div className="flex items-center gap-4">
              <Label className="whitespace-nowrap">Reorder window</Label>
              <Input
                type="number"
                min={5}
                max={120}
                className="w-20"
                value={config.upsell.reorder_window_minutes}
                onChange={(e) =>
                  update({
                    upsell: {
                      ...config.upsell,
                      reorder_window_minutes: Number(e.target.value) || 30,
                    },
                  })
                }
              />
              <span className="text-sm text-muted-foreground">minutes</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Time since the guest's last drink order before prompting "Another round?"
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
