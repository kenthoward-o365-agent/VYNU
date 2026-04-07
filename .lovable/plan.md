

# Multi-Venue Group Management for Tab-Less

## Context
Large Australian hospitality groups like AVC (Australian Venue Co) and ALH Group operate 100+ venues. They need centralized management with per-venue drill-down. Currently Tab-Less is single-venue only — one user, one venue.

## What We're Building

### 1. Database: `venue_groups` Table + Relationships
- New `venue_groups` table: id, name, logo_url, domain, settings (jsonb), created_at
- Add `group_id` (nullable FK) to `venues` table — venues can optionally belong to a group
- New `venue_group_staff` table: user_id, group_id, role (group_admin, group_viewer) — controls who can manage groups
- RLS: group admins can see/manage all venues in their group; existing single-venue RLS unchanged

### 2. Database: Diner CRM & Loyalty
- New `diner_profiles` table: id, user_id (nullable for anonymous), email, phone, display_name, preferences (jsonb), allergens, created_at
- New `diner_visits` table: id, diner_id, venue_id, order_id, visited_at — tracks visit history per venue
- New `loyalty_programs` table: id, venue_id or group_id, name, type (points/stamps/tier), rules (jsonb), is_active
- New `loyalty_balances` table: id, diner_id, program_id, balance, tier, updated_at
- RLS: diners see own data; venue staff see their venue's diners; group admins see all group diners

### 3. VenueContext Enhancement
- Update `VenueContext` to support multi-venue: user can belong to multiple venues via `venue_staff` and also to groups via `venue_group_staff`
- Add venue switcher dropdown in sidebar — if user has access to multiple venues, they can switch between them
- Add "Group View" mode for group admins that shows aggregate data across all group venues

### 4. UI: Venue Switcher & Group Dashboard
- **Sidebar**: Add venue switcher dropdown below the Tab-Less logo — shows current venue name, click to switch
- **Group Dashboard** (`/group`): Aggregate stats across all venues in the group — total revenue, orders, top-performing venues, underperformers
- **Group Menu Management** (`/group/menu`): Push menu templates to multiple venues, standardize items across the group
- **Group Analytics** (`/group/analytics`): Cross-venue comparisons, heat maps of performance

### 5. UI: CRM & Loyalty Pages
- **Diners** page (`/diners`): List of diners who have visited the venue, visit count, last visit, total spend, allergens/preferences
- **Loyalty** page (`/loyalty`): Configure loyalty programs, view member balances, tier distribution
- Group-level CRM view showing diners across all venues

### 6. Navigation Updates
- Add "Diners" and "Loyalty" to sidebar nav
- For group admins: add "Group" section in sidebar with Group Dashboard, Group Menu, Group Analytics
- Venue switcher appears for users with access to 2+ venues

## Technical Details

### New Tables Summary
```text
venue_groups
├── id (uuid PK)
├── name (text)
├── logo_url (text, nullable)
├── settings (jsonb)
└── created_at

venue_group_staff
├── id (uuid PK)
├── group_id (FK → venue_groups)
├── user_id (FK → auth.users)
├── role (enum: group_admin, group_viewer)
└── created_at

venues (ALTER)
└── group_id (uuid, nullable FK → venue_groups)

diner_profiles
├── id (uuid PK)
├── user_id (uuid, nullable)
├── email, phone, display_name
├── preferences (jsonb)
├── allergens (text[])
└── created_at

diner_visits
├── id (uuid PK)
├── diner_id (FK → diner_profiles)
├── venue_id (FK → venues)
├── order_id (FK → orders, nullable)
└── visited_at

loyalty_programs
├── id (uuid PK)
├── venue_id (nullable) / group_id (nullable)
├── name, type, rules (jsonb)
└── is_active

loyalty_balances
├── id (uuid PK)
├── diner_id (FK → diner_profiles)
├── program_id (FK → loyalty_programs)
├── balance (numeric), tier (text)
└── updated_at
```

### RLS Strategy
- `is_group_admin(user_id, group_id)` — new SECURITY DEFINER helper
- Group admins inherit access to all venues in the group
- Venue-level RLS unchanged for non-group venues

### Migration Plan
1. Migration 1: `venue_groups`, `venue_group_staff`, add `group_id` to `venues`, helper functions, RLS
2. Migration 2: `diner_profiles`, `diner_visits`, `loyalty_programs`, `loyalty_balances`, RLS
3. Frontend: VenueContext multi-venue support, venue switcher, group pages, CRM/loyalty pages

## Implementation Order
1. Database migrations (both)
2. Update VenueContext for multi-venue + group awareness
3. Venue switcher in sidebar
4. Group Dashboard page
5. Diners CRM page
6. Loyalty page
7. Group menu management
8. Group analytics

