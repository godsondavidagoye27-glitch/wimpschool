const deferredPromptKey = 'wimpschoolDeferredPrompt';
const SESSION_KEY = 'wimpschoolUser';
const SESSION_TIMEOUT_MINUTES = 30;

function setTextContentById(id, text) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

window.addEventListener('load', async () => {
  registerServiceWorker();
  listenInstallPrompt();
  // Rehydrate session from Supabase if available before enforcing role
  await rehydrateSessionFromSupabase();
  const allowed = await enforcePageRole();
  if (!allowed) {
    return;
  } 
  await loadPageData();
  await loadPageScripts();
  attachLogoutHandlers();
});

function hideProtectedContent() {
  if (document.body.dataset.requiredRole) {
    document.body.classList.add('hide-until-auth');
  }
}

function showProtectedContent() {
  document.body.classList.remove('hide-until-auth');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then(() => console.log('Service Worker registered.'))
      .catch(err => console.warn('SW registration failed:', err));
  }
}

function listenInstallPrompt() {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    window.wimpschoolInstallPrompt = event;
    const installNotice = document.createElement('div');
    installNotice.className = 'install-toast';
    installNotice.innerHTML = '<p>Add WimpSchool to your home screen for quick access.</p><button id="installPwa">Install</button>';
    document.body.appendChild(installNotice);
    document.getElementById('installPwa')?.addEventListener('click', async () => {
      installNotice.remove();
      const promptEvent = window.wimpschoolInstallPrompt;
      if (promptEvent) {
        promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        console.log('PWA install choice:', choice.outcome);
        window.wimpschoolInstallPrompt = null;
      }
    });
  });
}

function showMessage(message, type = 'info') {
  if (!message) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

window.showMessage = window.showMessage || showMessage;

async function rehydrateSessionFromSupabase() {
  try {
    const client = window.getSupabase ? window.getSupabase() : null;
    if (!client) return;

    const sessionInfo = await client.auth.getSession();
    const user = sessionInfo?.data?.session?.user;
    if (!user) return;

    const roleResult = await fetchUserRole(user.id);
    const role = roleResult.data?.role || user.user_metadata?.role || 'school_admin';

    saveSession({
      userId: user.id,
      email: user.email,
      role,
      schoolId: roleResult.data?.school_id || null,
      remember: true
    });
  } catch (err) {
    console.warn('rehydrateSessionFromSupabase error:', err);
  }
}

function getRoleRedirect(role) {
  switch (role) {
    case 'school_admin':
      return 'school-admin-dashboard.html';
    case 'teacher':
      return 'teacher-dashboard.html';
    case 'parent':
      return 'parent-portal.html';
    case 'super_admin':
      return 'super-admin-panel.html';
    default:
      return 'login.html';
  }
}

// Role detection must come from the server (Supabase) and not from client-side
// email heuristics. Use `fetchUserRole()` in `js/auth.js` to obtain the
// authoritative role and school membership for the logged-in user.

function saveSession(user) {
  const expiresAt = Date.now() + SESSION_TIMEOUT_MINUTES * 60 * 1000;
  const sessionObject = { ...user, expiresAt };

  if (user.remember) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionObject));
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionObject));
    localStorage.removeItem(SESSION_KEY);
  }
}

function loadSession() {
  const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw);
    if (!session.expiresAt || Date.now() > session.expiresAt) {
      clearSession();
      return null;
    }
    return session;
  } catch (error) {
    clearSession();
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

function redirectToDashboard(role) {
  const target = getRoleRedirect(role);
  window.location.href = target;
}

function attachLogoutHandlers() {
  document.querySelectorAll('[data-logout]').forEach(link => {
    link.addEventListener('click', async event => {
      event.preventDefault();
      await handleLogout();
    });
  });
}

async function handleLogout() {
  clearSession();
  const client = window.getSupabase ? window.getSupabase() : null;
  if (client) {
    await client.auth.signOut();
  }
  window.location.href = 'login.html';
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0
  }).format(Number(amount) || 0);
}

