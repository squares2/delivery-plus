(function() {
    const FB_CONFIG = {
        apiKey:            "AIzaSyCSTThgge2nSFlEQXjS1ta2tZXvVgNAnZ0",
        authDomain:        "deliveryonline-300f7.firebaseapp.com",
        databaseURL:       "https://deliveryonline-300f7-default-rtdb.firebaseio.com",
        projectId:         "deliveryonline-300f7",
        storageBucket:     "deliveryonline-300f7.firebasestorage.app",
        messagingSenderId: "294667842345",
        appId:             "1:294667842345:web:delivo-admin",
    };
    try {
        window._adminFbApp = firebase.apps.length
            ? firebase.apps[0]
            : firebase.initializeApp(FB_CONFIG, 'admin');
        window._adminDb   = firebase.firestore(window._adminFbApp);
        window._adminAuth = firebase.auth(window._adminFbApp);

        // No auto sign-in here anymore. Every employee now has their OWN
        // Firebase Auth account (created via the createAdminAccount Cloud
        // Function — see admin-07's employee panel) and signs in with their
        // real username/password from the login screen itself (doLogin() in
        // admin-04-core-auth-data.js calls signInWithEmailAndPassword there).
        // A single shared hardcoded account used to sign in silently for
        // EVERY visitor here — that meant anyone who merely loaded this page
        // already held a valid admin token, whether or not they ever passed
        // the login screen. Removed for that reason.

        // Watch SDK auth state — when signed in, resume everything
        window._adminAuth.onAuthStateChanged(user => {
            if (user) {
                window._adminSdkUid = user.uid;   // store for deleteUserAccount guard
                if (typeof _resumeAutoRefresh === 'function') {
                    _fsSignInFails = 0;
                    _resumeAutoRefresh();
                }
            }
        });

        console.log('[Admin] Firebase SDK ready');
    } catch(e) {
        console.warn('[Admin] Firebase SDK init failed:', e.message);
    }
})();
