import { serve } from 'https://deno.land/std@0.195.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

async function sendExternalChannel(channel: string, payload: Record<string, unknown>) {
  if (channel === 'email') {
    const apiKey = Deno.env.get('SENDGRID_API_KEY');
    const from = (payload.from as string) || Deno.env.get('NOTIFICATION_FROM_EMAIL') || 'hello@wimpschool.com';
    if (!apiKey) return { ok: false, reason: 'sendgrid-not-configured' };

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.to as string }] }],
        from: { email: from },
        subject: payload.subject as string || 'WimpSchool update',
        content: [{ type: 'text/plain', value: payload.message as string || '' }]
      })
    });

    return response.ok ? { ok: true } : { ok: false, reason: await response.text() };
  }

  if (channel === 'sms') {
    const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const token = Deno.env.get('TWILIO_AUTH_TOKEN');
    const from = Deno.env.get('TWILIO_FROM');
    if (!sid || !token || !from) return { ok: false, reason: 'twilio-not-configured' };

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: payload.to as string,
        From: from,
        Body: payload.message as string || ''
      })
    });

    return response.ok ? { ok: true } : { ok: false, reason: await response.text() };
  }

  return { ok: false, reason: 'unsupported-channel' };
}

serve(async req => {
  if (req.method === 'POST') {
    const payload = await req.json();
    const { userId, schoolId, type, message, channel, recipient, subject, from } = payload;
    if (!schoolId || !message) {
      return new Response(JSON.stringify({ error: 'Missing notification payload' }), { status: 400 });
    }

    const { data, error } = await supabase.from('notifications').insert([{
      user_id: userId || null,
      school_id: schoolId,
      type: type || 'info',
      message,
      read: false,
      created_at: new Date().toISOString()
    }]).select().single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (channel && recipient) {
      const externalResult = await sendExternalChannel(channel, {
        to: recipient,
        from,
        subject,
        message
      });
      return new Response(JSON.stringify({
        data,
        external: externalResult,
        configured: externalResult.ok || ['sendgrid-not-configured', 'twilio-not-configured'].includes(externalResult.reason as string)
      }), { status: 201 });
    }

    return new Response(JSON.stringify({ data, external: { ok: false, reason: 'not-requested' } }), { status: 201 });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
});
