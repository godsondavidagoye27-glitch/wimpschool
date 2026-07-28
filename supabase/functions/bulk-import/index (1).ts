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
  const { schoolId, records } = payload;
  if (!schoolId || !Array.isArray(records)) {
    return new Response(JSON.stringify({ error: 'Missing bulk import payload' }), { status: 400 });
  }

  const formatted = records.map(item => ({
    school_id: schoolId,
    name: item.name,
    class_name: item.class_name,
    parent_email: item.parent_email,
    student_code: item.student_code || item.student_id,
    created_at: new Date().toISOString()
  }));

  const { data, error } = await supabase.from('students').insert(formatted).select();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ data }), { status: 201 });
});
