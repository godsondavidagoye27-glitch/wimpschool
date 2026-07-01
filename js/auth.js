function isSupabaseClient(value) {
  return value
    && typeof value.auth === 'object'
    && typeof value.auth.signInWithPassword === 'function'
    && typeof value.auth.signUp === 'function'
    && typeof value.from === 'function';
}

function getSupabaseLibrary() {
  if (window.Supabase && typeof window.Supabase.createClient === 'function') {
    return window.Supabase;
  }

  if (window.supabase && typeof window.supabase.createClient === 'function') {
    window.Supabase = window.supabase;
    return window.Supabase;
  }

  return null;
}

function initSupabaseClient() {
  const SupabaseLib = getSupabaseLibrary();
  if (!SupabaseLib) {
    console.error('Supabase SDK not loaded. Make sure the CDN script tag comes before auth.js.');
    return null;
  }

  if (!window.wimpSchoolConfig) {
    console.error('wimpSchoolConfig not found. Run: node scripts/generate-config.js.');
    return null;
  }

  const { supabaseUrl, supabaseKey } = window.wimpSchoolConfig;

  if (!supabaseUrl || supabaseUrl.includes('<YOUR_')) {
    console.error('Supabase URL not configured. Fill in .env and run generate-config.js.');
    return null;
  }

  if (!supabaseKey || supabaseKey.includes('<YOUR_')) {
    console.error('Supabase key not configured. Fill in .env and run generate-config.js.');
    return null;
  }

  const client = SupabaseLib.createClient(supabaseUrl, supabaseKey);
  if (!isSupabaseClient(client)) {
    console.error('Supabase client initialization failed. Client object is invalid.');
    return null;
  }

  window.supabaseClient = client;
  return client;
}

// Ensure the Supabase client is initialized on page load
const _supabaseClient = initSupabaseClient();
if (_supabaseClient) {
  window.supabase = _supabaseClient;
}

function getSupabase() {
  if (isSupabaseClient(window.supabaseClient)) {
    return window.supabaseClient;
  }

  if (isSupabaseClient(window.supabase)) {
    window.supabaseClient = window.supabase;
    return window.supabase;
  }

  const client = initSupabaseClient();
  if (client) {
    window.supabase = client;
    return client;
  }

  return null;
}

async function fetchUserRole(userId) {
  const client = getSupabase();
  if (!client) {
    return { error: { message: 'Supabase is not initialized. Check your configuration and script order.' } };
  }

  try {
    // Use a normal select without .single() to handle empty results gracefully
    const { data, error } = await client
      .from('user_roles')
      .select('role, school_id')
      .eq('user_id', userId);

    if (error) {
      console.error('fetchUserRole error:', error);
      // Show banner for permission/RLS errors
      if (error.code === 'PGRST116' || error.status === 406 || error.status === 403) {
        const msg = 'Supabase user_roles table is not accessible. Admin: disable RLS on user_roles in Supabase dashboard or run: ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;';
        if (window.wimpSchoolRenderConfigError) {
          window.wimpSchoolRenderConfigError(msg);
        }
      }
      return { error };
    }

    // Get the first record if it exists, otherwise return null
    const record = Array.isArray(data) && data.length > 0 ? data[0] : null;
    return { data: record };
  } catch (err) {
    console.error('fetchUserRole exception:', err);
    return { error: { message: err?.message || 'Failed to fetch user role.' } };
  }
}

async function signIn(email, password) {
  const client = getSupabase();
  if (!client) {
    return { error: { message: 'Supabase is not initialized.' } };
  }

  try {
    const { data: authData, error: authError } = await client.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      return { error: authError };
    }

    if (!authData?.user) {
      return { error: { message: 'Authentication failed.' } };
    }

    const roleResult = await fetchUserRole(authData.user.id);
    if (roleResult.error) {
      return { error: roleResult.error };
    }

    const role = roleResult.data?.role || authData.user.user_metadata?.role || 'school_admin';
    return {
      data: {
        user: authData.user,
        role,
        schoolId: roleResult.data?.school_id || null
      }
    };
  } catch (err) {
    console.error('signIn error:', err);
    return { error: { message: err?.message || 'Unable to sign in. Check your network connection.' } };
  }
}

