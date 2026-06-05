# 🔥 Delivo — Firebase Setup Guide

## الخطوات بالترتيب — Follow these steps in order

---

## STEP 1 — Create your Firebase project

1. Go to https://console.firebase.google.com
2. Click **Add project** → name it `delivo` (or anything you like)
3. Disable Google Analytics (not needed now)
4. Click **Create project**

---

## STEP 2 — Register your web app

1. In your project dashboard, click the **</>** (Web) icon
2. App nickname: `Delivo Web`
3. ✅ Check **Firebase Hosting** (you'll use it to deploy)
4. Click **Register app**
5. You'll see a config object like this — **copy the values**:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "delivo-xxxxx.firebaseapp.com",
  projectId: "delivo-xxxxx",
  storageBucket: "delivo-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123:web:abc123"
};
```

6. Open `scripts/firebase.js` and paste your values into `FIREBASE_CONFIG`

---

## STEP 3 — Enable Email/Password Authentication

1. In Firebase Console → **Authentication** → **Get started**
2. Click **Email/Password** → Enable → Save
3. Under **Settings → Authorized domains**:
   - Keep `localhost` for development
   - Add your real domain when you go live (e.g. `delivo.lb`)
   - **Remove** any domain you don't use

---

## STEP 4 — Create Firestore database

1. Firebase Console → **Firestore Database** → **Create database**
2. Choose **Production mode** (starts locked — rules come next)
3. Location: `europe-west1` (closest to Lebanon)
4. Click **Done**

---

## STEP 5 — Deploy security rules (CRITICAL ⚠️)

This is the most important step. The rules in `firestore.rules`
protect your database.

### Option A — Firebase CLI (recommended):
```bash
npm install -g firebase-tools
firebase login
firebase init          # select Firestore + Hosting
firebase deploy --only firestore:rules
```

### Option B — Console (manual):
1. Firebase Console → Firestore → **Rules** tab
2. Delete everything there
3. Copy-paste the entire contents of `firestore.rules`
4. Click **Publish**

---

## STEP 6 — Set up admin access

The rules use a custom claim `admin: true` to identify admins.
You set this via Firebase Admin SDK **from a server** (never client-side).

### Quick setup with a Cloud Function or script:

```js
// Run this once on a server / Cloud Function
const admin = require('firebase-admin');
admin.initializeApp();

await admin.auth().setCustomUserClaims('YOUR_ADMIN_UID', { admin: true });
```

To find your UID:
1. Firebase Console → Authentication → Users
2. Sign in once with your admin email
3. Copy the UID shown in the table

---

## STEP 7 — Seed your Firestore data

Add your first store manually:

1. Firestore → Add collection → name it `stores`
2. Add a document with ID = store slug (e.g. `classic-food`)
3. Fields:
   ```
   name:        "كلاسيك فود"       (string)
   category:    "restaurants"      (string)
   tags:        "شاورما • غربي"   (string)
   rating:      4.5               (number)
   deliveryTime:"20-30"           (string)
   minOrder:    500000            (number)
   image:       "assets/classic-food.png"  (string)
   active:      true              (boolean)
   order:       1                 (number)
   ```

Repeat for categories and offers collections.

---

## STEP 8 — Enable App Check (extra protection)

App Check ensures only YOUR website can use your Firebase project,
blocking anyone who copies your config keys.

1. Firebase Console → **App Check** → **Get started**
2. Select your web app → Choose **reCAPTCHA v3**
3. Go to https://www.google.com/recaptcha/admin → register your domain
4. Copy the site key back into Firebase
5. Click **Register**

> ⚠️  Enable App Check **enforcement** only AFTER testing — it will
> block your local dev if you don't add `localhost` to reCAPTCHA too.

---

## Security Summary — What protects your Firebase

| Layer | What it does |
|-------|-------------|
| **Firestore Rules** | Blocks all unauthorized reads/writes at the database level |
| **Origin guard** (firebase.js) | Only initializes Firebase on your domain |
| **Rate limiting** (db.js + auth.js) | Blocks brute-force and flooding |
| **Input sanitization** (db.js) | Strips HTML/script from all data before saving |
| **Custom admin claim** | Admin actions require a server-set flag, never client |
| **App Check** | Ensures only your app can use your Firebase config |
| **Security headers** (firebase.json) | X-Frame-Options, CSP headers via Firebase Hosting |
| **Authorized domains** | Only your domain can use Auth |
| **No delete on orders** | Orders are permanent (audit trail) |

---

## Local development with emulators (recommended)

Run Firebase locally without touching the real database:

```bash
firebase emulators:start
```

Then in your browser console before loading the app:
```js
window.__USE_EMULATOR = true;
```

This connects to the local emulator instead of real Firebase.

---

## Files added to your project

```
web2/
├── scripts/
│   ├── firebase.js      ← Firebase init + origin guard
│   ├── db.js            ← All Firestore reads/writes
│   ├── auth.js          ← Login, register, logout
│   └── modal-auth.js    ← Wires modals to auth.js
├── firestore.rules      ← Security rules (deploy to Firebase)
├── firebase.json        ← Project config + security headers
└── FIREBASE_SETUP.md    ← This file
```
