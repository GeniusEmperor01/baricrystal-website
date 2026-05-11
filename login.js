import { auth, database, baseUrl } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  fetchSignInMethodsForEmail,
  EmailAuthProvider,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { ref, get, set, update } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

const errorMsg = document.getElementById('error-msg');
const submitBtn = document.getElementById('login-btn');
const googleBtn = document.getElementById('google-login-btn');

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

async function syncUserToDatabase(user) {
  const userRef = ref(database, 'users/' + user.uid);
  const snapshot = await get(userRef);
  const nameParts = (user.displayName || '').split(' ');
  const defaultData = {
    email: user.email || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    emailVerified: !!user.emailVerified,
    lastLogin: new Date().toISOString()
  };

  if (snapshot.exists()) {
    const existing = snapshot.val();
    const updateData = {
      ...defaultData,
      firstName: existing.firstName || nameParts[0] || '',
      lastName: existing.lastName || nameParts.slice(1).join(' ') || '',
      role: existing.role || 'candidate',
      accountStatus: existing.accountStatus || 'active'
    };
    await update(userRef, updateData);
    return updateData;
  }

  await set(userRef, {
    firstName: nameParts[0] || '',
    lastName: nameParts.slice(1).join(' ') || '',
    email: user.email || '',
    createdAt: new Date().toISOString(),
    emailVerified: !!user.emailVerified,
    lastLogin: new Date().toISOString(),
    role: 'candidate',
    accountStatus: 'active'
  });

  return { role: 'candidate' };
}

function getRedirectUrl(userData) {
  return baseUrl + (userData?.role === 'admin' ? 'admin.html' : 'dashboard.html');
}

async function firebaseGoogleLogin() {
  errorMsg.classList.remove('show');
  submitBtn.disabled = true;
  if (googleBtn) googleBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';

  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    const userData = await syncUserToDatabase(user);
    window.location.href = getRedirectUrl(userData);
  } catch (error) {
    console.error('❌ Google login error:', error.code, error.message);

    if (error.code === 'auth/account-exists-with-different-credential') {
      const email = error.customData?.email || error.email;
      if (email) {
        const methods = await fetchSignInMethodsForEmail(auth, email);
        const firstMethod = methods.includes('password') ? 'Password' : methods.map(m => m.replace('.com', '')).join(', ');
        showError(
          `An account already exists with this email using ${firstMethod}. Please sign in with that method first and then link Google in your account settings.`
        );
      } else {
        showError('An account already exists with this email. Please sign in using the original method.');
      }
    } else if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
      showError('Google sign-in was canceled. Please try again.');
    } else {
      showError(error.message || 'Unable to sign in with Google. Please try again.');
    }
  } finally {
    submitBtn.disabled = false;
    if (googleBtn) googleBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }
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

    // Update last login + sync verified status to DB
    const userRef = ref(database, 'users/' + user.uid);
    await update(userRef, {
      lastLogin: new Date().toISOString(),
      emailVerified: true
    });

    // Redirect based on role
    const snapshot = await get(userRef);
    if (snapshot.exists()) {
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
if (googleBtn) googleBtn.addEventListener('click', firebaseGoogleLogin);
document.addEventListener('keydown', (e) => { if (e.key === 'Enter') firebaseLogin(); });
