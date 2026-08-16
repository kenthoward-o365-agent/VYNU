-- The diner-facing AI agent defaults to "Vee" — the VYNU AI persona.
--
-- The column default was still 'Sippa', two brand names ago, so a venue whose
-- row is created without an explicit agent_name would introduce itself to
-- diners as a dead brand. Venues can still rename the agent and upload their
-- own icon in Settings (agent_name / agent_icon_url — both already exist).
--
-- Existing rows named 'Sippa' are almost certainly the untouched old default
-- rather than a deliberate choice, so they move to 'Vee' as well. Any name a
-- venue actually chose is left alone.

ALTER TABLE public.venue_ai_config ALTER COLUMN agent_name SET DEFAULT 'Vee';

UPDATE public.venue_ai_config SET agent_name = 'Vee' WHERE agent_name = 'Sippa';
