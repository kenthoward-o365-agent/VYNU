
CREATE OR REPLACE FUNCTION public.create_venue_with_owner(
  _name text,
  _venue_type text DEFAULT 'restaurant',
  _address text DEFAULT NULL,
  _city text DEFAULT NULL,
  _state text DEFAULT 'NSW',
  _postcode text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _email text DEFAULT NULL,
  _display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _venue_id uuid;
BEGIN
  INSERT INTO public.venues (name, venue_type, address, city, state, postcode, phone, email)
  VALUES (_name, _venue_type, _address, _city, _state, _postcode, _phone, _email)
  RETURNING id INTO _venue_id;

  INSERT INTO public.venue_staff (venue_id, user_id, role, display_name)
  VALUES (_venue_id, auth.uid(), 'owner', _display_name);

  RETURN _venue_id;
END;
$$;
