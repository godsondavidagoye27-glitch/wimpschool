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
    client.from('payments').select('amount, status, created_at, student_id').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(10),
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

  const studentIds = [...new Set(payments.map(item => item.student_id).filter(Boolean))];
  const { data: students } = studentIds.length ? await client.from('students').select('id, name').in('id', studentIds) : { data: [] };
  const studentMap = new Map((students || []).map(student => [student.id, student.name]));

  const recentPayments = payments.map(item => ({
    studentName: studentMap.get(item.student_id) || 'Unknown student',
    amount: Number(item.amount || 0),
    status: item.status || 'unknown',
    createdAt: item.created_at || null
  }));

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
    },
    recentPayments
  };

  let content = '';
  let fileName = 'wimpschool-dashboard-report';
  let mimeType = 'text/plain;charset=utf-8;';

  if (exportFormat === 'json') {
    content = JSON.stringify(summary, null, 2);
    fileName += '.json';
    mimeType = 'application/json;charset=utf-8;';
  } else if (exportFormat === 'html') {
    const metricsRows = Object.entries(summary.metrics).map(([key, value]) => `<tr><th>${key.replace(/_/g, ' ')}</th><td>${value ?? '—'}</td></tr>`).join('');
    const paymentRows = summary.recentPayments.length
      ? summary.recentPayments.map(item => `<tr><td>${item.studentName}</td><td>${formatCurrencyShort(item.amount)}</td><td>${item.status}</td><td>${item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}</td></tr>`).join('')
      : '<tr><td colspan="4">No recent payments recorded.</td></tr>';
    content = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>WimpSchool dashboard report</title><style>body{font-family:Inter,Arial,sans-serif;padding:24px;color:#1a1f5e}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #e6e8ef;padding:10px;text-align:left}th{background:#fbfbfb}</style></head><body><h1>WimpSchool dashboard report</h1><p>Generated: ${summary.generatedAt}</p><h2>Overview</h2><table>${metricsRows}</table><h2>Recent payments</h2><table><thead><tr><th>Student</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>${paymentRows}</tbody></table></body></html>`;
    fileName += '.html';
    mimeType = 'text/html;charset=utf-8;';
  } else if (exportFormat === 'txt') {
    const lines = [
      'WimpSchool dashboard report',
      `School: ${summary.schoolName}`,
      `Generated: ${summary.generatedAt}`,
      '',
      'Overview',
      `- Students: ${summary.metrics.students}`,
      `- Teachers: ${summary.metrics.teachers}`,
      `- Fees paid: ${formatCurrencyShort(summary.metrics.feesPaid)}`,
      `- Fees outstanding: ${formatCurrencyShort(summary.metrics.feesOutstanding)}`,
      `- Attendance rate: ${summary.metrics.attendanceRate}%`,
      `- Average score: ${summary.metrics.averageScore}/100`,
      `- Results logged: ${summary.metrics.resultsLogged}`,
      '',
      'Recent payments'
    ];
    if (summary.recentPayments.length) {
      summary.recentPayments.forEach(item => {
        lines.push(`- ${item.studentName}: ${formatCurrencyShort(item.amount)} (${item.status}) ${item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}`.trim());
      });
    } else {
      lines.push('- No recent payments recorded.');
    }
    content = lines.join('\n');
    fileName += '.txt';
  } else {
    const rows = [
      ['section', 'label', 'value'],
      ['overview', 'school_name', summary.schoolName],
      ['overview', 'students', summary.metrics.students],
      ['overview', 'teachers', summary.metrics.teachers],
      ['overview', 'fees_paid', summary.metrics.feesPaid],
      ['overview', 'fees_outstanding', summary.metrics.feesOutstanding],
      ['overview', 'attendance_rate', `${summary.metrics.attendanceRate}%`],
      ['overview', 'average_score', `${summary.metrics.averageScore}/100`],
      ['overview', 'results_logged', summary.metrics.resultsLogged],
      ['overview', 'payments_recorded', summary.metrics.paymentsRecorded]
    ];
    summary.recentPayments.forEach(item => {
      rows.push(['recent_payment', item.studentName, `${formatCurrencyShort(item.amount)} | ${item.status} | ${item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}`]);
    });
    content = rows.map(row => row.join(',')).join('\n');
    fileName += '.csv';
    mimeType = 'text/csv;charset=utf-8;';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
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

async function fetchAnalyticsSnapshot() {
  const client = window.getSupabase ? window.getSupabase() : null;
  const schoolId = getSavedSchoolId();
  if (!client || !schoolId) {
    return {
      attendanceRate: null,
      paymentRecovery: 0,
      averageScore: null,
      resultsLogged: 0,
      paidAmount: 0,
      outstandingAmount: 0,
      healthScore: 0,
      insight: 'Add attendance, payment, and results data to unlock the full health overview.'
    };
  }

  const [attendanceResult, paymentsResult, resultsResult] = await Promise.all([
    client.from('attendance').select('status').eq('school_id', schoolId),
    client.from('payments').select('amount, status').eq('school_id', schoolId),
    client.from('results').select('score').eq('school_id', schoolId)
  ]);

  const attendanceRecords = attendanceResult.data || [];
  const paymentRecords = paymentsResult.data || [];
  const resultRecords = resultsResult.data || [];

  const attendanceRate = attendanceRecords.length
    ? Math.round((attendanceRecords.filter(item => item.status === 'present').length / attendanceRecords.length) * 100)
    : null;

  const paidAmount = paymentRecords.filter(item => item.status === 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const outstandingAmount = paymentRecords.filter(item => item.status !== 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalAmount = paidAmount + outstandingAmount;
  const paymentRecovery = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;
  const averageScore = resultRecords.length
    ? Math.round(resultRecords.reduce((sum, item) => sum + Number(item.score || 0), 0) / resultRecords.length)
    : null;

  const healthScore = Math.max(0, Math.min(100, Math.round(((attendanceRate || 0) * 0.4) + (paymentRecovery * 0.4) + ((averageScore || 0) * 0.2))));

  let insight = 'The school is on track with a steady rhythm.';
  if (attendanceRate !== null && attendanceRate < 80) {
    insight = 'Attendance is below target. A quick check-in with homeroom teachers could help.';
  } else if (paymentRecovery < 70) {
    insight = 'Fee recovery needs attention. Follow-up reminders could improve collections.';
  } else if (averageScore !== null && averageScore >= 70) {
    insight = 'The school is showing strong academic momentum and healthy collections.';
  }

  return {
    attendanceRate,
    paymentRecovery,
    averageScore,
    resultsLogged: resultRecords.length,
    paidAmount,
    outstandingAmount,
    healthScore,
    insight
  };
}

async function renderHealthSnapshot() {
  const healthScoreEl = document.getElementById('healthScore');
  const healthAttendanceEl = document.getElementById('healthAttendance');
  const healthRecoveryEl = document.getElementById('healthRecovery');
  const healthResultsEl = document.getElementById('healthResults');
  const healthInsightEl = document.getElementById('healthInsight');

  if (!healthScoreEl && !healthAttendanceEl && !healthRecoveryEl && !healthResultsEl && !healthInsightEl) return;

  const snapshot = await fetchAnalyticsSnapshot();

  if (healthScoreEl) {
    healthScoreEl.textContent = `${snapshot.healthScore}%`;
  }
  if (healthAttendanceEl) {
    healthAttendanceEl.textContent = snapshot.attendanceRate === null ? 'No data' : `${snapshot.attendanceRate}%`;
  }
  if (healthRecoveryEl) {
    healthRecoveryEl.textContent = snapshot.paymentRecovery ? `${snapshot.paymentRecovery}%` : 'No data';
  }
  if (healthResultsEl) {
    healthResultsEl.textContent = snapshot.averageScore === null ? 'No data' : `${snapshot.averageScore}/100`;
  }
  if (healthInsightEl) {
    healthInsightEl.textContent = snapshot.insight;
  }
}

async function renderPaymentMixChart() {
  const canvas = document.getElementById('paymentMixChart');
  if (!canvas) return;

  const snapshot = await fetchAnalyticsSnapshot();
  const ctx = canvas.getContext('2d');
  const hasData = snapshot.paidAmount > 0 || snapshot.outstandingAmount > 0;

  if (!hasData) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const placeholder = new Image();
    placeholder.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220"><rect width="100%" height="100%" rx="24" fill="#fbfbfb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#58607c" font-family="Inter, Arial" font-size="16">No payment data yet</text></svg>');
    placeholder.onload = () => ctx.drawImage(placeholder, 0, 0, canvas.width, canvas.height);
    return;
  }

  if (window.paymentMixChartInstance) {
    window.paymentMixChartInstance.destroy();
  }

  window.paymentMixChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Paid', 'Outstanding'],
      datasets: [{
        data: [snapshot.paidAmount, snapshot.outstandingAmount],
        backgroundColor: ['#e63a2e', '#1a1f5e'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#58607c' } },
        tooltip: {
          callbacks: {
            label: item => `${item.label}: ${formatCurrencyShort(item.raw)}`
          }
        }
      }
    }
  });
}

window.addEventListener('load', () => {
  fetchStudentCount();
  fetchTeacherCount();
  fetchFeesCollectedToday();
  renderRecentPayments();
  renderFeeChart();
  renderEliteAnalytics();
  renderHealthSnapshot();
  renderPaymentMixChart();
  renderNotificationsWidget();
  document.getElementById('exportDashboardSummary')?.addEventListener('click', exportDashboardSummary);
});
