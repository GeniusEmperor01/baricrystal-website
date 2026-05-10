// ============================================================================
// SHARED FIREBASE INITIALIZATION
// Import this file in any page that needs Firebase
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

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
export const auth = getAuth(app);
export const database = getDatabase(app);

// GitHub Pages compatible base URL
// Handles: https://user.github.io/repo/ and custom domains
export const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');


// ============================================================================
// APP-LEVEL ACCESS CONSTANTS
// ============================================================================
export const DEMO_ADMIN_EMAIL = 'admin@baricrystal.com';
export const DEMO_ADMIN_PASSWORD = 'BariCrystal@2026!';
export const PAYMENT_SANDBOX_KEY = 'baricrystal_payment_sandbox_status';
export const PAYMENT_SANDBOX_ACTIVE_KEY = 'baricrystal_payment_sandbox_active';