function formatPercent(value) {
  return `${Math.round(Number(value) || 0)}%`;
}

async function loadPageData() {
  const requiredRole = document.body.dataset.requiredRole;
  const pageType = document.body.dataset.page;
  if (!requiredRole) return;

  // Only run dashboard loading on actual dashboard pages, not on all pages with that role
  if (requiredRole === 'school_admin' && !pageType) {
    await loadSchoolAdminDashboard();
  } else if (requiredRole === 'teacher' && !pageType) {
    await loadTeacherDashboard();
  } else if (requiredRole === 'parent' && pageType === 'parent-portal') {
    await loadParentPortal();
  }
}

async function loadPageScripts() {
  const pageType = document.body.dataset.page;
  switch (pageType) {
    case 'student-management':
      return attachStudentManagementHandlers();
    case 'teacher-management':
      return attachTeacherManagementHandlers();
    case 'announcements':
      return attachAnnouncementHandlers();
    case 'results':
      return attachResultsHandlers();
    case 'fee-management':
      return loadFeeManagementPage();
    case 'attendance':
      return loadAttendancePage();
    case 'parent-portal':
      return attachParentPortalHandlers();
    default:
      return;
  }
}

async function loadSchoolAdminDashboard() {
  const session = loadSession();
  const schoolId = session?.schoolId;
  if (!schoolId) return;

  const client = window.getSupabase ? window.getSupabase() : null;
  if (!client) return;

  const [studentsResult, teachersResult, paymentsResult, announcementsResult] = await Promise.all([
    client.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    client.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    client.from('payments').select('amount, status').eq('school_id', schoolId),
    client.from('announcements').select('title, body, created_at').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(3)
  ]);

  const totalStudents = studentsResult.count || 0;
  const totalTeachers = teachersResult.count || 0;
  const payments = paymentsResult.data || [];
  const feesCollected = payments.filter(p => p.status === 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const outstandingFees = payments.filter(p => p.status !== 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0);

  setTextContentById('totalStudents', totalStudents);
  setTextContentById('totalTeachers', totalTeachers);
  setTextContentById('feesCollected', formatCurrency(feesCollected));
  setTextContentById('outstandingFees', formatCurrency(outstandingFees));

  const announcementsContainer = document.getElementById('parentNotices');
  if (announcementsContainer && announcementsResult.data) {
    announcementsContainer.innerHTML = announcementsResult.data.length
      ? announcementsResult.data.map(item => `<article class="notice-card"><h3>${item.title}</h3><p>${item.body}</p></article>`).join('')
      : '<article class="notice-card"><h3>No announcements yet</h3><p>There are no recent school updates.</p></article>';
  }
}

async function loadTeacherDashboard() {
  const session = loadSession();
  if (!session) return;

  const client = window.getSupabase ? window.getSupabase() : null;
  if (!client) return;

  const { userId, schoolId } = session;
  const [teacherResult, resultsResult, attendanceResult] = await Promise.all([
    client.from('teachers').select('id, name, subjects, classes').eq('user_id', userId).single(),
    client.from('results').select('id').eq('school_id', schoolId).eq('submitted', false),
    client.from('attendance').select('class, status').eq('school_id', schoolId).eq('teacher_id', userId)
  ]);

  const classCount = Array.isArray(teacherResult.data?.classes) ? teacherResult.data.classes.length : (teacherResult.data?.classes ? 1 : 0);
  const pendingReports = resultsResult.data?.length || 0;
  const attendance = attendanceResult.data || [];
  const presentCount = attendance.filter(item => item.status === 'present').length;
  const attendancePercent = attendance.length ? (presentCount / attendance.length) * 100 : 0;

  setTextContentById('assignedClassesCount', classCount);
  setTextContentById('pendingReportsCount', pendingReports);
  setTextContentById('unreadMessagesCount', '5 unread');
  setTextContentById('todayAttendancePercent', formatPercent(attendancePercent));

  const attendanceList = document.getElementById('attendanceList');
  if (attendanceList) {
    if (!attendance.length) {
      attendanceList.innerHTML = '<li>No attendance records available for today.</li>';
    } else {
      attendanceList.innerHTML = attendance.slice(0, 5).map(item => `<li>${item.class}: ${item.status}</li>`).join('');
    }
  }
}

async function loadParentPortal() {
  const session = loadSession();
  if (!session) return;

  const client = window.getSupabase ? window.getSupabase() : null;
  if (!client) return;

  const { userId, schoolId } = session;
  const { data: parentData } = await client.from('parents').select('id, name, student_id, phone').eq('user_id', userId).single();
  const studentId = session.studentId || parentData?.student_id;

  const paymentsQuery = client.from('payments').select('amount, status').limit(20);
  if (parentData?.id && studentId) {
    paymentsQuery.or(`parent_id.eq.${parentData.id},student_id.eq.${studentId}`);
  } else if (parentData?.id) {
    paymentsQuery.eq('parent_id', parentData.id);
  } else if (studentId) {
    paymentsQuery.eq('student_id', studentId);
  } else {
    paymentsQuery.eq('school_id', schoolId);
  }

  const attendancePromise = studentId
    ? client.from('attendance').select('status').eq('student_id', studentId)
    : Promise.resolve({ data: [] });

  const [studentResult, paymentsResult, attendanceResult, announcementsResult] = await Promise.all([
    client.from('students').select('id, name, student_code, class_name').eq('id', studentId).single(),
    paymentsQuery,
    attendancePromise,
    client.from('announcements').select('title, body, created_at').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(3)
  ]);

  const student = studentResult.data;
  const payments = (paymentsResult.data || []).filter(Boolean);
  const outstanding = payments.filter(item => item.status !== 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const presentCount = (attendanceResult.data || []).filter(item => item.status === 'present').length;
  const attendancePercent = attendanceResult.data?.length ? (presentCount / attendanceResult.data.length) * 100 : 0;

  setTextContentById('childName', student?.name || parentData?.name || 'Not available');
  setTextContentById('studentId', student?.student_code || student?.id || 'N/A');
  setTextContentById('balanceAmount', formatCurrency(outstanding));
  setTextContentById('paymentBalance', formatCurrency(outstanding));
  setTextContentById('attendancePercent', formatPercent(attendancePercent));

  const noticesContainer = document.getElementById('parentNotices');
  if (noticesContainer) {
    const items = announcementsResult.data || [];
    noticesContainer.innerHTML = items.length
      ? items.map(item => `<article class="notice-card"><h3>${item.title}</h3><p>${item.body}</p></article>`).join('')
      : '<article class="notice-card"><h3>No announcements available</h3><p>Check back later for school news.</p></article>';
  }

  const payButton = document.getElementById('payButton');
  if (payButton) {
    payButton.dataset.studentId = student?.id || '';
    payButton.dataset.parentId = parentData?.id || '';
    payButton.dataset.schoolId = schoolId || '';
  }
}

async function loadAttendancePage() {
  const session = loadSession();
  if (!session) return;
  const client = window.getSupabase ? window.getSupabase() : null;
  if (!client) return;
  const { userId, schoolId } = session;
  const attendanceList = document.getElementById('attendanceDetailsList');

  const [attendanceResult, teacherResult] = await Promise.all([
    client.from('attendance').select('class, status').eq('school_id', schoolId).eq('teacher_id', userId).limit(10),
    client.from('teachers').select('name').eq('user_id', userId).single()
  ]);

  if (attendanceList) {
    const records = attendanceResult.data || [];
    if (!records.length) {
      attendanceList.innerHTML = '<li>No attendance records found for your classes.</li>';
    } else {
      attendanceList.innerHTML = records.map(item => `<li>${item.class}: ${item.status}</li>`).join('');
    }
  }

  const attendanceActionTextEl = document.getElementById('attendanceActionText');
  if (attendanceActionTextEl) {
    attendanceActionTextEl.textContent = teacherResult.data?.name
      ? `Welcome ${teacherResult.data.name}, choose a class to take attendance.`
      : 'Select a class and record attendance for today.';
  }
}

async function attachStudentManagementHandlers() {
  const form = document.getElementById('studentForm');
  const downloadButton = document.getElementById('downloadTemplateBtn');
  const bulkUploadInput = document.getElementById('bulkUploadInput');

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const session = loadSession();
    if (!session?.schoolId) {
      return showMessage('Unable to determine school. Please log in again.');
    }

    const payload = {
      name: document.getElementById('studentName')?.value.trim(),
      className: document.getElementById('studentClass')?.value.trim(),
      parentEmail: document.getElementById('studentParentEmail')?.value.trim(),
      parentName: document.getElementById('studentParentName')?.value.trim(),
      parentPhone: document.getElementById('studentParentPhone')?.value.trim(),
      schoolId: session.schoolId
    };

    const status = document.getElementById('studentCreateStatus');
    status.textContent = 'Creating student...';
    const { data, error } = await createStudentWithParentInvite(payload);
    if (error) {
      status.textContent = error.message || 'Unable to create student.';
      return;
    }

    status.textContent = `Student created: ${data.student.name} (${data.student.student_code})`;
    if (data.inviteToken) {
      status.textContent += ` - Parent invite token: ${data.inviteToken}`;
    }
  });

  downloadButton?.addEventListener('click', event => {
    event.preventDefault();
    downloadStudentTemplate();
  });

  bulkUploadInput?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    const session = loadSession();
    if (!file || !session?.schoolId) return;
    const status = document.getElementById('bulkUploadStatus');
    status.textContent = 'Importing student data...';
    const { data, error } = await bulkImportStudents(file, session.schoolId);
    if (error) {
      status.textContent = error.message || 'Bulk import failed.';
      return;
    }
    status.textContent = `Imported ${data?.length || 0} students successfully.`;
  });
}

