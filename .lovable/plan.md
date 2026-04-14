

# Database Security & Scalability Audit

## Critical Findings

### 1. ZERO Foreign Keys Across All Tables (CRITICAL)
Every `_id` column in the entire database lacks a foreign key constraint. This means:
- Orphan records accumulate silently (e.g., orders referencing deleted venues, order_items pointing to deleted menu_items)
- No cascading deletes — deleting a venue leaves behind orders, menu items, tables, staff records, etc.
- At 1000s of venues this becomes unmanageable data corruption

**50+ missing FK relationships** including: `orders.venue_id → venues.id`, `order_items.order_id → orders.id`, `menu_items.venue_id → venues.id`, `venue_staff.user_id → auth.users.id`, `loyalty_balances.program_id → loyalty_programs.id`, etc.

### 2. Chat Messages & Sessions Fully Public (ERROR)
- `chat_messages_log`: anon SELECT uses `USING (true)` — every diner's conversation history (dietary needs, allergies, preferences) is readable by anyone
- `chat_sessions`: anon SELECT uses `USING (true)` AND anon UPDATE uses `USING (true)` — anyone can read AND modify any session across all venues

### 3. Order Items Leaking to Anonymous Users (ERROR)
- `order_items` anon SELECT policy only checks `EXISTS (SELECT 1 FROM orders WHERE id = order_id)` — it verifies the order exists, not that the requester owns it. Any anonymous user can read all order items.

### 4. Storage Bucket: Any Auth User Can Delete Any Venue's Assets (ERROR)
- DELETE/UPDATE policies on `venue-assets` only check `auth.uid() IS NOT NULL` — any logged-in diner can delete or overwrite any venue's menu images, logos, etc.

### 5. Payment Config Exposes API Keys (CRITICAL)
- `venue_payment_config` stores `api_key_test` and `api_key_live` as plain text columns. Venue managers with SELECT access can read Adyen API keys. These should be in secrets/vault, not queryable columns.

### 6. Realtime Channels Not Scoped
- `orders` and `staff_alerts` are published to Realtime with no channel-level authorization. Any authenticated user can subscribe and receive live order updates from any venue.

### 7. Missing Index: `orders.created_at`
- Dashboard queries filter by date range on `orders.created_at` — no index exists. At scale this causes full table scans.

### 8. Duplicate Indexes (Waste)
- `chat_messages_log`: duplicate indexes on `session_id` (`idx_chat_messages_log_session_id` + `idx_chat_messages_session`) and `venue_id`
- `chat_sessions`: duplicate on `venue_id`
- `diner_stored_cards`: duplicates on `diner_id` and `venue_id`

### 9. `venues.tax_id` — Orphan Column
- `venues` has a `tax_id` text column that doesn't reference anything meaningful (venue_taxes uses its own id). Likely vestigial.

### 10. `diner_profiles.user_id` is Nullable
- RLS policies check `auth.uid() = user_id`, but `user_id` is nullable. A null user_id breaks ownership checks.

### 11. No Venue DELETE Policies
- `venues` table has no DELETE policy at all — venues can never be deleted even by admins.

## Proposed Migration

### Step 1: Add Foreign Keys with CASCADE
Add FK constraints with `ON DELETE CASCADE` (or `SET NULL` where appropriate) for all 50+ relationships. Key ones:
- `orders.venue_id → venues.id`
- `order_items.order_id → orders.id`
- `menu_items.venue_id → venues.id`
- `menu_items.category_id → menu_categories.id ON DELETE SET NULL`
- `venue_staff.venue_id → venues.id`
- `venue_staff.user_id → auth.users.id`
- `order_status_log.order_id → orders.id`
- All `diner_*` tables referencing `diner_profiles.id`
- All `loyalty_*` cross-references

### Step 2: Fix RLS Policies
- **chat_messages_log**: Replace anon `USING (true)` SELECT with session-scoped access
- **chat_sessions**: Replace anon `USING (true)` SELECT/UPDATE with session-id-scoped access
- **order_items**: Restrict anon SELECT to match by a session token or remove anon access
- **Storage**: Restrict DELETE/UPDATE to `is_venue_staff(auth.uid(), venue_id)` by parsing the storage path
- **venue_payment_config**: Create a view excluding `api_key_test`/`api_key_live`, deny direct SELECT on base table for non-admins

### Step 3: Add Missing Indexes
- `orders(created_at)` — needed for dashboard date-range queries
- Composite: `orders(venue_id, created_at)` for filtered date queries

### Step 4: Remove Duplicate Indexes
Drop 5 duplicate indexes to reduce write overhead.

### Step 5: Fix Nullable `diner_profiles.user_id`
Alter to `NOT NULL` (with a default migration for any existing nulls).

### Step 6: Drop Orphan Column
Remove `venues.tax_id` if confirmed unused.

### Step 7: Add Venue DELETE Policy
Add admin-only DELETE policy on `venues`.

## Impact
- All changes are additive migrations (no data loss)
- FK constraints will fail if orphan data already exists — migration will clean orphans first
- RLS changes tighten access but won't break operator dashboard (staff/manager policies unchanged)

