# baricrystal-website

## Admin login setup

Use this demo admin account when creating the Firebase Auth user:

- Email: `admin@baricrystal.com`
- Password: `BariCrystal@2026!`

Make sure the corresponding Realtime Database user record has `role: "admin"`.
Enable **Email/Password** sign-in in Firebase Authentication before testing the login flow.

## Payment sandbox testing

Open the payment page with `?sandbox=1` to test the unpaid -> paid unlock flow without using a real gateway.
The sandbox button marks the current browser session as paid and updates the user's status.
