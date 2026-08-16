-- Guest-suite greenfield modules from the VYNU deck: Concierge, Reserve,
-- Functions, Club, Discover. One migration because they ship as one feature
-- set and share conventions:
--   * every table is venue-scoped with CASCADE on venue delete
--   * RLS uses the inline EXISTS-on-venue_staff pattern (the is_venue_staff
--     helper is deliberately not executable by `authenticated`)
--   * transcript/event tables are append-only (no UPDATE/DELETE policies) —
--     the deck's "ledger-proof" guest-record principle
--   * Club signals are STAFF-SIDE ONLY (gaming compliance): no anon access,
--     and nothing here may ever be surfaced on a diner-facing page

-- ===========================================================================
-- Reserve — table reservations
-- ===========================================================================

-- Bookable spaces. Shared with Functions: kind='function' rows are function
-- rooms; kind='dining' rows are dining areas usable for reservations.
CREATE TABLE public.venue_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'dining' CHECK (kind IN ('dining','function')),
  capacity_min INT NOT NULL DEFAULT 1 CHECK (capacity_min >= 1),
  capacity_max INT NOT NULL DEFAULT 8 CHECK (capacity_max >= capacity_min),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_venue_spaces_venue ON public.venue_spaces (venue_id, sort_order);

CREATE TABLE public.venue_booking_settings (
  venue_id UUID PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  interval_minutes INT NOT NULL DEFAULT 15 CHECK (interval_minutes BETWEEN 5 AND 120),
  default_duration_minutes INT NOT NULL DEFAULT 90 CHECK (default_duration_minutes BETWEEN 15 AND 600),
  max_party_size INT NOT NULL DEFAULT 12 CHECK (max_party_size >= 1),
  advance_days INT NOT NULL DEFAULT 60 CHECK (advance_days BETWEEN 1 AND 365),
  auto_confirm BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  space_id UUID REFERENCES public.venue_spaces(id) ON DELETE SET NULL,
  table_id UUID REFERENCES public.tables(id) ON DELETE SET NULL,
  diner_profile_id UUID REFERENCES public.diner_profiles(id) ON DELETE SET NULL,
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  guest_email TEXT,
  party_size INT NOT NULL CHECK (party_size >= 1),
  starts_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 90 CHECK (duration_minutes BETWEEN 15 AND 600),
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending','confirmed','seated','completed','cancelled','no_show')),
  source TEXT NOT NULL DEFAULT 'staff'
    CHECK (source IN ('staff','phone','concierge','web','walk_in','partner')),
  occasion TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bookings_venue_start ON public.bookings (venue_id, starts_at);
CREATE INDEX idx_bookings_diner ON public.bookings (diner_profile_id) WHERE diner_profile_id IS NOT NULL;

-- Append-only status/audit trail for bookings.
CREATE TABLE public.booking_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  actor UUID,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_booking_events_booking ON public.booking_events (booking_id, created_at);

-- ===========================================================================
-- Functions — event & space enquiries
-- ===========================================================================

CREATE TABLE public.function_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_per_head_cents INT CHECK (price_per_head_cents IS NULL OR price_per_head_cents >= 0),
  min_guests INT NOT NULL DEFAULT 10 CHECK (min_guests >= 1),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_function_packages_venue ON public.function_packages (venue_id, sort_order);

CREATE TABLE public.function_enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  space_id UUID REFERENCES public.venue_spaces(id) ON DELETE SET NULL,
  package_id UUID REFERENCES public.function_packages(id) ON DELETE SET NULL,
  diner_profile_id UUID REFERENCES public.diner_profiles(id) ON DELETE SET NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT,
  contact_email TEXT,
  event_type TEXT,
  event_date DATE,
  party_size INT CHECK (party_size IS NULL OR party_size >= 1),
  budget_cents INT CHECK (budget_cents IS NULL OR budget_cents >= 0),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','quoted','confirmed','lost','completed')),
  source TEXT NOT NULL DEFAULT 'staff'
    CHECK (source IN ('staff','phone','concierge','web')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_function_enquiries_venue ON public.function_enquiries (venue_id, status, event_date);

-- ===========================================================================
-- Concierge — omnichannel front door (calls, SMS, WhatsApp)
-- ===========================================================================

CREATE TABLE public.concierge_settings (
  venue_id UUID PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  greeting TEXT,
  phone_number TEXT,
  forward_to_phone TEXT,
  channels JSONB NOT NULL DEFAULT '{"sms": true, "phone": false, "whatsapp": false}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.concierge_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('phone','sms','whatsapp','web')),
  guest_phone TEXT,
  guest_name TEXT,
  diner_profile_id UUID REFERENCES public.diner_profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','needs_human','resolved')),
  outcome TEXT
    CHECK (outcome IS NULL OR outcome IN ('booked','answered','message_taken','handed_off','missed')),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  summary TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_concierge_conv_venue ON public.concierge_conversations (venue_id, last_message_at DESC);
CREATE INDEX idx_concierge_conv_phone ON public.concierge_conversations (venue_id, guest_phone);

-- Append-only transcript.
CREATE TABLE public.concierge_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.concierge_conversations(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('guest','vee','staff','system')),
  body TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_concierge_msgs_conv ON public.concierge_messages (conversation_id, created_at);

-- ===========================================================================
-- Club — member scheme surface for gaming venues (staff-side only)
-- ===========================================================================

CREATE TABLE public.club_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Members',
  tiers JSONB NOT NULL DEFAULT '[{"key":"member","label":"Member"}]'::jsonb,
  external_system TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.club_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES public.club_programs(id) ON DELETE CASCADE,
  diner_profile_id UUID REFERENCES public.diner_profiles(id) ON DELETE SET NULL,
  member_no TEXT NOT NULL,
  display_name TEXT,
  tier_key TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','lapsed')),
  external_ref TEXT,
  joined_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, member_no)
);
CREATE INDEX idx_club_members_venue ON public.club_members (venue_id, status);

-- Gaming-floor signals. STAFF-SIDE ONLY BY DESIGN: never grant anon, never
-- join into any diner-facing query. Deck: "Gaming signals staff-side only."
CREATE TABLE public.club_signals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('vip_arrival','tier_change','milestone','service_alert')),
  note TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_club_signals_venue ON public.club_signals (venue_id, occurred_at DESC);

