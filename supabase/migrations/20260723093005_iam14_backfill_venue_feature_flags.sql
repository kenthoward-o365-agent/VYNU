-- IAM-14: Backfill venue_feature_flags so the frontend can switch its
-- absent-row default from 'feast' (fail-open, all features on) to 'bite'
-- (fail-closed) WITHOUT existing venues losing features.
--
-- Every venue that currently has no flags row behaves as 'feast' today. We
-- persist that explicitly here, so after the client default flips to 'bite',
-- only genuinely-unprovisioned/new venues fail closed. New venues should be
-- provisioned with an explicit tier at creation time.

INSERT INTO public.venue_feature_flags (venue_id, tier, flags)
SELECT v.id, 'feast', '{}'::jsonb
FROM public.venues v
WHERE NOT EXISTS (
  SELECT 1 FROM public.venue_feature_flags f WHERE f.venue_id = v.id
);
