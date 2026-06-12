// Generate landing page sections from a website URL using Firecrawl + Lovable AI
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!
const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY')!
const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') // optional
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface Body { venue_id: string; url: string }

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const LOGO_HINT = /(logo|favicon|icon|sprite|brand[-_]?mark|symbol)/i
const HERO_HINT = /(hero|banner|cover|header|masthead|jumbotron|featured)/i

function pickHeroImage(branding: any, links: string[]): string | undefined {
  const og = branding?.images?.ogImage
  if (og && !LOGO_HINT.test(og)) return og
  // Look through scraped links for image URLs that smell like a hero
  const imageLinks = (links || []).filter((u) => typeof u === 'string' && /\.(jpe?g|png|webp|avif)(\?|$)/i.test(u))
  const heroish = imageLinks.find((u) => HERO_HINT.test(u) && !LOGO_HINT.test(u))
  if (heroish) return heroish
  const firstNonLogo = imageLinks.find((u) => !LOGO_HINT.test(u))
  return firstNonLogo
}

function deriveTheme(branding: any) {
  const colors = branding?.colors || {}
  const fonts = Array.isArray(branding?.fonts) ? branding.fonts : []
  const background = colors.background || colors.primary || '#1a1a2e'
  const accent = colors.primary || colors.accent || '#7c3aed'
  return {
    background,
    surface: 'rgba(255,255,255,0.08)',
    border: 'rgba(255,255,255,0.15)',
    textPrimary: colors.textPrimary || '#ffffff',
    textMuted: colors.textSecondary || 'rgba(255,255,255,0.7)',
    accent,
    fontHeading: fonts[0]?.family || 'Inter',
    fontBody: fonts[1]?.family || fonts[0]?.family || 'Inter',
  }
}

async function googlePlacesLookup(query: string) {
  if (!GOOGLE_PLACES_API_KEY) return null
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.googleMapsUri,places.regularOpeningHours,places.nationalPhoneNumber,places.websiteUri',
      },
      body: JSON.stringify({ textQuery: query, pageSize: 1 }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const p = data?.places?.[0]
    if (!p) return null
    const hours = p.regularOpeningHours?.weekdayDescriptions?.join(' · ')
    return {
      address: p.formattedAddress as string | undefined,
      hours: hours as string | undefined,
      mapUrl: p.googleMapsUri as string | undefined,
      phone: p.nationalPhoneNumber as string | undefined,
    }
  } catch (_e) {
    return null
  }
}

