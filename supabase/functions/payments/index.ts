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
  const { studentId, parentId, schoolId, amount, status, method, txRef } = payload;

  if (!schoolId || !amount || !txRef) {
    return new Response(JSON.stringify({ error: 'Missing payment details' }), { status: 400 });
  }

  const { data, error } = await supabase.from('payments').insert([{
    student_id: studentId || null,
    parent_id: parentId || null,
    school_id: schoolId,
    amount,
    status: status || 'pending',
    method: method || 'online',
    tx_ref: txRef,
    processed_at: new Date().toISOString()
  }]).select().single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ data }), { status: 201 });
});
