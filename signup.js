import { auth, database, baseUrl } from './firebase-config.js';
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, sendEmailVerification, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { ref, get, set, update } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

const ADMIN_EMAIL = 'admin@baricrystal.com';
const isAdminEmail = (email) => String(email || '').trim().toLowerCase() === ADMIN_EMAIL;
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ============================================================================
// BLOCKED EMAIL DOMAINS
// ============================================================================
const blockedDomains = [
  'tempmail.com', 'guerrillamail.com', '10minutemail.com',
  'mailinator.com', 'throwaway.email', 'temp-mail.org', 'maildrop.cc'
];

function isBlockedEmailDomain(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  return blockedDomains.includes(domain);
}

// ============================================================================
// RATE LIMITING
// ============================================================================
const SIGNUP_ATTEMPT_KEY = 'signup_attempts';
const RATE_LIMIT_WINDOW = 3600000;
const MAX_ATTEMPTS = 5;

function checkRateLimit() {
  const attempts = JSON.parse(localStorage.getItem(SIGNUP_ATTEMPT_KEY) || '[]');
  const recentAttempts = attempts.filter(t => Date.now() - t < RATE_LIMIT_WINDOW);
  return recentAttempts.length < MAX_ATTEMPTS;
}

function recordSignupAttempt() {
  const attempts = JSON.parse(localStorage.getItem(SIGNUP_ATTEMPT_KEY) || '[]');
  const recentAttempts = attempts.filter(t => Date.now() - t < RATE_LIMIT_WINDOW);
  recentAttempts.push(Date.now());
  localStorage.setItem(SIGNUP_ATTEMPT_KEY, JSON.stringify(recentAttempts));
}

function setBusy(button, busy, busyText, normalText) {
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? busyText : normalText;
}

// ============================================================================
// SHOW MESSAGE HELPER
// ============================================================================
function showMessage(text, type = 'error') {
  const errorMsg = document.getElementById('error-msg');
  if (!errorMsg) return;

  if (type === 'success') {
    errorMsg.style.background = 'rgba(45, 158, 107, 0.08)';
    errorMsg.style.borderColor = 'rgba(45, 158, 107, 0.2)';
    errorMsg.style.color = '#2D9E6B';
  } else {
    errorMsg.style.background = 'rgba(226,75,74,0.08)';
    errorMsg.style.borderColor = 'rgba(226,75,74,0.2)';
    errorMsg.style.color = 'var(--error)';
  }

  errorMsg.textContent = text;
  errorMsg.classList.add('show');
}

