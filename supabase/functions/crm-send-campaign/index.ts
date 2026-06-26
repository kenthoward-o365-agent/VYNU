// Materialises a campaign send: resolves segment, creates send rows + tracking tokens, marks campaign as sent.
// Actual channel delivery (email, sms, push) is stubbed and ready to wire to providers.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface Body {
  campaign_id: string
  test_recipient?: string // if set, send a single test, do not mark campaign sent
}

function makeToken() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20)
}

const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return j({ error: 'Unauthorized' }, 401)

    const body: Body = await req.json()
    if (!body.campaign_id) return j({ error: 'Missing campaign_id' }, 400)

    // Verify JWT
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await callerClient.auth.getUser()
    const userId = userData?.user?.id
    if (userErr || !userId) return j({ error: 'Unauthorized' }, 401)

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: campaign, error } = await supabase
      .from('crm_campaigns').select('*').eq('id', body.campaign_id).maybeSingle()
    if (error || !campaign) return j({ error: 'Campaign not found' }, 404)

    // Confirm caller manages the campaign's venue
    const { data: isManager } = await supabase.rpc('is_venue_manager', {
      _user_id: userId, _venue_id: campaign.venue_id,
    })
    if (!isManager) return j({ error: 'Forbidden' }, 403)
    if (!['draft', 'scheduled'].includes(campaign.status) && !body.test_recipient) {
      return j({ error: `Cannot send a ${campaign.status} campaign` }, 400)
    }

    // Resolve recipients
    let recipients: { diner_id: string | null; recipient: string }[] = []
    if (body.test_recipient) {
      recipients = [{ diner_id: null, recipient: body.test_recipient }]
    } else if (campaign.audience_type === 'sms_subscribers') {
      if (campaign.channel !== 'sms') {
        return j({ error: 'SMS Subscribers audience requires SMS channel' }, 400)
      }
      const { data: subs } = await supabase
        .from('sms_subscribers')
        .select('phone')
        .eq('venue_id', campaign.venue_id)
        .eq('marketing_opt_in', true)
        .is('unsubscribed_at', null)
      const { data: suppressed } = await supabase
        .from('crm_suppression').select('sms_e164').eq('venue_id', campaign.venue_id)
      const supSms = new Set((suppressed || []).map((s: any) => s.sms_e164).filter(Boolean))
      for (const s of subs || []) {
        if (!s.phone || supSms.has(s.phone)) continue
        recipients.push({ diner_id: null, recipient: s.phone })
      }
    } else if (campaign.segment_id) {
      const { data: members } = await supabase
        .from('diner_segment_members')
        .select('diner_id, diner_profiles!inner(id, email, sms_e164, marketing_opt_in_email, marketing_opt_in_sms, marketing_opt_in_push, unsubscribe_token)')
        .eq('segment_id', campaign.segment_id)

      const optKey =
        campaign.channel === 'email' ? 'marketing_opt_in_email' :
        campaign.channel === 'sms' ? 'marketing_opt_in_sms' :
        campaign.channel === 'push' ? 'marketing_opt_in_push' : null

      // Suppression list
      const { data: suppressed } = await supabase
        .from('crm_suppression').select('email, sms_e164').eq('venue_id', campaign.venue_id)
      const supEmails = new Set((suppressed || []).map((s: any) => s.email).filter(Boolean))
      const supSms = new Set((suppressed || []).map((s: any) => s.sms_e164).filter(Boolean))

      for (const m of members || []) {
        const p: any = (m as any).diner_profiles
        if (!p) continue
        if (optKey && !p[optKey]) continue
        let addr: string | null = null
        if (campaign.channel === 'email') addr = p.email
        else if (campaign.channel === 'sms') addr = p.sms_e164
        else if (campaign.channel === 'push' || campaign.channel === 'in_app') addr = p.id
        if (!addr) continue
        if (campaign.channel === 'email' && supEmails.has(addr)) continue
        if (campaign.channel === 'sms' && supSms.has(addr)) continue
        recipients.push({ diner_id: p.id, recipient: addr })
      }
    }


    if (recipients.length === 0) return j({ error: 'No eligible recipients' }, 400)

    if (!body.test_recipient) {
      await supabase.from('crm_campaigns').update({
        status: 'sending', send_started_at: new Date().toISOString(), recipients_total: recipients.length,
      }).eq('id', campaign.id)
    }

    // Create send + token rows in batches
    const sendRows = recipients.map((r) => ({
      campaign_id: campaign.id,
      venue_id: campaign.venue_id,
      diner_id: r.diner_id,
      channel: campaign.channel,
      recipient: r.recipient,
      status: 'sent' as const,
      sent_at: new Date().toISOString(),
      tracking_token: makeToken(),
    }))

    const { data: inserted } = await supabase.from('crm_campaign_sends').insert(sendRows).select('id, tracking_token, diner_id')

    const tokenRows = (inserted || []).map((s: any) => ({
      token: s.tracking_token,
      campaign_id: campaign.id,
      send_id: s.id,
      venue_id: campaign.venue_id,
      diner_id: s.diner_id,
    }))
    if (tokenRows.length) await supabase.from('crm_tracking_tokens').insert(tokenRows)

    // TODO: Actual delivery integration (Lovable Emails, Twilio, Web Push). For now sends are logged as 'sent'.

    if (!body.test_recipient) {
      await supabase.from('crm_campaigns').update({
        status: 'sent',
        send_completed_at: new Date().toISOString(),
        recipients_sent: recipients.length,
      }).eq('id', campaign.id)
    }

    return j({ ok: true, recipients: recipients.length, test: !!body.test_recipient })
  } catch (e) {
    return j({ error: String(e) }, 500)
  }
})

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
