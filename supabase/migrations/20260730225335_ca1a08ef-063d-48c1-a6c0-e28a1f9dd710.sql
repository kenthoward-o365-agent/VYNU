
-- 1. Integration settings (group-scoped; venue_id kept for single-venue setups)
CREATE TABLE public.pubplus_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES public.venue_groups(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox',
  base_url text NOT NULL DEFAULT 'https://poseidon-uat.eagleeye.com',
  client_id text,
  parent_identity_number text,
  auto_earn_on_paid boolean NOT NULL DEFAULT true,
  identity_type text NOT NULL DEFAULT 'BARCODE',
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pubplus_integrations_scope_chk CHECK (group_id IS NOT NULL OR venue_id IS NOT NULL),
  CONSTRAINT pubplus_integrations_env_chk CHECK (environment IN ('sandbox','production'))
);
CREATE UNIQUE INDEX pubplus_integrations_group_uk ON public.pubplus_integrations(group_id) WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX pubplus_integrations_venue_uk ON public.pubplus_integrations(venue_id) WHERE venue_id IS NOT NULL AND group_id IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pubplus_integrations TO authenticated;
GRANT ALL ON public.pubplus_integrations TO service_role;
ALTER TABLE public.pubplus_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pubplus_integrations_admin_all" ON public.pubplus_integrations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));

CREATE POLICY "pubplus_integrations_group_admin_select" ON public.pubplus_integrations
  FOR SELECT TO authenticated
  USING (
    (group_id IS NOT NULL AND public.is_group_member(auth.uid(), group_id))
    OR (venue_id IS NOT NULL AND public.is_venue_manager(auth.uid(), venue_id))
  );

CREATE POLICY "pubplus_integrations_group_admin_write" ON public.pubplus_integrations
  FOR UPDATE TO authenticated
  USING (
    (group_id IS NOT NULL AND public.is_group_admin(auth.uid(), group_id))
    OR (venue_id IS NOT NULL AND public.is_venue_manager(auth.uid(), venue_id))
  )
  WITH CHECK (
    (group_id IS NOT NULL AND public.is_group_admin(auth.uid(), group_id))
    OR (venue_id IS NOT NULL AND public.is_venue_manager(auth.uid(), venue_id))
  );

CREATE POLICY "pubplus_integrations_group_admin_insert" ON public.pubplus_integrations
  FOR INSERT TO authenticated
  WITH CHECK (
    (group_id IS NOT NULL AND public.is_group_admin(auth.uid(), group_id))
    OR (venue_id IS NOT NULL AND public.is_venue_manager(auth.uid(), venue_id))
  );

CREATE TRIGGER pubplus_integrations_updated_at
  BEFORE UPDATE ON public.pubplus_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Diner <-> Pub+ membership links
CREATE TABLE public.pubplus_member_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diner_id uuid NOT NULL REFERENCES public.diner_profiles(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.venue_groups(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.loyalty_programs(id) ON DELETE SET NULL,
  identity_value text NOT NULL,
  identity_type text NOT NULL DEFAULT 'BARCODE',
  ee_wallet_id text,
  ee_consumer_id text,
  ee_account_id text,
  points_balance integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'linked',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pubplus_member_links_status_chk CHECK (status IN ('linked','pending','error','unlinked'))
);
CREATE UNIQUE INDEX pubplus_member_links_diner_group_uk
  ON public.pubplus_member_links(diner_id, COALESCE(group_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX pubplus_member_links_identity_idx ON public.pubplus_member_links(identity_value);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pubplus_member_links TO authenticated;
GRANT ALL ON public.pubplus_member_links TO service_role;
ALTER TABLE public.pubplus_member_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pubplus_links_admin_all" ON public.pubplus_member_links
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));

CREATE POLICY "pubplus_links_diner_all" ON public.pubplus_member_links
  FOR ALL TO authenticated
  USING (diner_id = public.get_user_diner_profile_id())
  WITH CHECK (diner_id = public.get_user_diner_profile_id());

CREATE POLICY "pubplus_links_group_staff_select" ON public.pubplus_member_links
  FOR SELECT TO authenticated
  USING (group_id IS NOT NULL AND public.is_group_member(auth.uid(), group_id));

CREATE TRIGGER pubplus_member_links_updated_at
  BEFORE UPDATE ON public.pubplus_member_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Activity log
CREATE TABLE public.pubplus_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diner_id uuid REFERENCES public.diner_profiles(id) ON DELETE SET NULL,
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  group_id uuid REFERENCES public.venue_groups(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  kind text NOT NULL,
  points_delta integer NOT NULL DEFAULT 0,
  amount_cents integer,
  ee_reference text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pubplus_transactions_kind_chk CHECK (kind IN ('earn','redeem','link','balance','test')),
  CONSTRAINT pubplus_transactions_status_chk CHECK (status IN ('pending','ok','failed','skipped'))
);
CREATE INDEX pubplus_transactions_order_idx ON public.pubplus_transactions(order_id);
CREATE INDEX pubplus_transactions_diner_idx ON public.pubplus_transactions(diner_id, created_at DESC);

GRANT SELECT ON public.pubplus_transactions TO authenticated;
GRANT ALL ON public.pubplus_transactions TO service_role;
ALTER TABLE public.pubplus_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pubplus_tx_admin_all" ON public.pubplus_transactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'tabless_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'tabless_admin'));

CREATE POLICY "pubplus_tx_diner_select" ON public.pubplus_transactions
  FOR SELECT TO authenticated
  USING (diner_id = public.get_user_diner_profile_id());

CREATE POLICY "pubplus_tx_venue_staff_select" ON public.pubplus_transactions
  FOR SELECT TO authenticated
  USING (venue_id IS NOT NULL AND public.is_venue_staff(auth.uid(), venue_id));

CREATE TRIGGER pubplus_transactions_updated_at
  BEFORE UPDATE ON public.pubplus_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
