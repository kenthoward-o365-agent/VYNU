

## Ordrup Loyalty — built-in rewards engine (Toast-inspired)

Rename the toggle, expand the program model with **Toast-style features**, and ship a full editor under Group Settings → **Diner & Loyalty Settings**.

### 1. Rename + reframe the section

In `AdminVenueDetail.tsx` (parent venue's *Group Settings* tab) and `GroupDashboard.tsx` (*Global Settings*):
- **Section title** stays "Diner & Loyalty Settings".
- Rename the toggle row from *"Global Diner Recognition"* → **"Ordrup Loyalty"**.
- New description: *"Ordrup's own built-in loyalty program — free of charge. Reward repeat diners with points, status tiers, birthday treats and more, across every venue in your group."*
- Keep the existing "Global Loyalty Programs" toggle (controls cross-venue pooling — separate concern).
- Add a **"Configure Program"** button next to the toggle → opens the new editor.

### 2. Expand the `loyalty_programs.rules` JSONB shape

No table changes — only the JSON structure that lives in `rules`. New canonical shape:

```jsonc
{
  "earn": {
    "mode": "points" | "stamps",          // operator picks one
    "points_per_dollar": 1,                // when mode=points
    "stamp_trigger": "visit" | "item",     // when mode=stamps
    "stamps_required": 10,                 // when mode=stamps
    "stamp_reward_item_id": "uuid|null"
  },
  "redeem": {
    "rate_cents_per_point": 5,             // 100 pts = $5
    "min_redeem_points": 100
  },
  "signup_bonus": { "enabled": true, "points": 50 },
  "tiers": {
    "enabled": true,
    "basis": "rolling_12mo_spend",
    "levels": [
      { "name": "Bronze", "threshold": 0,    "perks": "1x points",            "color": "#CD7F32" },
      { "name": "Silver", "threshold": 500,  "perks": "1.25x points + priority", "color": "#C0C0C0" },
      { "name": "Gold",   "threshold": 2000, "perks": "1.5x points + free dessert weekly", "color": "#FFD700" }
    ]
  },
  "birthday_reward": {
    "enabled": true,
    "type": "points" | "free_item" | "percent_discount",
    "points": 100,
    "free_item_id": "uuid|null",
    "discount_percent": 20,
    "valid_days": 14
  },
  "anniversary_reward": { "enabled": false, "type": "points", "points": 50 },
  "milestones": [
    { "at_points": 250,  "reward_type": "discount_dollars", "value": 5,  "label": "Bronze milestone" },
    { "at_points": 1000, "reward_type": "free_item",        "free_item_id": "uuid", "label": "House cocktail on us" }
  ]
}
```

Backwards-compatible: existing programs (*The Pass*, *Morris House*) get auto-mapped at first edit (current `points_per_dollar` → `earn.points_per_dollar`, current `birthday_reward` block preserved, `tiers.enabled = false` until operator opts in).

### 3. New component: `OrdrupLoyaltyEditor.tsx`

Mounted from both *AdminVenueDetail → Group Settings* (group programs) and *VenueSettings* (solo venues — same component, scope-aware via prop). Sectioned layout:

```text
┌─ Program Identity ─────────────────────────┐
│ Name [_________________]  Active [✓]       │
└────────────────────────────────────────────┘

┌─ Earn Mechanic ────────────────────────────┐
│ ○ Points per dollar    ● Visit stamps      │
│   Points/$ [1.0]         Trigger: Visit ▾  │
│                          Stamps required [10]
│                          Free item: Coffee ▾
└────────────────────────────────────────────┘

┌─ Redemption ───────────────────────────────┐
│ 100 points = $[5.00]                       │
│ Minimum redemption: [100] points           │
└────────────────────────────────────────────┘

┌─ Sign-up Bonus ────────────────────────────┐
│ [✓] Award [50] points when a diner joins   │
└────────────────────────────────────────────┘

┌─ Status Tiers (Rolling 12-month spend) ────┐
│ [✓] Enable tier badges                     │
│ ┌──────────┬────────────┬──────────────┐   │
│ │ Bronze   │ $0+        │ 1x points    │ ✕ │
│ │ Silver   │ $500+      │ 1.25x points │ ✕ │
│ │ Gold     │ $2000+     │ 1.5x points  │ ✕ │
│ └──────────┴────────────┴──────────────┘   │
│ [+ Add tier]                               │
└────────────────────────────────────────────┘

┌─ Birthday Reward ──────────────────────────┐
│ [✓] Enabled                                │
│ Type: ○ Bonus points  ● Free item  ○ % off │
│ Pick item: [Cake slice ▾]                  │
│ Valid for [14] days after birthday         │
└────────────────────────────────────────────┘

┌─ Point Milestones ─────────────────────────┐
│ At 250 pts → $5 discount         [edit][✕] │
│ At 1000 pts → Free house cocktail [edit][✕]│
│ [+ Add milestone]                          │
└────────────────────────────────────────────┘

[ Save Program ]
```

Stores everything as one `UPDATE loyalty_programs SET rules = ..., name = ... WHERE id = ...`.

### 4. Earn engine updates (`supabase/functions/loyalty-earn`)

Existing function already awards points on order paid. Extend it to:
- Read the new `rules.earn` block; if `mode = stamps`, increment a stamp counter on `loyalty_balances.balance` (1 per qualifying visit/item) instead of points.
- Apply tier multiplier when calculating points (`balance * level.multiplier` derived from perks string is too brittle — store an explicit `earn_multiplier` number on each tier level).
- After awarding, recompute the diner's tier from rolling 12-month spend (`SELECT SUM(spend_excl_tax) FROM diner_visits WHERE diner_id = ? AND venue_id IN (...) AND visited_at > now() - interval '12 months'`) and write `loyalty_balances.tier`.
- Check milestones — if balance crossed a threshold this order, insert a **redeemable reward** row (see #5).
- Check birthday window — if `diner_profiles` has a birthday field within ±N days, fire the birthday reward once per year (idempotency key on a new `loyalty_rewards_issued` table).

### 5. New table: `loyalty_rewards_issued`

To track one-off rewards (birthday, milestone, signup bonus issued as items rather than points), so they're idempotent and redeemable.

```sql
CREATE TABLE loyalty_rewards_issued (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diner_id uuid NOT NULL,
  program_id uuid NOT NULL REFERENCES loyalty_programs(id),
  reward_kind text NOT NULL,        -- 'signup' | 'birthday' | 'anniversary' | 'milestone' | 'tier_up'
  reward_payload jsonb NOT NULL,    -- {type, points, free_item_id, discount_percent, expires_at}
  issued_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  redeemed_order_id uuid,
  idempotency_key text UNIQUE       -- e.g. "birthday-2026-{diner_id}-{program_id}"
);
```

RLS: diners read their own; staff read for their venues; managers can void.

### 6. Diner-side surfaces (small touches)

- **`DinerProfile.tsx`**: under each membership, show the tier badge (color chip + name) and "Next tier in $X" progress bar; list active unredeemed rewards from `loyalty_rewards_issued`.
- **`CheckoutPanel.tsx`**: "Available rewards" row above the redeem-points toggle — tap to apply a free item or % discount from `loyalty_rewards_issued`.

### 7. Diner birthday capture

Add a `birthday` (DATE) column to `diner_profiles` and an editor field in `DinerProfile`. Birthday reward issuance keyed off this.

## Files to change

| File | Change |
|------|--------|
| New migration | `loyalty_rewards_issued` table + RLS; `diner_profiles.birthday` column |
| `src/components/venue/OrdrupLoyaltyEditor.tsx` (new) | Full sectioned editor described above |
| `src/pages/AdminVenueDetail.tsx` | Rename row → "Ordrup Loyalty" + new description; "Configure Program" button mounts editor |
| `src/pages/GroupDashboard.tsx` | Same rename + Configure button |
| `src/pages/VenueSettings.tsx` | Mount the same editor for solo (non-group) venues |
| `supabase/functions/loyalty-earn/index.ts` | Stamps mode, tier recalculation, milestone firing, birthday/anniversary issuance with idempotency |
| `src/components/consumer/DinerProfile.tsx` | Tier badge + progress + active rewards list + birthday field |
| `src/components/consumer/CheckoutPanel.tsx` | "Available rewards" applicator above existing redeem toggle |

## Out of scope (Phase 2+)

- Marketing automation (email/SMS blasts to tier holders or birthdays — separate notification system).
- Item-level point multipliers (e.g. "2x points on cocktails").
- Cross-group "Ordrup Network" pooling.
- Staff-side manual point adjustment UI.

## Expected result

A group admin opens *Group Settings → Diner & Loyalty Settings*, sees the renamed **Ordrup Loyalty** section described as Ordrup's free built-in program. They click **Configure Program** and define: 1 pt/$, Bronze/Silver/Gold tiers based on rolling 12-month spend, a 50-pt signup bonus, a free dessert on birthdays valid 14 days, and milestones at 250 pts ($5 off) and 1000 pts (free cocktail). Diners see their tier badge + progress in their profile, redeem rewards at checkout, and get a birthday treat automatically — all without the venue paying for a 3rd-party loyalty platform.