async function attachTeacherManagementHandlers() {
  const form = document.getElementById('teacherForm');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const session = loadSession();
    if (!session?.schoolId) {
      return showMessage('Unable to determine school. Please log in again.');
    }

    const payload = {
      name: document.getElementById('teacherName')?.value.trim(),
      email: document.getElementById('teacherEmail')?.value.trim(),
      subjects: document.getElementById('teacherSubjects')?.value.trim(),
      classes: document.getElementById('teacherClasses')?.value.trim(),
      schoolId: session.schoolId
    };

    const status = document.getElementById('teacherCreateStatus');
    status.textContent = 'Sending teacher invite...';
    const { data, error, token } = await inviteTeacher(payload);
    if (error) {
      status.textContent = error.message || 'Unable to send invite.';
      return;
    }
    status.textContent = `Teacher invited: ${payload.email}. Invite token: ${token}`;
  });
}

async function attachAnnouncementHandlers() {
  const form = document.getElementById('announcementForm');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const session = loadSession();
    if (!session?.schoolId) {
      return showMessage('Unable to determine school. Please log in again.');
    }

    const payload = {
      title: document.getElementById('announcementTitle')?.value.trim(),
      body: document.getElementById('announcementBody')?.value.trim(),
      targetClass: document.getElementById('announcementTarget')?.value.trim(),
      schoolId: session.schoolId
    };

    const status = document.getElementById('announcementStatus');
    status.textContent = 'Publishing announcement...';
    const { data, error } = await createAnnouncement(payload);
    if (error) {
      status.textContent = error.message || 'Unable to publish announcement.';
      return;
    }

    status.textContent = `Announcement published: ${data.title}`;
    const feed = document.getElementById('announcementFeed');
    if (feed) {
      feed.innerHTML = `<article class="notice-card"><h3>${data.title}</h3><p>${data.body}</p></article>${feed.innerHTML}`;
    }
  });
}

