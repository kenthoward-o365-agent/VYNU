-- Removes everything created by seed.ts. Run as service-role.
-- Order matters because of FK relations.
BEGIN;

WITH v AS (SELECT id FROM venues WHERE name LIKE 'LOADTEST_%')
DELETE FROM order_items WHERE order_id IN (
  SELECT id FROM orders WHERE venue_id IN (SELECT id FROM v)
);

DELETE FROM orders WHERE venue_id IN (
  SELECT id FROM venues WHERE name LIKE 'LOADTEST_%'
);

DELETE FROM table_sessions WHERE venue_id IN (
  SELECT id FROM venues WHERE name LIKE 'LOADTEST_%'
);

DELETE FROM tables WHERE venue_id IN (
  SELECT id FROM venues WHERE name LIKE 'LOADTEST_%'
);

DELETE FROM menu_items WHERE venue_id IN (
  SELECT id FROM venues WHERE name LIKE 'LOADTEST_%'
);

DELETE FROM menu_categories WHERE venue_id IN (
  SELECT id FROM venues WHERE name LIKE 'LOADTEST_%'
);

DELETE FROM venues WHERE name LIKE 'LOADTEST_%';

COMMIT;
