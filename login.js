import { auth, database, baseUrl, DEMO_ADMIN_EMAIL } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { ref, get, update, set } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

const errorMsg = document.getElementById('error-msg');
const submitBtn = document.getElementById('login-btn');

function showError(text) {
  errorMsg.textContent = text;
  errorMsg.style.background = 'rgba(226,75,74,0.08)';
  errorMsg.style.borderColor = 'rgba(226,75,74,0.2)';
  errorMsg.style.color = 'var(--error)';
  errorMsg.classList.add('show');
}

function normalizeRole(value) {
  return String(value || '').toLowerCase().trim();
}

async function resolveRoute(user) {
  const userRef = ref(database, 'users/' + user.uid);
  const snapshot = await get(userRef);
  const userData = snapshot.exists() ? snapshot.val() : {};
  const role = normalizeRole(userData.role);
  const isAdmin = user.email?.toLowerCase() === DEMO_ADMIN_EMAIL.toLowerCase() || role === 'admin';
  const accountStatus = userData.accountStatus || userData.paymentStatus || 'unpaid';

  if (!snapshot.exists() && isAdmin) {
    await set(userRef, {
      firstName: 'Admin',
      lastName: 'User',
      email: user.email,
      role: 'admin',
      createdAt: new Date().toISOString(),
      emailVerified: true,
      accountStatus: 'paid',
      paymentStatus: 'paid',
      planName: 'Administrator'
    });
  } else if (snapshot.exists()) {
    await update(userRef, {
      lastLogin: new Date().toISOString(),
      emailVerified: true,
      accountStatus,
      paymentStatus: userData.paymentStatus || accountStatus,
      planName: userData.planName || (accountStatus === 'paid' || accountStatus === 'active' ? 'Active Plan' : 'Unpaid Account')
    });
  }

  window.location.href = isAdmin ? (baseUrl + 'admin.html') : (baseUrl + 'dashboard.html');
}

// Redirect verified users to the correct portal.
onAuthStateChanged(auth, async (user) => {
  if (!user || !user.emailVerified) return;
  try {
    await resolveRoute(user);
  } catch (error) {
    console.error('Auth routing error:', error);
    window.location.href = baseUrl + 'dashboard.html';
  }
});

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

    if (!user.emailVerified) {
      await auth.signOut();
      showError('Please verify your email before logging in. Check your inbox for the verification link.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
      return;
    }

    await resolveRoute(user);
  } catch (error) {
    console.error('❌ Login error:', error.code, error.message);

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

document.getElementById('login-btn').addEventListener('click', firebaseLogin);
document.addEventListener('keydown', (e) => { if (e.key === 'Enter') firebaseLogin(); });