async function saveUserRecord(user, providerName = 'email', defaults = {}) {
  const userRef = ref(database, 'users/' + user.uid);
  const snapshot = await get(userRef);
  const existing = snapshot.exists() ? snapshot.val() : {};
  const admin = isAdminEmail(user.email) || existing.role === 'admin';
  const joinedAt = existing.joinedAt || existing.createdAt || new Date().toISOString();
  const accountStatus = defaults.accountStatus || existing.accountStatus || existing.paymentStatus || (admin ? 'paid' : 'unpaid');
  const emailVerified = typeof defaults.emailVerified === 'boolean' ? defaults.emailVerified : Boolean(user.emailVerified || admin);
  const displayName = user.displayName || existing.name || '';
  const parts = displayName.trim().split(/\s+/).filter(Boolean);

  const payload = {
    uid: user.uid,
    firstName: defaults.firstName || existing.firstName || parts[0] || '',
    lastName: defaults.lastName || existing.lastName || parts.slice(1).join(' ') || '',
    name: defaults.name || displayName,
    email: user.email || existing.email || '',
    phone: defaults.phone || existing.phone || '',
    state: defaults.state || existing.state || '',
    photoURL: user.photoURL || existing.photoURL || '',
    provider: providerName,
    joinedAt,
    createdAt: existing.createdAt || joinedAt,
    lastLogin: new Date().toISOString(),
    emailVerified,
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

// ============================================================================
// AUTH STATE
// Admin bypasses email verification.
// ============================================================================
onAuthStateChanged(auth, (user) => {
  if (!user) return;
  if (isAdminEmail(user.email)) {
    window.location.href = baseUrl + 'admin.html';
    return;
  }
  if (user.emailVerified) {
    window.location.href = baseUrl + 'dashboard.html';
  }
});

// ============================================================================
// RESEND VERIFICATION EMAIL
// ============================================================================
window.resendVerificationEmail = async function() {
  const user = auth.currentUser;
  if (!user) {
    showMessage('No account session found. Please sign up again.');
    return;
  }

  try {
    await sendEmailVerification(user, {
      url: baseUrl + 'dashboard.html',
      handleCodeInApp: true
    });
    showMessage('✓ Verification email resent! Check your inbox (and spam folder).', 'success');
  } catch (error) {
    console.error('Resend error:', error);
    if (error.code === 'auth/too-many-requests') {
      showMessage('Too many requests. Please wait a few minutes before trying again.');
    } else {
      showMessage('Failed to resend email: ' + error.message);
    }
  }
};

async function googleSignup() {
  const btn = document.getElementById('google-signup-btn');
  showMessage('', 'error');
  const errorMsg = document.getElementById('error-msg');
  if (errorMsg) errorMsg.classList.remove('show');
  setBusy(btn, true, 'Opening Google...', 'Sign Up with Google');

  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const admin = isAdminEmail(user.email);
    const record = await saveUserRecord(user, 'google', {
      emailVerified: Boolean(user.emailVerified),
      accountStatus: admin ? 'paid' : 'unpaid',
      firstName: user.displayName?.split(/\s+/)[0] || '',
      lastName: user.displayName?.split(/\s+/).slice(1).join(' ') || '',
      name: user.displayName || ''
    });
    window.location.href = record.role === 'admin' ? baseUrl + 'admin.html' : baseUrl + 'dashboard.html';
  } catch (error) {
    console.error('❌ Google signup error:', error.code, error.message);
    const errorMessages = {
      'auth/popup-closed-by-user': 'Google sign-in was closed before completion.',
      'auth/cancelled-popup-request': 'Google sign-in was cancelled.',
      'auth/account-exists-with-different-credential': 'This email already has another sign-in method. Use your existing login first.',
      'auth/unauthorized-domain': 'This domain is not authorized for Google sign-in in Firebase.',
      'auth/network-request-failed': 'Network error. Check your internet connection.'
    };
    showMessage(errorMessages[error.code] || error.message);
  } finally {
    setBusy(btn, false, 'Opening Google...', 'Sign Up with Google');
  }
}

// ============================================================================
// MAIN SIGNUP
// ============================================================================
window.firebaseSignup = async function() {
  const fname = document.getElementById('fname').value.trim();
  const lname = document.getElementById('lname').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const state = document.getElementById('state').value.trim();
  const password = document.getElementById('password').value;
  const confirm = document.getElementById('confirm').value;
  const terms = document.getElementById('terms-check').checked;
  const btn = document.getElementById('signup-btn');

  if (!fname || !lname || !email || !phone || !state || !password || !confirm) {
    showMessage('Please fill in all required fields.');
    return;
  }
  if (password.length < 8) {
    showMessage('Password must be at least 8 characters.');
    return;
  }
  if (password !== confirm) {
    showMessage('Passwords do not match.');
    return;
  }
  if (!terms) {
    showMessage('Please accept the Terms & Conditions to continue.');
    return;
  }
  if (!checkRateLimit()) {
    showMessage('Too many signup attempts. Please try again in 1 hour.');
    return;
  }
  if (isBlockedEmailDomain(email)) {
    showMessage('Temporary email services are not allowed. Please use a real email.');
    return;
  }

  setBusy(btn, true, 'Creating account...', 'Create Account');

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    recordSignupAttempt();

    const flagForReview = /\d{5,}/.test(fname + lname) || /[!@#$%^&*]/.test(fname + lname) || fname.length < 2 || lname.length < 2;
    const admin = isAdminEmail(email);

    await set(ref(database, 'users/' + user.uid), {
      uid: user.uid,
      firstName: fname,
      lastName: lname,
      name: `${fname} ${lname}`.trim(),
      email: email,
      phone: phone,
      state: state,
      createdAt: new Date().toISOString(),
      joinedAt: new Date().toISOString(),
      emailVerified: admin ? true : false,
      flaggedForReview: flagForReview,
      reviewReason: flagForReview ? 'Suspicious name pattern detected' : null,
      accountStatus: admin ? 'paid' : 'unpaid',
      paymentStatus: admin ? 'paid' : 'unpaid',
      planName: admin ? 'Admin Access' : 'Unpaid',
      role: admin ? 'admin' : 'user',
      provider: 'password'
    });

    if (admin) {
      await signOut(auth);
      showMessage('✓ Admin account created. You can sign in without email verification.', 'success');
      setBusy(btn, false, 'Creating account...', 'Create Account');
      btn.textContent = 'Create Admin Account';
      return;
    }

    await sendEmailVerification(user, {
      url: baseUrl + 'dashboard.html',
      handleCodeInApp: true
    });

    await signOut(auth);

    const errorMsg = document.getElementById('error-msg');
    errorMsg.innerHTML = `
      ✓ Account created! A verification email was sent to <strong>${email}</strong>.<br>
      Didn't get it? Check your spam folder or
      <a href="#" onclick="resendVerificationEmail(); return false;"
         style="color: #2D9E6B; font-weight: 600;">click here to resend</a>.
    `;
    errorMsg.style.background = 'rgba(45, 158, 107, 0.08)';
    errorMsg.style.borderColor = 'rgba(45, 158, 107, 0.2)';
    errorMsg.style.color = '#2D9E6B';
    errorMsg.classList.add('show');

    btn.textContent = 'Check your email';
  } catch (error) {
    console.error('❌ Signup error:', error.code, error.message);
    const errorMessages = {
      'auth/email-already-in-use': 'This email is already registered. Please log in instead.',
      'auth/weak-password': 'Password is too weak. Use at least 6 characters.',
      'auth/invalid-email': 'Invalid email format. Please check and try again.',
      'auth/network-request-failed': 'Network error. Check your internet connection and try again.',
      'auth/account-exists-with-different-credential': 'This email already has another sign-in method. Use your existing login first.'
    };
    showMessage(errorMessages[error.code] || error.message);
    setBusy(btn, false, 'Creating account...', 'Create Account');
  }
};

// ============================================================================
// INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', function() {
  const signupBtn = document.getElementById('signup-btn');
  if (signupBtn) signupBtn.addEventListener('click', window.firebaseSignup);
  const googleBtn = document.getElementById('google-signup-btn');
  if (googleBtn) googleBtn.addEventListener('click', googleSignup);
});
