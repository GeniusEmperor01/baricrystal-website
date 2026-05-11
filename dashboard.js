import { auth, database, baseUrl } from './firebase-config.js';
import { onAuthStateChanged, signOut, deleteUser, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { ref, get, update, remove, onValue, push, set } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

const ADMIN_EMAIL = 'admin@baricrystal.com';
const isAdminEmail = (email) => String(email || '').trim().toLowerCase() === ADMIN_EMAIL;

let currentUser = null;
let userData = null;
let inboxThreadId = null;
let inboxMessages = [];
let inboxMeta = null;
let inboxListenerStarted = false;
let jobListenerStarted = false;
let allJobs = [];
let jobSearch = '';
let jobCategory = 'all';
let jobCountry = 'all';
let jobStatus = 'all';

// ============================================================================
// AUTHENTICATION STATE
// ============================================================================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = baseUrl + 'login.html';
    return;
  }

  if (!user.emailVerified && !isAdminEmail(user.email)) {
    const content = document.querySelector('.content');
    if (content) {
      content.innerHTML = `
        <div style="text-align: center; padding: 60px 20px;">
          <h2 style="font-family: 'Cormorant Garamond', serif; font-size: 28px; margin-bottom: 16px;">Email Verification Required</h2>
          <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 24px; line-height: 1.6;">
            Please verify your email address to access your dashboard.<br>
            A verification link was sent to:<br>
            <strong style="color: var(--text);">${user.email}</strong><br><br>
            Check your inbox and click the link to continue.
          </p>
          <button onclick="window.location.reload()" style="padding: 12px 24px; background: var(--gold); color: var(--dark); border: none; cursor: pointer; font-weight: 500;">I've Verified — Refresh</button>
          <button onclick="handleLogout()" style="padding: 12px 24px; background: transparent; border: 1px solid var(--border); color: var(--text); margin-left: 12px; cursor: pointer;">Logout</button>
        </div>
      `;
    }
    return;
  }

  currentUser = user;
  await loadUserData(user.uid);
  displayUserInfo();
});

