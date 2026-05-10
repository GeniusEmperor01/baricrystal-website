import { auth, database, baseUrl } from './firebase-config.js';
import { onAuthStateChanged, signOut, deleteUser, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { ref, get, update, remove } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

let currentUser = null;
let userData = null;

function isSandboxPaymentActive() {
  return localStorage.getItem('baricrystal_payment_sandbox_status') === 'paid';
}

// ============================================================================
// AUTHENTICATION STATE
// ============================================================================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = baseUrl + 'login.html';
    return;
  }

  if (!user.emailVerified) {
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
}

function normalizeStatus(raw) {
  return String(raw || '').toLowerCase().trim();
}

function isPaidAccount() {
  if (isSandboxPaymentActive()) return true;
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
          ${isSandboxPaymentActive() ? '<br><span style="color: var(--success);">Sandbox payment is active on this browser.</span>' : ''}
        </div>
      </div>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <button class="btn-save" onclick="window.openPaymentPage()">Pay Now</button>
        <button class="btn-save" onclick="window.openSandboxPaymentPage()" style="background: transparent; border: 1px solid rgba(45,158,107,0.4); color: var(--success);">Test Payment</button>
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
// SETTINGS DISPLAY
// ============================================================================
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

window.openSandboxPaymentPage = function() {
  window.location.href = baseUrl + 'payment.html?sandbox=1';
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
