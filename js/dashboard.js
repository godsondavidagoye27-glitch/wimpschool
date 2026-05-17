const feeChartElement = document.getElementById('feeChart');

async function fetchRecentFeesByDay(schoolId) {
  try {
    if (!window.supabase) return null;

    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 6); // last 7 days

    const { data, error } = await supabase
      .from('payments')
      .select('amount, created_at')
      .eq('school_id', schoolId)
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString());

    if (error) return null;

    // Aggregate amounts by day
    const totals = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(from);
      d.setDate(from.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      totals[key] = 0;
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

async function renderFeeChart() {
  if (!feeChartElement) return;

  // Try to obtain schoolId from session storage (set by app.js)
  const raw = sessionStorage.getItem('wimpschoolUser') || localStorage.getItem('wimpschoolUser');
  let schoolId = null;
  try {
    const session = raw ? JSON.parse(raw) : null;
    schoolId = session?.schoolId || null;
  } catch (e) {
    schoolId = null;
  }

  let totals = null;
  if (schoolId && window.supabase) {
    totals = await fetchRecentFeesByDay(schoolId);
  }

  // Build labels and data for last 7 days
  const labels = [];
  const dataPoints = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
    dataPoints.push(totals ? (totals[key] || 0) : [420000, 380000, 470000, 430000, 520000, 510000, 490000][6 - i]);
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

window.addEventListener('load', () => {
  renderFeeChart();
});
