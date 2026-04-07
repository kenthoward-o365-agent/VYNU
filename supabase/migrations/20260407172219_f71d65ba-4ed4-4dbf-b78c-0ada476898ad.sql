
-- Add landing page HTML column to venues
ALTER TABLE public.venues ADD COLUMN landing_page_html text;

-- Create venue-assets storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('venue-assets', 'venue-assets', true);

-- Public read access for venue assets
CREATE POLICY "Anyone can view venue assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'venue-assets');

-- Venue staff can upload assets (folder = venue_id)
CREATE POLICY "Venue staff can upload assets"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'venue-assets'
  AND auth.uid() IS NOT NULL
);

-- Venue staff can update their assets
CREATE POLICY "Venue staff can update assets"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'venue-assets'
  AND auth.uid() IS NOT NULL
);

-- Venue staff can delete their assets
CREATE POLICY "Venue staff can delete assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'venue-assets'
  AND auth.uid() IS NOT NULL
);
