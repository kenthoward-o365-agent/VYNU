
CREATE TABLE public.pricing_rule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_rule_id uuid NOT NULL REFERENCES public.pricing_rules(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pricing_rule_id, menu_item_id)
);

ALTER TABLE public.pricing_rule_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view pricing rule items"
ON public.pricing_rule_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pricing_rules pr
    WHERE pr.id = pricing_rule_items.pricing_rule_id
      AND is_venue_staff(auth.uid(), pr.venue_id)
  )
);

CREATE POLICY "Managers can insert pricing rule items"
ON public.pricing_rule_items FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pricing_rules pr
    WHERE pr.id = pricing_rule_items.pricing_rule_id
      AND is_venue_manager(auth.uid(), pr.venue_id)
  )
);

CREATE POLICY "Managers can delete pricing rule items"
ON public.pricing_rule_items FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pricing_rules pr
    WHERE pr.id = pricing_rule_items.pricing_rule_id
      AND is_venue_manager(auth.uid(), pr.venue_id)
  )
);