CREATE TABLE public.club_promos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  placement TEXT NOT NULL DEFAULT 'promo_screen' CHECK (placement IN ('promo_screen','in_venue','both')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_club_promos_venue ON public.club_promos (venue_id, is_active, sort_order);

-- ===========================================================================
-- Discover — public offers & experiences feed (VYNU native)
-- ===========================================================================

CREATE TABLE public.discover_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'offer' CHECK (kind IN ('offer','event','announcement')),
  title TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  cta TEXT NOT NULL DEFAULT 'none' CHECK (cta IN ('book','order','none')),
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_discover_posts_venue ON public.discover_posts (venue_id, is_published);
CREATE INDEX idx_discover_posts_pub ON public.discover_posts (published_at DESC) WHERE is_published;

-- ===========================================================================
-- updated_at triggers
-- ===========================================================================

CREATE TRIGGER update_venue_spaces_updated_at BEFORE UPDATE ON public.venue_spaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_venue_booking_settings_updated_at BEFORE UPDATE ON public.venue_booking_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_function_packages_updated_at BEFORE UPDATE ON public.function_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_function_enquiries_updated_at BEFORE UPDATE ON public.function_enquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_concierge_settings_updated_at BEFORE UPDATE ON public.concierge_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_concierge_conversations_updated_at BEFORE UPDATE ON public.concierge_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_club_programs_updated_at BEFORE UPDATE ON public.club_programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_club_members_updated_at BEFORE UPDATE ON public.club_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_club_promos_updated_at BEFORE UPDATE ON public.club_promos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_discover_posts_updated_at BEFORE UPDATE ON public.discover_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================================================
-- RLS
-- ===========================================================================

ALTER TABLE public.venue_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_booking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.function_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.function_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_promos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discover_posts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.venue_spaces, public.venue_booking_settings, public.bookings,
  public.function_packages, public.function_enquiries,
  public.concierge_settings, public.concierge_conversations,
  public.club_programs, public.club_members, public.club_promos,
  public.discover_posts
TO authenticated;
-- Append-only tables: no UPDATE/DELETE grant at all.
GRANT SELECT, INSERT ON public.booking_events, public.concierge_messages TO authenticated;
-- Signals: staff acknowledge (UPDATE) but never rewrite history (no DELETE).
GRANT SELECT, INSERT, UPDATE ON public.club_signals TO authenticated;
GRANT ALL ON
  public.venue_spaces, public.venue_booking_settings, public.bookings,
  public.booking_events, public.function_packages, public.function_enquiries,
  public.concierge_settings, public.concierge_conversations, public.concierge_messages,
  public.club_programs, public.club_members, public.club_signals, public.club_promos,
  public.discover_posts
TO service_role;

-- One policy pair per table: active venue staff operate on their venue's rows.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'venue_spaces','venue_booking_settings','bookings','booking_events',
    'function_packages','function_enquiries',
    'concierge_settings','concierge_conversations','concierge_messages',
    'club_programs','club_members','club_signals','club_promos',
    'discover_posts'
  ] LOOP
    EXECUTE format($f$
      CREATE POLICY "Staff read own venue" ON public.%I FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.venue_staff vs
        WHERE vs.venue_id = %I.venue_id AND vs.user_id = auth.uid() AND vs.is_active = true
      ))
    $f$, t, t);
    EXECUTE format($f$
      CREATE POLICY "Staff write own venue" ON public.%I FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.venue_staff vs
        WHERE vs.venue_id = %I.venue_id AND vs.user_id = auth.uid() AND vs.is_active = true
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.venue_staff vs
        WHERE vs.venue_id = %I.venue_id AND vs.user_id = auth.uid() AND vs.is_active = true
      ))
    $f$, t, t, t);
  END LOOP;
END $$;

-- Discover is the one public surface: anyone may read published, live posts.
-- (Everything else — including every Club table — stays staff-only.)
CREATE POLICY "Anyone reads published posts" ON public.discover_posts
  FOR SELECT TO anon, authenticated
  USING (is_published = true AND (ends_at IS NULL OR ends_at > now()));
GRANT SELECT ON public.discover_posts TO anon;

-- ===========================================================================
-- Public Discover feed RPC — joins venue name/city/logo without exposing the
-- venues table to anon. SECURITY DEFINER, published rows of active venues only.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.get_discover_feed(_limit INT DEFAULT 50)
RETURNS TABLE (
  post_id UUID,
  venue_id UUID,
  venue_name TEXT,
  venue_city TEXT,
  venue_logo_url TEXT,
  kind TEXT,
  title TEXT,
  body TEXT,
  image_url TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  cta TEXT,
  published_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.venue_id, v.name, v.city, v.logo_url,
         p.kind, p.title, p.body, p.image_url,
         p.starts_at, p.ends_at, p.cta, p.published_at
  FROM public.discover_posts p
  JOIN public.venues v ON v.id = p.venue_id
  WHERE p.is_published = true
    AND (p.ends_at IS NULL OR p.ends_at > now())
    AND v.is_active = true
  ORDER BY p.published_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 100);
$$;

REVOKE EXECUTE ON FUNCTION public.get_discover_feed(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_discover_feed(INT) TO anon, authenticated;
