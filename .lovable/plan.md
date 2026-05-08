## H&L OrderNow Rebrand

Rename product from **Shyndig** → **H&L OrderNow** across the admin panel, operator app, consumer web app, and Knowledge Base. Replace logo + color palette to match the H&L POS system.

### 1. Brand assets

- Save the uploaded H&L logo to `src/assets/brand/hl-ordernow-logo.png` and `public/brand/hl-ordernow-logo.png`.
- Replace existing favicons (`/favicon-*.png`, `apple-touch-icon.png`) with H&L mark.
- Replace/retire the Shyndig SVGs in `src/assets/brand/` (logo-primary, mono-black, mono-white, reversed, icon) with H&L equivalents (recolored versions of the new logo and a mono variant for dark sidebar).
- Update `public/shyndig-icon.svg` and `src/assets/brand/shyndig-icon.svg` → H&L icon.

### 2. Color system (H&L palette)

Sampled from the POS screenshot + logo:

| Token | Hex | HSL | Role |
|-------|-----|-----|------|
| H&L Blue | #3BAEDC | 198 70% 55% | Primary — CTAs, links, headers, sidebar accents |
| H&L Blue Dark | #2A8FB8 | 199 63% 44% | Primary hover / pressed |
| H&L Green | #7FC242 | 87 50% 51% | Secondary accent — success, confirm dot, ring |
| Ink | #1F3B4D | 203 42% 21% | Text on light surfaces |
| Surface | #FFFFFF | 0 0% 100% | App background (POS feels light/white) |
| Muted Surface | #F4F8FB | 204 38% 97% | Cards / panels |

- Rewrite the brand tokens in `src/index.css` (`:root` and `.dark`) and `tailwind.config.ts` so `--primary`, `--accent`, `--ring`, `--sidebar-*`, gradients, and shadows use the H&L blue/green pair instead of Shyndig Midnight/Gold/Coral.
- Sidebar shifts from "always Midnight" to a clean H&L look — choose: white sidebar with blue accents (matches POS) **or** keep dark sidebar with H&L blue accents (see Q1).
- Update `mem://design/brand-colors.md` with the new palette.

### 3. Product name copy

Global find/replace `Shyndig` → `H&L OrderNow` (and `shyndig` → `h&l ordernow` where it's prose, not URLs/identifiers). Affected surfaces:

- `index.html` `<title>`, meta description, OG/Twitter tags, `meta[name=author]`.
- `src/components/DashboardLayout.tsx` — sidebar product name.
- `src/pages/Auth.tsx`, `ResetPassword.tsx`, `Onboarding.tsx` — auth screens.
- Admin pages: `AdminStaff.tsx`, `AdminVenueDetail.tsx`, `GroupDashboard.tsx`, `Developers.tsx`.
- Operator pages: `VenueSettings.tsx`, `Tables.tsx`, `Orders.tsx`, `Loyalty.tsx`, `Pricing.tsx`.
- Consumer surfaces: `ConsumerOrder.tsx`, `MenuFeed.tsx`, `VenueLanding.tsx`, `CheckoutPanel.tsx`, `ReceiptView.tsx`, `LoyaltyJoinPrompt.tsx`, `DinerProfile.tsx`, `DinerSignup.tsx`, `AIChatOverlay.tsx`, `AdyenDropin.tsx`.
- Settings/components mentioning "Shyndig Loyalty", "Shyndig AI", "Shyndig Analytics" → "H&L OrderNow Loyalty / AI / Analytics" (filenames can stay, only display strings change).
- `src/pages/KnowledgeBase.tsx` — every article body, headings, examples.
- Edge functions: only user-facing strings (email subjects, receipts, chat system prompts in `diner-chat`, `adyen-payment`, `partner-*`, `pos-*`, `admin-create-user`). Internal log lines and code identifiers left as-is unless trivial.

### 4. Things deliberately NOT changed

- **QR code URLs / `shyndig.lovable.app` host** — printed stickers are permanent (per `mem://constraints/qr-codes-permanent`). New domain only added if/when user provides one (see Q2).
- Database column names, table names, edge function names, env var names, file/component names containing "shyndig" or "sippa" — non-user-visible.
- Lovable Cloud / Supabase project ref.

### 5. Verification

- Build passes.
- Spot-check: Auth screen, Admin sidebar, Venue detail, Tables/QR page, Knowledge Base, consumer `/order/...` flow — all show H&L logo + blue/green palette + "H&L OrderNow" wording.
- `rg -i 'shyndig'` returns only intentional leftovers (host URL, internal identifiers, memory files).

### Open questions

See follow-up below.
