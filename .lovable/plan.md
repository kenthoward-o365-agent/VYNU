

# Audit Date System with DayEnd Navigation

## Overview

Add a venue-level **audit date** that decouples the business day from the calendar clock. Venues open past midnight keep the same audit date until staff explicitly advance it via a "DayEnd" action. The Dashboard will use the current audit date instead of `new Date()` for "Today."

## Database Changes

### New table: `venue_audit_dates`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `venue_id` | uuid | unique, references venues |
| `current_date` | date | The active business day |
| `advanced_by` | uuid | User who last advanced |
| `advanced_at` | timestamptz | When last advanced |
| `created_at` | timestamptz | default `now()` |

- On venue creation or first access, default to `CURRENT_DATE` in venue timezone.
- RLS: staff can SELECT; managers can UPDATE.

### New table: `venue_dayend_log`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `venue_id` | uuid | |
| `audit_date` | date | The date that was closed |
| `closed_by` | uuid | |
| `closed_at` | timestamptz | default `now()` |

- Immutable audit trail of every DayEnd action.
- RLS: staff can SELECT and INSERT.

### Database function: `advance_audit_date`

An RPC that atomically:
1. Reads current audit date for venue
2. Inserts a row into `venue_dayend_log`
3. Sets `current_date = current_date + 1` on `venue_audit_dates`
4. Returns the new date

Uses `SECURITY DEFINER` with venue staff check.

## Frontend Changes

### 1. Audit Date Context — `src/contexts/AuditDateContext.tsx`

New context that:
- Fetches `venue_audit_dates.current_date` for the active venue
- Exposes `auditDate: string` (YYYY-MM-DD), `advanceDay()`, and `loading`
- Wraps inside `VenueProvider` in App.tsx
- If no row exists for venue, calls an RPC to initialize it

### 2. Dashboard Integration — `src/pages/Dashboard.tsx`

- Import `useAuditDate()` from the new context
- Replace `getDefaultAuditDate()` with the audit date from context
- "Today" label maps to the current audit date, not `new Date()`
- The date picker still allows historical browsing

### 3. Navigation — `src/components/DashboardLayout.tsx`

Add a new collapsible "DayEnd" entry in the sidebar nav, positioned between "Diners" and "Settings":

```text
├── Diners
├── DayEnd          ← new, collapsible
│   └── Reporting   ← sub-link to /reporting
├── Settings
```

- Uses `CalendarCheck` or `ClipboardCheck` lucide icon
- Collapsible with same pattern as Menu Builder / Settings
- "Reporting" links to `/reporting`

### 4. DayEnd / Reporting Page — `src/pages/Reporting.tsx`

Initial page with:
- Current audit date display (prominent)
- "Close Day" button (advances audit date via RPC)
- Confirmation dialog before advancing
- Log of previous DayEnd closings (from `venue_dayend_log`)
- Placeholder section for future reports

### 5. Routing — `src/App.tsx`

Add `<Route path="/reporting" element={<Reporting />} />`

## Files Changed

| File | Change |
|------|--------|
| Migration SQL | Create `venue_audit_dates`, `venue_dayend_log`, `advance_audit_date` RPC |
| `src/contexts/AuditDateContext.tsx` | New context |
| `src/App.tsx` | Add AuditDateProvider wrapper, `/reporting` route |
| `src/pages/Dashboard.tsx` | Use audit date from context as default |
| `src/components/DashboardLayout.tsx` | Add DayEnd collapsible nav with Reporting sub-item |
| `src/pages/Reporting.tsx` | New page with day-close controls and log |
| `src/components/AuditDatePicker.tsx` | Minor update to accept an audit date override for "Today" |