async function attachResultsHandlers() {
  const form = document.getElementById('resultsForm');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const session = loadSession();
    if (!session?.schoolId) {
      return showMessage('Unable to determine school. Please log in again.');
    }

    const payload = {
      studentId: document.getElementById('resultStudentId')?.value.trim(),
      subject: document.getElementById('resultSubject')?.value.trim(),
      score: Number(document.getElementById('resultScore')?.value),
      term: document.getElementById('resultTerm')?.value.trim(),
      teacherId: session.userId,
      schoolId: session.schoolId
    };

    const status = document.getElementById('resultsStatus');
    status.textContent = 'Saving result...';
    const { data, error } = await submitResult(payload);
    if (error) {
      status.textContent = error.message || 'Unable to save result.';
      return;
    }
    status.textContent = `Result saved for student ${payload.studentId} (${payload.subject}).`;
  });
}

async function loadFeeManagementPage() {
  const session = loadSession();
  const feeHistory = document.getElementById('feeHistory');
  if (!session?.schoolId || !feeHistory) return;

  const client = window.getSupabase ? window.getSupabase() : null;
  if (!client) return;

  const { data, error } = await client.from('payments').select('student_id, amount, status, method, tx_ref').eq('school_id', session.schoolId).order('created_at', { ascending: false }).limit(20);
  if (error) {
    feeHistory.textContent = 'Unable to load payment history.';
    return;
  }

  if (!data?.length) {
    feeHistory.textContent = 'No payments have been recorded yet.';
    return;
  }

  feeHistory.innerHTML = `<ul>${data.map(item => `<li>${item.student_id || 'Unknown student'} — ${formatCurrency(item.amount)} — ${item.status} (${item.method || 'online'})</li>`).join('')}</ul>`;
}

