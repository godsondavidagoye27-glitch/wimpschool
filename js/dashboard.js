const feeChartElement = document.getElementById('feeChart');

function getSavedSchoolId() {
  const raw = sessionStorage.getItem('wimpschoolUser') || localStorage.getItem('wimpschoolUser');
  if (!raw) return null;
  try {
    return JSON.parse(raw)?.schoolId || null;
  } catch (err) {
    return null;
  }
}

async function fetchRecentFeesByDay(schoolId) {
  try {
    const client = window.getSupabase ? window.getSupabase() : null;
    if (!client) return null;

    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 6);

    const { data, error } = await client
      .from('payments')
      .select('amount, created_at')
      .eq('school_id', schoolId)
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString());

    if (error) return null;

    const totals = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(from);
      d.setDate(from.getDate() + i);
      totals[d.toISOString().slice(0, 10)] = 0;
    }

    (data || []).forEach(row => {
      const day = (row.created_at || row.createdAt || '').slice(0, 10);
      if (totals.hasOwnProperty(day)) {
        totals[day] += Number(row.amount || 0);
      }
    });

    return totals;
  } catch (err) {
    return null;
  }
}

function formatCurrencyShort(val) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(val || 0));
}

async function fetchSchoolNotifications(limit = 6) {
  const client = window.getSupabase ? window.getSupabase() : null;
  const schoolId = getSavedSchoolId();
  if (!client || !schoolId) {
    return [];
  }

  const { data, error } = await client
    .from('notifications')
    .select('message, type, created_at')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return error ? [] : (data || []);
}

async function renderNotificationsWidget() {
  const container = document.getElementById('dashboardNotifications');
  if (!container) return;

  const notifications = await fetchSchoolNotifications();
  if (!notifications.length) {
    container.innerHTML = '<article class="notification-item"><strong>No notifications yet</strong><p>Invites, payments, and alerts will appear here.</p></article>';
    return;
  }

  container.innerHTML = notifications.map(item => `
    <article class="notification-item">
      <strong>${(item.type || 'update').replace(/_/g, ' ')}</strong>
      <p>${item.message || 'New update available.'}</p>
      <p>${item.created_at ? new Date(item.created_at).toLocaleString() : ''}</p>
    </article>
  `).join('');
}

