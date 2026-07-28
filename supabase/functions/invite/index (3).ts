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

  const authHeader = req.headers.get('Authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!bearerToken) {
    return new Response(JSON.stringify({ error: 'Authorization token is required' }), { status: 401 });
  }

  const { data: authData, error: authErr } = await supabase.auth.getUser(bearerToken);
  if (authErr || !authData?.user) {
    return new Response(JSON.stringify({ error: authErr?.message || 'Unable to verify authentication token' }), { status: 401 });
  }

  const callerUserId = authData.user.id;
  const payload = await req.json();
  if (!payload.email || !payload.role || !payload.schoolId) {
    return new Response(JSON.stringify({ error: 'Missing invite payload' }), { status: 400 });
  }

  const allowedRoles = ['parent', 'teacher'];
  if (!allowedRoles.includes(payload.role)) {
    return new Response(JSON.stringify({ error: 'Unsupported invite role' }), { status: 400 });
  }

  const role = payload.role;
  const table = role === 'parent' ? 'parents' : 'teachers';
  const schoolId = payload.schoolId;

  const { data: authRole, error: authRoleErr } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', callerUserId)
    .eq('school_id', schoolId)
    .in('role', ['school_admin', 'super_admin'])
    .limit(1)
    .single();

  if (authRoleErr || !authRole) {
    return new Response(JSON.stringify({ error: 'Not authorized to create invites for this school' }), { status: 403 });
  }

  const token = crypto.randomUUID?.() || Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const row: Record<string, unknown> = {
    name: payload.name,
    email: payload.email,
    invite_token: token,
    account_created: false,
    school_id: schoolId
  };

  if (role === 'parent') {
    row.phone = payload.phone || null;
    if (payload.studentId) {
      row.student_id = payload.studentId;
    }
  } else {
    row.subjects = payload.subjects || null;
    row.classes = payload.classes || null;
  }

  const { data, error } = await supabase.from(table).insert([row]).select().single();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (role === 'parent' && payload.studentId && data?.id) {
    await supabase.from('parent_student_links').insert([{
      parent_id: data.id,
      student_id: payload.studentId,
      relation: 'parent'
    }]);
  }

  return new Response(JSON.stringify({ data, token }), { status: 201 });
});
