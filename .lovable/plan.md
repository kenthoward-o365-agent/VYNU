

## Impact on existing loyalty programs (and how Phase 1 handles it)

### What's in your database right now

| Program | Scope | Enrolled diners | Status |
|---------|-------|-----------------|--------|
| **The Pass** | Group: *Australian Venue Co.* | 1 | Active |
| **Morris House** | Venue: *Morris House* (child of that group) | 2 | Active |

The child venue currently has **both** a group program and its own venue program. Phase 1's "group wins for children" rule needs to handle this without breaking the 2 enrolled Morris House diners.

### How Phase 1 will treat existing data

**Nothing is auto-deleted, auto-merged, or auto-renamed.** All existing programs and balances are preserved as-is. Phase 1 only changes two things:

1. The **auto-provisioning trigger** only fires for *new* venues/groups going forward — your existing venues are skipped (the backfill check looks for "does this venue/group already have any active loyalty program?" and exits if yes).
2. The **`get_active_loyalty_program(venue_id)` resolver** decides which single program the diner UI shows at a given venue. For a child venue with both a group program and a venue program, the rule is **group wins**.

### What this means for your two existing programs

- **The Pass (group)** — unchanged. Becomes the resolved program for both *Australian Venue Co.* (parent) and *Morris House* (child). Its 1 enrolled diner sees it everywhere as before.
- **Morris House (venue program on a child)** — *kept in the database, balances preserved, but hidden from the diner UI at Morris House* because the group's "The Pass" now resolves first. The 2 enrolled diners' balances are not lost — they just wouldn't see "Morris House Rewards" on the menu/checkout/profile until you decide what to do with it.

### Three options the venue manager will see (new "Conflict Resolution" banner)

When a manager opens the Ordrup Rewards settings on either Morris House or the group, we'll detect the overlap and show a one-time banner:

> *"You have two active loyalty programs covering Morris House: **The Pass** (group) and **Morris House** (venue). Diners can only see one. Choose how to resolve:"*

- **A. Keep "The Pass" only** *(recommended)* — deactivates the Morris House program (`is_active = false`), **migrates the 2 Morris House diners' balances into The Pass** (insert/update `loyalty_balances` rows so each diner's combined points roll into The Pass; original rows are kept for audit but the program is inactive). Diners see no disruption — they just see their points under "The Pass" now.
- **B. Keep "Morris House" only at this venue** — deactivates the group program *for this child only* by setting an opt-out flag (new `loyalty_program_venue_optouts` row), so Morris House continues running its own program and ignores the group one. The Pass keeps running at the parent and any future siblings.
- **C. Decide later** — leaves both active; resolver shows the group program (The Pass), Morris House program is hidden but data preserved. Banner stays visible until resolved.

### How Option A's balance migration works

For each diner enrolled in the Morris House program:
1. Look up their balance in The Pass — if none exists, insert a new `loyalty_balances` row for The Pass with the migrated balance.
2. If they're already in The Pass, add the Morris House balance to their existing The Pass balance.
3. Set the Morris House program `is_active = false`. Old `loyalty_balances` rows stay for audit.

Done as part of the manager clicking "Keep The Pass only" — not automatic.

### What changes in the migration plan

Add to the original Phase 1 migration:

- `auto_provision_ordrup_rewards()` trigger gets an **idempotency guard**: skip if the venue/group already has any active `loyalty_programs` row. So your existing setup gets *nothing* auto-created.
- Backfill logic only touches venues/groups that have **zero** active programs today. Both your group and Morris House already have programs → both skipped.
- New table `loyalty_program_venue_optouts (program_id, venue_id)` to support Option B (a child opting out of its parent group's program).
- The `get_active_loyalty_program(venue_id)` resolver checks the optout table before returning the group program.

### What you (the operator) need to do after Phase 1 ships

Open the Ordrup Rewards tab on Morris House → see the conflict banner → pick A, B, or C. Until you pick, diners at Morris House will see The Pass (the group program) and the Morris House venue program will be invisible but intact.

### No risk to

- Existing diner balances (preserved on disk; only *visibility* changes until you resolve).
- The group "The Pass" program (unchanged).
- Any other venue/group not in this conflict (you only have one group right now, so this is the only conflict).
- Cross-venue cards, profiles, allergens (separate system).

