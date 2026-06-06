# Diner CRM — Plan

Goal: turn the Diners page into a full CRM with rich profiles, smart segments, scheduled multi-channel campaigns, AI-powered instant campaigns with guardrails, trigger-based automations, contests, and end-to-end revenue attribution that rolls into existing AI Generated Revenue.

Note: `diner_profiles.birthday` already exists. We extend, not replace.

---

## 1. Diner profile enrichment

**Schema additions to `diner_profiles`:**
- `birthday_month` / `birthday_day` (generated cols from `birthday`) — fast segment filters without exposing year.
- `marketing_email_opt_in`, `marketing_sms_opt_in`, `marketing_push_opt_in` (default false; explicit consent).
- `sms_e164` (normalised), `push_subscription` (jsonb — web push endpoint+keys).
- `unsubscribe_token` (uuid, unique).
- `crm_notes` (text, staff only).

**Computed/materialised per (diner_id, venue_id) — `diner_venue_stats` table, refreshed by trigger on `orders`/`diner_visits`:**
- `lifetime_spend`, `lifetime_orders`, `avg_ticket`, `last_visit_at`, `first_visit_at`, `visit_count_90d`, `favourite_category_id`, `favourite_item_id`, `preferred_daypart`, `rfm_recency`, `rfm_frequency`, `rfm_monetary`, `churn_risk_score` (0–100).

**Signup change (`DinerSignup.tsx`):** add optional birthday field with helper text "Get a birthday treat 🎂". `DinerProfile.tsx` keeps the existing prompt and adds channel opt-in toggles + a one-time "Add your birthday for a reward" nudge after first order.

---

## 2. Segmentation engine

**Table `diner_segments`** (per venue or group):
- `name`, `description`, `is_dynamic` (bool), `rules` (jsonb DSL), `ai_generated` (bool), `last_evaluated_at`, `member_count`.

**Rule DSL (jsonb, AND/OR groups):** any combination of —
- Spend: `lifetime_spend >=`, `avg_ticket between`, `spend_last_30d >=`
- Visits: `last_visit_within / before`, `visit_count >=`, `lapsed_days >=`
- Birthday: `birthday_month = current`, `birthday_day in next 7d`, `birthday_month = X`
- Behaviour: `favourite_category`, `dietary_tags contains`, `preferred_daypart`
- Loyalty: `points_balance >=`, `tier =`
- Channel eligibility (auto-applied): respects opt-in + suppression

**Materialised membership:** `diner_segment_members(segment_id, diner_id, added_at)` refreshed by edge function `evaluate-segments` (cron 15 min + on-demand).

**AI lookalikes / smart segments** (chosen option):
- Edge function `ai-suggest-segments` calls `google/gemini-3-flash-preview` with anonymised aggregate stats → proposes segments like *"High-LTV wine lovers"*, *"At-risk lapsed regulars"*, *"Weekend brunch crew"*. Saved as `ai_generated=true` drafts staff can publish.

---

## 3. Campaigns

**Table `crm_campaigns`:**
- `venue_id`, `name`, `channel` (`email|sms|push|in_app`), `segment_id`, `status` (`draft|scheduled|sending|sent|cancelled`), `scheduled_at`, `subject`, `body_md`, `cta_url`, `image_url`, `discount_id` (FK loyalty reward), `ai_generated`, `ai_prompt_used`, `created_by`, totals (`recipients`, `sent`, `delivered`, `opened`, `clicked`, `unsubscribed`, `bounced`).

**Table `crm_campaign_sends`** (one row per recipient): `campaign_id`, `diner_id`, `channel`, `status`, timestamps, `message_id`, `error`. Used for both delivery tracking and revenue attribution.

**Channels & infra:**
- **Email** — Lovable Emails (already configured). New React Email template `_shared/transactional-email-templates/crm-campaign.tsx` with branded header, body, CTA, unsubscribe footer (auto-appended).
- **SMS** — Twilio connector. Edge function `send-crm-sms` with SMS Pumping Protection + geo-permission reminder. Includes STOP keyword handling → flips `marketing_sms_opt_in` off.
- **Push** — Web push via VAPID. Service worker registered in consumer PWA; `push_subscription` stored on profile.
- **In-app** — surfaced through existing `AIChatOverlay` + a new `CampaignBanner` shown on `VenueLanding` / `MenuFeed` when a diner in the segment opens the app.

**Edge function `dispatch-campaign`** — fan-out worker: pulls segment members, dedupes against suppression + opt-out, writes `crm_campaign_sends` rows, enqueues per-channel jobs through pgmq (`jobs_notifications`). pg_cron runs every minute to pick up `scheduled_at <= now()`.

---

## 4. AI instant campaigns

**Venue settings (`venue_ai_config` extension or new `venue_crm_config`):**
- `ai_campaigns_enabled`, `ai_daily_send_cap`, `quiet_hours_start/end`, `max_discount_pct`, `eligible_segment_ids[]`, `allowed_channels[]`, `default_discount_strategy`, `tone` (friendly/upscale/playful), `require_approval` (default false per user choice).

**Composer (`AIInstantCampaign.tsx`):** staff picks a *goal template* — Daily special, Instant special (kitchen-load triggered), Weather boost, Slow-hour fill, Contest, Win-back. AI drafts copy + image prompt + segment + channel mix; respects guardrails; preview → Send Now or Schedule.

