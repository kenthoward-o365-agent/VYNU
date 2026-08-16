// AI campaign content composer - drafts subject/body/sms for a goal
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { aiChat, AiError } from '../_shared/ai.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface Body {
  venue_id: string
  goal: string // daily_special | instant_special | win_back | birthday | kitchen_load | contest | announcement | custom
  channel: 'email' | 'sms' | 'push' | 'in_app'
  prompt?: string
  tone?: string
  segment_name?: string
}

const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return j({ error: 'Unauthorized' }, 401)

    const body: Body = await req.json()
    if (!body.venue_id || !body.goal || !body.channel) return j({ error: 'Missing fields' }, 400)

    // Verify JWT and confirm caller manages this venue
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await callerClient.auth.getUser()
    const userId = userData?.user?.id
    if (userErr || !userId) return j({ error: 'Unauthorized' }, 401)

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: isManager } = await supabase.rpc('is_venue_manager', {
      _user_id: userId, _venue_id: body.venue_id,
    })
    if (!isManager) return j({ error: 'Forbidden' }, 403)
    const { data: venue } = await supabase.from('venues').select('name, cuisine_type').eq('id', body.venue_id).maybeSingle()
    const { data: cfg } = await supabase.from('venue_crm_config').select('default_tone, max_discount_pct').eq('venue_id', body.venue_id).maybeSingle()

    const tone = body.tone || cfg?.default_tone || 'friendly'
    const maxDiscount = cfg?.max_discount_pct ?? 20

    const sysPrompt = `You are an expert hospitality marketing copywriter for ${venue?.name || 'a restaurant'}.
Write punchy, conversion-focused campaign copy. Stay within brand guardrails:
- Tone: ${tone}
- Never offer discounts above ${maxDiscount}%
- Australian spelling
- Include a clear CTA
Output strictly as JSON with keys: subject, preheader, body_text, body_html, sms_text, push_title, push_body, cta_label.`

    const userPrompt = `Goal: ${body.goal}
Channel: ${body.channel}
Segment: ${body.segment_name || 'all eligible diners'}
${body.prompt ? `Brief: ${body.prompt}` : ''}

Return JSON only.`

    let content = '{}'
    try {
      const ai = await aiChat({
        role: 'chat',
        messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userPrompt }],
        responseFormat: { type: 'json_object' },
      })
      content = ai.text || '{}'
    } catch (e) {
      if (e instanceof AiError) return j({ error: e.publicMessage }, e.status)
      throw e
    }
    let parsed: any = {}
    try { parsed = JSON.parse(content) } catch { parsed = { body_text: content } }
    return j({ draft: parsed })
  } catch (e) {
    console.error('[crm-ai-compose] error', e)
    return j({ error: 'Internal error' }, 500)
  }
})

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
