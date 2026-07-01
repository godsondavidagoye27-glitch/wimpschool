function generateInviteToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function normalizeString(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').replace(/[^a-zA-Z0-9 ]/g, '');
}

function createStudentCode(name) {
  const parts = normalizeString(name).split(' ');
  const initials = (parts[0]?.[0] || 'S') + (parts[1]?.[0] || 'X');
  const suffix = Math.floor(100 + Math.random() * 899);
  return `${initials.toUpperCase()}-${suffix}`;
}

async function createStudent(payload) {
  const studentCode = createStudentCode(payload.name);
  const insertPayload = {
    name: normalizeString(payload.name),
    class_name: normalizeString(payload.className),
    parent_email: payload.parentEmail,
    student_code: studentCode,
    school_id: payload.schoolId
  };

  const { data, error } = await supabase.from('students').insert([insertPayload]).select().single();
  return { data, error };
}

async function createStudentWithParentInvite(payload) {
  const studentResult = await createStudent(payload);
  if (studentResult.error) {
    return { error: studentResult.error };
  }

  let inviteData = null;
  if (payload.parentEmail) {
    const inviteResult = await inviteParent({
      name: payload.parentName || `Parent of ${payload.name}`,
      email: payload.parentEmail,
      phone: payload.parentPhone || null,
      studentId: studentResult.data.id,
      schoolId: payload.schoolId
    });

    if (inviteResult.error) {
      return { error: inviteResult.error };
    }
    inviteData = inviteResult;
  }

  return {
    data: {
      student: studentResult.data,
      invite: inviteData?.data || null,
      inviteToken: inviteData?.token || null
    }
  };
}

async function bulkImportStudents(file, schoolId) {
  const rows = await parseCsvFile(file);
  if (!rows.length) {
    return { error: { message: 'No student rows found in the upload file.' } };
  }

  const records = rows
    .filter(row => row.name && row.class && row.parent_email)
    .map(row => ({
      name: normalizeString(row.name),
      class_name: normalizeString(row.class),
      parent_email: row.parent_email,
      student_code: createStudentCode(row.name),
      school_id: schoolId
    }));

  const { data, error } = await supabase.from('students').insert(records).select();
  return { data, error };
}

async function bulkImportResults(file, schoolId, teacherId) {
  const rows = await parseCsvFile(file);
  if (!rows.length) {
    return { error: { message: 'No result rows found in the upload file.' } };
  }

  const filteredRows = rows
    .filter(row => row.student_code && row.subject && row.score !== undefined && row.term)
    .map(row => ({
      student_code: normalizeString(row.student_code),
      subject: normalizeString(row.subject),
      score: Number(row.score),
      term: normalizeString(row.term)
    }));

  if (!filteredRows.length) {
    return { error: { message: 'Upload file must include student_code, subject, score, and term for each row.' } };
  }

  const studentCodes = [...new Set(filteredRows.map(row => row.student_code))];
  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('id, student_code')
    .in('student_code', studentCodes)
    .eq('school_id', schoolId);

  if (studentsError) {
    return { error: studentsError };
  }

  const studentMap = new Map((students || []).map(student => [normalizeString(student.student_code), student.id]));
  const records = filteredRows
    .map(row => {
      const studentId = studentMap.get(row.student_code);
      if (!studentId) return null;
      return {
        student_id: studentId,
        teacher_id: teacherId,
        school_id: schoolId,
        subject: row.subject,
        score: row.score,
        term: row.term,
        submitted: true,
        submitted_at: new Date().toISOString()
      };
    })
    .filter(Boolean);

  if (!records.length) {
    return { error: { message: 'No matching students were found for the uploaded student codes.' } };
  }

  const { data, error } = await supabase.from('results').insert(records).select();
  return { data, error };
}

async function inviteTeacher(payload) {
  const inviteToken = generateInviteToken();
  const { data, error } = await supabase.from('teachers').insert([
    {
      name: normalizeString(payload.name),
      email: payload.email,
      subjects: payload.subjects,
      classes: payload.classes,
      invite_token: inviteToken,
      account_created: false,
      school_id: payload.schoolId
    }
  ]).select().single();

  if (error) {
    return { error };
  }

  await sendSchoolNotification({
    schoolId: payload.schoolId,
    type: 'invite',
    message: `Teacher invite sent to ${payload.email}`
  });

  return { data, token: inviteToken };
}

