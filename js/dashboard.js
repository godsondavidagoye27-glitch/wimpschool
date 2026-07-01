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
}

window.addEventListener('load', () => {
  fetchStudentCount();
  fetchTeacherCount();
  fetchFeesCollectedToday();
  renderRecentPayments();
  renderFeeChart();
  renderEliteAnalytics();
});
