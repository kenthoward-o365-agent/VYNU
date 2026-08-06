GRANT EXECUTE ON FUNCTION public.get_venue_audit_date(uuid) TO anon;

COMMENT ON FUNCTION public.get_venue_audit_date(uuid) IS
  'Returns the venue''s current trading (audit) date, falling back to CURRENT_DATE when uninitialised. Called by the guest checkout to stamp orders.audit_date, so anon EXECUTE is required — do not include this in operator-only permission sweeps.';