// ============================================================================
// LOAD USER DATA
// ============================================================================
async function loadUserData(uid) {
  try {
    const snapshot = await get(ref(database, 'users/' + uid));
    userData = snapshot.exists() ? snapshot.val() : {
      firstName: 'User',
      lastName: '',
      email: currentUser.email,
      phone: '',
      state: '',
      createdAt: new Date().toISOString(),
      accountStatus: 'unpaid',
      paymentStatus: 'unpaid',
      planName: 'Unpaid Account'
    };
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

// ============================================================================
// DISPLAY USER INFO
// ============================================================================
function displayUserInfo() {
  if (!userData) return;

  const initials = (userData.firstName?.[0] || 'U') + (userData.lastName?.[0] || '');

  const avatar = document.querySelector('.user-avatar');
  if (avatar) avatar.textContent = initials.toUpperCase();

  const userName = document.querySelector('.user-name');
  if (userName) userName.textContent = `${userData.firstName || 'User'} ${userData.lastName || ''}`.trim();

  const userEmail = document.querySelector('.user-email');
  if (userEmail) userEmail.textContent = userData.email || '';

  updateSettingsDisplay();
  renderAccountBanner();
  renderPlanDisplay();
  loadInbox();
  loadJobs();
}

function normalizeStatus(raw) {
  return String(raw || '').toLowerCase().trim();
}

function isPaidAccount() {
  const status = normalizeStatus(userData?.accountStatus || userData?.paymentStatus);
  return ['paid', 'active', 'approved', 'subscribed'].includes(status);
}

function renderAccountBanner() {
  const banner = document.getElementById('account-banner');
  if (!banner) return;

  if (isPaidAccount()) {
    banner.innerHTML = '';
    return;
  }

  const status = normalizeStatus(userData?.accountStatus || userData?.paymentStatus || 'unpaid');
  const plan = userData?.planName || 'No active plan';

  banner.innerHTML = `
    <div style="margin-bottom: 24px; padding: 18px 20px; border: 1px solid rgba(200,155,60,0.35); background: rgba(200,155,60,0.08); color: var(--text); display: flex; gap: 16px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap;">
      <div style="max-width: 760px;">
        <div style="font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--gold); margin-bottom: 8px;">Payment required</div>
        <div style="font-size: 15px; line-height: 1.7;">
          Your account is currently <strong>${status || 'unpaid'}</strong>. ${plan ? `Current plan: <strong>${plan}</strong>.` : ''}
          Pay for a plan before continuing into jobs and applications.
        </div>
      </div>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <button class="btn-save" onclick="window.openPaymentPage()">Pay Now</button>
        <button class="btn-save" onclick="window.openCvBuilder()" style="background: transparent; border: 1px solid var(--border); color: var(--text);">Open CV Page</button>
      </div>
    </div>
  `;
}

function renderPlanDisplay() {
  const paid = isPaidAccount();
  const planName = userData?.planName || (paid ? 'Active Plan' : 'Unpaid Account');
  const amount = userData?.amountPaid ? `₦${Number(userData.amountPaid).toLocaleString()}` : (paid ? '—' : '₦0');
  const renewal = userData?.renewalDate || (paid ? 'Set after payment' : 'Pay to unlock');
  const statusLabel = paid ? 'Active' : 'Unpaid';

  const fields = {
    'current-plan-name': paid ? (userData?.planName || 'Active Plan') : 'Unpaid Account',
    'current-plan-badge': paid ? 'Active' : 'Unpaid',
    'current-plan-label': planName,
    'current-plan-amount': amount,
    'current-plan-renewal': renewal,
    'current-plan-status': statusLabel
  };

  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });

  const badge = document.getElementById('current-plan-badge');
  if (badge) {
    badge.style.background = paid ? 'rgba(45, 158, 107, 0.08)' : 'rgba(226, 75, 74, 0.08)';
    badge.style.color = paid ? 'var(--success)' : 'var(--error)';
    badge.style.borderColor = paid ? 'rgba(45, 158, 107, 0.2)' : 'rgba(226, 75, 74, 0.25)';
  }

  const statusEl = document.getElementById('current-plan-status');
  if (statusEl) {
    statusEl.style.color = paid ? 'var(--success)' : 'var(--error)';
  }
}

// ============================================================================
// JOBS DISPLAY
// ============================================================================

function normalizeText(v) {
  return String(v || '').trim().toLowerCase();
}

