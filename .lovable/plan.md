

# Group (Parent Company) Creation and Venue Assignment

## Current State
- `venue_groups` table exists with name, logo, settings, domain
- `venue_group_staff` table exists for group-level permissions
- Venues have a `group_id` column to link to a group
- Group Dashboard page exists but is read-only stats — no way to **create** a group, **assign venues** to it, or **manage** group membership
- The only way to set `group_id` on a venue is directly in the database

## What We'll Build

### 1. Group Management Page (rewrite `GroupDashboard.tsx`)
Tabbed layout with:

**Overview tab** — existing stats (keep as-is)

**Settings tab** — create or edit the group:
- If no group exists: "Create a Parent Company" form (name, logo upload)
- If group exists: edit name, logo, toggle `global_diners` and `global_loyalty` in settings JSONB
- On group creation, auto-insert current user as `group_admin` in `venue_group_staff`

**Venues tab** — manage which venues belong to this group:
- List all venues the current user owns/manages
- Toggle to assign/unassign each venue to/from the group (updates `venues.group_id`)
- Show venue name, city, type, and assignment status

**Loyalty tab** — group-level loyalty program management (from previously approved plan)

**Diners tab** — aggregated diner CRM across all group venues (from previously approved plan)

### 2. Update Sidebar Navigation
- Change "Group Dashboard" label to "Parent Company"
- Show it for any user who is a group admin OR owns multiple venues (so they can create a group)

### 3. Update Onboarding Flow
- After venue creation, offer an optional step: "Add this venue to a parent company?" with option to create a new group or skip

### 4. Venue Settings — Group Assignment
- Add a section in `VenueSettings.tsx` showing which group the venue belongs to (read-only display with group name, or "Not assigned")

## Database Changes
No schema changes needed — all tables and columns already exist. The `venues.group_id`, `venue_groups`, and `venue_group_staff` tables support this flow. The `settings` JSONB on `venue_groups` will store `global_diners` and `global_loyalty` flags.

## Technical Details

**Files to create/edit:**
- `src/pages/GroupDashboard.tsx` — full rewrite with tabs (Overview, Settings, Venues, Loyalty, Diners)
- `src/components/DashboardLayout.tsx` — update group nav visibility and label
- `src/pages/VenueSettings.tsx` — add read-only group assignment display
- `src/pages/Loyalty.tsx` — show inherited group programs banner
- `src/components/consumer/DinerSignup.tsx` — enroll in group programs when `global_loyalty` enabled

**Flow for creating a parent company:**
1. User navigates to Parent Company page
2. Clicks "Create Parent Company", enters name
3. System creates `venue_groups` row, inserts user as `group_admin` in `venue_group_staff`
4. Venues tab appears — user toggles their venues into the group
5. Settings tab lets them enable global diners/loyalty

**RLS note:** Existing policies already allow authenticated users to create groups and group admins to update them. The `venues` UPDATE policy for group admins already works for setting `group_id` on group venues.

