// Firebase configuration and initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, deleteUser, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getDatabase, ref, get, update, remove } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2Z3nEWjxrpIeiD0CQiCCWtrPf_A6tys4",
  authDomain: "baricrystal-auth.firebaseapp.com",
  databaseURL: "https://baricrystal-auth-default-rtdb.firebaseio.com",
  projectId: "baricrystal-auth",
  storageBucket: "baricrystal-auth.firebasestorage.app",
  messagingSenderId: "766524714838",
  appId: "1:766524714838:web:2774d97067139b585fb0f7",
  measurementId: "G-958DK8D2QL"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
const analytics = getAnalytics(app);

let currentUser = null;
let userData = null;

// ============================================================================
// AUTHENTICATION STATE MONITORING
// ============================================================================

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // User is not authenticated, redirect to login
    console.log('No authenticated user, redirecting to login');
    window.location.href = 'login.html';
    return;
  }

  // Check if email is verified
  if (!user.emailVerified) {
    console.warn('Email not verified. User must verify email first.');
    // Show verification pending message
    const content = document.querySelector('.content');
    if (content) {
      content.innerHTML = `
        <div style="text-align: center; padding: 60px 20px;">
          <h2 style="font-family: 'Cormorant Garamond', serif; font-size: 28px; margin-bottom: 16px;">Email Verification Required</h2>
          <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 24px; line-height: 1.6;">
            Please verify your email address to access your dashboard. A verification email has been sent to:<br>
            <strong style="color: var(--text);">${user.email}</strong><br><br>
            Check your inbox and click the verification link to continue.
          </p>
          <button onclick="window.location.reload()" style="padding: 12px 24px; background: var(--gold); color: var(--dark); border: none; cursor: pointer; font-weight: 500;">Refresh</button>
          <button onclick="handleLogout()" style="padding: 12px 24px; background: transparent; border: 1px solid var(--border); color: var(--text); margin-left: 12px; cursor: pointer;">Logout</button>
        </div>
      `;
    }
    return;
  }

  currentUser = user;
  console.log('Authenticated user:', user.uid);
  
  // Load user data from database
  await loadUserData(user.uid);
  displayUserInfo();
});

// ============================================================================
// LOAD USER DATA
// ============================================================================

async function loadUserData(uid) {
  try {
    const userRef = ref(database, 'users/' + uid);
    const snapshot = await get(userRef);

    if (snapshot.exists()) {
      userData = snapshot.val();
      console.log('User data loaded:', userData);
    } else {
      console.warn('No user data found in database for UID:', uid);
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

  // Update user avatar with initials
  const userAvatar = document.querySelector('.user-avatar');
  if (userAvatar) {
    const initials = (userData.firstName?.[0] || 'U') + (userData.lastName?.[0] || '');
    userAvatar.textContent = initials.toUpperCase();
  }

  // Update user name in sidebar
  const userName = document.querySelector('.user-name');
  if (userName) {
    userName.textContent = `${userData.firstName || 'User'} ${userData.lastName || ''}`.trim();
  }

  // Update user email in sidebar
  const userEmail = document.querySelector('.user-email');
  if (userEmail) {
    userEmail.textContent = userData.email || '';
  }

  // Update settings form fields
  updateSettingsDisplay();
}

// ============================================================================
// UPDATE SETTINGS DISPLAY
// ============================================================================

function updateSettingsDisplay() {
  if (!userData) return;

  // Display current values
  const settingsFields = {
    'fname-display': userData.firstName || '',
    'lname-display': userData.lastName || '',
    'email-display': userData.email || '',
    'phone-display': userData.phone || '',
    'state-display': userData.state || ''
  };

  Object.entries(settingsFields).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value || 'Not provided';
    }
  });

  // Set form field values for editing
  const editFields = {
    'fname-edit': userData.firstName || '',
    'lname-edit': userData.lastName || '',
    'phone-edit': userData.phone || '',
    'state-edit': userData.state || ''
  };

  Object.entries(editFields).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.value = value;
    }
  });
}

// ============================================================================
// TOGGLE EDIT MODE
// ============================================================================

window.toggleEditMode = function() {
  const displayBox = document.getElementById('personal-details-display');
  const editBox = document.getElementById('personal-details-edit');
  
  if (displayBox && editBox) {
    displayBox.style.display = displayBox.style.display === 'none' ? 'block' : 'none';
    editBox.style.display = editBox.style.display === 'none' ? 'block' : 'none';
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

  const saveBtn = document.querySelector('.btn-save');
  const originalText = saveBtn?.textContent;

  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    // Update user data in database
    const userRef = ref(database, 'users/' + currentUser.uid);
    await update(userRef, {
      firstName: fname,
      lastName: lname,
      phone: phone,
      state: state,
      updatedAt: new Date().toISOString()
    });

    // Update local userData
    userData.firstName = fname;
    userData.lastName = lname;
    userData.phone = phone;
    userData.state = state;

    // Refresh display
    displayUserInfo();

    // Show success message
    alert('Your account information has been updated successfully.');

  } catch (error) {
    console.error('Error saving changes:', error);
    alert('Error updating account: ' + error.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  }
};

// ============================================================================
// ACCOUNT DELETION
// ============================================================================

window.showDeleteModal = function() {
  const modal = document.getElementById('delete-modal');
  if (modal) {
    modal.classList.add('show');
  }
};

window.closeDeleteModal = function() {
  const modal = document.getElementById('delete-modal');
  if (modal) {
    modal.classList.remove('show');
  }
};

window.confirmDelete = async function() {
  if (!currentUser) {
    alert('User not found.');
    return;
  }

  const confirmBtn = document.querySelector('.modal-confirm');
  const originalText = confirmBtn?.textContent;

  try {
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Deleting...';
    }

    // Delete user data from Realtime Database
    const userRef = ref(database, 'users/' + currentUser.uid);
    await remove(userRef);

    console.log('User data deleted from database');

    // Delete user from Firebase Auth
    await deleteUser(currentUser);

    console.log('User account deleted from Firebase Auth');

    // Redirect to homepage
    alert('Your account has been deleted successfully. Redirecting to homepage...');
    window.location.href = 'index.html';

  } catch (error) {
    console.error('Error deleting account:', error);

    if (error.code === 'auth/requires-recent-login') {
      alert('For security reasons, please log out and log back in before deleting your account.');
      window.location.href = 'login.html';
    } else {
      alert('Error deleting account: ' + error.message);
    }

    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = originalText;
    }
  }
};

