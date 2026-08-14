
-- Allow authenticated users (diners) to read chat sessions they created
CREATE POLICY "Authenticated diners can read own chat sessions"
  ON public.chat_sessions FOR SELECT
  TO authenticated
  USING (diner_id = get_user_diner_profile_id() OR diner_id IS NULL);
