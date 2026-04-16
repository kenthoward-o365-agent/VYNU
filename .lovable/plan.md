

# Update App URL Without Breaking Existing QR Codes

## Problem

QR codes are stored in the database with the full URL (e.g. `https://sippaai.lovable.app/order/{venueId}/{tableId}`). Changing the domain would break all printed stickers unless we handle the migration.

## Approach

**Two-part solution:**

1. **Connect your custom domain** via Lovable's built-in domain settings — no code change needed for this step.

2. **Migrate existing QR code URLs in the database** and update the code constant so new QR codes use the new domain.

### Step 1: Connect Your Custom Domain

Go to **Project Settings → Domains** and connect your custom domain. You'll need to add DNS records (A records pointing to `185.158.133.1` and a TXT verification record) at your domain registrar. Lovable will auto-provision SSL once DNS propagates.

**Do this first, then tell me the domain so I can proceed with Step 2.**

### Step 2: Code & Data Changes

Once the custom domain is active:

| Change | Detail |
|--------|--------|
| **`src/pages/Tables.tsx`** | Update `PUBLISHED_BASE_URL` constant from `"https://sippaai.lovable.app"` to your new custom domain |
| **Database migration** | Run a SQL migration to update all existing `qr_code` values: `UPDATE tables SET qr_code = REPLACE(qr_code, 'https://sippaai.lovable.app', 'https://yournewdomain.com') WHERE qr_code LIKE '%sippaai.lovable.app%';` |
| **Memory files** | Update `mem://constraints/qr-codes-permanent` with the new URL format |

### Safety Net

The old `sippaai.lovable.app` URL will continue to work as long as the project remains published — Lovable doesn't remove the `.lovable.app` subdomain when you add a custom domain. So existing printed QR codes will keep working even before migration. The migration just ensures consistency for any new prints or downloads.

## Next Step

Please connect your custom domain first in **Project Settings → Domains**, then share the domain name with me so I can update the code and run the database migration.

