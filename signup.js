// Firebase configuration and initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

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
// PHONE VALIDATION
// ============================================================================
function validateNigerianPhone(phone) {
  const nigerianPhoneRegex = /^(\+234|0)[789][01]\d{8}$/;
  const cleaned = phone.replace(/\s+/g, '');
  return nigerianPhoneRegex.test(cleaned);
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

// ============================================================================
// AUTH STATE — only redirect if email is verified
// ============================================================================
onAuthStateChanged(auth, (user) => {
  if (user && user.emailVerified) {
    window.location.href = 'dashboard.html';
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
      url: window.location.origin + '/dashboard.html',
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

// ============================================================================
// MAIN SIGNUP
// ============================================================================
window.firebaseSignup = async function() {
  if (!window.validateForm || !window.validateForm()) return;

  const fname = document.getElementById('fname').value.trim();
  const lname = document.getElementById('lname').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const state = document.getElementById('state').value.trim();
  const password = document.getElementById('password').value;
  const btn = document.getElementById('signup-btn');

  if (!checkRateLimit()) {
    showMessage('Too many signup attempts. Please try again in 1 hour.');
    return;
  }

  if (isBlockedEmailDomain(email)) {
    showMessage('Temporary email services are not allowed. Please use a real email.');
    return;
  }

  if (!validateNigerianPhone(phone)) {
    showMessage('Please enter a valid Nigerian phone number (e.g., +234 801 234 5678).');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creating account...';

  try {
    // 1. Create Firebase Auth user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    recordSignupAttempt();

    // 2. Save to Realtime Database
    const suspiciousPatterns = {
      hasNumbers: /\d{5,}/.test(fname + lname),
      hasSpecialChars: /[!@#$%^&*]/.test(fname + lname),
      tooShort: fname.length < 2 || lname.length < 2
    };
    const flagForReview = Object.values(suspiciousPatterns).some(Boolean);

    await set(ref(database, 'users/' + user.uid), {
      firstName: fname,
      lastName: lname,
      email: email,
      phone: phone,
      state: state,
      createdAt: new Date().toISOString(),
      emailVerified: false,
      flaggedForReview: flagForReview,
      reviewReason: flagForReview ? 'Suspicious name pattern detected' : null,
      accountStatus: 'pending_verification'
    });

    console.log('✅ User saved to DB:', user.uid);

    // 3. Send verification email
    await sendEmailVerification(user, {
      url: window.location.origin + '/dashboard.html',
      handleCodeInApp: true
    });

    console.log('✅ Verification email sent to:', email);

    // 4. Show success + resend option
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
    };

    showMessage(errorMessages[error.code] || error.message);
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
};

// ============================================================================
// INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', function() {
  const signupBtn = document.getElementById('signup-btn');
  if (signupBtn) {
    signupBtn.addEventListener('click', window.firebaseSignup);
  }
});