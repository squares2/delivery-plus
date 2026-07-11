/* ══════════════════════════════════════════════════════════
   functions/index.js — Cloud Functions entry point
   Firebase CLI looks for exports in this exact file by default
   (see firebase.json → functions.source + the "main" field in
   this folder's package.json). Each Cloud Function you want
   deployed must be re-exported from here.
══════════════════════════════════════════════════════════ */

exports.adminResetUserPassword = require('./adminresetpassword').adminResetUserPassword;
exports.customerPhoneLogin     = require('./customerphonelogin').customerPhoneLogin;
exports.adminUploadImage       = require('./adminuploadimage').adminUploadImage;