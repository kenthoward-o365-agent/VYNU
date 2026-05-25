
-- ============================================================
-- PCI DSS: Payments config audit log (Req 10.x)
-- ============================================================
CREATE TABLE public.payment_config_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  actor_id UUID,
  actor_email TEXT,
  action TEXT NOT NULL,             -- 'create' | 'update'
  field TEXT NOT NULL,              -- column name
  old_value TEXT,                   -- masked / redacted
  new_value TEXT,                   -- masked / redacted
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_config_audit_venue ON public.payment_config_audit(venue_id, created_at DESC);

ALTER TABLE public.payment_config_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view payment audit"
  ON public.payment_config_audit FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role));

CREATE POLICY "Venue managers can view their payment audit"
  ON public.payment_config_audit FOR SELECT
  TO authenticated
  USING (is_venue_manager(auth.uid(), venue_id));

-- Inserts only via authenticated managers/admins of that venue
CREATE POLICY "Staff can insert payment audit"
  ON public.payment_config_audit FOR INSERT
  TO authenticated
  WITH CHECK (
    is_venue_manager(auth.uid(), venue_id)
    OR has_role(auth.uid(), 'tabless_admin'::app_role)
  );

-- No UPDATE / DELETE policies → immutable log

-- ============================================================
-- PCI DSS: Payment-page script integrity baseline (Req 6.4.3 / 11.6.1)
-- ============================================================
CREATE TABLE public.pci_script_baseline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,                       -- page URL checked
  script_src TEXT NOT NULL,                -- script source URL or 'inline:<hash-prefix>'
  integrity_hash TEXT NOT NULL,            -- sha256 of content
  is_authorised BOOLEAN NOT NULL DEFAULT false,
  justification TEXT,                      -- why this script is on the payment page
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  alert_sent_at TIMESTAMPTZ,
  UNIQUE(url, script_src, integrity_hash)
);

CREATE INDEX idx_pci_baseline_url ON public.pci_script_baseline(url);

ALTER TABLE public.pci_script_baseline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage pci_script_baseline"
  ON public.pci_script_baseline FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'tabless_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'tabless_admin'::app_role));
