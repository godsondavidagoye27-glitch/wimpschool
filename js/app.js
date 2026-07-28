const deferredPromptKey = 'wimpschoolDeferredPrompt';
const SESSION_KEY = 'wimpschoolUser';
const SESSION_TIMEOUT_MINUTES = 30;

function setTextContentById(id, text) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

function applySchoolBrandingPreview({ schoolName, primaryColor, schoolLogoUrl }) {
  const displayName = schoolName || 'WimpSchool';
  const fallbackLogo = schoolLogoUrl || 'favicon.svg';

  document.title = `${displayName} | WimpSchool`;

  document.querySelectorAll('.brand').forEach(brandEl => {
    brandEl.innerHTML = `
      <span class="brand-shell">
        <img class="brand-logo" src="${fallbackLogo}" alt="school logo" />
        <span class="brand-text">${displayName}</span>
      </span>
    `;
  });

  if (primaryColor) {
    document.documentElement.style.setProperty('--accent', primaryColor);
  }

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta && primaryColor) {
    themeMeta.setAttribute('content', primaryColor);
  }
}

async function applySavedSchoolBranding() {
  const session = loadSession();
  const client = window.getSupabase ? window.getSupabase() : null;
  if (!session?.schoolId || !client) return;

  const { data, error } = await client
    .from('schools')
    .select('name, logo_url, primary_color')
    .eq('id', session.schoolId)
    .single();

  if (!error && data) {
    applySchoolBrandingPreview({
      schoolName: data.name,
      primaryColor: data.primary_color,
      schoolLogoUrl: data.logo_url
    });
  }
}

