import { auth, db } from './firebase-config.js';

import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  ref,
  get,
  update
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const loginForm = document.getElementById("loginForm");
const googleBtn = document.getElementById("googleLoginBtn");

const ADMIN_EMAIL = "admin@baricrystal.com";

/* =========================
   USER SYNC
========================= */

async function syncUserToDatabase(user) {

  if (!user) return;

  try {

    const userRef = ref(db, `users/${user.uid}`);

    const snap = await get(userRef);

    const current = snap.exists()
      ? snap.val()
      : {};

    const userData = {
      uid: user.uid,
      name:
        user.displayName ||
        current.name ||
        "",

      email:
        user.email ||
        current.email ||
        "",

      photoURL:
        user.photoURL ||
        current.photoURL ||
        "",

      role:
        current.role ||
        (user.email === ADMIN_EMAIL
          ? "admin"
          : "user"),

      accountStatus:
        current.accountStatus ||
        "unpaid",

      joinedAt:
        current.joinedAt ||
        Date.now(),

      lastLoginAt: Date.now()
    };

    await update(userRef, userData);

    console.log("User synced successfully");

  } catch (error) {

    console.error(
      "User sync failed:",
      error
    );
  }
}

/* =========================
   EMAIL LOGIN
========================= */

if (loginForm) {

  loginForm.addEventListener(
    "submit",
    async (e) => {

      e.preventDefault();

      const email = document
        .getElementById("email")
        .value
        .trim();

      const password = document
        .getElementById("password")
        .value;

      try {

        const userCredential =
          await signInWithEmailAndPassword(
            auth,
            email,
            password
          );

        const user = userCredential.user;

        if (
          user.email !== ADMIN_EMAIL &&
          !user.emailVerified
        ) {

          alert(
            "Please verify your email before logging in."
          );

          return;
        }

        await syncUserToDatabase(user);

        if (user.email === ADMIN_EMAIL) {

          window.location.href =
            "admin.html";

        } else {

          window.location.href =
            "dashboard.html";
        }

      } catch (error) {

        console.error(error);
        alert(error.message);
      }
    }
  );
}

/* =========================
   GOOGLE LOGIN
========================= */

if (googleBtn) {

  googleBtn.addEventListener(
    "click",
    async () => {

      try {

        const provider =
          new GoogleAuthProvider();

        const result =
          await signInWithPopup(
            auth,
            provider
          );

        const user = result.user;

        await syncUserToDatabase(user);

        if (user.email === ADMIN_EMAIL) {

          window.location.href =
            "admin.html";

        } else {

          window.location.href =
            "dashboard.html";
        }

      } catch (error) {

        console.error(error);
        alert(error.message);
      }
    }
  );
}

/* =========================
   AUTO SYNC EXISTING USERS
========================= */

onAuthStateChanged(auth, async (user) => {

  if (user) {

    await syncUserToDatabase(user);
  }
});