import { auth, database, baseUrl } from './firebase-config.js';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

const ADMIN_EMAIL = 'admin@baricrystal.com';
const isAdminEmail = (email) => String(email || '').trim().toLowerCase() === ADMIN_EMAIL;
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const errorMsg = document.getElementById('error-msg');
const submitBtn = document.getElementById('login-btn');
const googleBtn = document.getElementById('google-login-btn');

function setBusy(button, busy, busyText, normalText) {
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? busyText : normalText;
}

function showError(text) {
  if (!errorMsg) return;
  errorMsg.textContent = text;
  errorMsg.style.background = 'rgba(226,75,74,0.08)';
  errorMsg.style.borderColor = 'rgba(226,75,74,0.2)';
  errorMsg.style.color = 'var(--error)';
  errorMsg.classList.add('show');
}

async function saveUserRecord(user, source = 'email') {
  const userRef = ref(database, 'users/' + user.uid);
  const snapshot = await get(userRef);
  const existing = snapshot.exists() ? snapshot.val() : {};
  const admin = isAdminEmail(user.email) || existing.role === 'admin';
  const joinedAt = existing.joinedAt || existing.createdAt || new Date().toISOString();
  const accountStatus = existing.accountStatus || existing.paymentStatus || (admin ? 'paid' : 'unpaid');

  const displayName = user.displayName || existing.name || '';
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  const firstName = existing.firstName || parts[0] || '';
  const lastName = existing.lastName || parts.slice(1).join(' ') || '';

  const payload = {
    uid: user.uid,
    firstName,
    lastName,
    name: displayName,
    email: user.email || existing.email || '',
    phone: existing.phone || '',
    state: existing.state || '',
    photoURL: user.photoURL || existing.photoURL || '',
    provider: source,
    joinedAt,
    createdAt: existing.createdAt || joinedAt,
    lastLogin: new Date().toISOString(),
    emailVerified: Boolean(user.emailVerified || admin),
    flaggedForReview: existing.flaggedForReview || false,
    reviewReason: existing.reviewReason || null,
    accountStatus,
    paymentStatus: existing.paymentStatus || accountStatus,
    planName: existing.planName || (accountStatus === 'paid' ? 'Active Plan' : 'Unpaid'),
    role: admin ? 'admin' : (existing.role || 'user')
  };

  await update(userRef, payload);
  return payload;
}

async function routeSignedInUser(user) {
  const data = await saveUserRecord(user, user.providerData?.[0]?.providerId || 'email');
  window.location.href = data.role === 'admin' ? baseUrl + 'admin.html' : baseUrl + 'dashboard.html';
}

// AUTH STATE
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  if (isAdminEmail(user.email)) {
    window.location.href = baseUrl + 'admin.html';
    return;
  }
  if (user.emailVerified) {
    window.location.href = baseUrl + 'dashboard.html';
  }
});

// LOGIN
async function firebaseLogin() {
  const emailEl = document.getElementById('email');
  const passwordEl = document.getElementById('password');
  const email = emailEl.value.trim();
  const password = passwordEl.value;

  emailEl.classList.remove('error');
  passwordEl.classList.remove('error');
  errorMsg.classList.remove('show');

  if (!email || !password) {
    showError('Please fill in all fields.');
    if (!email) emailEl.classList.add('error');
    if (!password) passwordEl.classList.add('error');
    return;
  }

  setBusy(submitBtn, true, 'Signing in...', 'Sign In');

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (!isAdminEmail(user.email) && !user.emailVerified) {
      await signOut(auth);
      showError('Please verify your email before logging in. Check your inbox for the verification link.');
      setBusy(submitBtn, false, 'Signing in...', 'Sign In');
      return;
    }

    await routeSignedInUser(user);
  } catch (error) {
    console.error('❌ Login error:', error.code, error.message);
    const errorMessages = {
      'auth/invalid-credential': 'Incorrect email or password. Please try again.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/too-many-requests': 'Too many failed attempts. Please wait a moment and try again.',
      'auth/network-request-failed': 'Network error. Check your internet connection.',
      'auth/account-exists-with-different-credential': 'This email is already connected to another sign-in method. Use the method you signed up with first.'
    };
    showError(errorMessages[error.code] || error.message);
    emailEl.classList.add('error');
    passwordEl.classList.add('error');
    setBusy(submitBtn, false, 'Signing in...', 'Sign In');
  }
}

async function googleLogin() {
  errorMsg.classList.remove('show');
  setBusy(googleBtn, true, 'Opening Google...', 'Continue with Google');

  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    await routeSignedInUser(user);
  } catch (error) {
    console.error('❌ Google login error:', error.code, error.message);
    const errorMessages = {
      'auth/popup-closed-by-user': 'Google sign-in was closed before completion.',
      'auth/cancelled-popup-request': 'Google sign-in was cancelled.',
      'auth/account-exists-with-different-credential': 'This email already has another sign-in method. Use your existing login first.',
      'auth/unauthorized-domain': 'This domain is not authorized for Google sign-in in Firebase.',
      'auth/network-request-failed': 'Network error. Check your internet connection.'
    };
    showError(errorMessages[error.code] || error.message);
  } finally {
    setBusy(googleBtn, false, 'Opening Google...', 'Continue with Google');
  }
}

// INIT
submitBtn?.addEventListener('click', firebaseLogin);
googleBtn?.addEventListener('click', googleLogin);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (document.activeElement?.id === 'email' || document.activeElement?.id === 'password')) {
    firebaseLogin();
  }
});