**Trigger-based automations (`crm_automations`):**
- Birthday (day-of, 7-day lead)
- Welcome (24h after first visit)
- Post-visit thank-you (2h after order completed)
- Win-back lapsed (no visit X days)
- Abandoned cart (cart not checked out 20 min)
- Kitchen low-load → push instant special to nearby diners
- Each automation row: `trigger_type`, `delay`, `segment_filter`, `template_id`, `is_active`, `guardrails`.

**Contests & gamification:**
- `contests` table: spin-to-win, scratch card, refer-a-friend, leaderboard. Rewards issued via existing `loyalty_rewards_issued`. AI can launch flash contests inside guardrails ("next 20 orders win a free coffee").

---

## 5. Revenue attribution → rolls into AI Generated Revenue

**Attribution model:**
- Every campaign send gets a tracking token. Email/SMS/push CTAs link to `/r/:sendId` which sets a session cookie + `chat_sessions.referrer_send_id` then redirects to venue.
- `order_items.ai_source` is already used for AI revenue. Extend enum / value set:
  - `ai_chat` (existing)
  - `ai_upsell` (existing)
  - `ai_campaign` ← **new** (AI-generated instant/scheduled campaigns)
  - `crm_campaign` (staff-authored — tracked but not counted as AI revenue)
- On order creation, if session has `referrer_send_id` whose campaign is `ai_generated=true`, stamp items with `ai_source='ai_campaign'`.
- `get_venue_performance` + `get_platform_performance` already SUM ai_source attributed revenue → AI campaign revenue automatically appears in the existing **AI Generated Revenue** total. SippaAnalytics gets a new breakdown row "AI Campaigns".

**Campaign ROI card** on each campaign: recipients, opens, clicks, orders, attributed revenue, $/recipient, ROAS vs cost (email free, SMS = Twilio cost from `ai_usage_log`-style new `crm_cost_log`).

---

## 6. UI — extends `/diners`

Three tabs added to existing Diners page:
1. **Diners** (existing list) + new columns: Lifetime spend, Last visit, Birthday, Tags, channels opted-in. Bulk-add to segment.
2. **Segments** — list, builder (visual rule builder), AI suggestions panel.
3. **Campaigns** — calendar + list, composer, AI instant button, automations manager, contests.
4. **Insights** — leaderboards (top spenders, birthday this month, at-risk), channel performance, AI revenue attributed to CRM.

---

## 7. Additional industry-leading features (recommended)

- **Auto-RFM tiers** (Champions, Loyal, At-risk, Lost) auto-maintained, usable in segments.
- **Predictive next-visit date** + "best time to send" per diner (AI).
- **Group-level CRM** (uses existing `venue_groups`) — campaigns can span all venues in a group with per-venue throttle.
- **A/B test** subject / copy / image on email & push; AI picks winner after threshold.
- **Smart frequency capping** — never message a diner more than N times / 7d across all channels.
- **GDPR / Privacy Act compliance**: per-channel consent log, export/delete diner data, audit trail.
- **Webhook out** to partner CRMs (already have `partner-crm` edge function — extend with campaign events).
- **Review request automation** post-visit with rating gate (4★+ → Google, lower → private feedback).
- **Referral program**: unique diner code, both-sided reward, leaderboard.
- **Geo-fenced push** for nearby lapsed diners (opt-in).
- **Dynamic discount AI** — recommends min discount needed to re-activate a diner based on their RFM.

---

## Technical details

- **New tables**: `diner_venue_stats`, `diner_segments`, `diner_segment_members`, `crm_campaigns`, `crm_campaign_sends`, `crm_automations`, `crm_automation_runs`, `crm_suppression`, `crm_cost_log`, `contests`, `contest_entries`, `venue_crm_config`. All under RLS scoped via `is_venue_staff` / `is_venue_manager`; service_role grants for edge functions.
- **New columns on `diner_profiles`**: opt-in flags, `sms_e164`, `push_subscription`, `unsubscribe_token`, generated `birthday_month`/`birthday_day`.
- **Enum extension**: `ai_source` += `ai_campaign`, `crm_campaign`.
- **New edge functions**: `evaluate-segments`, `dispatch-campaign`, `send-crm-sms`, `send-crm-push`, `ai-draft-campaign`, `ai-suggest-segments`, `crm-track-click` (`/r/:sendId`), `crm-automation-runner` (cron), `crm-unsubscribe`.
- **Cron**: `evaluate-segments` every 15 min; `crm-automation-runner` every minute; `dispatch-campaign` picks up scheduled every minute.
- **Connectors required**: Twilio (SMS). Email = Lovable Emails (already on). Push = VAPID keys stored as secrets `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`.
- **Reuse**: existing `ai_usage_log` for AI cost tracking; existing `loyalty_rewards_issued` for contest/birthday rewards; existing `get_venue_performance` for revenue rollup.

---

## Build order (phased so each step is shippable)

1. **Schema + profile enrichment** (birthday already present → add opt-ins, stats table, RFM trigger, signup nudge).
2. **Segments** (rule builder + materialised members + AI suggestions).
3. **Email campaigns** (composer, scheduler, dispatch, tracking, attribution wired into AI revenue).
4. **SMS + Push + In-app** channels.
5. **AI instant campaigns + guardrails + ROI card**.
6. **Automations** (birthday, welcome, win-back, post-visit, abandoned cart, kitchen-load).
7. **Contests & gamification**.
8. **Insights tab + A/B testing + frequency capping + AI lookalikes polish**.

Phase 1 alone delivers immediate value; each phase is independently usable.
