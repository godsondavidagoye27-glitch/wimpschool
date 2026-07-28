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
    const { userId, role, schoolId } = payload || {};
    if (!userId || !role) {
      return new Response(JSON.stringify({ error: 'Missing userId or role' }), { status: 400 });
    }

    if (callerUserId !== userId) {
      return new Response(JSON.stringify({ error: 'Authenticated user must match requested userId' }), { status: 403 });
    }

    const allowedRoles = ['school_admin', 'teacher', 'parent', 'super_admin'];
    const isSuperAdminRequest = role === 'super_admin';

    if (isSuperAdminRequest) {
      const superAdminSecret = Deno.env.get('SUPER_ADMIN_ROLE_SECRET');
      const providedSecret = req.headers.get('x-super-admin-secret');
      if (!superAdminSecret || providedSecret !== superAdminSecret) {
        return new Response(JSON.stringify({ error: 'Missing or invalid super admin authorization' }), { status: 403 });
      }
    } else if (!['school_admin', 'teacher', 'parent'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Unsupported or forbidden role' }), { status: 403 });
    }

    if (role === 'school_admin') {
      if (!schoolId) {
        return new Response(JSON.stringify({ error: 'Missing schoolId for school admin role' }), { status: 400 });
      }

      const { data: school, error: schoolErr } = await supabase
        .from('schools')
        .select('id')
        .eq('id', schoolId)
        .eq('admin_id', callerUserId)
        .single();

      if (schoolErr || !school) {
        return new Response(JSON.stringify({ error: 'School administrator verification failed' }), { status: 403 });
      }
    }

    if (role === 'teacher') {
      if (!schoolId) {
        return new Response(JSON.stringify({ error: 'Missing schoolId for teacher role' }), { status: 400 });
      }

      const { data: teacher, error: teacherErr } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', callerUserId)
        .eq('school_id', schoolId)
        .single();

      if (teacherErr || !teacher) {
        return new Response(JSON.stringify({ error: 'Teacher verification failed' }), { status: 403 });
      }
    }

    if (role === 'parent') {
      if (!schoolId) {
        return new Response(JSON.stringify({ error: 'Missing schoolId for parent role' }), { status: 400 });
      }

      const { data: parent, error: parentErr } = await supabase
        .from('parents')
        .select('id')
        .eq('user_id', callerUserId)
        .eq('school_id', schoolId)
        .single();

      if (parentErr || !parent) {
        return new Response(JSON.stringify({ error: 'Parent verification failed' }), { status: 403 });
      }
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
