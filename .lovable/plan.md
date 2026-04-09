

## Plan: Database Integrity & Security Hardening

### Summary
A comprehensive migration to fix 6 security vulnerabilities (privilege escalation, data exposure), add 18 missing indexes on foreign key columns, and add missing foreign keys — all critical for scaling to thousands of customers.

---

### A. Security Fixes (Critical)

**1. Privilege escalation — `venue_staff` self-insert**
Remove the policy "Staff can insert themselves" which lets any authenticated user make themselves owner/manager of any venue.

**2. Privilege escalation — `venue_group_staff` self-insert**
Remove the policy "Users can add themselves as group staff" — same escalation risk for groups.

**3. Exposed payment API keys — `venue_payment_config`**
Replace the "Anyone can check venue payment status" policy with one that only exposes `is_active` and `provider` via a security-definer function, hiding `api_key_test`, `api_key_live`, and `merchant_account`.

**4. Order items publicly readable**
Replace the "Anyone can view order items by order id" `USING: true` policy with one that restricts reads to venue staff or the order's customer.

**5. Chat sessions update too permissive**
The "Anyone can update own chat sessions" policy uses `venue_id IS NOT NULL` which is always true. Replace with a session-ownership check (match on `id` passed by client, scoped by anon insert).

**6. Venue sensitive fields publicly readable**
Create a security-definer function for public venue lookups that returns only display-safe fields (name, logo, operating_hours, venue_type). Keep full SELECT for staff/managers only.

---

### B. Missing Indexes (Performance)

Add B-tree indexes on 18 unindexed foreign key columns. These are critical for RLS policy evaluation at scale — every `is_venue_staff()` join and every FK lookup in policies will degrade without them.

```text
Table                  Column          
─────────────────────  ────────────────
chat_sessions          diner_id, table_id
diner_profiles         user_id
diner_visits           diner_id, order_id, venue_id
loyalty_programs       group_id, venue_id
menu_categories        venue_id
modifier_categories    venue_id
modifiers              category_id, venue_id
order_items            menu_item_id
orders                 customer_id
staff_alerts           diner_id, table_id, venue_id
venue_taxes            venue_id
venues                 group_id
```

---

### C. Schema Integrity

**Foreign keys** — All `_id` columns already have proper FK constraints with appropriate CASCADE behavior. No orphaned foreign keys found.

**No orphaned tables** — Every table is referenced by at least one relationship or serves a distinct purpose.

**`diner_profiles.user_id` is nullable** — This is used in RLS policies (`auth.uid() = user_id`). A null `user_id` means the RLS check silently fails. We should consider whether guest diner profiles (no user_id) are intentional. If not, make it NOT NULL.

**`order_status_log.changed_by` nullable** — Status change triggers set `changed_by = auth.uid()` which can be NULL for anon inserts. This is acceptable for the initial status log on anon order creation but worth noting.

---

### D. Implementation

**Single migration** containing:
1. Drop 2 dangerous self-insert policies
2. Drop and replace 3 overly permissive SELECT policies  
3. Create 1 security-definer function for safe public venue data
4. Create 1 security-definer function for safe payment status checks
5. Add 18 indexes (all `CREATE INDEX CONCURRENTLY` compatible, using `IF NOT EXISTS`)
6. Fix the chat_sessions update policy

**Files modified:**
- New migration SQL file only — no application code changes needed since the app already queries through the Supabase client and the stricter policies are transparent to authorized users.

---

### Technical Details

The venue public SELECT fix uses a view or security-definer function approach so that the consumer-facing pages (VenueLanding, VenueDiscovery) still work for anonymous users but only see name, logo, venue_type, operating_hours, and is_active. The existing anon SELECT policy on venues gets dropped and replaced.

For `venue_payment_config`, we create a function `public.get_venue_payment_active(venue_id uuid)` that returns just `(is_active, provider)` and replace the open SELECT with a staff-only policy plus the function for public checks.

The `order_items` fix joins through `orders` to check `customer_id` or `is_venue_staff`, matching the existing `orders` SELECT pattern.

