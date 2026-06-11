// Generate landing page sections from a website URL using Firecrawl + Lovable AI
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!
const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY')!
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
    // Authorize: must be tabless_admin or venue manager
    const [{ data: isAdmin }, { data: isMgr }] = await Promise.all([
      admin.rpc('has_role', { _user_id: userId, _role: 'tabless_admin' }),
      admin.rpc('is_venue_manager', { _user_id: userId, _venue_id: body.venue_id }),
    ])
    if (!isAdmin && !isMgr) return j({ error: 'Forbidden' }, 403)

    if (!FIRECRAWL_API_KEY) return j({ error: 'Firecrawl not configured' }, 500)

    // 1) Scrape with Firecrawl v2
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
          'branding',
          { type: 'json', schema: extractionSchema, prompt: 'Extract restaurant/venue information from the page.' },
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

    // 2) Ask Lovable AI to compose sections
    const sysPrompt = `You compose landing pages for restaurants on the Tab-Less platform.
Return JSON with key "sections": an array following this exact discriminated-union schema.
Allowed section types and their fields (output only these fields, no extras):
- hero: { type:"hero", title:string, subtitle:string, bgColor:string (hex), logoEmoji:string, heroImageUrl?:string }
- table-display: { type:"table-display", label?:string, numberColor?:string, bgColor?:string, borderColor?:string, labelColor?:string }
- featured-items: { type:"featured-items", title:string, items:[{ emoji:string, name:string, price:string }] }
- loyalty-cta: { type:"loyalty-cta", heading:string, description:string, variant?:"text"|"image", imageUrl?:string, icon?:string }
- hours-location: { type:"hours-location", address:string, hours:string }
- social-links: { type:"social-links", instagram:string, facebook:string, google:string }
- text: { type:"text", content:string }
- divider: { type:"divider" }
- spacer: { type:"spacer", height:number }

Rules:
- Always include a hero section first, then table-display, then content sections.
- Use the venue's actual brand colours from the provided branding (hero bgColor = branding.colors.background or .primary if dark, else a complementary dark hex).
- Use Australian spelling. Keep copy short and punchy.
- Only include social-links if at least one URL is known.
- Use up to 4 featured items (with food emojis). If none found, omit the section.
- Do NOT include id fields — those are added by the client.
- Output strictly valid JSON.`

    const userPrompt = `Source URL: ${targetUrl.toString()}
Branding: ${JSON.stringify(branding).slice(0, 2000)}
Extracted: ${JSON.stringify(extracted).slice(0, 3000)}
Summary: ${summary.slice(0, 1500)}`

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

    // Fallback: stamp logo onto hero if we got one and AI didn't include it
    const logo = branding?.images?.logo || branding?.logo
    if (logo) {
      const hero = sections.find((s: any) => s?.type === 'hero')
      if (hero && !hero.heroImageUrl) hero.heroImageUrl = logo
    }

    return j({ sections, branding })
  } catch (e) {
    return j({ error: String(e) }, 500)
  }
})
