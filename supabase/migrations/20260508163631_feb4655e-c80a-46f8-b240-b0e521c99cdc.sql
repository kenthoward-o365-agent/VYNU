UPDATE public.tables
SET qr_code = REPLACE(qr_code, 'shyndig.lovable.app', 'hlordernow.lovable.app')
WHERE qr_code LIKE '%shyndig.lovable.app%';