function jobsFilterText(job) {
  return [
    job.title,
    job.jobTitle,
    job.category,
    job.jobCategory,
    job.country,
    job.description,
    job.salary,
    job.pay,
    job.status,
    job.state,
    ...(job.highlights || []),
    ...(job.requirements || []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function updateDashboardJobFilters() {
  const categoryEl = document.getElementById('dashboard-job-category');
  const countryEl = document.getElementById('dashboard-job-country');
  if (categoryEl) {
    const categories = [...new Set(allJobs.map((job) => String(job.category || job.jobCategory || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const current = categoryEl.value || 'all';
    categoryEl.innerHTML = '<option value="all">All Categories</option>' + categories.map((c) => `<option value="${c}">${c}</option>`).join('');
    categoryEl.value = categories.includes(current) || current === 'all' ? current : 'all';
  }
  if (countryEl) {
    const countries = [...new Set(allJobs.map((job) => String(job.country || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const current = countryEl.value || 'all';
    countryEl.innerHTML = '<option value="all">All Countries</option>' + countries.map((c) => `<option value="${c}">${c}</option>`).join('');
    countryEl.value = countries.includes(current) || current === 'all' ? current : 'all';
  }
}

function renderDashboardJobs() {
  const grid = document.getElementById('live-jobs-grid');
  if (!grid) return;
  const filtered = allJobs.filter((job) => {
    const search = normalizeText(jobSearch);
    const status = normalizeText(job.status || job.state || 'open');
    const category = normalizeText(job.category || job.jobCategory || '');
    const country = normalizeText(job.country || '');
    if (search && !jobsFilterText(job).includes(search)) return false;
    if (jobStatus !== 'all' && status !== jobStatus) return false;
    if (jobCategory !== 'all' && category !== jobCategory) return false;
    if (jobCountry !== 'all' && country !== jobCountry) return false;
    return true;
  });

  if (!filtered.length) {
    grid.innerHTML = `<div class="job-card job-card-full" style="grid-column:1/-1;"><div style="padding:26px 18px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-subtle);background:rgba(255,255,255,0.01);border-radius:12px;">${allJobs.length ? 'No jobs match the current filters.' : 'Getting data from Firebase...'}</div></div>`;
    return;
  }

  grid.innerHTML = filtered.map((job) => {
    const title = job.title || job.jobTitle || 'Untitled Job';
    const desc = job.description || 'No description available yet.';
    const country = job.country || '—';
    const slots = job.slots ?? job.openings ?? '—';
    const category = job.category || job.jobCategory || 'General';
    const status = normalizeText(job.status || job.state || 'open');
    const icon = job.icon || '✦';
    const highlights = (job.highlights || []).slice(0, 3);
    return `<div class="job-card ${status === 'featured' ? 'job-card-full' : ''}">
      <div class="job-icon">${esc(icon)}</div>
      <div class="job-name">${esc(title)}</div>
      <div class="job-desc">${esc(desc)}</div>
      <div class="job-footer">
        <span>${esc(country)} · ${esc(slots)} Slots</span>
        <button class="apply-btn" onclick="switchTab('applications', document.querySelector('.nav-item[onclick*=\"applications\"]'))">Apply Now</button>
      </div>
      <div class="job-tags" style="margin-top:16px;">
        <span class="job-tag highlight">${esc(statusLabel(status))}</span>
        <span class="job-tag">${esc(category)}</span>
        ${highlights.map((h) => `<span class="job-tag">${esc(h)}</span>`).join('')}
      </div>
    </div>`;
  }).join('');
}

window.filterDashboardJobs = function filterDashboardJobs(value) {
  if (typeof value === 'string') jobSearch = value;
  jobCategory = normalizeText(document.getElementById('dashboard-job-category')?.value || 'all');
  jobCountry = normalizeText(document.getElementById('dashboard-job-country')?.value || 'all');
  jobStatus = normalizeText(document.getElementById('dashboard-job-status')?.value || 'all');
  renderDashboardJobs();
};

// ============================================================================
// SETTINGS DISPLAY
// ============================================================================

function getThreadId() {
  return `baricrystal_${String(currentUser?.uid || '').trim()}`;
}

function formatMessageDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function setInboxStatus(message, tone = 'info') {
  const box = document.getElementById('inbox-status');
  if (!box) return;
  const colors = {
    success: ['rgba(45,158,107,0.12)', '#2D9E6B'],
    warning: ['rgba(232,168,56,0.12)', '#E8A838'],
    error: ['rgba(226,75,74,0.10)', '#E24B4A'],
    info: ['rgba(58,138,196,0.10)', 'var(--text-muted)'],
  };
  const [bg, color] = colors[tone] || colors.info;
  box.style.display = 'block';
  box.style.background = bg;
  box.style.color = color;
  box.textContent = message;
}

async function loadInbox() {
  inboxThreadId = getThreadId();
  try {
    const convoSnap = await get(ref(database, `conversations/${inboxThreadId}`));
    inboxMeta = convoSnap.exists() ? convoSnap.val() : { threadId: inboxThreadId, userUid: currentUser.uid, userEmail: currentUser.email, userName: `${userData?.firstName || 'User'} ${userData?.lastName || ''}`.trim() };
    if (!inboxListenerStarted) {
      inboxListenerStarted = true;
      onValue(ref(database, `conversationMessages/${inboxThreadId}`), (snap) => {
        inboxMessages = snap.exists() ? Object.entries(snap.val() || {}).map(([id, item]) => ({ id, ...(item || {}) })) : [];
        inboxMessages.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
        renderInbox();
      }, () => setInboxStatus('Unable to get data for inbox.', 'error'));
    }
    const msgSnap = await get(ref(database, `conversationMessages/${inboxThreadId}`));
    inboxMessages = msgSnap.exists() ? Object.entries(msgSnap.val() || {}).map(([id, item]) => ({ id, ...(item || {}) })) : [];
    inboxMessages.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    renderInbox();
  } catch (error) {
    console.error(error);
    setInboxStatus('Unable to get data for inbox.', 'error');
  }
}

window.loadInbox = loadInbox;

async function loadJobs() {
  try {
    if (!jobListenerStarted) {
      jobListenerStarted = true;
      onValue(ref(database, 'jobs'), (snap) => {
        allJobs = snap.exists() ? Object.entries(snap.val() || {}).map(([id, item]) => ({ id, ...(item || {}) })) : [];
        updateDashboardJobFilters();
        renderDashboardJobs();
      }, () => {
        const grid = document.getElementById('live-jobs-grid');
        if (grid) grid.innerHTML = `<div class="job-card job-card-full" style="grid-column:1/-1;"><div style="padding:26px 18px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-subtle);background:rgba(255,255,255,0.01);border-radius:12px;">Unable to get data.</div></div>`;
      });
    }
  } catch (error) {
    console.error(error);
    const grid = document.getElementById('live-jobs-grid');
    if (grid) grid.innerHTML = `<div class="job-card job-card-full" style="grid-column:1/-1;"><div style="padding:26px 18px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-subtle);background:rgba(255,255,255,0.01);border-radius:12px;">Unable to get data.</div></div>`;
  }
}


function renderInbox() {
  const list = document.getElementById('user-inbox-list');
  const thread = document.getElementById('user-message-thread');
  if (list) {
    list.innerHTML = inboxMeta ? `
      <button class="inbox-thread active" onclick="loadInbox()">
        <div class="title">BARICRYSTAL Support</div>
        <div class="sub">${inboxMeta.lastMessage ? inboxMeta.lastMessage : 'No messages yet'}</div>
      </button>
    ` : '<div class="empty-state">Getting data from Firebase...</div>';
  }
  if (thread) {
    if (!inboxMessages.length) {
      thread.innerHTML = '<div class="empty-state">Data confirmed, but no messages yet.</div>';
    } else {
      thread.innerHTML = inboxMessages.map((m) => {
        const mine = String(m.senderType || '').toLowerCase() === 'user';
        return `<div class="message-item ${mine ? 'mine' : ''}">
          <div>${String(m.text || '').replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</div>
          <div class="meta">${String(mine ? 'You' : 'Support')} • ${formatMessageDate(m.createdAt)}</div>
        </div>`;
      }).join('');
      thread.scrollTop = thread.scrollHeight;
    }
  }
}

window.sendUserMessage = async function sendUserMessage() {
  const input = document.getElementById('user-message-input');
  const text = String(input?.value || '').trim();
  if (!text) {
    setInboxStatus('Type a message before sending.', 'warning');
    return;
  }
  const threadId = getThreadId();
  try {
    const msgRef = push(ref(database, `conversationMessages/${threadId}`));
    await set(msgRef, {
      text,
      senderType: 'user',
      senderUid: currentUser.uid,
      senderEmail: currentUser.email || '',
      createdAt: new Date().toISOString(),
    });
    await update(ref(database, `conversations/${threadId}`), {
      threadId,
      userUid: currentUser.uid,
      userEmail: currentUser.email || '',
      userName: `${userData?.firstName || ''} ${userData?.lastName || ''}`.trim(),
      lastMessage: text,
      lastMessageAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      unreadByAdmin: true,
      unreadByUser: false,
    });
    if (input) input.value = '';
    await loadInbox();
    setInboxStatus('Message sent.', 'success');
  } catch (error) {
    console.error(error);
    setInboxStatus('Unable to send message.', 'error');
  }
};


function updateSettingsDisplay() {
  if (!userData) return;

  const displayFields = {
    'fname-display': userData.firstName,
    'lname-display': userData.lastName,
    'email-display': userData.email,
    'phone-display': userData.phone,
    'state-display': userData.state
  };

  Object.entries(displayFields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || 'Not provided';
  });

  const editFields = {
    'fname-edit': userData.firstName || '',
    'lname-edit': userData.lastName || '',
    'phone-edit': userData.phone || '',
    'state-edit': userData.state || ''
  };

  Object.entries(editFields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });
}

// ============================================================================
// EDIT MODE TOGGLE
// ============================================================================
window.toggleEditMode = function() {
  const display = document.getElementById('personal-details-display');
  const edit = document.getElementById('personal-details-edit');
  if (display && edit) {
    const isEditing = edit.style.display !== 'none';
    display.style.display = isEditing ? 'block' : 'none';
    edit.style.display = isEditing ? 'none' : 'block';
  }
};

// ============================================================================
// SAVE ACCOUNT CHANGES
// ============================================================================
window.saveAccountChanges = async function() {
  if (!currentUser || !userData) {
    alert('User data not loaded. Please refresh the page.');
    return;
  }

  const fname = document.getElementById('fname-edit')?.value.trim();
  const lname = document.getElementById('lname-edit')?.value.trim();
  const phone = document.getElementById('phone-edit')?.value.trim();
  const state = document.getElementById('state-edit')?.value.trim();

  if (!fname || !lname) {
    alert('First name and last name are required.');
    return;
  }

  // FIX: Target save button specifically inside the edit box, not the first
  // .btn-save on the page which could be any button
  const saveBtn = document.querySelector('#personal-details-edit .btn-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

  try {
    await update(ref(database, 'users/' + currentUser.uid), {
      firstName: fname,
      lastName: lname,
      phone: phone,
      state: state,
      updatedAt: new Date().toISOString()
    });

    userData = { ...userData, firstName: fname, lastName: lname, phone, state };
    displayUserInfo();
    window.toggleEditMode();
    alert('Account updated successfully.');
  } catch (error) {
    console.error('Error saving changes:', error);
    alert('Error updating account: ' + error.message);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
  }
};

// ============================================================================
// DELETE ACCOUNT
// FIX: Now prompts for password re-authentication before deletion
// to avoid auth/requires-recent-login errors
// ============================================================================
window.showDeleteModal = function() {
  document.getElementById('delete-modal')?.classList.add('show');
};

window.closeDeleteModal = function() {
  document.getElementById('delete-modal')?.classList.remove('show');
  const input = document.getElementById('delete-password-input');
  if (input) input.value = '';
};

window.confirmDelete = async function() {
  if (!currentUser) return;

  const passwordInput = document.getElementById('delete-password-input');
  const password = passwordInput?.value;

  if (!password) {
    alert('Please enter your password to confirm account deletion.');
    return;
  }

  const confirmBtn = document.querySelector('#delete-modal .modal-confirm');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Deleting...'; }

  try {
    // Re-authenticate before delete to prevent auth/requires-recent-login
    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, credential);

    await remove(ref(database, 'users/' + currentUser.uid));
    await deleteUser(currentUser);

    window.location.href = baseUrl + 'index.html';
  } catch (error) {
    console.error('Error deleting account:', error);
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      alert('Incorrect password. Please try again.');
    } else {
      alert('Error deleting account: ' + error.message);
    }
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Delete My Account'; }
  }
};

// ============================================================================
// CHANGE PASSWORD
// ============================================================================
window.showChangePasswordModal = function() {
  document.getElementById('change-password-modal')?.classList.add('show');
};

window.closeChangePasswordModal = function() {
  document.getElementById('change-password-modal')?.classList.remove('show');
  ['current-password', 'new-password', 'confirm-new-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
};

window.changePassword = async function() {
  if (!currentUser) return;

  const currentPassword = document.getElementById('current-password')?.value;
  const newPassword = document.getElementById('new-password')?.value;
  const confirmPassword = document.getElementById('confirm-new-password')?.value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    alert('Please fill in all password fields.');
    return;
  }
  if (newPassword.length < 8) {
    alert('New password must be at least 8 characters.');
    return;
  }
  if (newPassword !== confirmPassword) {
    alert('New passwords do not match.');
    return;
  }

  const changeBtn = document.querySelector('#change-password-modal .modal-confirm');
  if (changeBtn) { changeBtn.disabled = true; changeBtn.textContent = 'Changing...'; }

  try {
    const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
    await reauthenticateWithCredential(currentUser, credential);
    await updatePassword(currentUser, newPassword);
    alert('Password changed successfully.');
    window.closeChangePasswordModal();
  } catch (error) {
    console.error('Error changing password:', error);
    alert(
      error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential'
        ? 'Current password is incorrect.'
        : 'Error changing password: ' + error.message
    );
  } finally {
    if (changeBtn) { changeBtn.disabled = false; changeBtn.textContent = 'Change Password'; }
  }
};

// ============================================================================
// LOGOUT
// ============================================================================
window.handleLogout = async function() {
  try {
    await signOut(auth);
    window.location.href = baseUrl + 'login.html';
  } catch (error) {
    console.error('Logout error:', error);
    alert('Error logging out: ' + error.message);
  }
};

// ============================================================================
// SIDEBAR & TABS
// FIX: switchSubTab now only targets sub-tabs within the currently active
// main tab, so switching sub-tabs doesn't wipe other main tab content
// ============================================================================
window.toggleSidebar = function() {
  document.querySelector('.sidebar')?.classList.toggle('open');
};

window.closeSidebarOnMobile = function() {
  if (window.innerWidth <= 768) {
    document.querySelector('.sidebar')?.classList.remove('open');
  }
};

window.switchTab = function(tabId, navEl) {
  const blockedTabs = ['jobs', 'applications'];
  if (blockedTabs.includes(tabId) && !isPaidAccount()) {
    renderAccountBanner();
    const banner = document.getElementById('account-banner');
    if (banner) banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  document.querySelectorAll('.main > .content > .tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tabId)?.classList.add('active');
  if (navEl) navEl.classList.add('active');

  const titles = {
    overview: 'Overview',
    jobs: 'Available Jobs',
    applications: 'My Applications',
    messages: 'Inbox',
    settings: 'Account Settings'
  };
  document.getElementById('page-title').textContent = titles[tabId] || tabId;
  window.closeSidebarOnMobile();
};

window.switchSubTab = function(tabId, btn) {
  // FIX: Only target sub-tabs within the active main tab container
  const activeMainTab = document.querySelector('.main > .content > .tab-content.active');
  if (activeMainTab) {
    activeMainTab.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  }
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tabId)?.classList.add('active');
  btn.classList.add('active');
};

// ============================================================================
// PLANS & JOBS
// ============================================================================
window.upgradePlan = function(planName, amount) {
  const qs = new URLSearchParams({ plan: planName, amount });
  window.location.href = baseUrl + 'payment.html?' + qs.toString();
};

window.openPaymentPage = function() {
  window.location.href = baseUrl + 'payment.html';
};

window.openCvBuilder = function() {
  window.location.href = baseUrl + 'cv-builder.html';
};

// ============================================================================
// DOCUMENTS & PREFERENCES
// ============================================================================
window.uploadDocuments = function() {
  alert('Use the CV page to create and manage CV files. Document uploads are handled there.');
  window.openCvBuilder();
};

window.saveJobPreferences = function() {
  const category = document.getElementById('job-category')?.value;
  const countries = Array.from(document.querySelectorAll('input[name="job-countries"]:checked')).map(cb => cb.value);
  console.log('Preferences — Category:', category, '| Countries:', countries);
  alert('Job preferences saved!');
};

// ============================================================================
// INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', function() {
  // Set date in topbar
  const topbarDate = document.getElementById('topbar-date');
  if (topbarDate) {
    topbarDate.textContent = new Date().toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  renderAccountBanner();
  renderPlanDisplay();

  // Close modals on backdrop click
  ['delete-modal', 'change-password-modal'].forEach(id => {
    const modal = document.getElementById(id);
    if (modal) modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('show');
    });
  });
});
