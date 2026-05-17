import { serve } from 'https://deno.land/std@0.195.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

serve(async req => {
  const url = new URL(req.url);

  if (req.method === 'POST') {
    const payload = await req.json();
    const { studentId, teacherId, schoolId, className, status } = payload;
    if (!studentId || !schoolId || !status) {
      return new Response(JSON.stringify({ error: 'Missing attendance payload' }), { status: 400 });
    }

    const { data, error } = await supabase.from('attendance').insert([{
      student_id: studentId,
      teacher_id: teacherId || null,
      school_id: schoolId,
      class: className || null,
      status,
      recorded_at: new Date().toISOString()
    }]).select().single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ data }), { status: 201 });
  }

  if (req.method === 'GET') {
    const studentId = url.searchParams.get('studentId');
    const schoolId = url.searchParams.get('schoolId');
    let query = supabase.from('attendance').select('*');

    if (studentId) query = query.eq('student_id', studentId);
    if (schoolId) query = query.eq('school_id', schoolId);

    const { data, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    return new Response(JSON.stringify({ data }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unsupported method' }), { status: 405 });
});
