
function appReady(userid) {
    console.log("Logged in as: " + userid);
    startTracking(userid);
}

// Call this when the user successfully clicks "Login"
function onLoginSuccess(userid) {
    window.localStorage.setItem('userid', userid);
    startTracking2(userid);
}

function startTracking2(userid) {
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition((position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // Send to Android Bridge
            if (window.AndroidBridge) {
                window.AndroidBridge.updateFirebaseLocation(userid, lat, lng);
            }
        }, (error) => console.log(error), { enableHighAccuracy: true });
    }
}