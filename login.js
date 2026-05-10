import { auth, database, baseUrl } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { ref, get, update, set } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

const errorMsg = document.getElementById('error-msg');
const submitBtn = document.getElementById('login-btn');

// ============================================================================
// AUTH STATE
// Admin bypasses verification; normal users still require it
// ============================================================================
const ADMIN_EMAIL = 'admin@baricrystal.com';

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const isAdmin = normalizeEmail(user.email) === ADMIN_EMAIL;
  if (user.emailVerified || isAdmin) {
    window.location.href = baseUrl + (isAdmin ? 'admin.html' : 'dashboard.html');
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

    const isAdmin = normalizeEmail(user.email) === ADMIN_EMAIL;

    // Block unverified users from logging in, except admin
    if (!isAdmin && !user.emailVerified) {
      await signOut(auth);
      showError('Please verify your email before logging in. Check your inbox for the verification link.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
      return;
    }

    // Update last login + sync verified status to DB
    const userRef = ref(database, 'users/' + user.uid);
    const snapshot = await get(userRef);
    const payload = {
      lastLogin: new Date().toISOString(),
      emailVerified: isAdmin ? true : user.emailVerified
    };

    if (isAdmin) payload.role = 'admin';

    if (snapshot.exists()) {
      await update(userRef, payload);
    } else {
      await set(userRef, {
        firstName: isAdmin ? 'Admin' : 'User',
        lastName: '',
        email: user.email,
        phone: '',
        state: '',
        createdAt: new Date().toISOString(),
        ...payload
      });
    }

    // Redirect based on role / admin email
    if (isAdmin) {
      window.location.href = baseUrl + 'admin.html';
    } else if (snapshot.exists()) {
      const userData = snapshot.val();
      window.location.href = baseUrl + (userData.role === 'admin' ? 'admin.html' : 'dashboard.html');
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
