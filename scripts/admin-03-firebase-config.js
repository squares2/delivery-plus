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

        // Sign in with admin credentials so Firestore rules pass
        // This uses the Firebase SDK sign-in (separate from the REST getFsToken flow)
        // and does NOT count against the REST rate limit
        window._adminAuth.signInWithEmailAndPassword(
            'admin@delivo.app', 'delivo26'
        ).then(() => {
            console.log('[Admin] Firebase SDK signed in ✅');
        }).catch(e => {
            console.warn('[Admin] Firebase SDK sign-in failed:', e.message,
                '— will retry when lockout clears');
            // Retry once after 6 minutes (Firebase lockout is usually 5 min)
            setTimeout(() => {
                window._adminAuth.signInWithEmailAndPassword(
                    'admin@delivo.app', 'delivo26'
                ).then(() => {
                    console.log('[Admin] Firebase SDK signed in after retry ✅');
                    // Reload data now that SDK is authenticated
                    if (typeof loadAllData === 'function') {
                        _fsSignInFails = 0;
                        _resumeAutoRefresh();
                        loadAllData();
                    }
                }).catch(() => {});
            }, 6 * 60 * 1000);
        });

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
