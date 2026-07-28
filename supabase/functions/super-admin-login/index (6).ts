import { serve } from 'https://deno.land/std@0.195.0/http/server.ts';

serve(async req => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  const payload = await req.json();
  const secret = payload?.secret;
  const expected = Deno.env.get('SUPER_ADMIN_SECRET');

  if (!expected) {
    return new Response(JSON.stringify({ error: 'Server configuration incomplete' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  if (!secret || secret !== expected) {
    return new Response(JSON.stringify({ error: 'Invalid super admin secret key' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