async function inviteParent(payload) {
  const inviteToken = generateInviteToken();
  const { data, error } = await supabase.from('parents').insert([
    {
      name: normalizeString(payload.name),
      email: payload.email,
      phone: payload.phone,
      student_id: payload.studentId,
      invite_token: inviteToken,
      account_created: false,
      school_id: payload.schoolId
    }
  ]).select().single();

  if (error) {
    return { error };
  }

  await sendSchoolNotification({
    schoolId: payload.schoolId,
    type: 'invite',
    message: `Parent invite sent to ${payload.email}`
  });

  return { data, token: inviteToken };
}

async function recordAttendance(payload) {
  const { data, error } = await supabase.from('attendance').insert([
    {
      student_id: payload.studentId,
      teacher_id: payload.teacherId,
      school_id: payload.schoolId,
      class: payload.className,
      status: payload.status,
      recorded_at: new Date().toISOString()
    }
  ]).select().single();

  return { data, error };
}

async function submitResult(payload) {
  const { data, error } = await supabase.from('results').insert([
    {
      student_id: payload.studentId,
      teacher_id: payload.teacherId,
      school_id: payload.schoolId,
      subject: payload.subject,
      score: payload.score,
      term: payload.term,
      submitted: true,
      submitted_at: new Date().toISOString()
    }
  ]).select().single();

  return { data, error };
}

async function createAnnouncement(payload) {
  const { data, error } = await supabase.from('announcements').insert([
    {
      school_id: payload.schoolId,
      title: normalizeString(payload.title),
      body: payload.body,
      target_class: payload.targetClass || 'all',
      created_at: new Date().toISOString()
    }
  ]).select().single();

  return { data, error };
}

async function recordPayment(payload) {
  const { data, error } = await supabase.from('payments').insert([
    {
      student_id: payload.studentId,
      parent_id: payload.parentId,
      school_id: payload.schoolId,
      amount: payload.amount,
      status: payload.status,
      method: payload.method,
      tx_ref: payload.txRef,
      processed_at: new Date().toISOString()
    }
  ]).select().single();

  if (!error && data) {
    await sendSchoolNotification({
      schoolId: payload.schoolId,
      type: payload.status === 'paid' ? 'payment' : 'payment_pending',
      message: payload.status === 'paid'
        ? `Payment received for ₦${Number(payload.amount || 0)}`
        : `Payment reminder created for ₦${Number(payload.amount || 0)}`
    });
  }

  return { data, error };
}

async function reconcilePayment(txRef, status) {
  const { data, error } = await supabase.from('payments').update({ status, processed_at: new Date().toISOString() }).eq('tx_ref', txRef).select().single();
  return { data, error };
}

async function sendSchoolNotification(payload) {
  try {
    if (supabase?.functions?.invoke) {
      const response = await supabase.functions.invoke('notifications', {
        body: JSON.stringify({
          ...payload,
          created_at: new Date().toISOString()
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.error) {
        return { data: response.data, error: null };
      }
    }
  } catch (err) {
    console.warn('Notification function call failed:', err);
  }

  const { data, error } = await supabase.from('notifications').insert([
    {
      user_id: payload.userId || null,
      school_id: payload.schoolId,
      type: payload.type || 'info',
      message: payload.message,
      read: false,
      created_at: new Date().toISOString()
    }
  ]).select().single();

  return { data, error };
}

async function getSchoolNotifications(schoolId, limit = 6) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, message, type, created_at, read')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return { data, error };
}

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      const rows = String(text).split(/\r?\n/).filter(Boolean);
      const headings = rows[0]?.split(',').map(h => h.trim().toLowerCase());
      const data = rows.slice(1).map(line => {
        const values = line.split(',').map(value => value.trim());
        return headings.reduce((obj, key, index) => {
          obj[key] = values[index] || '';
          return obj;
        }, {});
      });
      resolve(data);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function downloadStudentTemplate() {
  const headers = ['name,class,parent_email'];
  const blob = new Blob([headers.join(',') + '\n'], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'student-import-template.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}
