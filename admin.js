import { auth, database, baseUrl } from './firebase-config.js';
import {
  onAuthStateChanged,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';
import {
  ref,
  onValue,
  get,
  set,
  update,
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js';

const ADMIN_EMAIL = 'admin@baricrystal.com';
const isAdminEmail = (email) => String(email || '').trim().toLowerCase() === ADMIN_EMAIL;

const state = {
  users: [],
  applications: [],
  payments: [],
  jobs: [],
  settings: {},
  currentUser: null,
  appSearch: '',
  appStatus: 'all',
};

const titles = {
  overview: 'Overview',
  applications: 'Applications',
  payments: 'Payments',
  jobs: 'Job Listings',
  users: 'Users',
  settings: 'Settings',
};

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || 'U') + (parts[1]?.[0] || '')).toUpperCase();
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function parseDate(value) {
  const d = new Date(value || 0);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function toArray(node, keyName = 'id') {
  if (!node) return [];
  if (Array.isArray(node)) {
    return node.filter(Boolean).map((item, idx) => ({ [keyName]: item?.[keyName] || String(idx + 1), ...(item || {}) }));
  }
  return Object.entries(node).map(([key, item]) => ({ [keyName]: key, ...(item || {}) }));
}

function normalizeUsers(node) {
  return toArray(node, 'uid').map((u) => {
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.displayName || u.fullName || u.name || u.email?.split('@')?.[0] || 'Unnamed User';
    const status = String(u.accountStatus || u.paymentStatus || u.status || 'unpaid').toLowerCase();
    return {
      ...u,
      name,
      status,
      registeredAt: u.createdAt || u.registeredAt || u.lastLogin || '',
    };
  });
}

function statusLabel(status) {
  const s = String(status || 'pending').toLowerCase().replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function badgeClass(status) {
  const s = String(status || 'pending').toLowerCase();
  if (['approved', 'paid', 'active', 'completed', 'admin'].includes(s)) return 'badge-approved';
  if (['processing', 'in review', 'review', 'pending review'].includes(s)) return 'badge-processing';
  if (['rejected', 'declined'].includes(s)) return 'badge-rejected';
  return 'badge-pending';
}

function moneyFromPayment(value) {
  const num = Number(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

function emptyRow(cols, message) {
  return `<tr><td colspan="${cols}"><div style="padding:28px 18px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-subtle);background:rgba(255,255,255,0.01);border-radius:12px;">${esc(message)}</div></td></tr>`;
}

function showAdminFeedback(message, tone = 'info') {
  const box = document.getElementById('admin-feedback');
  if (!box) return;
  const colors = {
    success: ['rgba(45,158,107,0.12)', 'rgba(45,158,107,0.35)', '#2D9E6B'],
    warning: ['rgba(232,168,56,0.12)', 'rgba(232,168,56,0.35)', '#E8A838'],
    error: ['rgba(226,75,74,0.10)', 'rgba(226,75,74,0.30)', '#E24B4A'],
    info: ['rgba(58,138,196,0.10)', 'rgba(58,138,196,0.30)', 'var(--text-muted)'],
  };
  const [bg, border, color] = colors[tone] || colors.info;
  box.style.display = 'block';
  box.style.background = bg;
  box.style.borderColor = border;
  box.style.color = color;
  box.textContent = message;
}

function setActiveTab(tabId, navEl) {
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  const panel = document.getElementById(`tab-${tabId}`);
  if (panel) panel.classList.add('active');
  if (navEl) navEl.classList.add('active');
  const title = document.getElementById('page-title');
  if (title) title.textContent = titles[tabId] || tabId;
}

function renderAdminIdentity() {
  const name = state.currentUser?.displayName || state.currentUser?.email || 'Admin';
  const adminName = document.querySelector('.admin-name');
  const adminRole = document.querySelector('.admin-role');
  const avatar = document.querySelector('.admin-avatar');
  if (adminName) adminName.textContent = name;
  if (adminRole) adminRole.textContent = isAdminEmail(state.currentUser?.email) ? 'Super Admin' : 'Admin';
  if (avatar) avatar.textContent = initials(name);
}

function renderOverview() {
  const applications = state.applications;
  const payments = state.payments;
  const users = state.users;

  const approved = applications.filter((a) => ['approved', 'paid', 'active', 'completed'].includes(String(a.status || a.applicationStatus || '').toLowerCase())).length;
  const pending = applications.filter((a) => ['pending', 'processing', 'review', 'pending review'].includes(String(a.status || a.applicationStatus || '').toLowerCase())).length;
  const revenue = payments.reduce((sum, p) => sum + moneyFromPayment(p.amount), 0);

  const statNums = document.querySelectorAll('.stats-row .stat-card-num');
  if (statNums[0]) statNums[0].textContent = String(applications.length);
  if (statNums[1]) statNums[1].textContent = String(approved);
  if (statNums[2]) statNums[2].textContent = String(pending);
  if (statNums[3]) statNums[3].textContent = revenue ? `₦${revenue.toLocaleString('en-NG')}` : '₦0';

  const weekCounts = [0, 0, 0, 0, 0];
  const now = new Date();
  applications.forEach((app) => {
    const ts = parseDate(app.appliedAt || app.createdAt || app.date);
    if (!ts) return;
    const d = new Date(ts);
    if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return;
    const week = Math.min(4, Math.floor((d.getDate() - 1) / 7));
    weekCounts[week] += 1;
  });
  const bars = document.querySelectorAll('.bar-chart .bar-col .bar');
  const max = Math.max(1, ...weekCounts);
  bars.forEach((bar, idx) => {
    const h = 18 + Math.round((weekCounts[idx] / max) * 72);
    bar.style.height = `${h}%`;
  });
  const sub = document.querySelector('.chart-card-sub');
  if (sub) sub.textContent = `Realtime from Firebase — ${now.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}`;

  renderActivity();
  showAdminFeedback(
    users.length || applications.length || payments.length || state.jobs.length
      ? 'Live Firebase data loaded successfully.'
      : 'No records found yet. Empty states are showing instead of fake demo data.',
    users.length || applications.length || payments.length || state.jobs.length ? 'success' : 'warning'
  );
}

function renderActivity() {
  const box = document.querySelector('.recent-activity');
  if (!box) return;

  const events = [];

  state.users.slice().sort((a, b) => parseDate(b.registeredAt) - parseDate(a.registeredAt)).slice(0, 2).forEach((u) => {
    events.push({
      ts: parseDate(u.registeredAt),
      color: 'var(--success)',
      text: `<strong>${esc(u.name)}</strong> joined the system`,
      time: formatDate(u.registeredAt),
    });
  });

  state.applications.slice().sort((a, b) => parseDate(b.appliedAt || b.createdAt || b.date) - parseDate(a.appliedAt || a.createdAt || a.date)).slice(0, 2).forEach((a) => {
    const name = a.name || [a.firstName, a.lastName].filter(Boolean).join(' ') || a.email || 'Unnamed Applicant';
    const job = a.jobCategory || a.category || a.jobTitle || 'application';
    events.push({
      ts: parseDate(a.appliedAt || a.createdAt || a.date),
      color: 'var(--info)',
      text: `<strong>${esc(name)}</strong> submitted ${esc(job)}`,
      time: formatDate(a.appliedAt || a.createdAt || a.date),
    });
  });

  state.payments.slice().sort((a, b) => parseDate(b.date || b.createdAt || b.paidAt) - parseDate(a.date || a.createdAt || a.paidAt)).slice(0, 1).forEach((p) => {
    const name = p.name || p.candidate || p.email || 'Payment';
    const plan = p.plan || p.planName || 'Plan';
    events.push({
      ts: parseDate(p.date || p.createdAt || p.paidAt),
      color: 'var(--gold)',
      text: `<strong>${esc(name)}</strong> completed payment — ${esc(plan)}`,
      time: formatDate(p.date || p.createdAt || p.paidAt),
    });
  });

  events.sort((a, b) => b.ts - a.ts);
  const slice = events.slice(0, 5);

  box.innerHTML = `<div class="activity-title">Recent Activity</div>${slice.length ? slice.map((item) => `
    <div class="activity-item">
      <div class="activity-dot" style="background:${item.color}"></div>
      <div><div class="activity-text">${item.text}</div><div class="activity-time">${esc(item.time)}</div></div>
    </div>
  `).join('') : '<div class="activity-item"><div class="activity-dot" style="background:var(--warning)"></div><div><div class="activity-text">No activity yet.</div><div class="activity-time">Once Firebase has records, this panel will update automatically.</div></div></div>'}`;
}

function matchesAppFilter(item) {
  if (state.appStatus !== 'all') {
    const status = String(item.status || item.applicationStatus || 'pending').toLowerCase();
    if (status !== state.appStatus) return false;
  }
  const q = state.appSearch.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    item.name,
    item.firstName,
    item.lastName,
    item.email,
    item.phone,
    item.jobCategory,
    item.category,
    item.jobTitle,
    item.plan,
    item.planName,
    item.status,
    item.applicationStatus,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

function renderApplicationsTable() {
  const tbody = document.getElementById('admin-applications-body');
  const recent = document.getElementById('admin-recent-applications-body');
  const data = state.applications.slice().sort((a, b) => parseDate(b.appliedAt || b.createdAt || b.date) - parseDate(a.appliedAt || a.createdAt || a.date));
  const filtered = data.filter(matchesAppFilter);

  const rows = filtered.map((item) => {
    const name = item.name || [item.firstName, item.lastName].filter(Boolean).join(' ') || item.email || 'Unnamed Applicant';
    const email = item.email || '—';
    const phone = item.phone || '—';
    const job = item.jobCategory || item.category || item.jobTitle || '—';
    const plan = item.plan || item.planName || '—';
    const status = item.status || item.applicationStatus || 'pending';
    const applied = formatDate(item.appliedAt || item.createdAt || item.date);
    return `<tr data-status="${esc(String(status).toLowerCase())}"><td><div class="candidate-info"><div class="candidate-avatar">${esc(initials(name))}</div><div><div class="candidate-name">${esc(name)}</div><div class="candidate-email">${esc(email)}</div></div></div></td><td>${esc(phone)}</td><td>${esc(job)}</td><td>${esc(plan)}</td><td><span class="badge ${badgeClass(status)}">${esc(statusLabel(status))}</span></td><td>${esc(applied)}</td><td><button class="action-btn" data-action="view">View</button></td></tr>`;
  }).join('');

  if (tbody) tbody.innerHTML = rows || emptyRow(7, state.appSearch || state.appStatus !== 'all' ? 'No applications match the current filter.' : 'No applications yet. Once Firebase is connected, applications will show here automatically.');

  if (recent) {
    const latest = data.slice(0, 4);
    recent.innerHTML = latest.length ? latest.map((item) => {
      const name = item.name || [item.firstName, item.lastName].filter(Boolean).join(' ') || item.email || 'Unnamed Applicant';
      const email = item.email || '—';
      const job = item.jobCategory || item.category || item.jobTitle || '—';
      const status = item.status || item.applicationStatus || 'pending';
      const date = formatDate(item.appliedAt || item.createdAt || item.date);
      return `<tr><td><div class="candidate-info"><div class="candidate-avatar">${esc(initials(name))}</div><div><div class="candidate-name">${esc(name)}</div><div class="candidate-email">${esc(email)}</div></div></div></td><td>${esc(job)}</td><td>${esc(item.plan || item.planName || '—')}</td><td><span class="badge ${badgeClass(status)}">${esc(statusLabel(status))}</span></td><td>${esc(date)}</td></tr>`;
    }).join('') : emptyRow(5, 'No recent applications yet.');
  }

  const appCount = document.getElementById('admin-app-count');
  if (appCount) appCount.textContent = `(${state.applications.length})`;
}

function renderPaymentsTable() {
  const tbody = document.getElementById('admin-payments-body');
  const data = state.payments.slice().sort((a, b) => parseDate(b.date || b.createdAt || b.paidAt) - parseDate(a.date || a.createdAt || a.paidAt));
  const rows = data.map((item) => {
    const name = item.name || item.candidate || item.email || 'Unnamed Client';
    const plan = item.plan || item.planName || '—';
    const amount = item.amount || '—';
    const method = item.method || item.paymentMethod || '—';
    const status = item.status || item.paymentStatus || 'pending';
    const date = formatDate(item.date || item.createdAt || item.paidAt);
    return `<tr><td><div class="candidate-name">${esc(name)}</div><div class="candidate-email">${esc(item.email || '')}</div></td><td>${esc(plan)}</td><td>${esc(amount)}</td><td>${esc(method)}</td><td><span class="badge ${badgeClass(status)}">${esc(statusLabel(status))}</span></td><td>${esc(date)}</td></tr>`;
  }).join('');
  if (tbody) tbody.innerHTML = rows || emptyRow(6, 'No payment records yet. Payments will appear here when Firebase receives them.');
}

function renderJobsTable() {
  const tbody = document.getElementById('admin-jobs-body');
  const data = state.jobs.slice().sort((a, b) => parseDate(b.createdAt || b.updatedAt) - parseDate(a.createdAt || a.updatedAt));
  const rows = data.map((item, idx) => {
    const id = item.id || String(idx + 1).padStart(3, '0');
    const title = item.title || item.jobTitle || 'Untitled Job';
    const category = item.category || item.jobCategory || '—';
    const country = item.country || '—';
    const slots = item.slots ?? item.openings ?? '—';
    const status = item.status || item.state || 'open';
    const pill = String(status).toLowerCase() === 'filled' ? 'filled' : 'open';
    return `<tr><td style="color:var(--text-muted)">${esc(id)}</td><td>${esc(title)}</td><td>${esc(category)}</td><td>${esc(country)}</td><td>${esc(slots)}</td><td><div class="job-pill"><div class="job-dot ${pill}"></div>${esc(statusLabel(status))}</div></td><td><button class="action-btn" data-action="edit">Edit</button></td></tr>`;
  }).join('');
  if (tbody) tbody.innerHTML = rows || emptyRow(7, 'No job listings yet. Add jobs in Firebase and they will appear here.');
}

function renderUsersTable() {
  const tbody = document.getElementById('admin-users-body');
  const data = state.users.slice().sort((a, b) => parseDate(b.registeredAt) - parseDate(a.registeredAt));
  const rows = data.map((item) => {
    const name = item.name || item.displayName || item.fullName || item.email?.split('@')?.[0] || 'Unnamed User';
    const email = item.email || '—';
    const phone = item.phone || '—';
    const stateName = item.state || item.location || '—';
    const registered = formatDate(item.registeredAt || item.createdAt || item.lastLogin);
    const appStatus = item.applicationStatus || item.status || item.accountStatus || 'pending';
    return `<tr><td><div class="candidate-info"><div class="candidate-avatar">${esc(initials(name))}</div><div><div class="candidate-name">${esc(name)}</div><div class="candidate-email">${esc(email)}</div></div></div></td><td>${esc(phone)}</td><td>${esc(stateName)}</td><td>${esc(registered)}</td><td><span class="badge ${badgeClass(appStatus)}">${esc(statusLabel(appStatus))}</span></td><td><button class="action-btn" data-action="view">View</button></td></tr>`;
  }).join('');
  if (tbody) tbody.innerHTML = rows || emptyRow(6, 'No users yet. Firebase user records will appear here automatically.');

  const userCount = document.getElementById('admin-user-count');
  if (userCount) userCount.textContent = `(${state.users.length})`;
}

function saveAdminSettings() {
  const payload = {
    agencyName: document.getElementById('admin-agency-name')?.value || '',
    contactEmail: document.getElementById('admin-contact-email')?.value || '',
    whatsapp: document.getElementById('admin-whatsapp')?.value || '',
    updatedAt: new Date().toISOString(),
    updatedBy: state.currentUser?.email || 'admin',
  };
  set(ref(database, 'adminSettings'), payload)
    .then(() => {
      state.settings = payload;
      showAdminFeedback('Settings saved to Firebase.', 'success');
    })
    .catch((error) => {
      console.error(error);
      showAdminFeedback('Could not save settings to Firebase.', 'error');
    });
}

async function updateAdminPassword() {
  const currentPassword = document.getElementById('admin-current-password')?.value || '';
  const newPassword = document.getElementById('admin-new-password')?.value || '';
  if (!currentPassword || !newPassword) {
    showAdminFeedback('Fill in both password fields first.', 'warning');
    return;
  }
  const user = auth.currentUser;
  if (!user || !user.email) {
    showAdminFeedback('No signed-in admin session found.', 'error');
    return;
  }
  try {
    const cred = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, newPassword);
    document.getElementById('admin-current-password').value = '';
    document.getElementById('admin-new-password').value = '';
    showAdminFeedback('Admin password updated successfully.', 'success');
  } catch (error) {
    console.error(error);
    showAdminFeedback(error?.code === 'auth/wrong-password' ? 'Current password is incorrect.' : 'Password update failed.', 'error');
  }
}

function handleActionButtonClick(btn) {
  const row = btn.closest('tr');
  const action = String(btn.dataset.action || btn.textContent || '').trim().toLowerCase();
  const rowText = row ? row.textContent.replace(/\s+/g, ' ').trim() : '';
  if (action === 'view') return showAdminFeedback(`Viewing record: ${rowText}`, 'info');
  if (action === 'edit') return showAdminFeedback(`Editing item: ${rowText}`, 'info');
  showAdminFeedback(`Action clicked: ${action}`, 'info');
}

window.togglePassword = function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  if (btn) {
    btn.textContent = isPassword ? '🙈' : '👁';
    btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  }
};

window.showTab = function showTab(tabId, navEl) {
  setActiveTab(tabId, navEl);
};

window.filterTable = function filterTable(val) {
  state.appSearch = String(val || '');
  renderApplicationsTable();
};

window.filterStatus = function filterStatus(status, btn) {
  state.appStatus = String(status || 'all').toLowerCase();
  document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderApplicationsTable();
};

window.saveAdminSettings = saveAdminSettings;
window.updateAdminPassword = updateAdminPassword;
window.logoutAdmin = async function logoutAdmin() {
  try {
    await signOut(auth);
  } finally {
    window.location.href = baseUrl + 'login.html';
  }
};

function renderAll() {
  renderAdminIdentity();
  renderUsersTable();
  renderApplicationsTable();
  renderPaymentsTable();
  renderJobsTable();
  renderOverview();
  applyActionHandlers();
}

function applyActionHandlers() {
  document.querySelectorAll('.action-btn').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => handleActionButtonClick(btn));
  });
}