// ============================================================================
// PASSWORD MANAGEMENT
// ============================================================================

window.showChangePasswordModal = function() {
  const modal = document.getElementById('change-password-modal');
  if (modal) {
    modal.classList.add('show');
  }
};

window.closeChangePasswordModal = function() {
  const modal = document.getElementById('change-password-modal');
  if (modal) {
    modal.classList.remove('show');
    // Clear form
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-new-password').value = '';
  }
};

window.changePassword = async function() {
  if (!currentUser) {
    alert('User not found.');
    return;
  }

  const currentPassword = document.getElementById('current-password')?.value;
  const newPassword = document.getElementById('new-password')?.value;
  const confirmPassword = document.getElementById('confirm-new-password')?.value;
  const changeBtn = document.querySelector('.modal-confirm[onclick*="changePassword"]');

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

  try {
    if (changeBtn) {
      changeBtn.disabled = true;
      changeBtn.textContent = 'Changing...';
    }

    // Reauthenticate user with current password
    const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
    await reauthenticateWithCredential(currentUser, credential);

    // Update password
    await updatePassword(currentUser, newPassword);

    console.log('Password changed successfully');
    alert('Your password has been changed successfully.');
    window.closeChangePasswordModal();

  } catch (error) {
    console.error('Error changing password:', error);
    if (error.code === 'auth/wrong-password') {
      alert('Current password is incorrect.');
    } else {
      alert('Error changing password: ' + error.message);
    }
  } finally {
    if (changeBtn) {
      changeBtn.disabled = false;
      changeBtn.textContent = 'Change Password';
    }
  }
};

// ============================================================================
// LOGOUT
// ============================================================================

window.handleLogout = async function() {
  try {
    await signOut(auth);
    console.log('User logged out');
    window.location.href = 'login.html';
  } catch (error) {
    console.error('Error logging out:', error);
    alert('Error logging out: ' + error.message);
  }
};

// ============================================================================
// SIDEBAR AND TAB MANAGEMENT
// ============================================================================

window.toggleSidebar = function() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.classList.toggle('open');
  }
};

window.closeSidebarOnMobile = function() {
  if (window.innerWidth <= 768) {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.classList.remove('open');
    }
  }
};

window.switchTab = function(tabId, navEl) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const tabElement = document.getElementById('tab-' + tabId);
  if (tabElement) {
    tabElement.classList.add('active');
  }

  if (navEl) {
    navEl.classList.add('active');
  }

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
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.remove('active');
  });

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('tab-' + tabId).classList.add('active');
  btn.classList.add('active');
};

// ============================================================================
// PLANS AND JOBS
// ============================================================================

window.upgradePlan = function(planName, amount) {
  alert('Redirecting to payment for ' + planName + ' plan (₦' + amount + ')');
  // window.location.href = 'payment.html';
};

// ============================================================================
// DOCUMENTS UPLOAD (PLACEHOLDER)
// ============================================================================

window.uploadDocuments = function() {
  const cvFile = document.getElementById('cv-upload')?.files[0];
  const passportFile = document.getElementById('passport-upload')?.files[0];
  const otherFile = document.getElementById('other-upload')?.files[0];

  if (!cvFile && !passportFile && !otherFile) {
    alert('Please select at least one document to upload.');
    return;
  }

  alert('Documents uploaded successfully!');
  // TODO: Send files to backend for storage
};

window.saveJobPreferences = function() {
  const categorySelect = document.getElementById('job-category');
  const countryCheckboxes = document.querySelectorAll('input[name="job-countries"]:checked');

  if (categorySelect) {
    console.log('Preferred job category:', categorySelect.value);
  }

  console.log('Selected countries:', Array.from(countryCheckboxes).map(cb => cb.value));
  alert('Job preferences saved!');
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
  // Set date
  const topbarDate = document.getElementById('topbar-date');
  if (topbarDate) {
    topbarDate.textContent = new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  // File upload handling
  const cvUpload = document.getElementById('cv-upload');
  if (cvUpload) {
    cvUpload.addEventListener('change', function() {
      console.log('CV file selected:', this.files[0]?.name);
    });
  }

  const passportUpload = document.getElementById('passport-upload');
  if (passportUpload) {
    passportUpload.addEventListener('change', function() {
      console.log('Passport file selected:', this.files[0]?.name);
    });
  }

  const otherUpload = document.getElementById('other-upload');
  if (otherUpload) {
    otherUpload.addEventListener('change', function() {
      console.log('Other documents file selected:', this.files[0]?.name);
    });
  }

  // Close delete modal when clicking outside
  const deleteModal = document.getElementById('delete-modal');
  if (deleteModal) {
    deleteModal.addEventListener('click', function(e) {
      if (e.target === this) {
        window.closeDeleteModal();
      }
    });
  }
});
