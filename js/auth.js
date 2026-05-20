const supabaseClient = (window.supabase || window.Supabase).createClient(
  wimpSchoolConfig.supabaseUrl,
  wimpSchoolConfig.supabaseKey
);

window.supabase = window.supabase || supabaseClient;
var supabase = window.supabase;

async function fetchUserRole(userId) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, school_id')
    .eq('user_id', userId)
    .single();

  if (error && error.details !== 'Results contain 0 rows') {
    return { error };
  }

  if (!data) {
    return { data: null };
  }

  return { data };
}

async function signIn(email, password) {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
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
}

async function signUpSchoolAdmin(payload) {
  const { data: signupData, error: signupError } = await supabase.auth.signUp({
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

  const { data: schoolData, error: schoolError } = await supabase
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

  const { error: roleError } = await supabase.from('user_roles').insert([
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
}

async function sendPasswordReset(email) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login.html`
  });

  return { data, error };
}

async function verifyInviteToken(token) {
  if (!token) {
    return { error: { message: 'Invite token is missing.' } };
  }

  const { data: parent, error: parentError } = await supabase
    .from('parents')
    .select('id, name, email, phone, student_id, invite_token, account_created, school_id')
    .eq('invite_token', token)
    .single();

  if (parent && !parentError) {
    return { data: { ...parent, role: 'parent' } };
  }

  const { data: teacher, error: teacherError } = await supabase
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
  const inviteResult = await verifyInviteToken(token);
  if (inviteResult.error) {
    return { error: inviteResult.error };
  }

  const invite = inviteResult.data;
  if (invite.account_created) {
    return { error: { message: 'This invite has already been used.' } };
  }

  const signUpResult = await supabase.auth.signUp({
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

  const { error: updateError } = await supabase
    .from(targetTable)
    .update(updatePayload)
    .eq('invite_token', token);

  if (updateError) {
    return { error: updateError };
  }

  const { error: roleError } = await supabase.from('user_roles').insert([
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
