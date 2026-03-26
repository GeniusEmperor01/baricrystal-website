import { auth, database, baseUrl } from './firebase-config.js';
import { onAuthStateChanged, signOut, deleteUser, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { ref, get, update, remove } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

let currentUser = null;
let userData = null;

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
    if (snapshot.exists()) {
      userData = snapshot.val();
    } else {
      userData = {
        firstName: 'User',
        lastName: '',
        email: currentUser.email,
        phone: '',
        state: '',
        createdAt: new Date().toISOString()
      };
    }
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
  const el = (id) => document.querySelector(id);

  const avatar = el('.user-avatar');
  if (avatar) avatar.textContent = initials.toUpperCase();

  const userName = el('.user-name');
  if (userName) userName.textContent = `${userData.firstName || 'User'} ${userData.lastName || ''}`.trim();

  const userEmail = el('.user-email');
  if (userEmail) userEmail.textContent = userData.email || '';

  updateSettingsDisplay();
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
  }
};

// ============================================================================
// DELETE ACCOUNT
// ============================================================================
window.showDeleteModal = function() {
  document.getElementById('delete-modal')?.classList.add('show');
};

window.closeDeleteModal = function() {
  document.getElementById('delete-modal')?.classList.remove('show');
};

window.confirmDelete = async function() {
  if (!currentUser) return;

  const confirmBtn = document.querySelector('#delete-modal .modal-confirm');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Deleting...'; }

  try {
    await remove(ref(database, 'users/' + currentUser.uid));
    await deleteUser(currentUser);
    window.location.href = baseUrl + 'index.html';
  } catch (error) {
    console.error('Error deleting account:', error);
    if (error.code === 'auth/requires-recent-login') {
      alert('Please log out and log back in before deleting your account.');
      window.location.href = baseUrl + 'login.html';
    } else {
      alert('Error deleting account: ' + error.message);
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Delete My Account'; }
    }
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
    alert(error.code === 'auth/wrong-password'
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
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
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
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tabId)?.classList.add('active');
  btn.classList.add('active');
};

// ============================================================================
// PLANS & JOBS
// ============================================================================
window.upgradePlan = function(planName, amount) {
  alert('Redirecting to payment for ' + planName + ' plan (₦' + amount + ')');
};

// ============================================================================
// DOCUMENTS & PREFERENCES
// ============================================================================
window.uploadDocuments = function() {
  const cv = document.getElementById('cv-upload')?.files[0];
  const passport = document.getElementById('passport-upload')?.files[0];
  const other = document.getElementById('other-upload')?.files[0];

  if (!cv && !passport && !other) {
    alert('Please select at least one document to upload.');
    return;
  }
  alert('Documents uploaded successfully!');
};

window.saveJobPreferences = function() {
  const category = document.getElementById('job-category')?.value;
  const countries = Array.from(document.querySelectorAll('input[name="job-countries"]:checked')).map(cb => cb.value);
  console.log('Preferences saved — Category:', category, '| Countries:', countries);
  alert('Job preferences saved!');
};

// ============================================================================
// INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', function() {
  const topbarDate = document.getElementById('topbar-date');
  if (topbarDate) {
    topbarDate.textContent = new Date().toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  // File input change feedback
  [['cv-upload', 'cv-status'], ['passport-upload', 'passport-status'], ['other-upload', 'other-status']].forEach(([inputId, statusId]) => {
    const input = document.getElementById(inputId);
    const status = document.getElementById(statusId);
    if (input && status) {
      input.addEventListener('change', function() {
        status.textContent = this.files[0] ? '✓ ' + this.files[0].name : '';
      });
    }
  });

  // Close modals on backdrop click
  ['delete-modal', 'change-password-modal'].forEach(id => {
    const modal = document.getElementById(id);
    if (modal) modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('show');
    });
  });
});