window.addEventListener('load', async () => {
  registerServiceWorker();
  listenInstallPrompt();
  // Rehydrate session from Supabase if available before enforcing role
  await rehydrateSessionFromSupabase();
  await applySavedSchoolBranding();
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

function showSupportBanner(message, type = 'error') {
  if (!message) return;

  const existingBanner = document.getElementById('wimpschool-support-banner');
  if (existingBanner) {
    existingBanner.remove();
  }

  const banner = document.createElement('div');
  banner.id = 'wimpschool-support-banner';
  banner.className = `support-banner support-banner-${type}`;
  banner.innerHTML = `
    <div class="support-banner__content">
      <strong>Need help?</strong>
      <span>${message}</span>
    </div>
    <div class="support-banner__actions">
      <a href="support.html" class="support-banner__link">Contact support</a>
      <button type="button" class="support-banner__close" aria-label="Dismiss support banner">×</button>
    </div>
  `;

  document.body.prepend(banner);
  banner.querySelector('.support-banner__close')?.addEventListener('click', () => banner.remove());
}

window.showMessage = window.showMessage || showMessage;
window.showSupportBanner = window.showSupportBanner || showSupportBanner;

async function rehydrateSessionFromSupabase() {
  try {
    const client = window.getSupabase ? window.getSupabase() : null;
    if (!client) return;

    const sessionInfo = await client.auth.getSession();
    const user = sessionInfo?.data?.session?.user;
    if (!user) return;

    const roleResult = await fetchUserRole(user.id);
    if (roleResult.error || !roleResult.data) return;

    const role = roleResult.data.role || user.user_metadata?.role || 'school_admin';

    saveSession({
      userId: user.id,
      email: user.email,
      role,
      schoolId: roleResult.data.school_id || null,
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

function ensureRoleAccess(requiredRole, sessionRole) {
  if (!requiredRole) return true;
  if (!sessionRole) return false;
  return sessionRole === requiredRole || sessionRole === 'super_admin';
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
      // student-management.html has its own inline script that already wires up
      // the create form, template download, bulk upload, and the live student
      // list. Also calling attachStudentManagementHandlers() here used to attach
      // a second set of listeners to the same form, so every submit created the
      // student twice (and every bulk upload imported the file twice).
      return;
    case 'teacher-management':
      return attachTeacherManagementHandlers();
    case 'announcements':
      // announcements.html's inline script already handles the post form and
      // the live feed. attachAnnouncementHandlers() attached a duplicate submit
      // listener here, so every announcement was posted twice.
      return;
    case 'results':
      return attachResultsHandlers();
    case 'fee-management':
      return loadFeeManagementPage();
    case 'attendance':
      // attendance.html's inline script builds the actual class/student marking
      // UI. loadAttendancePage() only wrote plain welcome text into the same
      // container, and the two handlers raced on window 'load', sometimes
      // wiping out the marking form after it had already rendered.
      return;
    case 'parent-portal':
      return attachParentPortalHandlers();
    case 'admin-settings':
      return attachAdminSettingsHandlers();
    default:
      return;
  }
}

function parseFeeMapping(rawValue) {
  if (!rawValue) return {};
  if (typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    return rawValue;
  }

  try {
    const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    return {};
  }
}

function formatFeeBreakdown(feeMap) {
  const entries = Object.entries(feeMap || {}).filter(([, value]) => Number(value) > 0);
  if (!entries.length) {
    return '<p>No class fees configured yet.</p>';
  }

  return `<ul>${entries.map(([className, amount]) => `<li><strong>${className}</strong>: ${formatCurrency(Number(amount || 0))}</li>`).join('')}</ul>`;
}

async function loadSchoolAdminDashboard() {
  const session = loadSession();
  const schoolId = session?.schoolId;
  if (!schoolId) return;

  const client = window.getSupabase ? window.getSupabase() : null;
  if (!client) return;

  const [schoolResult] = await Promise.all([
    client.from('schools').select('subscription_plan, pending_subscription_plan, subscription_change_effective_date, next_billing_date').eq('id', schoolId).single()
  ]);

  const schoolPlan = schoolResult?.data || null;
  const currentPlan = schoolPlan?.subscription_plan || 'Starter';
  const pendingPlan = schoolPlan?.pending_subscription_plan || null;
  const effectiveDate = schoolPlan?.next_billing_date ? new Date(schoolPlan.next_billing_date).toLocaleDateString() : (schoolPlan?.subscription_change_effective_date ? new Date(schoolPlan.subscription_change_effective_date).toLocaleDateString() : null);

  setTextContentById('currentPlan', currentPlan);
  setTextContentById('planUpgradeStatus', pendingPlan ? `Upgrade scheduled to ${pendingPlan} on ${effectiveDate || 'next billing date'}.` : 'No pending plan changes.');

  // Note: totalStudents, totalTeachers, and feesCollected ("Fees collected
  // today") are populated by dashboard.js's fetchStudentCount(),
  // fetchTeacherCount(), and fetchFeesCollectedToday(). This function used to
  // also write to those same elements with an all-time total for
  // "feesCollected" - which raced against, and didn't match, the "today"
  // label on that stat card.
  // #dashboardNotifications is populated by dashboard.js's
  // renderNotificationsWidget(), which reads the `notifications` table -
  // that's the panel's actual data source, so it isn't duplicated here.
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
  const { data: parentData } = await client.from('parents').select('id, name, student_id, phone').eq('user_id', userId).maybeSingle();
  const baseStudentId = session.studentId || parentData?.student_id;
  const { data: links } = await client.from('parent_student_links').select('student_id').eq('parent_id', parentData?.id);
  const linkedStudentIds = [...new Set([baseStudentId, ...(links || []).map(link => link.student_id)].filter(Boolean))];
  const studentId = linkedStudentIds[0] || baseStudentId || null;

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
    studentId ? client.from('students').select('id, name, student_code, class_name').eq('id', studentId).maybeSingle() : Promise.resolve({ data: null }),
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

  const childSelector = document.getElementById('childSelector');
  const feeBreakdownEl = document.getElementById('childFeeBreakdown');
  if (childSelector) {
    const { data: studentRows } = await client.from('students').select('id, name, class_name').in('id', linkedStudentIds);
    if (studentRows?.length) {
      childSelector.innerHTML = studentRows.map(studentRow => `<option value="${studentRow.id}" ${String(studentRow.id) === String(studentId) ? 'selected' : ''}>${studentRow.name} (${studentRow.class_name || 'Class'})</option>`).join('');
      childSelector.disabled = false;
    } else if (student) {
      childSelector.innerHTML = `<option value="${student.id}">${student.name} (${student.class_name || 'Class'})</option>`;
      childSelector.disabled = false;
    } else {
      childSelector.innerHTML = '<option value="">No child linked</option>';
      childSelector.disabled = true;
    }
  }

  if (feeBreakdownEl) {
    const { data: schoolData } = await client.from('schools').select('fee_structure, default_tuition').eq('id', schoolId).maybeSingle();
    const feeMap = parseFeeMapping(schoolData?.fee_structure || {});
    const feeAmount = Number(feeMap?.[student?.class_name] || schoolData?.default_tuition || 0);
    feeBreakdownEl.innerHTML = `<p><strong>${student?.name || 'Selected child'}</strong></p><p>${student?.class_name || 'Class'} fee: ${formatCurrency(feeAmount)}</p>`;
  }

  if (!window.wimpSchoolParentPortalChannel) {
    const realtimeChannel = client.channel(`parent-payments-${session.userId}`);
    realtimeChannel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'payments',
      filter: `school_id=eq.${schoolId}`
    }, async () => {
      if (document.visibilityState === 'hidden') return;
      await loadParentPortal();
    });
    realtimeChannel.subscribe();
    window.wimpSchoolParentPortalChannel = realtimeChannel;
  }

  if (window.wimpSchoolParentPortalRefreshTimer) {
    clearInterval(window.wimpSchoolParentPortalRefreshTimer);
  }
  window.wimpSchoolParentPortalRefreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    void loadParentPortal();
  }, 10000);
}

window.refreshParentPortalData = loadParentPortal;
window.addEventListener('beforeunload', () => {
  if (window.wimpSchoolParentPortalRefreshTimer) {
    clearInterval(window.wimpSchoolParentPortalRefreshTimer);
  }
  if (window.wimpSchoolParentPortalChannel) {
    window.getSupabase?.().removeChannel(window.wimpSchoolParentPortalChannel);
  }
});

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

async function loadTeacherList() {
  const teacherList = document.getElementById('teacherList');
  if (!teacherList) return;

  const session = loadSession();
  if (!session?.schoolId) {
    teacherList.innerHTML = '<p>Unable to load teachers. Please sign in again.</p>';
    return;
  }

  const client = window.getSupabase ? window.getSupabase() : null;
  if (!client) {
    teacherList.innerHTML = '<p>Unable to connect to the database.</p>';
    return;
  }

  const { data: teachers, error } = await client
    .from('teachers')
    .select('id, name, email, subjects, classes, account_created')
    .eq('school_id', session.schoolId)
    .order('created_at', { ascending: false });

  if (error || !teachers?.length) {
    teacherList.innerHTML = '<p>No teachers found. Create one above to get started.</p>';
    return;
  }

  teacherList.innerHTML = `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 2px solid #e63a2e;">
          <th style="text-align: left; padding: 8px;">Name</th>
          <th style="text-align: left; padding: 8px;">Email</th>
          <th style="text-align: left; padding: 8px;">Subjects</th>
          <th style="text-align: left; padding: 8px;">Classes</th>
          <th style="text-align: left; padding: 8px;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${teachers.map(teacher => `
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px;">${teacher.name}</td>
            <td style="padding: 8px; word-break: break-all;">${teacher.email}</td>
            <td style="padding: 8px;">${teacher.subjects || '—'}</td>
            <td style="padding: 8px;">${teacher.classes || '—'}</td>
            <td style="padding: 8px;">${teacher.account_created ? '✅ Active' : '⏳ Invited'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function attachTeacherManagementHandlers() {
  const form = document.getElementById('teacherForm');
  const status = document.getElementById('teacherCreateStatus');

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

    if (!payload.name || !payload.email) {
      if (status) {
        status.textContent = 'Please provide a name and email for the teacher.';
      }
      return;
    }

    if (status) {
      status.textContent = 'Sending teacher invite...';
    }

    const { data, error, token } = await inviteTeacher(payload);
    if (error) {
      if (status) {
        status.textContent = error.message || 'Unable to send invite.';
      }
      return;
    }

    if (status) {
      status.textContent = `Teacher invited: ${payload.email}. Invite token: ${token}`;
    }

    form?.reset();
    await loadTeacherList();
  });

  await loadTeacherList();
}

async function attachAdminSettingsHandlers() {
  const planForm = document.getElementById('planUpgradeForm');
  const currentPlanEl = document.getElementById('settingsCurrentPlan');
  const pendingPlanEl = document.getElementById('settingsPendingPlan');
  const effectiveDateEl = document.getElementById('settingsPlanEffectiveDate');
  const planStatusEl = document.getElementById('planUpgradeStatus');
  const profileForm = document.getElementById('profileSettingsForm');
  const feeForm = document.getElementById('feeSettingsForm');
  const profileStatusEl = document.getElementById('profileStatus');
  const feeStatusEl = document.getElementById('feeStatus');
  const brandingForm = document.getElementById('brandingForm');
  const brandingStatus = document.getElementById('brandingStatus');
  const notificationForm = document.getElementById('notificationSettingsForm');
  const notificationChannelEl = document.getElementById('notificationChannel');
  const notificationRecipientEl = document.getElementById('notificationRecipient');
  const notificationSubjectEl = document.getElementById('notificationSubject');
  const notificationMessageEl = document.getElementById('notificationMessage');
  const notificationStatus = document.getElementById('notificationStatus');
  const session = loadSession();
  const client = window.getSupabase ? window.getSupabase() : null;

  if (!session?.schoolId || !client) {
    if (planStatusEl) {
      planStatusEl.textContent = 'Unable to load settings. Please sign in again.';
    }
    return;
  }

  const profileNameEl = document.getElementById('settingsSchoolName');
  const profileCodeEl = document.getElementById('settingsSchoolCode');
  const profileAddressEl = document.getElementById('settingsSchoolAddress');
  const profileEmailEl = document.getElementById('settingsSchoolEmail');
  const profilePhoneEl = document.getElementById('settingsSchoolPhone');
  const profileLogoEl = document.getElementById('brandingLogoUrl');
  const profileColorEl = document.getElementById('brandingPrimaryColor');
  const feeTuitionEl = document.getElementById('settingsDefaultTuition');
  const feeMapEl = document.getElementById('settingsClassFeeMap');
  const feeScaleEl = document.getElementById('settingsGradingScale');

  const { data: school, error } = await client
    .from('schools')
    .select('subscription_plan, pending_subscription_plan, subscription_change_effective_date, next_billing_date, name, address, email, phone, logo_url, primary_color, default_tuition, fee_structure, grading_scale, school_code')
    .eq('id', session.schoolId)
    .single();

  if (!school || error) {
    if (planStatusEl) {
      planStatusEl.textContent = 'Unable to retrieve your school settings.';
    }
    return;
  }

  if (currentPlanEl) {
    currentPlanEl.textContent = school.subscription_plan || 'Starter';
  }
  if (pendingPlanEl) {
    pendingPlanEl.textContent = school.pending_subscription_plan || 'None';
  }
  if (effectiveDateEl) {
    effectiveDateEl.textContent = school.subscription_change_effective_date
      ? new Date(school.subscription_change_effective_date).toLocaleDateString()
      : 'N/A';
  }

  if (profileNameEl) {
    profileNameEl.value = school.name || '';
  }
  if (profileCodeEl) {
    profileCodeEl.value = school.school_code || '';
  }
  if (profileAddressEl) {
    profileAddressEl.value = school.address || '';
  }
  if (profileEmailEl) {
    profileEmailEl.value = school.email || '';
  }
  if (profilePhoneEl) {
    profilePhoneEl.value = school.phone || '';
  }
  if (profileLogoEl) {
    profileLogoEl.value = school.logo_url || '';
  }
  if (profileColorEl) {
    profileColorEl.value = school.primary_color || '#e63a2e';
  }
  if (feeTuitionEl) {
    feeTuitionEl.value = school.default_tuition || '';
  }
  if (feeMapEl) {
    feeMapEl.value = JSON.stringify(school.fee_structure || {}, null, 2);
  }
  if (feeScaleEl) {
    feeScaleEl.value = school.grading_scale || '';
  }

  applySchoolBrandingPreview({ schoolName: school.name, primaryColor: school.primary_color });

  planForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const selectedPlan = document.getElementById('upgradePlan')?.value;
    if (!selectedPlan) {
      if (planStatusEl) {
        planStatusEl.textContent = 'Please choose a plan to upgrade to.';
      }
      return;
    }

    const existingPlan = school.subscription_plan || 'Starter';
    if (selectedPlan === existingPlan) {
      if (planStatusEl) {
        planStatusEl.textContent = 'You are already on this plan.';
      }
      return;
    }

    const nextBillingDate = school.next_billing_date
      ? new Date(school.next_billing_date)
      : new Date();

    if (!school.next_billing_date) {
      nextBillingDate.setDate(nextBillingDate.getDate() + 30);
    }

    const { data: updated, error: updateError } = await client
      .from('schools')
      .update({
        pending_subscription_plan: selectedPlan,
        subscription_change_effective_date: nextBillingDate.toISOString()
      })
      .eq('id', session.schoolId)
      .select('subscription_plan, pending_subscription_plan, subscription_change_effective_date')
      .single();

    if (updateError || !updated) {
      if (planStatusEl) {
        planStatusEl.textContent = 'Unable to schedule the plan upgrade. Try again later.';
      }
      return;
    }

    if (currentPlanEl) {
      currentPlanEl.textContent = updated.subscription_plan || 'Starter';
    }
    if (pendingPlanEl) {
      pendingPlanEl.textContent = updated.pending_subscription_plan || 'None';
    }
    if (effectiveDateEl) {
      effectiveDateEl.textContent = new Date(updated.subscription_change_effective_date).toLocaleDateString();
    }
    if (planStatusEl) {
      planStatusEl.textContent = `Upgrade scheduled to ${selectedPlan} starting ${new Date(updated.subscription_change_effective_date).toLocaleDateString()}.`;
    }

    await sendSchoolNotification({
      schoolId: session.schoolId,
      type: 'plan_upgrade',
      message: `Plan upgrade to ${selectedPlan} has been scheduled.`
    });
  });

  profileForm?.addEventListener('submit', async event => {
    event.preventDefault();

    const name = profileNameEl?.value.trim();
    const address = profileAddressEl?.value.trim();
    const email = profileEmailEl?.value.trim();
    const phone = profilePhoneEl?.value.trim();

    if (!name) {
      if (profileStatusEl) {
        profileStatusEl.textContent = 'School name is required.';
      }
      return;
    }

    if (profileStatusEl) {
      profileStatusEl.textContent = 'Saving profile settings...';
    }

    const { data: updatedProfile, error: profileError } = await client
      .from('schools')
      .update({
        name,
        address: address || null,
        email: email || null,
        phone: phone || null
      })
      .eq('id', session.schoolId)
      .select('name, address, email, phone')
      .single();

    if (profileError || !updatedProfile) {
      if (profileStatusEl) {
        profileStatusEl.textContent = 'Unable to save profile settings. Try again later.';
      }
      return;
    }

    if (profileStatusEl) {
      profileStatusEl.textContent = 'Profile settings saved successfully.';
    }
  });

  feeForm?.addEventListener('submit', async event => {
    event.preventDefault();

    const defaultTuition = Number(feeTuitionEl?.value || 0);
    const feeMapping = parseFeeMapping(feeMapEl?.value);
    const gradingScale = feeScaleEl?.value || null;

    if (feeStatusEl) {
      feeStatusEl.textContent = 'Saving fee settings...';
    }

    const payload = {
      default_tuition: Number.isFinite(defaultTuition) && defaultTuition > 0 ? defaultTuition : null,
      fee_structure: feeMapping,
      grading_scale: gradingScale || null
    };

    const { data: updatedFee, error: feeError } = await client
      .from('schools')
      .update(payload)
      .eq('id', session.schoolId)
      .select('default_tuition, grading_scale')
      .single();

    if (feeError || !updatedFee) {
      if (feeStatusEl) {
        feeStatusEl.textContent = 'Unable to save fee settings. Try again later.';
      }
      return;
    }

    if (feeStatusEl) {
      feeStatusEl.textContent = 'Fee settings saved successfully.';
    }
  });

  brandingForm?.addEventListener('submit', async event => {
    event.preventDefault();

    const logoUrl = profileLogoEl?.value.trim();
    const primaryColor = profileColorEl?.value;

    if (brandingStatus) {
      brandingStatus.textContent = 'Saving branding settings...';
    }

    const { data: updatedBranding, error: brandingError } = await client
      .from('schools')
      .update({
        logo_url: logoUrl || null,
        primary_color: primaryColor || '#e63a2e'
      })
      .eq('id', session.schoolId)
      .select('logo_url, primary_color')
      .single();

    if (brandingError || !updatedBranding) {
      if (brandingStatus) {
        brandingStatus.textContent = 'Unable to save branding settings. Try again later.';
      }
      return;
    }

    applySchoolBrandingPreview({ schoolName: school.name, primaryColor: updatedBranding.primary_color });
    if (brandingStatus) {
      brandingStatus.textContent = 'Branding settings saved successfully.';
    }
  });

  notificationForm?.addEventListener('submit', async event => {
    event.preventDefault();

    const channel = notificationChannelEl?.value;
    const recipient = notificationRecipientEl?.value.trim();
    const subject = notificationSubjectEl?.value.trim();
    const message = notificationMessageEl?.value.trim();

    if (!channel || !recipient || !message) {
      if (notificationStatus) {
        notificationStatus.textContent = 'Please choose a channel, provide a recipient, and enter a message.';
      }
      return;
    }

    if (notificationStatus) {
      notificationStatus.textContent = 'Sending notification...';
    }

    const result = await sendSchoolNotification({
      schoolId: session.schoolId,
      type: 'test_alert',
      message,
      channel,
      recipient,
      subject: subject || `${channel.toUpperCase()} test notification`,
      from: school.email || null
    });

    if (result.error) {
      if (notificationStatus) {
        notificationStatus.textContent = result.error.message || 'Unable to send notification.';
      }
      return;
    }

    if (notificationStatus) {
      notificationStatus.textContent = `Notification sent via ${channel}.`;
    }
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
  const bulkUploadInput = document.getElementById('bulkResultUploadInput');
  const resultStatus = document.getElementById('resultsStatus');
  const bulkStatus = document.getElementById('bulkResultStatus');

  const session = loadSession();
  if (!session?.schoolId || !session?.userId) {
    if (resultStatus) {
      resultStatus.textContent = 'Unable to determine school or user. Please log in again.';
    }
    return;
  }

  const client = window.getSupabase ? window.getSupabase() : null;
  if (!client) {
    if (resultStatus) {
      resultStatus.textContent = 'Unable to connect to database.';
    }
    return;
  }

  form?.addEventListener('submit', async event => {
    event.preventDefault();

    const studentCode = document.getElementById('resultStudentId')?.value.trim();
    const subject = document.getElementById('resultSubject')?.value.trim();
    const score = Number(document.getElementById('resultScore')?.value);
    const term = document.getElementById('resultTerm')?.value.trim();

    if (!studentCode || !subject || !term || Number.isNaN(score)) {
      if (resultStatus) {
        resultStatus.textContent = 'Please fill in all fields correctly.';
      }
      return;
    }

    if (resultStatus) {
      resultStatus.textContent = 'Finding student...';
    }

    const { data: student, error: studentError } = await client
      .from('students')
      .select('id')
      .eq('school_id', session.schoolId)
      .eq('student_code', studentCode)
      .single();

    if (studentError || !student) {
      if (resultStatus) {
        resultStatus.textContent = `Student code ${studentCode} not found.`;
      }
      return;
    }

    const { data: teacher, error: teacherError } = await client
      .from('teachers')
      .select('id')
      .eq('school_id', session.schoolId)
      .eq('user_id', session.userId)
      .single();

    if (teacherError || !teacher) {
      if (resultStatus) {
        resultStatus.textContent = 'Teacher record not found.';
      }
      return;
    }

    if (resultStatus) {
      resultStatus.textContent = 'Saving result...';
    }

    const { data, error } = await submitResult({
      studentId: student.id,
      teacherId: teacher.id,
      schoolId: session.schoolId,
      subject,
      score,
      term
    });

    if (error) {
      if (resultStatus) {
        resultStatus.textContent = error.message || 'Unable to save result.';
      }
      return;
    }

    if (resultStatus) {
      resultStatus.textContent = `Result saved successfully for ${studentCode}.`;
    }
    form?.reset();
  });

  bulkUploadInput?.addEventListener('change', async event => {
    event.preventDefault();
    const file = event.target.files?.[0];
    if (!file) return;

    if (bulkStatus) {
      bulkStatus.textContent = 'Uploading results...';
    }

    const { data: teacher, error: teacherError } = await client
      .from('teachers')
      .select('id')
      .eq('school_id', session.schoolId)
      .eq('user_id', session.userId)
      .single();

    if (teacherError || !teacher) {
      if (bulkStatus) {
        bulkStatus.textContent = 'Teacher record not found.';
      }
      return;
    }

    const result = await bulkImportResults(file, session.schoolId, teacher.id);
    if (result.error) {
      if (bulkStatus) {
        bulkStatus.textContent = result.error.message || 'Bulk upload failed.';
      }
      return;
    }

    if (bulkStatus) {
      const count = Array.isArray(result.data) ? result.data.length : 0;
      bulkStatus.textContent = `Uploaded ${count} result${count === 1 ? '' : 's'} successfully.`;
    }
    bulkUploadInput.value = '';
  });
}

async function loadFeeManagementPage() {
  const session = loadSession();
  const feeHistory = document.getElementById('feeHistory');
  const classFeeForm = document.getElementById('classFeeForm');
  const classFeeConfigEl = document.getElementById('classFeeConfig');
  const classFeeStatusEl = document.getElementById('classFeeStatus');
  if (!session?.schoolId || !feeHistory) return;

  const client = window.getSupabase ? window.getSupabase() : null;
  if (!client) return;

  const { data: schoolData } = await client.from('schools').select('fee_structure, default_tuition').eq('id', session.schoolId).single();
  if (classFeeConfigEl) {
    classFeeConfigEl.value = JSON.stringify(schoolData?.fee_structure || {}, null, 2);
  }

  classFeeForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const mapping = parseFeeMapping(classFeeConfigEl?.value || '{}');
    if (classFeeStatusEl) {
      classFeeStatusEl.textContent = 'Saving class fees...';
    }

    const { error } = await client.from('schools').update({ fee_structure: mapping }).eq('id', session.schoolId);
    if (error) {
      if (classFeeStatusEl) {
        classFeeStatusEl.textContent = error.message || 'Unable to save class fees.';
      }
      return;
    }

    if (classFeeStatusEl) {
      classFeeStatusEl.textContent = 'Class fees saved successfully.';
    }
  });

  // Payment history for #feeHistory is rendered by fee-management.html's own
  // inline script (loadPaymentHistory), which also resolves student names.
  // This function used to fetch and overwrite the same element with a plainer
  // list, racing with the inline version and duplicating the query.
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

  const childSelector = document.getElementById('childSelector');
  if (childSelector) {
    childSelector.addEventListener('change', async () => {
      const session = loadSession();
      const client = window.getSupabase ? window.getSupabase() : null;
      if (!session || !client) return;

      const selectedStudentId = childSelector.value;
      const { data: student } = await client.from('students').select('id, name, class_name').eq('id', selectedStudentId).maybeSingle();
      const { data: schoolData } = await client.from('schools').select('fee_structure, default_tuition').eq('id', session.schoolId).maybeSingle();
      const feeMap = parseFeeMapping(schoolData?.fee_structure || {});
      const feeAmount = Number(feeMap?.[student?.class_name] || schoolData?.default_tuition || 0);
      const feeBreakdownEl = document.getElementById('childFeeBreakdown');
      if (feeBreakdownEl) {
        feeBreakdownEl.innerHTML = `<p><strong>${student?.name || 'Selected child'}</strong></p><p>${student?.class_name || 'Class'} fee: ${formatCurrency(feeAmount)}</p>`;
      }

      const balanceEl = document.getElementById('balanceAmount');
      const paymentBalanceEl = document.getElementById('paymentBalance');
      if (balanceEl) balanceEl.textContent = formatCurrency(feeAmount);
      if (paymentBalanceEl) paymentBalanceEl.textContent = formatCurrency(feeAmount);
      payButton.dataset.studentId = student?.id || '';
    });
  }
}

