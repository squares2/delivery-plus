import { getCoordinates, updateCoordinates,showPopup } from './database.js';

// 1. GLOBAL VARIABLES
let map, marker, selectedCoords;

// 2. INIT FUNCTION (The Core Setup)
window.initMap = async function() {
    console.log("initMap has started...");

    const defaultPos = { lat: 33.8938, lng: 35.5018 }; // Beirut
    let finalPos = defaultPos;

    try {
        const userData = await getCoordinates(); 
        if (userData) {
            const lat = parseFloat(userData.lat || userData.lat);
            const lng = parseFloat(userData.lng || userData.lng);
            if (!isNaN(lat) && !isNaN(lng)) {
                finalPos = { lat, lng };
            }
        }
    } catch (error) {
        console.error("Firebase fetch failed:", error);
    }

    const mapElement = document.getElementById("map-box");
    if (!mapElement) return;

    // Initialize Map
    map = new google.maps.Map(mapElement, {
    zoom: 15,
    center: finalPos,
    mapTypeId: 'hybrid', // This adds the road/label overlay to the satellite view
    mapTypeControl: false,
    streetViewControl: false
});
	map.addListener("click", (mapsMouseEvent) => {
    // 2. Get the coordinates of where the user clicked
    const clickedPos = mapsMouseEvent.latLng;
    
    // 3. Move the marker to that exact spot
    marker.setPosition(clickedPos);
    
    // 4. Center the map on that spot (optional, but smoother)
    // map.panTo(clickedPos); 

    // 5. Save the coordinates to your global variable
    selectedCoords = { 
        lat: clickedPos.lat(), 
        lng: clickedPos.lng() 
    };

    console.log("Map clicked at:", selectedCoords);
});
    // Initialize Marker with DRAGGABLE enabled immediately
    marker = new google.maps.Marker({
        position: finalPos,
        map: map,
        title: "Your Location",
        draggable: true, // CRITICAL: This allows dragging
        animation: google.maps.Animation.DROP
    });

    selectedCoords = finalPos;

    // SAVE LOCATION AFTER MANUAL DRAG
    google.maps.event.addListener(marker, 'dragend', function() 
	{
        const newPos = marker.getPosition();
        selectedCoords = { lat: newPos.lat(), lng: newPos.lng() };
        console.log("Manual move saved:", selectedCoords);
    });
};

// 🌍 GLOBAL COORDINATES (To use later in your app)
const shareLocation = document.getElementById('myLocation');
document.body.addEventListener('click', function(event) 
{
    if (event.target && event.target.matches('#myLocation')) {
        const toggle = event.target;
        const mapBtn = document.getElementById('open-map-trigger');
        const place_order = document.getElementById('place_order');

					
        if (toggle.checked) 
		{
			// Disable button and make it gray
			if (place_order) 
			{
				place_order.disabled = true;
				place_order.style.backgroundColor = "#cccccc"; 
				place_order.style.color = "#666666";
				place_order.style.borderColor = "#cccccc";
				place_order.style.cursor = "not-allowed";
			}
			// Disable button and make it gray
			if (mapBtn) 
			{
				mapBtn.disabled = true;
				mapBtn.style.backgroundColor = "#cccccc"; 
				mapBtn.style.color = "#666666";
				mapBtn.style.borderColor = "#cccccc";
				mapBtn.style.cursor = "not-allowed";
			}

            console.log("No stored coords. Requesting physical GPS hardware...");

            navigator.geolocation.getCurrentPosition(
                // 🟢 SUCCESS CALLBACK
                (position) => 
				{
                    window.lat = position.coords.latitude;
                    window.lng = position.coords.longitude;
                    showPopup("You Request Set At Your Phone Location");

                    // Disable button and make it gray
					if (place_order) 
					{
						place_order.disabled = false;
						place_order.style.backgroundColor = ""; 
						place_order.style.color = "";
						place_order.style.borderColor = "";
						place_order.style.cursor = "pointer";
					}
                },
                // 🔴 FAILURE CALLBACK
                (error) => 
				{
                    console.error("GPS Error Code:", error.code);
                    showPopup("Location access denied or failed.");
                    toggle.checked = false; 
                },
                {
                    enableHighAccuracy: true,
                    timeout: 5000 
                }
            );
        } 
		else 
		{
            // ⚪ USER UNCHECKED THE BOX
            console.log("Checkbox unchecked. Restoring button...");
            
            if (mapBtn) 
			{
                mapBtn.disabled = false;
                window.lat=34;
				window.lng=36;
                // Clear the inline styles to restore your original CSS file colors
                mapBtn.style.backgroundColor = ""; 
                mapBtn.style.color = "";
                mapBtn.style.borderColor = "";
                mapBtn.style.cursor = "pointer";
            }
        }
    }
});

// 3. UI LOGIC (Fixed for Dynamic Fetching)
document.addEventListener('click', function(event) {
    const modal = document.getElementById('mapModal');
    
    // --- 1. OPEN MODAL LOGIC (Event Delegation) ---
    // This catches the click even if the sidebar is fetched late
    const openBtn = event.target.closest('#open-map-trigger');
    const openBtn2 = event.target.closest('#open-map-trigger2');

    if (openBtn || openBtn2) {
        window.mapSaveMode = openBtn ? 'firebase' : 'local';
        console.log("Map Save Mode:", window.mapSaveMode);
        
        if (modal) {
            modal.style.display = "block";
            // Give the map a moment to resize after showing the modal
            setTimeout(() => {
                if (map && marker) {
                    google.maps.event.trigger(map, "resize");
                    map.setCenter(marker.getPosition());
                }
            }, 300);
        }
    }

    // --- 2. CLOSE MODAL LOGIC ---
    if (event.target.id === 'close-modal' || event.target.closest('#close-modal')) {
        if (modal) modal.style.display = "none";
    }

    // --- 3. ONE-CLICK LOCATE LOGIC ---
    if (event.target.id === 'one-click-locate' || event.target.closest('#one-click-locate')) {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by this browser.");
            return;
        }

        navigator.geolocation.getCurrentPosition((position) => {
            const pos = { 
                lat: position.coords.latitude, 
                lng: position.coords.longitude 
            };
            if (map && marker) {
                map.setCenter(pos);
                map.setZoom(17);
                marker.setPosition(pos);
                selectedCoords = pos;
            }
        }, (error) => {
            alert("Location access denied.");
        }, { enableHighAccuracy: true });
    }

    // --- 4. SAVE LOGIC ---
    if (event.target.id === 'confirm-save-btn' || event.target.closest('#confirm-save-btn')) {
        handleSaveLocation();
    }
});

// Helper function for saving to keep the click listener clean
async function handleSaveLocation() {
    if (selectedCoords) {
        try {
            if (window.mapSaveMode === 'firebase') {
                await updateCoordinates(selectedCoords.lat, selectedCoords.lng);
                showPopup("Your New Location Saved!");
            } else {
                // Your Local Save Logic
                window.lat = selectedCoords.lat;
                window.lng = selectedCoords.lng;
                showPopup("Location set for this order!");
            }
            document.getElementById('mapModal').style.display = "none";
        } catch (err) {
            console.error("Save failed:", err);
        }
    }
}
// Manual Trigger for Google Maps
if (typeof google !== 'undefined' && google.maps) {
    window.initMap();
}