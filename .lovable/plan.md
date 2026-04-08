
# Sippa AI — Chat Agent Management

## Phase 1: Settings & Configuration (Build Now)

### Database
Add a `sippa_config` JSONB column to the `venues.settings` field (or a dedicated table) storing:
- `chat_agent_name` (default: "Sippa")
- `opening_message` (customizable greeting)
- `tone` (enum: `aussie`, `british`, `north_american`)
- `chat_mode` (enum: `chat_first`, `chat_optional`, `chat_only`)
- `agent_icon_url` (uploaded to venue-assets bucket)

### Venue Settings UI
New "Sippa AI" tab in Venue Settings with:
1. **Agent Name** — text input (default "Sippa")
2. **Agent Icon** — image upload (uses existing venue-assets bucket)
3. **Opening Message** — textarea with placeholder suggestions per tone
4. **Tone & Personality** — radio select: Full Aussie 🇦🇺 / British 🇬🇧 / North American 🇺🇸
5. **Chat Mode** — radio select:
   - *Chat First* — chat opens automatically, menu behind it
   - *Chat Optional* — menu shows first, chat is a floating button
   - *Chat Only* — no traditional menu, everything through chat
6. **Preview** — live preview of how the greeting will look

### Edge Function Update
Update `diner-chat` to:
- Load venue's Sippa config
- Inject tone-specific system prompt (slang, idioms, greeting style)
- Use custom opening message
- Pass agent name back to frontend

### Consumer App Update
- Use venue's Sippa config for agent name, icon, and opening message
- Respect chat_mode setting for UX flow

## Phase 2: Advanced Capabilities (Future)
These require significant backend work and will be planned separately:
- **Venue knowledge base** — crawl venue website, ingest menus, train per-venue context
- **Order another round** — repeat last order via chat command
- **Get the manager** — escalation flow (notify staff via realtime)
- **Check splitting** — split bill N ways via chat
- **Learning/memory** — remember diner preferences across visits

## Technical Details

### New Table: `venue_ai_config`
```sql
CREATE TABLE public.venue_ai_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL UNIQUE REFERENCES venues(id) ON DELETE CASCADE,
  agent_name text NOT NULL DEFAULT 'Sippa',
  agent_icon_url text,
  opening_message text DEFAULT 'Hey! 👋 I''m your AI server. Tell me what you''re in the mood for and I''ll find the perfect dish.',
  tone text NOT NULL DEFAULT 'aussie',
  chat_mode text NOT NULL DEFAULT 'chat_optional',
  personality_extras jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
- RLS: managers can CRUD for their venue, staff can view, public can view (needed for consumer app)

### Files Changed
- **New migration** — `venue_ai_config` table + RLS
- **New component** — `src/components/venue/SippaAISettings.tsx`
- **Edit** — `src/pages/VenueSettings.tsx` — add Sippa AI tab
- **Edit** — `supabase/functions/diner-chat/index.ts` — load config, apply tone
- **Edit** — `src/components/consumer/AIChatOverlay.tsx` — use config for name/icon/greeting
- **Edit** — `src/pages/ConsumerOrder.tsx` — respect chat_mode