async function attachParentPortalHandlers() {
  const payButton = document.getElementById('payButton');
  if (!payButton) return;

  payButton.addEventListener('click', () => {
    const status = document.getElementById('paymentStatus');
    if (status) {
      status.textContent = 'Opening payment checkout...';
    }
  });
}

async function loginUser(email, password, remember) {
  const { data, error } = await signIn(email, password);
  if (error) {
    return showMessage(error.message || 'Login failed.');
  }

  saveSession({
    userId: data.user.id,
    email,
    role: data.role,
    schoolId: data.schoolId,
    remember
  });

  redirectToDashboard(data.role);
}

async function registerSchool(payload) {
  const submitBtn = document.querySelector('#registerForm button[type="submit"]');
  if (submitBtn) {
    submitBtn.textContent = 'Creating account...';
    submitBtn.disabled = true;
  }

  try {
    const result = await signUpSchoolAdmin(payload);
    if (result.error) {
      showMessage(result.error.message || 'Registration failed. Please try again.', 'error');
      return;
    }

    showMessage('School registered! Check your email to verify.', 'success');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1500);
  } catch (err) {
    console.error('registerSchool error:', err);
    showMessage('An unexpected error occurred. Check the browser console for details.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.textContent = 'Create school account';
      submitBtn.disabled = false;
    }
  }
}

async function verifySuperAdminSecret(secret) {
  if (!secret) {
    return { error: { message: 'Super admin secret key is required.' } };
  }

  const client = window.getSupabase ? window.getSupabase() : null;
  if (!client) {
    return { error: { message: 'Supabase client not initialized.' } };
  }

  const response = await client.functions.invoke('super-admin-login', {
    body: JSON.stringify({ secret }),
    headers: { 'Content-Type': 'application/json' }
  });

  if (response.error) {
    return { error: response.error };
  }

  return { data: response.data };
}

async function superAdminLogin(email, password, secret) {
  const verifyResult = await verifySuperAdminSecret(secret);
  if (verifyResult.error) {
    return showMessage(verifyResult.error.message || 'Invalid super admin secret key.', 'error');
  }

  const { data, error } = await signIn(email, password);
  if (error) {
    return showMessage(error.message || 'Login failed.', 'error');
  }

  if (data.role !== 'super_admin') {
    return showMessage('This account does not have super admin access.', 'error');
  }

  saveSession({
    userId: data.user.id,
    email,
    role: data.role,
    schoolId: data.schoolId,
    remember: true
  });

  window.location.href = 'super-admin-panel.html';
}

