# Landing Page Builder for Venues

## Approach
Use **GrapesJS** — a mature, open-source drag-and-drop web page builder (MIT licensed). It provides a full visual editor with blocks, styling panel, layer manager, and responsive preview out of the box.

## What We're Building

### 1. Database
- Add a `landing_page_html` column (text) to the `venues` table to store the serialized page content
- Create a `venue-assets` storage bucket for uploaded images (logos, hero photos, etc.)

### 2. Landing Page Editor (`/settings/landing-page`)
- Embed GrapesJS in a new tab/page within Venue Settings
- Pre-built blocks tailored for hospitality:
  - **Hero section** (venue name, tagline, background image)
  - **Loyalty signup CTA** (incentive text + button)
  - **Featured items** (image + name + price cards)
  - **Hours & location** block
  - **Social links** block
- Operators drag blocks, customize text/colors/images, and save
- Save serializes HTML + CSS to the `landing_page_html` column

### 3. Consumer Landing Page Update
- When a diner scans QR → check if venue has custom `landing_page_html`
- If yes → render the custom HTML landing page with injected "Start Ordering" and "Continue as Guest" buttons
- If no → fall back to current default VenueLanding component

### 4. Image Uploads
- Storage bucket `venue-assets` for venue images
- Upload within the GrapesJS asset manager

## Implementation Order
1. Database migration (add column + storage bucket)
2. Install GrapesJS + build editor page
3. Add custom hospitality blocks
4. Update ConsumerOrder to render custom landing pages
5. Wire up image uploads via storage bucket
