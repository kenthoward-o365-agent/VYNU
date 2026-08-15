-- Enable pg_cron and pg_net, which later migrations assume are already present.
--
-- WHY THIS EXISTS
-- The next migration (20260605164709) calls cron.unschedule() / cron.job and
-- fails on a fresh project with 3F000 "schema cron does not exist".
--
-- In the original database these extensions were enabled out of band — almost
-- certainly through the Supabase dashboard — and never captured in a migration.
-- The four migrations that do contain CREATE EXTENSION pg_cron are all dated
-- August 2026, months after this June migration already depends on the cron
-- schema. They only ever executed as no-ops, because the extension was in place
-- long before they ran. Replayed in order against an empty project, that gap
-- becomes a hard failure.
--
-- SCHEMA CHOICE
-- Those August migrations say `WITH SCHEMA extensions`. That clause is not used
-- here, deliberately: it never took effect (IF NOT EXISTS skipped the statement
-- entirely), and the application references cron.job, cron.schedule and
-- net.http_post — the default schemas each extension creates for itself. Naming
-- a different schema would either be ignored or put the functions somewhere the
-- code does not look. The August statements remain valid no-ops after this.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