async function requestPasswordReset(email) {
  const status = document.getElementById('forgotStatus');
  if (status) {
    status.textContent = 'Sending password reset link...';
  }

  const { error } = await sendPasswordReset(email);
  if (error) {
    if (status) {
      status.textContent = error.message || 'Unable to send reset email.';
    }
    return showMessage(error.message || 'Unable to send reset email.', 'error');
  }

  if (status) {
    status.textContent = 'If this email is registered, a password reset link will be sent.';
  }
  showMessage('If this email is registered, a password reset link will be sent.', 'success');
}

async function enforcePageRole() {
  const requiredRole = document.body.dataset.requiredRole;
  if (!requiredRole) {
    showProtectedContent();
    return true;
  }

  hideProtectedContent();

  const client = window.getSupabase ? window.getSupabase() : null;
  if (!client) {
    // If Supabase client isn't available, try to recover from local session
    const fallback = loadSession();
    if (fallback) {
      showProtectedContent();
      return true;
    }
    window.location.href = 'login.html';
    return false;
  }

  const sessionInfo = await client.auth.getSession();
  if (!sessionInfo?.data?.session?.user) {
    // Supabase client has no session stored (possible multiple client instances or race).
    // Fall back to our stored session if present to avoid redirect loops.
    const fallback = loadSession();
    if (fallback) {
      showProtectedContent();
      return true;
    }
    window.location.href = 'login.html';
    return false;
  }

  const userId = sessionInfo.data.session.user.id;
  const roleResult = await fetchUserRole(userId);
  if (roleResult.error || !roleResult.data) {
    window.location.href = 'login.html';
    return false;
  }

  const currentRole = roleResult.data.role || sessionInfo.data.session.user.user_metadata?.role;
  if (currentRole !== requiredRole) {
    showMessage('Access denied. Please sign in with the correct account.', 'error');
    window.location.href = 'login.html';
    return false;
  }

  saveSession({
    userId,
    email: sessionInfo.data.session.user.email,
    role: currentRole,
    schoolId: roleResult.data.school_id,
    remember: true
  });

  showProtectedContent();
  return true;
}

if (document.getElementById('loginForm')) {
  document.getElementById('loginForm').addEventListener('submit', event => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const remember = document.getElementById('rememberMe').checked;

    if (!email || !password) {
      return showMessage('Please enter your email and password.');
    }

    loginUser(email, password, remember);
  });
}

if (document.getElementById('registerForm')) {
  document.getElementById('registerForm').addEventListener('submit', event => {
    event.preventDefault();
    const payload = {
      schoolName: document.getElementById('schoolName').value.trim(),
      schoolCode: document.getElementById('schoolCode').value.trim(),
      schoolAddress: document.getElementById('schoolAddress').value.trim(),
      schoolPhone: document.getElementById('schoolPhone').value.trim(),
      schoolEmail: document.getElementById('schoolEmail').value.trim(),
      adminName: document.getElementById('adminName').value.trim(),
      adminEmail: document.getElementById('adminEmail').value.trim(),
      adminPassword: document.getElementById('adminPassword').value,
      subscriptionPlan: document.getElementById('subscriptionPlan').value
    };

    registerSchool(payload);
  });
}

if (document.getElementById('superAdminForm')) {
  document.getElementById('superAdminForm').addEventListener('submit', event => {
    event.preventDefault();
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const secret = document.getElementById('adminSecret').value;

    if (!email || !password || !secret) {
      return showMessage('All fields are required.');
    }

    superAdminLogin(email, password, secret);
  });
}

if (document.getElementById('forgotForm')) {
  document.getElementById('forgotForm').addEventListener('submit', async event => {
    event.preventDefault();
    const email = document.getElementById('resetEmail').value.trim();
    if (!email) return showMessage('Enter your email address.');

    const submitButton = event.target.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Sending...';
    }

    await requestPasswordReset(email);

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Send reset link';
    }
  });
}