async function loginUser(email, password, remember, expectedRole) {
  const { data, error } = await signIn(email, password);
  if (error) {
    return showMessage(error.message || 'Login failed.', 'error');
  }

  if (expectedRole && expectedRole !== '' && data.role !== expectedRole) {
    const friendlyRole = expectedRole.replace('_', ' ');
    return showMessage(`This account is not a ${friendlyRole}. Please choose the correct portal or use the correct login mode.`, 'error');
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

    // Ensure the user_roles entry exists for the newly created admin
    (async () => {
      try {
        const userId = result.data.user.id;
        const schoolId = result.data.schoolId;
        const ensure = await ensureUserRole(userId, 'school_admin', schoolId);
        if (ensure.error) {
          console.warn('ensureUserRole warning:', ensure.error);
          const msg = ensure.error.message || (ensure.error && ensure.error.toString()) || 'Unable to create role for the account.';
          showMessage(`Role setup warning: ${msg}`, 'error');
          if (typeof window.showSupportBanner === 'function') {
            window.showSupportBanner(`Role setup needs attention: ${msg}. Contact support if you cannot sign in after registration.`, 'error');
          }
        }
      } catch (err) {
        console.warn('ensureUserRole exception:', err);
        showMessage('Role setup failed. Check the console for details.', 'error');
      }
    })();

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
    clearSession();
    window.location.href = 'login.html';
    return false;
  }

  const sessionInfo = await client.auth.getSession();
  if (!sessionInfo?.data?.session?.user) {
    clearSession();
    window.location.href = 'login.html';
    return false;
  }

  const userId = sessionInfo.data.session.user.id;
  const roleResult = await fetchUserRole(userId);
  if (roleResult.error || !roleResult.data) {
    clearSession();
    window.location.href = 'login.html';
    return false;
  }

  const currentRole = roleResult.data.role || sessionInfo.data.session.user.user_metadata?.role;
  if (!ensureRoleAccess(requiredRole, currentRole)) {
    showMessage('Access denied. Redirecting to your correct portal.', 'error');
    window.location.href = getRoleRedirect(currentRole || 'school_admin');
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
    const expectedRole = document.getElementById('loginRole')?.value || '';

    if (!email || !password) {
      return showMessage('Please enter your email and password.', 'error');
    }

    if (!expectedRole) {
      return showMessage('Please select your login mode.', 'error');
    }

    loginUser(email, password, remember, expectedRole);
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
      schoolLogoUrl: document.getElementById('schoolLogoUrl')?.value.trim(),
      adminName: document.getElementById('adminName').value.trim(),
      adminEmail: document.getElementById('adminEmail').value.trim(),
      adminPassword: document.getElementById('adminPassword').value,
      subscriptionPlan: document.getElementById('subscriptionPlan').value
    };

    if (!payload.schoolName || !payload.schoolCode || !payload.schoolAddress || !payload.schoolPhone || !payload.schoolEmail || !payload.adminName || !payload.adminEmail || !payload.adminPassword) {
      return showMessage('Please complete all school and admin fields before registering.', 'error');
    }

    applySchoolBrandingPreview({ schoolName: payload.schoolName, primaryColor: '#e63a2e', schoolLogoUrl: payload.schoolLogoUrl });
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
