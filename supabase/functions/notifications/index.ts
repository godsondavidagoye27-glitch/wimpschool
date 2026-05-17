import { serve } from 'https://deno.land/std@0.195.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

serve(async req => {
  if (req.method === 'POST') {
    const payload = await req.json();
    const { userId, schoolId, type, message } = payload;
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

    return new Response(JSON.stringify({ data }), { status: 201 });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
});
