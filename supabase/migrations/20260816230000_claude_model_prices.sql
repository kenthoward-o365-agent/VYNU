-- Per-1k-token USD rates for the Claude models the AI provider adapter can
-- serve (see supabase/functions/_shared/ai.ts — AI_PROVIDER=anthropic).
-- Without these rows, ai_usage_log records every Claude call at zero cost and
-- platform financials go quietly wrong.
INSERT INTO public.ai_model_prices (model, input_per_1k_usd, output_per_1k_usd, notes)
VALUES
  ('claude-opus-5',    0.005, 0.025, 'Anthropic first-party rates ($5/$25 per MTok)'),
  ('claude-sonnet-5',  0.003, 0.015, 'Anthropic first-party rates ($3/$15 per MTok; intro $2/$10 through 2026-08-31 not reflected)'),
  ('claude-haiku-4-5', 0.001, 0.005, 'Anthropic first-party rates ($1/$5 per MTok)')
ON CONFLICT (model) DO UPDATE
  SET input_per_1k_usd = EXCLUDED.input_per_1k_usd,
      output_per_1k_usd = EXCLUDED.output_per_1k_usd,
      notes = EXCLUDED.notes,
      updated_at = now();
