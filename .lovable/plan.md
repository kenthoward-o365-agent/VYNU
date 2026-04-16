

# Editable Loyalty CTA Icon + Table Number Styling

## Overview

Two enhancements:

1. **Loyalty CTA** -- make the "🎁" icon prefix editable (change emoji, or remove it entirely)
2. **Table Number** -- make it fully customizable: label text, number color, background color, label color, font size

## Changes

### 1. Types (`types.ts`)

**LoyaltyCTASection** -- add `icon?: string` (default `"🎁"`). Empty string = no icon.

**TableDisplaySection** -- add optional styling fields:
- `label?: string` (default `"Your Table"`)
- `numberColor?: string` (default `"#7c3aed"`)
- `bgColor?: string` (default `"rgba(255,255,255,0.1)"`)
- `borderColor?: string` (default `"rgba(255,255,255,0.15)"`)
- `labelColor?: string` (default `"rgba(255,255,255,0.5)"`)

Update `createDefaultSection` with these defaults.

### 2. Editor Panel (`SectionEditPanel.tsx`)

**Loyalty CTA** -- add an "Icon" input field (emoji/text, with hint "Leave empty to hide").

**Table Number** -- replace the "no configuration" message with fields:
- Label text input
- Number color picker
- Background color picker
- Border color picker
- Label color picker

### 3. Renderer (`LandingSectionRenderer.tsx`)

**Loyalty CTA** -- use `section.icon` instead of hardcoded `"🎁"`. If empty/undefined, show heading without icon prefix. Fall back to `"🎁"` for backward compat when `icon` is undefined.

**Table Number** -- apply the style properties from the section data, falling back to current hardcoded values.

## Files Changed

| File | Change |
|------|--------|
| `src/components/landing-editor/types.ts` | Add `icon` to LoyaltyCTASection; add style fields to TableDisplaySection |
| `src/components/landing-editor/SectionEditPanel.tsx` | Add icon field for loyalty CTA; add label + color fields for table display |
| `src/components/landing-editor/LandingSectionRenderer.tsx` | Use dynamic icon for loyalty CTA; use dynamic styles for table display |

