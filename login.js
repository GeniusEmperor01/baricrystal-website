import { auth, database, baseUrl } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

const errorMsg = document.getElementById('error-msg');
const submitBtn = document.getElementById('login-btn');

// ============================================================================
// AUTH STATE
// FIX: Only redirect verified users — unverified sessions are ignored
// ============================================================================
onAuthStateChanged(auth, (user) => {
  if (user && user.emailVerified) {
    window.location.href = baseUrl + 'dashboard.html';
  }
});

// ============================================================================
// SHOW MESSAGE HELPER
// ============================================================================
function showError(text) {
  errorMsg.textContent = text;
  errorMsg.style.background = 'rgba(226,75,74,0.08)';
  errorMsg.style.borderColor = 'rgba(226,75,74,0.2)';
  errorMsg.style.color = 'var(--error)';
  errorMsg.classList.add('show');
}

// ============================================================================
// LOGIN
// ============================================================================
async function firebaseLogin() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  document.getElementById('email').classList.remove('error');
  document.getElementById('password').classList.remove('error');
  errorMsg.classList.remove('show');

  if (!email || !password) {
    showError('Please fill in all fields.');
    if (!email) document.getElementById('email').classList.add('error');
    if (!password) document.getElementById('password').classList.add('error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // FIX: Block unverified users from logging in
    if (!user.emailVerified) {
      await auth.signOut();
      showError('Please verify your email before logging in. Check your inbox for the verification link.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
      return;
    }

    // Update last login + keep account status synced
    const userRef = ref(database, 'users/' + user.uid);
    const snapshot = await get(userRef);
    const userData = snapshot.exists() ? snapshot.val() : {};

    const accountStatus = userData.accountStatus || userData.paymentStatus || 'unpaid';

    await update(userRef, {
      lastLogin: new Date().toISOString(),
      emailVerified: true,
      accountStatus,
      paymentStatus: userData.paymentStatus || accountStatus,
      planName: userData.planName || (accountStatus === 'paid' || accountStatus === 'active' ? 'Active Plan' : 'Unpaid')
    });

    // Redirect based on role
    if (userData.role === 'admin') {
      window.location.href = baseUrl + 'admin.html';
    } else {
      window.location.href = baseUrl + 'dashboard.html';
    }

  } catch (error) {
    console.error('❌ Login error:', error.code, error.message);

    // FIX: auth/user-not-found and auth/wrong-password are legacy codes —
    // newer Firebase returns auth/invalid-credential for both
    const errorMessages = {
      'auth/invalid-credential': 'Incorrect email or password. Please try again.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/too-many-requests': 'Too many failed attempts. Please wait a moment and try again.',
      'auth/network-request-failed': 'Network error. Check your internet connection.',
    };

    showError(errorMessages[error.code] || error.message);
    document.getElementById('email').classList.add('error');
    document.getElementById('password').classList.add('error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }
}

// ============================================================================
// INIT
// ============================================================================
document.getElementById('login-btn').addEventListener('click', firebaseLogin);
document.addEventListener('keydown', (e) => { if (e.key === 'Enter') firebaseLogin(); });