async function exportDashboardSummary() {
  const client = window.getSupabase ? window.getSupabase() : null;
  const schoolId = getSavedSchoolId();
  const exportFormat = document.getElementById('dashboardExportFormat')?.value || 'csv';
  if (!client || !schoolId) return;

  const [studentsResult, teachersResult, paymentsResult, attendanceResult, resultsResult, schoolResult] = await Promise.all([
    client.from('students').select('id').eq('school_id', schoolId),
    client.from('teachers').select('id').eq('school_id', schoolId),
    client.from('payments').select('amount, status').eq('school_id', schoolId),
    client.from('attendance').select('status').eq('school_id', schoolId),
    client.from('results').select('score').eq('school_id', schoolId),
    client.from('schools').select('name, subscription_plan, pending_subscription_plan').eq('id', schoolId).single()
  ]);

  const totalStudents = studentsResult.data?.length || 0;
  const totalTeachers = teachersResult.data?.length || 0;
  const payments = paymentsResult.data || [];
  const paidTotal = payments.filter(item => item.status === 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const outstandingTotal = payments.filter(item => item.status !== 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const attendanceTotal = attendanceResult.data?.length || 0;
  const presentAttendance = (attendanceResult.data || []).filter(item => item.status === 'present').length;
  const attendanceRate = attendanceTotal ? Math.round((presentAttendance / attendanceTotal) * 100) : 0;
  const averageScore = (resultsResult.data || []).reduce((sum, item) => sum + Number(item.score || 0), 0) / Math.max((resultsResult.data || []).length, 1);

  const summary = {
    schoolName: schoolResult.data?.name || 'WimpSchool',
    schoolId,
    generatedAt: new Date().toISOString(),
    metrics: {
      students: totalStudents,
      teachers: totalTeachers,
      feesPaid: paidTotal,
      feesOutstanding: outstandingTotal,
      attendanceRate,
      averageScore: Math.round(averageScore),
      resultsLogged: resultsResult.data?.length || 0,
      paymentsRecorded: payments.length,
      currentPlan: schoolResult.data?.subscription_plan || 'Starter',
      pendingPlan: schoolResult.data?.pending_subscription_plan || null
    }
  };

  const blob = exportFormat === 'json'
    ? new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json;charset=utf-8;' })
    : new Blob([[
      ['metric', 'value'],
      ['students', totalStudents],
      ['teachers', totalTeachers],
      ['fees_paid', paidTotal],
      ['fees_outstanding', outstandingTotal],
      ['attendance_rate', attendanceRate],
      ['average_score', Math.round(averageScore)],
      ['results_logged', summary.metrics.resultsLogged],
      ['payments_recorded', summary.metrics.paymentsRecorded]
    ].map(row => row.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `wimpschool-dashboard-summary.${exportFormat === 'json' ? 'json' : 'csv'}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function renderRecentPayments() {
  const paymentsList = document.getElementById('recentPaymentsList');
  const client = window.getSupabase ? window.getSupabase() : null;
  if (!paymentsList || !client) return;

  const schoolId = getSavedSchoolId();
  if (!schoolId) {
    paymentsList.innerHTML = '<li>No recent payments available.</li>';
    return;
  }

  const { data: payments, error } = await client
    .from('payments')
    .select('id, amount, status, student_id')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !payments?.length) {
    paymentsList.innerHTML = '<li>No recent payments available.</li>';
    return;
  }

  const studentIds = [...new Set(payments.map(item => item.student_id).filter(Boolean))];
  const { data: students } = studentIds.length ? await client.from('students').select('id, name').in('id', studentIds) : { data: [] };
  const studentMap = new Map((students || []).map(student => [student.id, student.name]));

  paymentsList.innerHTML = payments.map(item => {
    const studentName = studentMap.get(item.student_id) || 'Unknown student';
    return `<li>${studentName} — ${formatCurrencyShort(item.amount)} — ${item.status || 'unknown'}</li>`;
  }).join('');
}

async function renderFeeChart() {
  if (!feeChartElement) return;

  const schoolId = getSavedSchoolId();
  const client = window.getSupabase ? window.getSupabase() : null;
  const totals = schoolId && client ? await fetchRecentFeesByDay(schoolId) : null;

  const labels = [];
  const dataPoints = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
    dataPoints.push((totals && totals[key] !== undefined) ? totals[key] : 0);
  }

  const ctx = feeChartElement.getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Fees collected',
        data: dataPoints,
        borderColor: '#e63a2e',
        backgroundColor: 'rgba(230,58,46,0.18)',
        fill: true,
        tension: .35,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => formatCurrencyShort(ctx.parsed.y)
          }
        }
      },
      scales: {
        y: {
          ticks: { color: '#1a1f5e' },
          grid: { color: 'rgba(26,31,94,0.08)' }
        },
        x: {
          ticks: { color: '#1a1f5e' },
          grid: { color: 'transparent' }
        }
      }
    }
  });
}

async function fetchStudentCount() {
  const element = document.getElementById('totalStudents');
  if (!element) return;

  const client = window.getSupabase ? window.getSupabase() : null;
  const schoolId = getSavedSchoolId();
  
  if (!client || !schoolId) {
    element.textContent = '0';
    return;
  }

  const { count, error } = await client
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId);

  element.textContent = error ? '0' : (count || 0);
}

async function fetchTeacherCount() {
  const element = document.getElementById('totalTeachers');
  if (!element) return;

  const client = window.getSupabase ? window.getSupabase() : null;
  const schoolId = getSavedSchoolId();
  
  if (!client || !schoolId) {
    element.textContent = '0';
    return;
  }

  const { count, error } = await client
    .from('teachers')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId);

  element.textContent = error ? '0' : (count || 0);
}

async function fetchFeesCollectedToday() {
  const element = document.getElementById('feesCollected');
  if (!element) return;

  const client = window.getSupabase ? window.getSupabase() : null;
  const schoolId = getSavedSchoolId();
  
  if (!client || !schoolId) {
    element.textContent = '₦0';
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { data, error } = await client
    .from('payments')
    .select('amount')
    .eq('school_id', schoolId)
    .eq('status', 'paid')
    .gte('created_at', today.toISOString())
    .lt('created_at', tomorrow.toISOString());

  if (error || !data?.length) {
    element.textContent = '₦0';
    return;
  }

  const total = data.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  element.textContent = formatCurrencyShort(total);
}

async function fetchOutstandingFees() {
  const client = window.getSupabase ? window.getSupabase() : null;
  const schoolId = getSavedSchoolId();
  if (!client || !schoolId) {
    return 0;
  }

  const { data, error } = await client
    .from('payments')
    .select('amount')
    .eq('school_id', schoolId)
    .neq('status', 'paid');

  if (error || !data?.length) {
    return 0;
  }

  return data.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

async function fetchEliteAttendanceRate() {
  const client = window.getSupabase ? window.getSupabase() : null;
  const schoolId = getSavedSchoolId();
  if (!client || !schoolId) return null;

  const { data, error } = await client
    .from('attendance')
    .select('status')
    .eq('school_id', schoolId);

  if (error || !data?.length) return null;

  const total = data.length;
  const present = data.filter(record => record.status === 'present').length;
  return total ? Math.round((present / total) * 100) : null;
}

async function fetchEliteAverageScore() {
  const client = window.getSupabase ? window.getSupabase() : null;
  const schoolId = getSavedSchoolId();
  if (!client || !schoolId) return null;

  const { data, error } = await client
    .from('results')
    .select('score')
    .eq('school_id', schoolId);

  if (error || !data?.length) return null;

  const scores = data.map(item => Number(item.score || 0)).filter(Number.isFinite);
  if (!scores.length) return null;
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

async function renderEliteAnalytics() {
  const attendanceEl = document.getElementById('eliteAttendanceRate');
  const recoveryEl = document.getElementById('eliteFeeRecovery');
  const scoreEl = document.getElementById('eliteAverageScore');

  const [attendanceRate, outstandingFees] = await Promise.all([
    fetchEliteAttendanceRate(),
    fetchOutstandingFees()
  ]);

  const resultCountEl = document.getElementById('eliteResultCount');

  const paidTotal = await (async () => {
    const client = window.getSupabase ? window.getSupabase() : null;
    const schoolId = getSavedSchoolId();
    if (!client || !schoolId) return 0;

    const { data, error } = await client
      .from('payments')
      .select('amount')
      .eq('school_id', schoolId)
      .eq('status', 'paid');

    if (error || !data?.length) return 0;
    return data.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  })();

  if (attendanceEl) {
    attendanceEl.textContent = attendanceRate === null ? 'No attendance data' : `${attendanceRate}%`;
  }
  if (recoveryEl) {
    const total = outstandingFees + paidTotal;
    recoveryEl.textContent = total > 0 ? `${Math.round(((paidTotal / total) * 100) || 0)}%` : 'No payment data';
  }
  if (scoreEl) {
    const averageScore = await fetchEliteAverageScore();
    scoreEl.textContent = averageScore === null ? 'No results data' : `${averageScore}/100`;
  }
  if (resultCountEl) {
    const client = window.getSupabase ? window.getSupabase() : null;
    const schoolId = getSavedSchoolId();
    if (client && schoolId) {
      const { count, error } = await client.from('results').select('id', { count: 'exact', head: true }).eq('school_id', schoolId);
      resultCountEl.textContent = error ? '0' : (count || 0);
    } else {
      resultCountEl.textContent = '0';
    }
  }
}

window.addEventListener('load', () => {
  fetchStudentCount();
  fetchTeacherCount();
  fetchFeesCollectedToday();
  renderRecentPayments();
  renderFeeChart();
  renderEliteAnalytics();
  renderNotificationsWidget();
  document.getElementById('exportDashboardSummary')?.addEventListener('click', exportDashboardSummary);
});
