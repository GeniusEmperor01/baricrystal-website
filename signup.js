// Firebase configuration and initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";
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

// ============================================================================
// BLOCKED EMAIL DOMAINS (Fake Email Prevention)
// ============================================================================

const blockedDomains = [
  'tempmail.com',
  'guerrillamail.com',
  '10minutemail.com',
  'mailinator.com',
  'throwaway.email',
  'temp-mail.org',
  'maildrop.cc'
  // Add more disposable email domains as needed
];

function isBlockedEmailDomain(email) {
  const domain = email.split('@')[1].toLowerCase();
  return blockedDomains.includes(domain);
}

// ============================================================================
// PHONE NUMBER VALIDATION (Nigerian Format)
// ============================================================================

function validateNigerianPhone(phone) {
  // Accept formats: +234XXXXXXXXXX, +234 XXX XXX XXXX, 0XXXXXXXXXX, etc.
  const nigerianPhoneRegex = /^(\+234|0)[789][01]\d{8}$/;
  const cleaned = phone.replace(/\s+/g, '');
  return nigerianPhoneRegex.test(cleaned);
}

// ============================================================================
// RATE LIMITING (Prevent Multiple Signups)
// ============================================================================

const SIGNUP_ATTEMPT_KEY = 'signup_attempts';
const RATE_LIMIT_WINDOW = 3600000; // 1 hour in milliseconds
const MAX_ATTEMPTS = 5; // Max signup attempts per hour

function checkRateLimit() {
  const attempts = JSON.parse(localStorage.getItem(SIGNUP_ATTEMPT_KEY) || '[]');
  const now = Date.now();
  
  // Filter out old attempts (older than 1 hour)
  const recentAttempts = attempts.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
  
  if (recentAttempts.length >= MAX_ATTEMPTS) {
    return false; // Rate limited
  }
  
  return true;
}

function recordSignupAttempt() {
  const attempts = JSON.parse(localStorage.getItem(SIGNUP_ATTEMPT_KEY) || '[]');
  const now = Date.now();
  attempts.push(now);
  
  // Keep only recent attempts
  const recentAttempts = attempts.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
  localStorage.setItem(SIGNUP_ATTEMPT_KEY, JSON.stringify(recentAttempts));
}

// ============================================================================
// AUTHENTICATION STATE MONITORING
// ============================================================================

onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is already signed in, redirect to dashboard
    console.log('User already signed in:', user.uid);
    window.location.href = 'dashboard.html';
  } else {
    console.log('User is not signed in');
  }
});

// ============================================================================
// PHONE VALIDATION (called from form)
// ============================================================================

window.validatePhone = function(phone) {
  if (!phone) return false;
  return validateNigerianPhone(phone);
};

// ============================================================================
// FIREBASE SIGNUP WITH EMAIL VERIFICATION
// ============================================================================

window.firebaseSignup = async function() {
  if (!window.validateForm()) return;

  const fname = document.getElementById('fname').value.trim();
  const lname = document.getElementById('lname').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const state = document.getElementById('state').value.trim();
  const password = document.getElementById('password').value;
  const errorMsg = document.getElementById('error-msg');
  const btn = document.getElementById('signup-btn');

  // Check rate limiting
  if (!checkRateLimit()) {
    errorMsg.textContent = 'Too many signup attempts. Please try again in 1 hour.';
    errorMsg.style.background = 'rgba(226,75,74,0.08)';
    errorMsg.style.borderColor = 'rgba(226,75,74,0.2)';
    errorMsg.style.color = 'var(--error)';
    errorMsg.classList.add('show');
    return;
  }

  // Check for blocked email domains
  if (isBlockedEmailDomain(email)) {
    errorMsg.textContent = 'Please use a valid email domain. Temporary email services are not allowed.';
    errorMsg.style.background = 'rgba(226,75,74,0.08)';
    errorMsg.style.borderColor = 'rgba(226,75,74,0.2)';
    errorMsg.style.color = 'var(--error)';
    errorMsg.classList.add('show');
    return;
  }

  // Validate phone format
  if (!validateNigerianPhone(phone)) {
    errorMsg.textContent = 'Please enter a valid Nigerian phone number (e.g., +234 801 234 5678).';
    errorMsg.style.background = 'rgba(226,75,74,0.08)';
    errorMsg.style.borderColor = 'rgba(226,75,74,0.2)';
    errorMsg.style.color = 'var(--error)';
    errorMsg.classList.add('show');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creating account...';

  const actionCodeSettings = {
    url: window.location.origin + '/dashboard.html',
    handleCodeInApp: true
  };

  try {
    // Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    recordSignupAttempt();

    // Flag suspicious patterns for admin review
    let flagForReview = false;
    const suspiciousPatterns = {
      hasNumbers: /\d{5,}/.test(fname + lname), // Multiple consecutive numbers in name
      hasSpecialChars: /[!@#$%^&*]/.test(fname + lname), // Special characters in name
      tooShort: fname.length < 2 || lname.length < 2 // Very short names
    };

    if (suspiciousPatterns.hasNumbers || suspiciousPatterns.hasSpecialChars || suspiciousPatterns.tooShort) {
      flagForReview = true;
    }

    // Save user data to Realtime Database
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
      accountStatus: 'pending_verification' // pending_verification, verified, suspended
    });

    // Send email verification
    await sendEmailVerification(user, actionCodeSettings);

    console.log('User created, verification email sent:', user.uid);
    errorMsg.classList.remove('show');

    // Show success message
    errorMsg.textContent = '✓ Account created! Verification email sent to ' + email + '. Check your inbox and verify your email.';
    errorMsg.style.background = 'rgba(45, 158, 107, 0.08)';
    errorMsg.style.borderColor = 'rgba(45, 158, 107, 0.2)';
    errorMsg.style.color = '#2D9E6B';
    errorMsg.classList.add('show');

    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 3000);

  } catch (error) {
    console.error('Signup error:', error);

    let errorText = error.message;
    if (error.code === 'auth/email-already-in-use') {
      errorText = 'This email is already registered. Please log in or use a different email.';
    } else if (error.code === 'auth/weak-password') {
      errorText = 'Password is too weak. Please use a stronger password.';
    } else if (error.code === 'auth/invalid-email') {
      errorText = 'Invalid email format. Please check and try again.';
    }

    errorMsg.textContent = errorText;
    errorMsg.style.background = 'rgba(226,75,74,0.08)';
    errorMsg.style.borderColor = 'rgba(226,75,74,0.2)';
    errorMsg.style.color = 'var(--error)';
    errorMsg.classList.add('show');
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
};

// Add click listener to button
document.addEventListener('DOMContentLoaded', function() {
  const signupBtn = document.getElementById('signup-btn');
  if (signupBtn) {
    signupBtn.addEventListener('click', window.firebaseSignup);
  }
});