async function signUpSchoolAdmin(payload) {
  const client = getSupabase();
  if (!client) {
    return { error: { message: 'Supabase is not initialized. Check your configuration and script order.' } };
  }

  try {
    const { data: signupData, error: signupError } = await client.auth.signUp({
      email: payload.adminEmail,
      password: payload.adminPassword,
      options: {
        data: {
          role: 'school_admin',
          name: payload.adminName
        }
      }
    });

    if (signupError) {
      return { error: signupError };
    }

    const userId = signupData.user?.id;
    if (!userId) {
      return { error: { message: 'Unable to create the school administrator account.' } };
    }

    const { data: schoolData, error: schoolError } = await client
      .from('schools')
      .insert([
        {
          name: payload.schoolName,
          address: payload.schoolAddress,
          school_code: payload.schoolCode,
          subscription_plan: payload.subscriptionPlan,
          admin_id: userId,
          verified: false
        }
      ])
      .select('id')
      .single();

    if (schoolError) {
      return { error: schoolError };
    }

    const schoolId = schoolData?.id;
    if (!schoolId) {
      return { error: { message: 'School registration failed.' } };
    }

    const { error: roleError } = await client.from('user_roles').insert([
      { user_id: userId, role: 'school_admin', school_id: schoolId }
    ]);

    if (roleError) {
      return { error: roleError };
    }

    return {
      data: {
        user: signupData.user,
        schoolId
      }
    };
  } catch (err) {
    console.error('signUpSchoolAdmin error:', err);
    return { error: { message: err?.message || 'Unable to register school administrator account.' } };
  }
}

async function sendPasswordReset(email) {
  const client = getSupabase();
  if (!client) {
    return { error: { message: 'Supabase is not initialized. Check your configuration and script order.' } };
  }

  const { data, error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login.html`
  });

  return { data, error };
}

async function verifyInviteToken(token) {
  if (!token) {
    return { error: { message: 'Invite token is missing.' } };
  }

  const client = getSupabase();
  if (!client) {
    return { error: { message: 'Supabase is not initialized. Check your configuration and script order.' } };
  }

  const { data: parent, error: parentError } = await client
    .from('parents')
    .select('id, name, email, phone, student_id, invite_token, account_created, school_id')
    .eq('invite_token', token)
    .single();

  if (parent && !parentError) {
    return { data: { ...parent, role: 'parent' } };
  }

  const { data: teacher, error: teacherError } = await client
    .from('teachers')
    .select('id, name, email, subjects, classes, invite_token, account_created, school_id')
    .eq('invite_token', token)
    .single();

  if (teacher && !teacherError) {
    return { data: { ...teacher, role: 'teacher' } };
  }

  return { error: { message: 'Invalid or expired invite token.' } };
}

async function acceptInvite(token, password) {
  const client = getSupabase();
  if (!client) {
    return { error: { message: 'Supabase is not initialized. Check your configuration and script order.' } };
  }

  const inviteResult = await verifyInviteToken(token);
  if (inviteResult.error) {
    return { error: inviteResult.error };
  }

  const invite = inviteResult.data;
  if (invite.account_created) {
    return { error: { message: 'This invite has already been used.' } };
  }

  const signUpResult = await client.auth.signUp({
    email: invite.email,
    password,
    options: {
      data: {
        role: invite.role,
        name: invite.name
      }
    }
  });

  if (signUpResult.error) {
    return { error: signUpResult.error };
  }

  const userId = signUpResult.data.user?.id;
  if (!userId) {
    return { error: { message: 'Unable to create user account.' } };
  }

  const targetTable = invite.role === 'parent' ? 'parents' : 'teachers';
  const updatePayload = {
    account_created: true,
    user_id: userId
  };

  const { error: updateError } = await client
    .from(targetTable)
    .update(updatePayload)
    .eq('invite_token', token);

  if (updateError) {
    return { error: updateError };
  }

  const { error: roleError } = await client.from('user_roles').insert([
    { user_id: userId, role: invite.role, school_id: invite.school_id || null }
  ]);

  if (roleError) {
    return { error: roleError };
  }

  return {
    data: {
      userId,
      role: invite.role,
      schoolId: invite.school_id || null
    }
  };
}
