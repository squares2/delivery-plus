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
            const lat = parseFloat(userData.lat || userData.y);
            const lng = parseFloat(userData.lng || userData.x);
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
        mapTypeControl: false,
        streetViewControl: false
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

// 3. UI LOGIC
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('mapModal');
    const openBtn = document.getElementById('open-map-trigger');
    const closeBtn = document.getElementById('close-modal');
    const locateBtn = document.getElementById('one-click-locate');
    const saveBtn = document.getElementById('confirm-save-btn');

    // Open Modal Logic
    if (openBtn) {
        openBtn.onclick = () => {
            modal.style.display = "block";
            setTimeout(() => {
                if (map) {
                    google.maps.event.trigger(map, "resize");
                    map.setCenter(marker.getPosition());
                }
            }, 300); 
        };
    }

    // Close Modal Logic
    if (closeBtn) {
        closeBtn.onclick = () => modal.style.display = "none";
    }

    // ONE-CLICK LOCATE LOGIC
    if (locateBtn) {
        locateBtn.onclick = () => {
            if (navigator.geolocation) {
                // Open modal so user sees the "magic" happen
                modal.style.display = "block";

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
                        console.log("One-click location set:", selectedCoords);
                    }
                }, (error) => {
                    alert("Location access denied. Please drag the pin manually.");
                }, { enableHighAccuracy: true });
            } else {
                alert("Browser does not support geolocation.");
            }
        };
    }

    // SAVE TO DATABASE
    if (saveBtn) 
	{
        saveBtn.onclick = async () => 
		{
            if (selectedCoords) 
			{
                try 
				{
                    await updateCoordinates(selectedCoords.lng,selectedCoords.lat);
                    showPopup("Your New Location Saved!");
                    modal.style.display = "none";
                } 
				catch (err) 
				{
                    showPopup("Error saving location.");
                }
            }
        };
    }
});



// Manual Trigger for Google Maps
if (typeof google !== 'undefined' && google.maps) {
    window.initMap();
}
