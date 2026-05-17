import { serve } from 'https://deno.land/std@0.195.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

serve(async req => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const payload = await req.json();
  if (!payload.email || !payload.role || !payload.schoolId) {
    return new Response(JSON.stringify({ error: 'Missing invite payload' }), { status: 400 });
  }

  const token = crypto.randomUUID?.() || Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const row = {
    name: payload.name,
    email: payload.email,
    invite_token: token,
    account_created: false,
    school_id: payload.schoolId
  };

  const table = payload.role === 'parent' ? 'parents' : 'teachers';
  const { data, error } = await supabase.from(table).insert([row]).select().single();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ data, token }), { status: 201 });
});