function findLoyaltyLink(links: string[]): string | undefined {
  const re = /(loyalty|rewards|nation|join|signup|sign-up|members|club)/i
  return links.find((u) => typeof u === 'string' && re.test(u))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return j({ error: 'Unauthorized' }, 401)

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userRes, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userRes?.user) return j({ error: 'Unauthorized' }, 401)
    const userId = userRes.user.id

    const body: Body = await req.json()
    if (!body?.venue_id || !body?.url) return j({ error: 'Missing venue_id or url' }, 400)

    let targetUrl: URL
    try { targetUrl = new URL(body.url.startsWith('http') ? body.url : `https://${body.url}`) }
    catch { return j({ error: 'Invalid URL' }, 400) }
    if (!['http:', 'https:'].includes(targetUrl.protocol)) return j({ error: 'Invalid URL' }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const [{ data: isAdmin }, { data: isMgr }] = await Promise.all([
      admin.rpc('has_role', { _user_id: userId, _role: 'tabless_admin' }),
      admin.rpc('is_venue_manager', { _user_id: userId, _venue_id: body.venue_id }),
    ])
    if (!isAdmin && !isMgr) return j({ error: 'Forbidden' }, 403)

    if (!FIRECRAWL_API_KEY) return j({ error: 'Firecrawl not configured' }, 500)

    const extractionSchema = {
      type: 'object',
      properties: {
        venue_name: { type: 'string' },
        tagline: { type: 'string' },
        about: { type: 'string' },
        signature_dishes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              price: { type: 'string' },
            },
          },
        },
        hours: { type: 'string' },
        address: { type: 'string' },
        phone: { type: 'string' },
        instagram: { type: 'string' },
        facebook: { type: 'string' },
        google_maps: { type: 'string' },
        loyalty_url: { type: 'string' },
      },
    }

    const fcRes = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: targetUrl.toString(),
        onlyMainContent: true,
        formats: [
          'markdown',
          'summary',
          'links',
          'branding',
          { type: 'json', schema: extractionSchema, prompt: 'Extract restaurant/venue information from the page. Look for street address, opening hours, social links, and any loyalty/rewards/sign-up URL.' },
        ],
      }),
    })

    if (!fcRes.ok) {
      const t = await fcRes.text()
      return j({ error: 'Scrape failed', detail: t.slice(0, 500) }, fcRes.status === 402 ? 402 : 502)
    }
    const fcJson = await fcRes.json()
    const data = fcJson.data ?? fcJson
    const branding = data.branding ?? {}
    const extracted = data.json ?? {}
    const summary = data.summary ?? ''
    const links: string[] = Array.isArray(data.links) ? data.links : []
    const metadataTitle = data.metadata?.title || ''

    // Address fallback via Google Places when missing
    let place: Awaited<ReturnType<typeof googlePlacesLookup>> = null
    if (!extracted.address) {
      const query = [extracted.venue_name || metadataTitle, targetUrl.hostname].filter(Boolean).join(' ')
      if (query) place = await googlePlacesLookup(query)
    }
    if (place) {
      extracted.address = extracted.address || place.address
      extracted.hours = extracted.hours || place.hours
      extracted.google_maps = extracted.google_maps || place.mapUrl
      extracted.phone = extracted.phone || place.phone
    }

    // Hero image selection (never a logo)
    const heroImage = pickHeroImage(branding, links)
    const loyaltyLink = extracted.loyalty_url || findLoyaltyLink(links)
    const theme = deriveTheme(branding)

    const sysPrompt = `You compose landing pages for restaurants on the H&L OrderNOW platform.
Return strict JSON with key "sections" (array). Allowed section shapes (output only listed fields, no extras, no ids):
- hero: { type:"hero", title, subtitle, bgColor (hex), logoEmoji, heroImageUrl?, overlayOpacity? (0..0.9) }
- table-display: { type:"table-display", label? }
- featured-items: { type:"featured-items", title, items:[{ emoji, name, price }] }
- loyalty-cta: { type:"loyalty-cta", heading, description, icon?, ctaLabel?, ctaUrl?, variant?:"text"|"image", imageUrl? }
- hours-location: { type:"hours-location", address, hours, mapUrl? }
- social-links: { type:"social-links", instagram, facebook, google }
- text: { type:"text", content, align?:"left"|"center"|"right" }
- divider: { type:"divider" }
- spacer: { type:"spacer", height }

Rules:
- Order: hero → table-display → featured-items (if any) → loyalty-cta (if any) → hours-location → social-links.
- For the hero: only set heroImageUrl to the provided HERO_IMAGE value (or omit it). Never set heroImageUrl to a logo or favicon URL. If HERO_IMAGE is empty, omit heroImageUrl and rely on bgColor + logoEmoji.
- Use Australian spelling. Keep copy short and punchy.
- For loyalty-cta: only include the section when LOYALTY_LINK is provided OR an obvious loyalty programme is mentioned. When present, set ctaLabel (e.g. "Join now") and ctaUrl = LOYALTY_LINK.
- For hours-location: use the provided ADDRESS / HOURS / MAP_URL when given; omit the section only if address is truly unknown.
- Only include social-links when at least one URL is known.
- Up to 4 featured items with food emojis. Omit the section if none.
- Do not invent URLs. Do not add any field not listed above.
- Output strictly valid JSON.`

    const userPrompt = `Source URL: ${targetUrl.toString()}
Branding: ${JSON.stringify(branding).slice(0, 1500)}
Extracted: ${JSON.stringify(extracted).slice(0, 2500)}
Summary: ${summary.slice(0, 1200)}
HERO_IMAGE: ${heroImage || ''}
LOYALTY_LINK: ${loyaltyLink || ''}
ADDRESS: ${extracted.address || ''}
HOURS: ${extracted.hours || ''}
MAP_URL: ${extracted.google_maps || ''}`

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    })

    if (!aiRes.ok) {
      const t = await aiRes.text()
      if (aiRes.status === 429) return j({ error: 'AI rate limit, please retry' }, 429)
      if (aiRes.status === 402) return j({ error: 'AI credits exhausted' }, 402)
      return j({ error: 'AI error', detail: t.slice(0, 500) }, 502)
    }
    const aiData = await aiRes.json()
    const content = aiData.choices?.[0]?.message?.content || '{}'
    let parsed: any = {}
    try { parsed = JSON.parse(content) } catch { return j({ error: 'AI returned invalid JSON' }, 502) }

    const sections = Array.isArray(parsed.sections) ? parsed.sections : []
    if (!sections.length) return j({ error: 'No sections generated' }, 502)

    // Post-process safety: enforce hero image rules + plug in scraped CTA URL if AI dropped it
    const hero = sections.find((s: any) => s?.type === 'hero')
    if (hero) {
      if (hero.heroImageUrl && LOGO_HINT.test(hero.heroImageUrl)) {
        delete hero.heroImageUrl // never use logos as hero
      }
      if (!hero.heroImageUrl && heroImage) hero.heroImageUrl = heroImage
      if (hero.heroImageUrl && typeof hero.overlayOpacity !== 'number') hero.overlayOpacity = 0.5
    }

    const loyalty = sections.find((s: any) => s?.type === 'loyalty-cta')
    if (loyalty && loyaltyLink && !loyalty.ctaUrl) {
      loyalty.ctaUrl = loyaltyLink
      if (!loyalty.ctaLabel) loyalty.ctaLabel = 'Join now'
    }

    const hoursLoc = sections.find((s: any) => s?.type === 'hours-location')
    if (hoursLoc) {
      if (!hoursLoc.address && extracted.address) hoursLoc.address = extracted.address
      if (!hoursLoc.hours && extracted.hours) hoursLoc.hours = extracted.hours
      if (!hoursLoc.mapUrl && extracted.google_maps) hoursLoc.mapUrl = extracted.google_maps
    }

    return j({ sections, theme, branding })
  } catch (e) {
    return j({ error: String(e) }, 500)
  }
})
