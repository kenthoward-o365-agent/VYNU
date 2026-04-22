-- Add birthday column to diner_profiles
ALTER TABLE public.diner_profiles
  ADD COLUMN IF NOT EXISTS birthday date;

-- Create loyalty_rewards_issued table
CREATE TABLE IF NOT EXISTS public.loyalty_rewards_issued (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diner_id uuid NOT NULL,
  program_id uuid NOT NULL REFERENCES public.loyalty_programs(id) ON DELETE CASCADE,
  reward_kind text NOT NULL CHECK (reward_kind IN ('signup','birthday','anniversary','milestone','tier_up')),
  reward_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  issued_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  redeemed_order_id uuid,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_issued_diner ON public.loyalty_rewards_issued(diner_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_issued_program ON public.loyalty_rewards_issued(program_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_issued_unredeemed ON public.loyalty_rewards_issued(diner_id) WHERE redeemed_at IS NULL;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_loyalty_rewards_issued_updated_at ON public.loyalty_rewards_issued;
CREATE TRIGGER trg_loyalty_rewards_issued_updated_at
BEFORE UPDATE ON public.loyalty_rewards_issued
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.loyalty_rewards_issued ENABLE ROW LEVEL SECURITY;

-- Diners can view their own rewards
CREATE POLICY "Diners can view own rewards"
ON public.loyalty_rewards_issued
FOR SELECT
TO authenticated
USING (diner_id = public.get_user_diner_profile_id());

-- Diners can update their own rewards (e.g. set redeemed_at on apply)
CREATE POLICY "Diners can update own rewards"
ON public.loyalty_rewards_issued
FOR UPDATE
TO authenticated
USING (diner_id = public.get_user_diner_profile_id())
WITH CHECK (diner_id = public.get_user_diner_profile_id());

-- Staff can view rewards for programs at their venues / groups
CREATE POLICY "Staff can view rewards for their programs"
ON public.loyalty_rewards_issued
FOR SELECT
TO authenticated
USING (public.can_manage_loyalty_program_balance(auth.uid(), program_id));

-- Managers/admins can delete (void) rewards
CREATE POLICY "Managers can void rewards"
ON public.loyalty_rewards_issued
FOR DELETE
TO authenticated
USING (public.can_manage_loyalty_program_balance(auth.uid(), program_id));

-- Staff can also insert (for manual grants); service role bypasses RLS
CREATE POLICY "Staff can insert rewards"
ON public.loyalty_rewards_issued
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_loyalty_program_balance(auth.uid(), program_id));