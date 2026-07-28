## Plan: Restore Supabase env vars in `.env`

Write the three public Supabase client values into the project-root `.env` so the Vite build can inline them into `src/integrations/supabase/client.ts`.

### Values to write

```
VITE_SUPABASE_PROJECT_ID=fhjuiyabezcjzjyjxcqi
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_XqhZDvVcFgLDmMP0yhqRWA_fZe0XnWf
VITE_SUPABASE_URL=https://fhjuiyabezcjzjyjxcqi.supabase.co
```

### Steps

1. Read the current `.env` to see which keys are already present.
2. Add or update only the three `VITE_SUPABASE_*` keys above, preserving any other existing entries.
3. Restart the dev server so Vite picks up the new env values, then hit `http://localhost:8080/` to confirm it serves without the "supabase URL undefined" failure.

### Notes

- These are the public project ref, publishable (anon) key, and URL — safe to ship in the browser bundle; RLS protects the data.
- `.env` is normally auto-managed by the Lovable Cloud connection. Writing it by hand is fine as a one-off restore, but if the connection later rewrites the file these same values should reappear.