function loadSettingsIntoForm() {
  const s = state.settings || {};
  if (document.getElementById('admin-agency-name')) document.getElementById('admin-agency-name').value = s.agencyName || 'BARICRYSTAL INTERNATIONAL';
  if (document.getElementById('admin-contact-email')) document.getElementById('admin-contact-email').value = s.contactEmail || 'info@baricrystalinternational.com';
  if (document.getElementById('admin-whatsapp')) document.getElementById('admin-whatsapp').value = s.whatsapp || '';
}

function watchFirebase() {
  onValue(ref(database, 'users'), (snap) => {
    state.users = normalizeUsers(snap.val());
    renderAll();
  });

  onValue(ref(database, 'applications'), (snap) => {
    state.applications = toArray(snap.val(), 'id');
    renderAll();
  });

  onValue(ref(database, 'payments'), (snap) => {
    state.payments = toArray(snap.val(), 'id');
    renderAll();
  });

  onValue(ref(database, 'jobs'), (snap) => {
    state.jobs = toArray(snap.val(), 'id');
    renderAll();
  });

  onValue(ref(database, 'adminSettings'), (snap) => {
    state.settings = snap.val() || {};
    loadSettingsIntoForm();
    renderOverview();
  });
}

function boot() {
  const dateEl = document.getElementById('topbar-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = baseUrl + 'login.html';
      return;
    }

    state.currentUser = user;
    renderAdminIdentity();

    const isAdmin = isAdminEmail(user.email);
    if (!isAdmin) {
      try {
        const snap = await get(ref(database, `users/${user.uid}`));
        const role = String(snap.exists() ? snap.val()?.role : '').toLowerCase();
        if (role !== 'admin') {
          window.location.href = baseUrl + 'dashboard.html';
          return;
        }
      } catch (error) {
        console.error(error);
        window.location.href = baseUrl + 'dashboard.html';
        return;
      }
    }

    watchFirebase();
    renderAll();
  });

  if (!document.querySelector('script[data-admin-init]')) {
    const mark = document.createElement('script');
    mark.dataset.adminInit = '1';
    document.head.appendChild(mark);
  }
}

document.addEventListener('DOMContentLoaded', boot);
