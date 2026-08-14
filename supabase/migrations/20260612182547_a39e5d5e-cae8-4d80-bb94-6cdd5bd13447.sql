-- Remove the remaining anonymous table-level read grant on table_sessions.
-- Anonymous QR flows keep INSERT for creating sessions and use list_open_sessions_at_table for scoped reads.
REVOKE SELECT ON public.table_sessions FROM anon;
GRANT INSERT ON public.table_sessions TO anon;
GRANT EXECUTE ON FUNCTION public.list_open_sessions_at_table(uuid, uuid) TO anon, authenticated;