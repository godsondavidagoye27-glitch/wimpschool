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

  try {
    const payload = await req.json();
    const { userId, role, schoolId } = payload || {};
    if (!userId || !role) {
      return new Response(JSON.stringify({ error: 'Missing userId or role' }), { status: 400 });
    }

    // Check existing
    const { data: existing, error: selErr } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (selErr) {
      return new Response(JSON.stringify({ error: selErr.message }), { status: 500 });
    }

    if (Array.isArray(existing) && existing.length > 0) {
      return new Response(JSON.stringify({ data: { exists: true } }), { status: 200 });
    }

    const payloadRow: any = { user_id: userId, role };
    if (schoolId) payloadRow.school_id = schoolId;

    const { data, error } = await supabase
      .from('user_roles')
      .insert([payloadRow])
      .select('id, user_id, role, school_id')
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ data }), { status: 201 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
