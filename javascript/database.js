var cartCount=0;
var cartItems=[];
window.lat = 34;
window.lng = 36;

// Global variable for delivery
export var totalDelivery = 0;

//[{id: '6', title: 'bananas', price: 1, image: 'items/6.png', qty: 1}]
var cartItemsDriver=[];
var saleEnd=Date.now()+12*60*60*1000;

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getDatabase,onDisconnect,query, push ,set, get, update, remove, ref, increment, runTransaction, child, onValue,orderByChild,equalTo,onChildChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";
import { getFirestore, doc, getDocs,setLogLevel,collection, where, limit  } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCSTThgge2nSFlEQXjS1ta2tZXvVgNAnZ0",
    authDomain: "deliveryonline-300f7.firebaseapp.com",
    databaseURL: "https://deliveryonline-300f7-default-rtdb.firebaseio.com",
    projectId: "deliveryonline-300f7",
    storageBucket: "deliveryonline-300f7.firebasestorage.app",
    messagingSenderId: "360058447266",
    appId: "1:360058447266:web:5ac25e3ad30f636bdd3efb"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const dbf = getFirestore(app); // Firestore instance
const db = getDatabase(app);   // Realtime Database instance
const dbref=ref(db);

  
const storedData = localStorage.getItem('delivoUser');
if (storedData) 
{
	var username;
	var userid;
	const user = JSON.parse(storedData);
	username=user.username;
	userid=user.id;
//	updateColumn("users",userid,"timestamp",Date.now());
}

const storedData2 = localStorage.getItem('delivoDriver');
if (storedData2) 
{
	var driverusername;
	var driverowner;
	var driverid;
	const driver = JSON.parse(storedData2);
	driverusername=driver.driverusername;
	driverowner=driver.driverowner;
	driverid=driver.id;
	//startDriverTracking(driverid);
	onLoginSuccess(driverid);
	updateColumn('drivers',driverid,'timestamp',Date.now());
	updateColumn('drivers',driverid,'status','online');
}



	if(storedData)
	{
		const userStatusRef  = ref(db, "users/"+userid+"/status");
		const timestampRef = ref(db, "users/" + userid + "/timestamp");

		onValue(userStatusRef, (snapshot) => 
		{
			const presence = onDisconnect(userStatusRef);
			const presence2 = onDisconnect(timestampRef);
    
			// Now call .set() on the result of that function
			presence.set("offline");
			presence2.set(Date.now());

			// Finally, set the user to online
			set(userStatusRef, "online");
		});
	}

	const maintenanceRef = ref(db, "maintenance/1");
	onValue(maintenanceRef, (snapshot) => 
	{
	    if (snapshot.exists()) 
		{
	        const data = snapshot.val();
	        if (!data.state)document.body.classList.add('site-closed');
			else document.body.classList.remove('site-closed');
	    }
	});
	
	const requestRef = ref(db, "requests");
	onValue(requestRef, (snapshot) => 
	{
	    if (snapshot.exists()) 
		{
	        distributeDriver();
	    }
	});
	
	onChildChanged(requestRef, (snapshot) => 
	{
    const updatedRequest = snapshot.val();
    const requestId = snapshot.key;

    // 1. Precise Check: Only refresh if 'trackorder' is present in the change
    // Since onChildChanged returns the whole child, we compare or just check existence
    if (updatedRequest.hasOwnProperty('trackorder')) 
	{
        console.log(`Track status changed for ${requestId}. Refreshing UI...`);
        const storedData = localStorage.getItem('delivoUser');
        if (storedData) 
		{
            const username = JSON.parse(storedData).username;
            // 2. Refresh only the history table to reflect the new button state
            distributeHistory(username);
			getHomeTrack(username);
        }
    }
});
	const requestcustomerRef = ref(db, "historyRequests");
	onValue(requestcustomerRef, (snapshot) => 
	{
	    if (snapshot.exists()) 
		{
			if (username) 
			{
				distributeHistory(userid);
			}	        
	    }
	});
	
	const patternRef = ref(db, "pattern");

	onValue(patternRef, (snapshot) => 
	{
	    if (snapshot.exists()) 
		{
	        getCompanies();
	    }
	});
/*	
window.initLiveTracking = function(orderId, driverId) {
    // 1. Show the tracking modal
    const trackModal = new bootstrap.Modal(document.getElementById('trackingModal'));
    trackModal.show();

    // 2. Initialize Google Map
    const map = new google.maps.Map(document.getElementById("live-tracking-map"), {
        zoom: 15,
        center: { lat: 0, lng: 0 },
        styles: [] // You can add custom dark mode styles here
    });

    const driverMarker = new google.maps.Marker({
        position: { lat: 0, lng: 0 },
        map: map,
        icon: {
            url: "https://google.com", // Delivery icon
            scaledSize: new google.maps.Size(40, 40)
        }
    });

    // 3. Listen to Driver's Real-time location in Firebase
    // Adjust the path "drivers/${driverId}/location" to match your actual database path
    const driverLocRef = ref(db, `drivers/${driverId}/location`);
    
    onValue(driverLocRef, (snapshot) => {
        if (snapshot.exists()) {
            const loc = snapshot.val();
            const pos = { lat: parseFloat(loc.lat), lng: parseFloat(loc.lng) };

            driverMarker.setPosition(pos);
            map.panTo(pos);
            document.getElementById('tracking-status').innerText = "Driver is on the way!";
        } else {
            document.getElementById('tracking-status').innerText = "Waiting for driver GPS...";
        }
    });
};
*/
	
window.onload = function() 
{
    
    if (username) 
	{
		const savedImage = localStorage.getItem('userProfileImage');
		if (savedImage) 
		{
			const pfpElement = document.getElementById('sidebar-pfp');
			if (pfpElement)pfpElement.src = savedImage;
		}
		
        updateNavToLoggedIn(username);
		updateProfileInfos(userid);
		//updateProfileImage(user.username,user.id);
    }
};
async function checkTrack(requestId) {
    try {
        const snapshot = await get(child(ref(db), `requests/${requestId}`));
        
        if (snapshot.exists()) {
            const data = snapshot.val();
            // Check if trackorder is 1 (handles both string "1" and number 1)
            return data.trackorder == "1" || data.trackorder == 1;
        }
        
        return false; // Request not found
    } catch (error) {
        console.error("Error checking tracking status:", error);
        return false;
    }
}
function updateColumn(entity, key, column, value) 
{
  
  // Create an updates object with the dynamic column name
  var updates = {};
  updates[`/${entity}/${key}/${column}`] = value;

  // Perform the update
  return update(ref(db), updates)
    .then(() => {
      console.log(`Successfully updated ${key} status to ${value}`);
    })
    .catch((error) => {
      console.error("Error updating field: ", error);
    });
}
export async function updateCoordinates(lat,lng) 
{
    if (username) 
	{
		const userRef = ref(db, `users/${userid}`);
		
		// update() only changes the fields you specify; 
		// it keeps existing fields (like your coordinates) untouched.
		await update(userRef, 
		{
			lat: lat,
			lng: lng
		});
	}
}
export async function getCoordinates()
{
    if (username) 
	{
		const userRef = ref(db, `users/${userid}`);
		
		try 
		{
			const snapshot = await get(userRef);

			if (snapshot.exists()) 
			{
				const userData = snapshot.val();
				return userData;
			} 
			else 
			{
				return null;
			}
		} 
		catch (error) 
		{
			console.error("Error fetching user:", error);
			throw error;
		}
	}
	else return null;
	
}
async function updateProfileInfos(autoNumberId) 
{
    // Create a reference directly to users/ID_HERE
    const userRef = ref(db, `users/${autoNumberId}`);
	
    try 
	{
        const snapshot = await get(userRef);

        if (snapshot.exists()) 
		{
            const userData = snapshot.val();
			const profilename=document.getElementById('profilename');
			const profilepoints=document.getElementById('profilepoints');
			if(profilename)
			{
				if(userData.fullname&&userData.fullname.length>0)profilename.innerHTML=userData.fullname;
				else profilename.innerHTML=userData.username;
				const points=userData.points;
				var p="point";
				if(points>1)p="points";
				profilepoints.innerHTML="Balance : "+points+" "+p;
			}		
        } 
		else 
		{
            
        }
    } 
	catch (error) 
	{
        console.error("Error fetching user:", error);
        throw error;
    }
}
function updateProfileData(userId)
{
    // This adds 1 directly on the server without reading it first
    return update(ref(db, 'globalCounter'), 
	{
        last_request_id: increment(1)
    });
}

function updateProfileImage(username, userId) {
    // Finds ALL elements with the id "sidebar-pfp"
    // Use '.sidebar-pfp' if you switch to using a class
    const pfps = document.querySelectorAll('#sidebar-pfp');

    pfps.forEach(pfp => {
        // 1. Set the error handler first
        pfp.onerror = function() {
            console.log("Custom image not found for an element, loading default...");
            this.onerror = null; // Prevent infinite loops
            this.src = 'users/0.png';
        };

        // 2. Set the source second
        pfp.src = "users/" + username + ".png";
    });
}
function updateRequestAndHistory(requestId, userid, newState) 
{
  const db = getDatabase();
  const rootRef = ref(db);

  // Define the multiple paths you want to update
  const updates = {};
  
  // Path 1: Update the primary request
  updates[`/requests/${requestId}/state`] = newState;
  
  // Path 2: Update the nested history entry using dot-notation paths
  // This updates only the 'state' field without overwriting the rest of the object
  if(userid&&userid.length>0)updates[`/historyRequests/${userid}/${requestId}/state`] = newState;

  try {
    // Perform the update atomically
    update(rootRef, updates);
    console.log("Both locations updated successfully!");
  } catch (error) {
    console.error("Error updating database:", error);
  }
}
export function updateProfileInfo(userid, username, fullname,phone) 
{
	console.log('update function')
  const db = getDatabase();
  const rootRef = ref(db);

  // Define the multiple paths you want to update
  const updates = {};
  
  // Path 1: Update the primary request
  updates[`/users/${userid}/username`] = username;
  updates[`/users/${userid}/fullname`] = fullname;
  updates[`/users/${userid}/phone`] = phone;
  

  try {
    // Perform the update atomically
    update(rootRef, updates);
    console.log("Both locations updated successfully!");
  } catch (error) {
    console.error("Error updating database:", error);
  }
}

async function generateRequestId() 
{
    // This adds 1 directly on the server without reading it first
    return update(ref(db, 'globalCounter'), 
	{
        last_request_id: increment(1)
    });
}
async function updateRequestState(requestid,newState) 
{
	const targetPath = "requests/"+requestid;
	const updates = 
	{
		state: newState
	};

	try 
	{
		await update(ref(db, targetPath), updates);
	} 
	catch (error) 
	{
		console.error("Error updating state: ", error);
	}
}

function getCompanies()
{
	const list = document.getElementById('companieslist');
	const list2 = document.getElementById('companieslist2');
	const list3 = document.getElementById('companieslist3');
	const list4 = document.getElementById('companieslist4');
	var inner="";
	
	get(child(dbref,"pattern")).then((snapshot) => 
	{
		if (snapshot.exists()) 
		{
			const data = snapshot.val();
			const keys = Object.keys(data);
			let i = 0;
			let j = 0;
			let compname="";
			let soon="";
			while (i < keys.length) 
			{
				const key = keys[i];
				const item = data[key];
				j=0;
				inner+="<div class='col-6 col-lg-3'><h6 class='fw-semibold main-category-dark'>"+key+"</h6>"
				while (j < item.length)
				{
					compname=item[j].companyname;
					if(item[j].soon=="1")soon="soon";
					else soon="";
					inner+="<a class='dropdown-item sub-category-dark "+soon+"' href='category.html?category="+compname+"&pattern="+key+"'>"+compname+"</a>"
					j++
				}	
				i++;
				inner+="</div>";
			}
			if(list!=null)
			{
				list.innerHTML=inner;
			}	
			if(list2!=null)
			{
				list2.innerHTML=inner;
			}	
			if(list3!=null)
			{
				list3.innerHTML=inner;
			}	
			if(list4!=null)
			{
				list4.innerHTML=inner;
			}	
		} 
		else 
		{
			console.log("No data available");
		}
	}).catch((error) => 
	{
		console.error(error);
	});
}
export async function getHomeTrack(uname)
{
	get(child(dbref, "requests")).then(async (snapshot) => 
	{
        if (snapshot.exists()) 
		{
			var counter=0;
			var firstkey=-1;
			var dId=-1
			var key;
            const data = snapshot.val();
            
            const keys = Object.keys(data).sort((a, b) => {
                const numA = parseInt(a.split('_')[1]) || 0;
                const numB = parseInt(b.split('_')[1]) || 0;
                return numB - numA; 
            });

            // 2. Switched from .forEach to 'for...of' to allow 'await' inside the loop
            for (key of keys) 
			{
                const item = data[key];
                
                if (item.username==uname&&item.vault == "0"&&item.state == "0" && item.trackorder == '1'&&item.lat&&item.lat.length>0) 
				{
                    counter++;
					if(firstkey==-1)firstkey=key;
                    // 3. This 'await' will now work correctly
                    const dId = await getUserId(item.username);
				}
			}
			const hometrack = document.getElementById('hometrack');

if (hometrack) {
    if (counter == 0) {
        // HIDE
        hometrack.classList.add('d-none');
        hometrack.classList.remove('d-flex');
    } 
    else if (counter == 1) {
        let finalDriverId = "";
        try {
            const requestSnap = await get(child(dbref, `requests/${firstkey}`));
            if (requestSnap.exists()) {
                const reqData = requestSnap.val();
                if (reqData.trackorder == "1" || reqData.trackorder == 1) {
                    const driverName = reqData.driver;
                    const driverSnap = await get(child(dbref, `drivers`));
                    if (driverSnap.exists()) {
                        const allDrivers = driverSnap.val();
                        for (let dKey in allDrivers) {
                            if (allDrivers[dKey].owner === driverName || dKey === driverName) {
                                finalDriverId = dKey;
                                break;
                            }
                        }
                    }
                }
            }
        } catch (e) { console.error("Tracking check failed", e); }

        // SHOW as Flexbox
        hometrack.classList.remove('d-none');
        hometrack.classList.add('d-flex');

        hometrack.onclick = function(e) {
            e.preventDefault(); // Stop page jump
            openTrackingModal(firstkey, finalDriverId);
        };
    } 
    else {
        // SHOW as Flexbox for multiple orders
        hometrack.classList.remove('d-none');
        hometrack.classList.add('d-flex');

        hometrack.onclick = function(e) {
            e.preventDefault();
            window.location.href = "trackorders.html";
        };
    }
}
		}
    }).catch(console.error);
}
function distributeDriver() {
    const params = new URLSearchParams(window.location.search);
    let historyValue = params.get('history') || 0;
    const link1 = document.getElementById('history');
    if (link1) {
        if (historyValue == 1) {
            link1.href = "?history=0";
            link1.innerHTML = "<i class='fa-solid fa-house me-2'></i>Main";
        } else {
            link1.href = "?history=1";
            link1.innerHTML = "<i class='fa-solid fa-clock-rotate-left me-2'></i>History";
        }
    }

    const drivershiptable = document.getElementById('drivershiptable');
    
    if (driverowner == null) {
        if (drivershiptable) drivershiptable.innerHTML = "";
        return;
    }

    var inner1 = "<thead><tr><th>Ship Number</th><th>Owner</th><th>Owner Phone</th><th>Owner Address</th>";
    inner1 += "<th>Amount</th><th>Due Date</th><th>Status</th></tr></thead><tbody>";
    var inner2 = "";
    
    var countndelivered = document.getElementById('count-ndelivered');
    var countdelivered = document.getElementById('count-delivered');
    var countdelayed = document.getElementById('count-delayed');
    var countcanceled = document.getElementById('count-canceled');
    var countpcanceled = document.getElementById('count-pcanceled');
    
    var totdel=0, totndel=0, totdelayed=0, totcancel=0, totpcancel=0;

    // 1. Added 'async' to the snapshot callback
    get(child(dbref, "requests")).then(async (snapshot) => 
	{
        if (snapshot.exists()) {
            const data = snapshot.val();
            
            const keys = Object.keys(data).sort((a, b) => {
                const numA = parseInt(a.split('_')[1]) || 0;
                const numB = parseInt(b.split('_')[1]) || 0;
                return numB - numA; 
            });

            // 2. Switched from .forEach to 'for...of' to allow 'await' inside the loop
            for (const key of keys) 
			{
                const item = data[key];
                
                if (item.driver === driverowner && ((item.vault == "1" && historyValue == 1) || (item.vault == "0" && historyValue == 0))) {
                    
                    // 3. This 'await' will now work correctly
                    const uId = await getUserId(item.username);

                    let stateClass = "";
                    let stateText = "";

                    if (item.state == "0") { stateClass = "btn-ndelivered"; stateText = "Not Delivered"; totndel++; }
                    else if (item.state == "1") { stateClass = "btn-delivered"; stateText = "Delivered"; totdel++; }
                    else if (item.state == "2") { stateClass = "btn-canceled"; stateText = "Canceled"; totcancel++; }
                    else if (item.state == "3") { stateClass = "btn-delayed"; stateText = "Delayed"; totdelayed++; }
                    else if (item.state == "5") { stateClass = "btn-pcanceled"; stateText = "Canceled Payed"; totpcancel++; }

                    let trackBtnHtml = "";
                    // Using await for checkTrack because it is also an async function
                    if (item.vault != "1" && item.state == "0"&&item.lat.length>0) 
					{
                        const isTracking = await checkTrack(key);
                        const btnColor = isTracking ? "btn-danger" : "btn-success";
                        const btnText = isTracking ? "Stop Tracking" : "Start Tracking";
                        
                        trackBtnHtml = `
                            <button class="btn btn-sm ${btnColor} track-btn-main action-track" 
                                    data-orderid="${key}"> 
                                <i class="fa-solid fa-location-arrow me-1"></i> ${btnText}
                            </button>`;
                    }

                    inner2 += `<tr class="expandable">`;
                    inner2 += `<td data-label='Ship Number'>
                                <span class="desktop-only-text">${key}</span>
                                <div class="mobile-summary-row">
                                    <span class="toggle-icon" onclick="toggleCard(this)">+</span>
                                    <div class="shrink-track-wrapper">${trackBtnHtml}</div>
                                    <span class="m-ship">#${key}</span>
                                    <span class="m-total">${item.total} $</span>
                                    <span class="m-status-badge ${stateClass}">${stateText}</span>
                                </div>
                               </td>`;

                    inner2 += `<td data-label='Owner'>${item.fullname}</td>`;
                    inner2 += `<td data-label='Owner Phone'>${item.phone}</td>`;
                    inner2 += `<td data-label='Owner Address'>${item.city}/${item.street}</td>`;
                    inner2 += `<td data-label='Amount'>${item.total}</td>`;
                    inner2 += `<td data-label='Due Date'>${item.date}</td>`;
                    
                    inner2 += `<td data-label='Status'>
                                <div class='status-selector' data-user='${uId}' data-shipnumber='${key}'>`;
                    
                    if ((item.state == "0" && historyValue == 1) || historyValue == 0) 
                        inner2 += `<button class="status-btn btn-ndelivered ${item.state == '0' ? 'active' : ''}">Not Delivered</button>`;
                    if ((item.state == "1" && historyValue == 1) || historyValue == 0) 
                        inner2 += `<button class="status-btn btn-delivered ${item.state == '1' ? 'active' : ''}">Delivered</button>`;
                    if ((item.state == "3" && historyValue == 1) || historyValue == 0) 
                        inner2 += `<button class="status-btn btn-delayed ${item.state == '3' ? 'active' : ''}">Delayed</button>`;
                    if ((item.state == "2" && historyValue == 1) || historyValue == 0) 
                        inner2 += `<button class="status-btn btn-canceled ${item.state == '2' ? 'active' : ''}">Canceled</button>`;
                    if ((item.state == "5" && historyValue == 1) || historyValue == 0) 
                        inner2 += `<button class="status-btn btn-pcanceled ${item.state == '5' ? 'active' : ''}">Canceled Payed</button>`;
                    
                    if (historyValue == 0) 
                        inner2 += `<button id='cartdriverdetail' data-shipnumber='${key} 'data-username='${item.username}' class='status-btn2 btn-items'>Items</button>`;
                    
                    inner2 += `</div>
                               <div class="expanded-track-wrapper">${trackBtnHtml}</div>
                               </td></tr>`;
                }
            }

            inner2 += "</tbody>";
            if (drivershiptable) drivershiptable.innerHTML = inner1 + inner2;

            if (countndelivered) countndelivered.innerHTML = totndel;
            if (countdelivered) countdelivered.innerHTML = totdel;
            if (countdelayed) countdelayed.innerHTML = totdelayed;
            if (countcanceled) countcanceled.innerHTML = totcancel;
            if (countpcanceled) countpcanceled.innerHTML = totpcancel;

        } else {
            inner2 += "<tr><td colspan='7' class='text-center'>No data available</td></tr></tbody>";
            if (drivershiptable) drivershiptable.innerHTML = inner1 + inner2;
        }
    }).catch(console.error);
}

var shiptable = document.getElementById('drivershiptable');

if (shiptable) {
    shiptable.addEventListener('click', function(e) {
        const btn = e.target.closest('.action-track');
        if (!btn) return;

        const dataorderId = btn.getAttribute('data-orderid');
        
        // Check if the button is currently in 'Start' or 'Stop' mode
        // If it has 'btn-success', it means it's ready to START (1)
        // If it has 'btn-danger', it means it's ready to STOP (0)
        const isCurrentlyTracking = btn.classList.contains('btn-danger');
        const newState = isCurrentlyTracking ? '0' : '1';

        // Update Firebase
        updateColumn('requests', dataorderId, 'trackorder', newState);
        
        console.log(`Order ${dataorderId} tracking set to: ${newState}`);

        // IMPORTANT: Refresh the UI after update so the button changes color/text
        // This calls the function you previously built
        distributeDriver(); 
    });
}

// Global Toggle Function for driver.html
window.toggleCard = function(btnElement) {
    const currentRow = btnElement.closest('tr');
    const isExpanded = currentRow.classList.contains('expanded');

    // Collapse others
    document.querySelectorAll('.mobile-table tr.expanded').forEach(row => {
        row.classList.remove('expanded');
        const icon = row.querySelector('.toggle-icon');
        if (icon) icon.textContent = '+';
    });

    // Expand current
    if (!isExpanded) {
        currentRow.classList.add('expanded');
        btnElement.textContent = '−';
    }
};
export function distributeHistory(username) {
    const historyshiptable = document.getElementById('historyshiptable');
    if (historyshiptable) historyshiptable.innerHTML = "";
    
    var inner1 = "<thead><tr><th>Ship Number</th><th>Full Name</th><th>Phone</th><th>Address</th>";
    inner1 += "<th>Amount</th><th>Due Date</th><th>Status</th></tr></thead><tbody>";
    
    var countndelivered = document.getElementById('count-ndelivered');
    var countdelivered = document.getElementById('count-delivered');
    var countdelayed = document.getElementById('count-delayed');
    var countcanceled = document.getElementById('count-canceled');
    var countpcanceled = document.getElementById('count-pcanceled');
    
    var totdel = 0, totndel = 0, totdelayed = 0, totcancel = 0, totpcancel = 0;

    get(child(dbref, "historyRequests/" + userid)).then(async (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const keys = Object.keys(data).sort((a, b) => {
                const numA = parseInt(a.replace(/\D/g, '')) || 0;
                const numB = parseInt(b.replace(/\D/g, '')) || 0;
                return numB - numA; 
            });

            const rowPromises = keys.map(async (key) => {
                const item = data[key];
                let stateClass = "";
                let stateText = "";

                if (item.state == "0") { stateClass = "btn-ndelivered"; stateText="Not Delivered"; totndel++; }
                else if (item.state == "1") { stateClass = "btn-delivered"; stateText="Delivered"; totdel++; }
                else if (item.state == "2") { stateClass = "btn-canceled"; stateText="Canceled"; totcancel++; }
                else if (item.state == "3") { stateClass = "btn-delayed"; stateText="Delayed"; totdelayed++; }
                else if (item.state == "5") { stateClass = "btn-pcanceled"; stateText="Canceled Paid"; totpcancel++; }

                let finalDriverId = "";
                
                try {
                    // 1. Get live data from 'requests' node for this specific Ship Number
                    const requestSnap = await get(child(dbref, `requests/${key}`));
                    if (requestSnap.exists()) 
					{
                        const reqData = requestSnap.val();
                        
                        // 2. CHECK TRACKORDER FROM REQUESTS (Live)
                        if (reqData.trackorder == "1"&&reqData.lat&&reqData.lat.length>0) 
						{
                            const driverName = reqData.driver; // e.g., "JohnDoe"
                            
                            // 3. Get the Driver's Unique ID/Key from 'drivers' node
                            const driverSnap = await get(child(dbref, `drivers`));
                            if (driverSnap.exists()) 
							{
                                const allDrivers = driverSnap.val();
                                // Find the key where the driver's info matches the name
                                for (let dKey in allDrivers) 
								{
                                    if (allDrivers[dKey].owner === driverName || dKey === driverName) {
                                        finalDriverId = dKey; 
                                        break;
                                    }
                                }
                            }
                        }
                    }
                } catch (e) { console.error("Tracking check failed", e); }

                let trackButtonHtml = "";
				
                if (finalDriverId) {
                    trackButtonHtml = `
                        <button class="btn btn-warning track-btn-main" 
                                onclick="openTrackingModal('${key}', '${finalDriverId}')">
                            <i class="fa-solid fa-location-dot"></i> Track
                        </button>`;
                }

                return `
                <tr class="expandable">
                    <td data-label='Ship Number'>
                        <span class="desktop-only-text">${key}</span>
                        <div class="mobile-summary-row">
                            <span class="toggle-icon" onclick="toggleCard(this)">+</span>
                            <div class="shrink-track-wrapper">${trackButtonHtml}</div>
                            <span class="m-ship">#${key}</span>
                            <span class="m-total">${item.total} $</span>
                            <span class="m-status-badge ${stateClass}">${stateText}</span>
                        </div>
                    </td>
                    <td data-label='Full Name'>${item.fullname}</td>
                    <td data-label='Phone'>${item.phone}</td>
                    <td data-label='Address'>${item.city}/${item.street}</td>
                    <td data-label='Amount'>${item.total} $</td>
                    <td data-label='Due Date'>${item.date}</td>
                    <td data-label='Status'>
                        <div class='status-selector' data-username='${item.username}' data-shipnumber='${key}'>
                            <button class='status-btn ${stateClass} active'>${stateText}</button>
                            <button id='carthistorydetail' data-shipnumber='${key}' class='status-btn2 btn-items'>Items</button>
                        </div>
                        <div class="expanded-track-wrapper">${trackButtonHtml}</div>
                    </td>
                </tr>`;
            });

            const rows = await Promise.all(rowPromises);
            if (historyshiptable) historyshiptable.innerHTML = inner1 + rows.join("") + "</tbody>";
            
            if (countndelivered) countndelivered.innerHTML = totndel;
            if (countdelivered) countdelivered.innerHTML = totdel;
            if (countdelayed) countdelayed.innerHTML = totdelayed;
            if (countcanceled) countcanceled.innerHTML = totcancel;
            if (countpcanceled) countpcanceled.innerHTML = totpcancel;
        } else {
            if (historyshiptable) historyshiptable.innerHTML = inner1 + "<tr><td colspan='7' class='text-center'>No Orders Exist</td></tr></tbody>";
        }
    });
}
export function distributeTrack(username) 
{
    const historytracktable = document.getElementById('historytracktable');
    if (historytracktable) historytracktable.innerHTML = "";
    
    var inner1 = "<thead><tr><th>Ship Number</th><th>Full Name</th><th>Phone</th><th>Address</th>";
    inner1 += "<th>Amount</th><th>Due Date</th><th>Status</th></tr></thead><tbody>";
    
    var countndelivered = document.getElementById('count-ndelivered');
    var countdelivered = document.getElementById('count-delivered');
    var countdelayed = document.getElementById('count-delayed');
    var countcanceled = document.getElementById('count-canceled');
    var countpcanceled = document.getElementById('count-pcanceled');
    
    var totdel = 0, totndel = 0, totdelayed = 0, totcancel = 0, totpcancel = 0;

    get(child(dbref, "requests/")).then(async (snapshot) => {
        if (snapshot.exists()) 
		{
            const data = snapshot.val();
            const keys = Object.keys(data).sort((a, b) => 
			{
                const numA = parseInt(a.replace(/\D/g, '')) || 0;
                const numB = parseInt(b.replace(/\D/g, '')) || 0;
                return numB - numA; 
            });

            const rowPromises = keys.map(async (key) => 
			{
                const item = data[key];
                let stateClass = "";
                let stateText = "";
				if(item.username==username&&item.trackorder=="1")
				{
					if (item.state == "0") { stateClass = "btn-ndelivered"; stateText="Not Delivered"; totndel++; }
					else if (item.state == "1") { stateClass = "btn-delivered"; stateText="Delivered"; totdel++; }
					else if (item.state == "2") { stateClass = "btn-canceled"; stateText="Canceled"; totcancel++; }
					else if (item.state == "3") { stateClass = "btn-delayed"; stateText="Delayed"; totdelayed++; }
					else if (item.state == "5") { stateClass = "btn-pcanceled"; stateText="Canceled Paid"; totpcancel++; }

					let finalDriverId = "";
					
					try 
					{
						// 1. Get live data from 'requests' node for this specific Ship Number
						const requestSnap = await get(child(dbref, `requests/${key}`));
						if (requestSnap.exists()) 
						{
							const reqData = requestSnap.val();
							
							const driverName = reqData.driver; // e.g., "JohnDoe"
							
							// 3. Get the Driver's Unique ID/Key from 'drivers' node
							const driverSnap = await get(child(dbref, `drivers`));
							if (driverSnap.exists()) 
							{
								const allDrivers = driverSnap.val();
								// Find the key where the driver's info matches the name
								for (let dKey in allDrivers) 
								{
									if (allDrivers[dKey].owner === driverName || dKey === driverName) {
										finalDriverId = dKey; 
										break;
									}
								}
							}
						}
					} catch (e) { console.error("Tracking check failed", e); }

					let trackButtonHtml = "";
					
					if (finalDriverId) {
						trackButtonHtml = `
							<button class="btn btn-warning track-btn-main" 
									onclick="openTrackingModal('${key}', '${finalDriverId}')">
								<i class="fa-solid fa-location-dot"></i> Track
							</button>`;
					}

					return `
					<tr class="expandable">
						<td data-label='Ship Number'>
							<span class="desktop-only-text">${key}</span>
							<div class="mobile-summary-row">
								<span class="toggle-icon" onclick="toggleCard(this)">+</span>
								<div class="shrink-track-wrapper">${trackButtonHtml}</div>
								<span class="m-ship">#${key}</span>
								<span class="m-total">${item.total} $</span>
								<span class="m-status-badge ${stateClass}">${stateText}</span>
							</div>
						</td>
						<td data-label='Full Name'>${item.fullname}</td>
						<td data-label='Phone'>${item.phone}</td>
						<td data-label='Address'>${item.city}/${item.street}</td>
						<td data-label='Amount'>${item.total} $</td>
						<td data-label='Due Date'>${item.date}</td>
						<td data-label='Status'>
							<div class='status-selector' data-username='${item.username}' data-shipnumber='${key}'>
								<button class='status-btn ${stateClass} active'>${stateText}</button>
								<button id='carthistorydetail' data-shipnumber='${key}' class='status-btn2 btn-items'>Items</button>
							</div>
							<div class="expanded-track-wrapper">${trackButtonHtml}</div>
						</td>
					</tr>`;
				}

            });

            const rows = await Promise.all(rowPromises);
            if (historytracktable) historytracktable.innerHTML = inner1 + rows.join("") + "</tbody>";
            
            if (countndelivered) countndelivered.innerHTML = totndel;
            if (countdelivered) countdelivered.innerHTML = totdel;
            if (countdelayed) countdelayed.innerHTML = totdelayed;
            if (countcanceled) countcanceled.innerHTML = totcancel;
            if (countpcanceled) countpcanceled.innerHTML = totpcancel;
        } else {
            if (historytracktable) historytracktable.innerHTML = inner1 + "<tr><td colspan='7' class='text-center'>No Orders Exist</td></tr></tbody>";
        }
    });
}
// REQ 1 & 2 Logic: One expanded at a time + Button-only toggle
window.toggleCard = function(btnElement) {
    const currentRow = btnElement.closest('tr');
    const isExpanded = currentRow.classList.contains('expanded');

    // Requirement 2: Collapse all other rows
    document.querySelectorAll('.mobile-table tr.expanded').forEach(row => {
        row.classList.remove('expanded');
        row.querySelector('.toggle-icon').textContent = '+';
    });

    // Requirement 1: Only expand/shrink when icon is clicked
    if (!isExpanded) {
        currentRow.classList.add('expanded');
        btnElement.textContent = '−';
    }
};


function loadPersonals()
{
	var fullname=document.getElementById("fullname");
	var phone=document.getElementById("phone");
	var city=document.getElementById("city");
	var street=document.getElementById("street");
	
	if(fullname!=null)fullname.value=localStorage.getItem('fullname');
	if(phone!=null)phone.value=localStorage.getItem('phone');
	if(city!=null)city.value=localStorage.getItem('city');
	if(street!=null)street.value=localStorage.getItem('street');
	checkForm(); 
}
export async function getCategories(companyname)
{
	const list = document.getElementById('categorieslist');
	const list2 = document.getElementById('categorieslist2');
	var inner="";
	var val;
	deliveryMenu=[];
	let subs=[];
	await get(child(dbref,"categories")).then((snapshot) => 
	{
		if (snapshot.exists()) 
		{
			snapshot.forEach((childSnapshot) => 
			{
				const key = childSnapshot.key;    
				const item = childSnapshot.val(); 
				if(key==companyname)
				{
					for (const [subKey, value] of Object.entries(item)) 
					{
						// 🌙 Main Category: Added 'main-category-dark' class
						inner+="<div class='col-6 col-lg-3'><h6 class='fw-semibold main-category-dark'>"+subKey+"</h6>"
						val=value.slice(0, -1);
						subs=[];
						const values = val.split(",");
						for(let i=0;i<values.length;i++)
						{
							// 🌙 Sub-Category: Added 'dropdown-item-dark' and 'sub-category-dark' class
							inner+="<a class='dropdown-item dropdown-item-dark sub-category-dark' href='#"+values[i]+"'>"+values[i]+"</a>"
							subs.push(values[i]);
						}
						inner+="</div>";
						let row={main:subKey,sectionId:subKey,subs:subs};
						deliveryMenu.push(row);
						updateCategoryUI();
					}
				}	
			});
			if(list!=null)
			{
				list.innerHTML=inner;
				distribute2(companyname);
			}	
			if(list2!=null)
			{
				list2.innerHTML=inner;
			}	
		} 
		else 
		{
			console.log("No data available");
		}
	}).catch((error) => 
	{
		console.error(error);
	});
}
	export let products = [];
export async function distribute(comp,cat)
{
			products = [];
	await get(child(dbref,"items/"+comp)).then((snapshot) => 
	{
		if (snapshot.exists()) 
		{
			const data = snapshot.val();
			const keys = Object.keys(data);
			let i = 0;
			while (i < keys.length) 
			{
				const key = keys[i];
				const item = data[key];
				
				if(item.cat==cat)
				{
					let row={id:key,title:item.name,price:item.price,sale:item.sale,image:'items/'+key+'.png',category:item.cat,company:comp,unitdesc:item.unitdesc};
					products.push(row);
				}
				i++;
			}
		} 
		else 
		{
			console.log("No data available");
		}
	}).catch((error) => 
	{
		console.error(error);
	});
};
export async function distribute2(comp)
{
			products = [];
	await get(child(dbref,"items/"+comp)).then((snapshot) => 
	{
		if (snapshot.exists()) 
		{
			const data = snapshot.val();
			const keys = Object.keys(data);
			let i = 0;
			while (i < keys.length) 
			{
				const key = keys[i];
				const item = data[key];
				
				let row={id:key,title:item.name,price:item.price,sale:item.sale,image:'items/'+key+'.png',category:item.cat,company:comp,unitdesc:item.unitdesc};
				products.push(row);
				i++;
			}
		} 
		else 
		{
			console.log("No data available");
		}
	}).catch((error) => 
	{
		console.error(error);
	});
	renderCategoryPage();
};
function setCompany(comp) {
    const back = document.getElementById('back');
    const featured = document.getElementById('featuredcompanies');
    var inner = "";

    if (comp == "-1") {
        // Hardcoded categories to match your provided HTML exactly
        inner = "<div class='col-6 col-lg-2'><a href='' data-company-name='Restaurants' class='card category-card text-center'><img src='png/restaurants.jpg' class='card-img-top'><div class='card-body p-1'><h6 class='m-0'>Restaurants</h6></div></a></div>";
        inner += "<div class='col-6 col-lg-2'><a href='' data-company-name='Markets' class='card category-card text-center'><img src='png/markets.jpg' class='card-img-top' alt='Dairy'><div class='card-body p-1'><h6 class='m-0'>Markets</h6></div></a></div>";
        inner += "<div class='col-6 col-lg-2'><a href='' data-company-name='ButcherShops' class='card category-card text-center'><img src='png/butchershops.jpg' class='card-img-top' alt='Staples'><div class='card-body p-1'><h6 class='m-0'>Butchers</h6></div></a></div>";
        inner += "<div class='col-6 col-lg-2'><a href='' data-company-name='BakeryShops' class='card category-card text-center'><img src='png/bakeryshops.jpg' class='card-img-top' alt='Meat'><div class='card-body p-1'><h6 class='m-0'>Bakery</h6></div></a></div>";
        inner += "<div class='col-6 col-lg-2'><a href='' data-company-name='FishShops' class='card category-card text-center'><img src='png/fishshop.jpg' class='card-img-top' alt='Household'><div class='card-body p-1'><h6 class='m-0'>Fish</h6></div></a></div>";
        inner += "<div class='col-6 col-lg-2'><a href='' data-company-name='ChickenShops' class='card category-card text-center'><img src='png/chickenshop.jpg' class='card-img-top' alt='Household'><div class='card-body p-1'><h6 class='m-0'>Chicken</h6></div></a></div>";
        inner += "<div class='col-6 col-lg-2'><a href='' data-company-name='DairyShops' class='card category-card text-center'><img src='png/dairyshop.jpg' class='card-img-top' alt='Household'><div class='card-body p-1'><h6 class='m-0'>Dairy</h6></div></a></div>";
        inner += "<div class='col-6 col-lg-2'><a href='' data-company-name='FlowerShops' class='card category-card text-center'><img src='png/flowershop.jpg' class='card-img-top' alt='Household'><div class='card-body p-1'><h6 class='m-0'>Flower</h6></div></a></div>";
        inner += "<div class='col-6 col-lg-2'><a href='' data-company-name='Taxi' class='card category-card text-center'><img src='png/taxi.jpg' class='card-img-top' alt='Household'><div class='card-body p-1'><h6 class='m-0'>Taxi</h6></div></a></div>";
        inner += "<div class='col-6 col-lg-2'><a href='' data-company-name='Groceries' class='card category-card text-center'><img src='png/groceries.jpg' class='card-img-top' alt='Snacks'><div class='card-body p-1'><h6 class='m-0'>Groceries</h6></div></a></div>";
        inner += "<div class='col-6 col-lg-2'><a href='' data-company-name='Sweets' class='card category-card text-center'><img src='png/sweets.jpg' class='card-img-top' alt='Household'><div class='card-body p-1'><h6 class='m-0'>Sweets</h6></div></a></div>";
        inner += "<div class='col-6 col-lg-2'><a href='' data-company-name='Tobbaco' class='card category-card text-center'><img src='png/tobacco.jpg' class='card-img-top' alt='Household'><div class='card-body p-1'><h6 class='m-0'>Tobbaco</h6></div></a></div>";
        inner += "<div class='col-6 col-lg-2'><a href='' data-company-name='Toysshops' class='card category-card text-center'><img src='png/toys.jpg' class='card-img-top' alt='Staples'><div class='card-body p-1'><h6 class='m-0'>Toys</h6></div></a></div>";
        
        featured.innerHTML = inner;
        attachLinkListeners();
    } else {
        get(child(dbref, "pattern")).then((snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const keys = Object.keys(data);
                inner = "";
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    const item = data[key];
                    for (let j = 0; j < item.length; j++) {
                        let compname = item[j].companyname;
                        let soon = item[j].soon;
                        if (comp == key && parseInt(soon) > 1) {
                            // Fixed: Using your specific category.html link structure
                            inner += "<div class='col-6 col-lg-2'><a href='category.html?category=" + compname + "&pattern=" + key + "' data-company-name='" + compname + "'";
                            inner += " class='card category-card text-center'><img src='png/" + comp.toLowerCase() + ".jpg' ";
                            inner += " class='card-img-top'><div class='card-body p-1'><h6 class='m-0'>" + compname + "</h6></div></a></div>";
                        }
                    }
                }
                featured.innerHTML = inner;
                attachLinkListeners();
            }
        }).catch((error) => console.error(error));
    }

    if (back) back.style.display = (comp == "-1") ? "none" : "flex";
}

function attachLinkListeners() {
    const back = document.getElementById('back');
    if (back) {
        back.onclick = function(event) {
            event.preventDefault();
            setCompany("-1");
        };
    }
    const links = document.querySelectorAll('#featuredcompanies a');
    links.forEach(link => {
        link.onclick = function(event) {
            // Only prevent default if it's a "back to menu" category (no href set to category.html)
            if (link.getAttribute('href') === "" || link.getAttribute('href') === "#") {
                event.preventDefault();
                const companyname = link.dataset.companyName;
                setCompany(companyname);
            }
        };
    });
}
async function getUserPoints(userId) 
{
    try 
	{
        // 1. Create a reference directly to the specific field 'points'
        const pointsRef = ref(db, `users/${userId}/points`);
        
        // 2. Await the fetch
        const snapshot = await get(pointsRef);

        // 3. Check if the value exists
        if (snapshot.exists()) 
		{
            const points = snapshot.val(); // This is just the number/string, not an object
            return points;
        } 
		else 
		{
            return 0; 
        }
    } 
	catch (error) 
	{
        console.error("Error fetching single value:", error);
    }
}
async function getUserId(targetUsername) {
    try {
        const usersRef = ref(db, 'users');
        const snapshot = await get(usersRef);

        if (snapshot.exists()) {
            const users = snapshot.val();
            
            // Loop through the object keys to find a match
            for (const key in users) {
                if (users[key].username === targetUsername) {
                    return key; // This is the 'users/key' you need
                }
            }
        }
        return null; // No match found
    } catch (error) {
        console.error("Error retrieving user key:", error);
        return null;
    }
}
function getNow()
{
	const today = new Date();
	const year = today.getFullYear();
	const month = today.getMonth() + 1; // Add 1 because months are 0-indexed
	const day = today.getDate();
	const hour = today.getHours();
	const minute = today.getMinutes();
	const second = today.getSeconds();
	return year+"-"+month+"-"+day+" "+hour+":"+minute+":"+second;
}
function renderCategoryPage()
{
	var grid=document.getElementById('categoryGrid');
	if(!grid)return;
	var cat=getParam('category2');
	const params = new URLSearchParams(window.location.search);
	const selectedCategories = params.getAll('category2');
	var list=products.filter(function(p)
	{
		return !cat||selectedCategories.includes(p.category)
	});
	// 2. SORT THE LIST BY CATEGORY (The Fix)
    list.sort((a, b) => a.category.localeCompare(b.category));
	var html='';
	var prehtml='';
	var posthtml='';
	var prev='';
	list.forEach(function(p)
	{
		prehtml='';
		posthtml='';
		if(prev.length==0)
		{
			prev=p.category;
			prehtml="<section id='"+p.category+"'class='py-5'><div class='container'>";
			prehtml+="<div class='d-flex justify-content-between align-items-center mb-4'>";
			prehtml+="<h2 style='background: linear-gradient(to right, #42adad 30%, #0c2626 70%);color:#fff;border-radius: 10px;padding: 10px 5px;'>"+p.category+"</h2></div><div class='row g-3'>";
			html+=prehtml+cardTemplate(p);
		}
		else if(prev==p.category)
		{
			html+=cardTemplate(p);
		}
		else
		{
			prev=p.category;
			prehtml="<section id='"+p.category+"'class='py-5'><div class='container'>";
			prehtml+="<div class='d-flex justify-content-between align-items-center mb-4'>";
			prehtml+="<h2 style='background: linear-gradient(to right, #42adad 30%, #0c2626 70%);color:#fff;border-radius: 10px;padding: 10px 5px;'>"+p.category+"</h2></div><div class='row g-3'>";
			posthtml="</div></div></section>";
			html+=posthtml+prehtml+cardTemplate(p);
		}
		
	});
	html+=posthtml;
	grid.innerHTML=html;
	wireButtons(grid)
};
function money(num) {
  if (num < 10000) {
    // Return as double with .00 and $
	var numericValue = Number(num) || 0;
    return numericValue.toFixed(2) + '$';
  } else {
    // Return as integer with commas and L.L.
    return Math.floor(num).toLocaleString('en-US') + ' L.L.';
  }
}		
function saveCart()
{
	try
	{
		localStorage.setItem('grocer_cart',JSON.stringify(cartItems))
	}
	catch(e)
	{
		
	} 
}
function loadCart()
{
	try
	{
		var s=localStorage.getItem('grocer_cart');
		cartItems=s?JSON.parse(s):[]
	}
	catch(e)
	{
		cartItems=[]
	}
}
function getCartCount()
{
	var n=0;
	for(var i=0;i<cartItems.length;i++)
	{
		n+=parseInt(cartItems[i].qty);
	}
	return n
}
function updateCartBadge() {
    const cartCount = getCartCount();
    const ids = ['cartCount', 'cartCount2', 'cartCount3'];
    let foundAll = true;

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = String(cartCount);
        } else {
            foundAll = false;
        }
    });

    // If elements weren't found, try again in 100ms
    if (!foundAll) {
        setTimeout(updateCartBadge, 100);
    }
    
    checkForm();
}
function addToCart(id)
{
	var p=products.find(function(x)
	{
		return x.id===id
	});
	if(!p)return;
	var found=cartItems.find(function(ci)
	{
		return ci.id===id
	});
	if(found)
	{
		found.qty+=1
		playSound('add');
	}
	else
	{
		let cost=Number(p.price);
		let sale=Number(p.sale);
		if(cost>2000)cost=cost/90000;
		if(sale>2000)sale=sale/90000;
		let price=cost;
		if(sale>0)price=sale;
		cartItems.push({id:p.id,title:p.title,price:price,image:p.image,qty:1,company:p.company})
		playSound('add');
	}
	saveCart();
	updateCartBadge();
	renderCartSidebar(cartItems);
}
function removeProductOverlay(productId) 
{
    // 1. Find the button with that ID inside the grid
    const btnInGrid = document.querySelector(`#categoryGrid [data-product-id="${productId}"]`);
    
    if (btnInGrid) 
    {
        // 2. Find the main container using our new class name
        const card = btnInGrid.closest('.pc-card-main');
        
        if (card) {
            // 3. Find the overlay using the new class name
            const overlay = card.querySelector('.pc-cart-overlay');
            if (overlay) 
            {
                overlay.style.display = 'none'; // Hide overlay
            }
            
            // 4. Reset button text and classes using the new names
            btnInGrid.innerText = 'Add to Cart';
            // Swap the green gradient for the blue gradient
            btnInGrid.classList.remove('pc-btn-success', 'btn-success-gradient');
            btnInGrid.classList.add('pc-btn-primary', 'btn-primary-gradient');
        }
    }
    checkForm();
}
window.openImageModal = function(src) {
    const modal = document.createElement('div');
    // Styling the background overlay
    modal.style = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.9); z-index: 10000; display: flex;
        align-items: center; justify-content: center; cursor: zoom-out;
        opacity: 0; transition: opacity 0.3s ease;
    `;
    
    const img = document.createElement('img');
    img.src = src;
    // Styling the image for maximum visibility
    img.style = `
    width: 200px;       /* 150% of the screen width */
    height: auto;       /* Keep aspect ratio */
    object-fit: contain; 
    border-radius: 4px;
    box-shadow: 0 0 30px rgba(0,0,0,0.5);
    transform: scale(1);
    transition: transform 0.3s ease;
`;
    
    modal.appendChild(img);
    document.body.appendChild(modal);

    // Trigger animations
    setTimeout(() => {
        modal.style.opacity = "1";
        img.style.transform = "scale(1)";
    }, 10);

    // Close function
    modal.onclick = () => {
        modal.style.opacity = "0";
        setTimeout(() => modal.remove(), 300);
    };
}
window.openProductModal = function(productId) {
    const p = products.find(item => item.id == productId);
    if (!p) return;

    const isInCart = cartItems.some(item => item.id == p.id);
    
    // Detect Arabic characters in Title or Description
    const isArabic = /[\u0600-\u06FF]/.test(p.title + (p.unitdesc || ''));
    const langAttr = isArabic ? 'lang="ar"' : 'lang="en"';

    let modal = document.getElementById('productQuickView');
    if(!modal) {
        modal = document.createElement('div');
        modal.id = 'productQuickView';
        modal.className = 'custom-modal-overlay';
        modal.onclick = (e) => { if(e.target === modal) modal.classList.remove('active'); };
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-card-content animate-pop" ${langAttr}>
            <span class="close-modal" onclick="this.closest('.custom-modal-overlay').classList.remove('active')">&times;</span>
            <div class="modal-grid">
                <div class="modal-img-side">
                    <img src="${p.image}" onerror="this.src='items/0.png'">
                </div>
                <div class="modal-info-side">
                    <h3 class="modal-title">${p.title}</h3>
                    <p class="unit-desc">${p.unitdesc || ''}</p>
                    
                    <div class="modal-price-wrap">
                        ${p.sale > 0 
                            ? `<span class="modal-sale">${money(p.sale)}</span><span class="modal-old">${money(p.price)}</span>`
                            : `<span>${money(p.price)}</span>`
                        }
                    </div>

                    <button class="modal-btn ${isInCart ? 'btn-green' : 'btn-blue'}" 
                            onclick="handleModalAddToCart('${p.id}', this)">
                        ${isInCart ? '✓ تمّت الإضافة' : 'Add to Cart'}
                    </button>
                </div>
            </div>
        </div>
    `;
    modal.classList.add('active');
}

// Helper to trigger your existing add-to-cart logic
window.handleModalAddToCart = function(id, btn) {
    // 1. Find the hidden button on the main page grid that matches this ID
    const mainBtn = document.querySelector(`.pc-btn-glow[data-product-id="${id}"]`);
    
    if (mainBtn) {
        // 2. Trigger the click on the main button to run your existing Firebase/Cart logic
        mainBtn.click();
        
        // 3. Update the modal button styling immediately
        btn.classList.remove('btn-blue');
        btn.classList.add('btn-green');
        btn.innerHTML = '✓ Added to Cart';
        
        // Optional: Add a little "bounce" effect on click
        btn.style.transform = "scale(0.95)";
        setTimeout(() => btn.style.transform = "scale(1)", 100);
    } else {
        console.error("Main add-to-cart button not found for ID:", id);
    }
};

function cardTemplate(p) {

    // Detect if title is Arabic to apply specific font styling
    const isArabic = /[\u0600-\u06FF]/.test(p.title);
    const langAttr = isArabic ? 'lang="ar"' : 'lang="en"';

    // Check if item is in cart
    let found = cartItems.some(item => item.id == p.id);
    let display = found ? 'block' : 'none';

    // Calculate percentage discount
    let discountPercent = 0;
    if (p.sale > 0 && p.price > 0) {
        discountPercent = Math.round(((p.price - p.sale) / p.price) * 100);
    }

    return `
    <div class="col-3 col-lg-3 pc-grid-item" ${langAttr}>
        <div class="pc-card-main">
            ${p.sale > 0 ? `
                <span class="pc-badge-offer">OFFER</span>
                <span class="pc-badge-percent">-${discountPercent}%</span>
            ` : ''}
            
            <div class="pc-img-holder">
                <img src="${p.image}" 
				 onclick="openProductModal('${p.id}')"
				 onerror="this.onerror=null;this.src='items/0.png';" 
				 class="pc-product-img" 
				 style="cursor:pointer">
                
                <img src="png/cart3.png" 
                     style="display:${display}" 
                     class="pc-cart-overlay" 
                     alt="In Cart">
            </div>
            
            <div class="pc-body">
                <h6 class="pc-item-title">${p.title}</h6>
                <div class="pc-price-wrap">
                    ${p.sale > 0 
                        ? `<span class="pc-new-price">${money(p.sale)}</span>
                           <span class="pc-old-price">${money(p.price)}</span>`
                        : `<span class="pc-standard-price">${money(p.price)}</span>`
                    }
                </div>
                <div class="pc-btn-group">
                    <button class="pc-btn-glow ${found ? 'pc-btn-success' : 'pc-btn-primary'}" 
                            data-product-id="${p.id}">
                        ${found ? 'Added' : 'Add to Cart'}
                    </button>
                </div>
            </div>
        </div>
    </div>`;
}
function wireButtons(context)
{
	var root=context||document;
	root.querySelectorAll('[data-product-id]').forEach(function(btn)
	{
		btn.addEventListener('click',function()
		{
			var id=parseInt(btn.getAttribute('data-product-id'));
			var ids=""+id;
			addToCart(ids)
		})
	});
}
function updateTimer()
{
	var el=document.getElementById('dealTimer');
	if(!el)return;
	var t=saleEnd-Date.now();
	if(t<=0)
	{
		el.textContent='Sale ended';
		return
	}
	var h=Math.floor(t/3600000);
	var m=Math.floor((t%3600000)/60000);
	var s=Math.floor((t%60000)/1000);
	el.textContent=h+'h '+m+'m '+s+'s'
}
function openQuickView(id)
{
	var p=products.find(function(x)
	{
		return x.id===id
	});
	if(!p)return;
	var t=document.getElementById('quickViewTitle');
	var i=document.getElementById('quickViewImage');
	var pr=document.getElementById('quickViewPrice');
	var b=document.getElementById('quickViewAdd');
	if(t)t.textContent=p.title;
	if(i)
	{
		i.src=p.image;
		i.alt=p.title
	}
	if(pr)pr.textContent=money(p.price);
	if(b)
	{
		b.onclick=function()
		{
			addToCart(p.id);
			var modalEl=document.getElementById('quickViewModal');
			var inst=modalEl?bootstrap.Modal.getInstance(modalEl):null;
			if(inst)inst.hide()
		}
	}
}

function getParam(name)
{
	var u=new URL(window.location.href);
	//console.log(u.searchParams.get(name));
	return u.searchParams.get(name)
}
function renderProductDetail()
{
	var root=document.getElementById('productDetail');
	if(!root)return;
	var id=parseInt(getParam('id')||'0');
	var p=window.products.find(function(x)
	{
		return x.id===id
	})
	||window.products[0];root.innerHTML=
  '<div class="row g-4">'+
    '<div class="col-12 col-lg-5"><img class="img-fluid rounded" src="'+p.image+'" alt="'+p.title+'"></div>'+
    '<div class="col-12 col-lg-7">'+
      '<h3 class="mb-2">'+p.title+'</h3>'+
      '<div class="fs-4 mb-3">'+money(p.price)+'</div>'+
      '<p class="text-muted">High-quality product sourced from trusted suppliers.</p>'+
      '<div class="d-flex gap-2">'+
        '<button class="btn btn-primary" data-product-id="'+p.id+'">Add to Cart</button>'+
        '<a class="btn btn-outline-secondary" id="checkoutbutton"href="checkout.html">Buy Now</a>'+
      '</div>'+
    '</div>'+
  '</div>'+
  '<div class="mt-4">'+
    '<ul class="nav nav-tabs" id="prodTabs" role="tablist">'+
      '<li class="nav-item" role="presentation"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tab-desc" type="button" role="tab">Description</button></li>'+
      '<li class="nav-item" role="presentation"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-rev" type="button" role="tab">Reviews</button></li>'+
      '<li class="nav-item" role="presentation"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-faq" type="button" role="tab">FAQ</button></li>'+
    '</ul>'+
    '<div class="tab-content border-bottom border-start border-end p-3">'+
      '<div class="tab-pane fade show active" id="tab-desc" role="tabpanel">'+
        '<p>Freshly sourced and quality-checked. Store in a cool, dry place. Best consumed before the indicated date on the package.</p>'+
      '</div>'+
      '<div class="tab-pane fade" id="tab-rev" role="tabpanel">'+
        '<div class="d-flex align-items-start gap-3 mb-3"><img src="https://i.pravatar.cc/40?img=7" class="rounded-circle" width="40" height="40"><div><div class="fw-semibold">Taylor</div><div class="text-muted small">Great taste and value.</div></div></div>'+
        '<div class="d-flex align-items-start gap-3"><img src="https://i.pravatar.cc/40?img=8" class="rounded-circle" width="40" height="40"><div><div class="fw-semibold">Jordan</div><div class="text-muted small">Packaging was neat and delivery was fast.</div></div></div>'+
      '</div>'+
      '<div class="tab-pane fade" id="tab-faq" role="tabpanel">'+
        '<div class="accordion" id="faqAcc">'+
          '<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#q1">Is this product organic?</button></h2><div id="q1" class="accordion-collapse collapse show" data-bs-parent="#faqAcc"><div class="accordion-body">Selected variants are organic; check the label.</div></div></div>'+
          '<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#q2">What is the shelf life?</button></h2><div id="q2" class="accordion-collapse collapse" data-bs-parent="#faqAcc"><div class="accordion-body">Refer to the date printed on the package.</div></div></div>'+
        '</div>'+
      '</div>'+
    '</div>'+
  '</div>'
  ;
	wireButtons(root)
}
function renderCartSidebar(cartItem1) {
    var list = document.getElementById('cartList');
    var totalEl = document.getElementById('cartTotal');
    
    if (!list || !totalEl) return;

    const groupedByCompany = cartItem1.reduce((acc, ci) => {
        const shop = ci.company || "Other"; 
        if (!acc[shop]) acc[shop] = [];
        acc[shop].push(ci);
        return acc;
    }, {});

    var html = '';
    var subTotal = 0;
    
    // Calculate total delivery ($2 per shop)
    const shopCount = Object.keys(groupedByCompany).length;
    totalDelivery = shopCount * 2;

    for (const shopName in groupedByCompany) {
        html += `
        <div class="shop-container mb-4 p-2 border border-secondary rounded" style="border-style: dashed !important;">
            <div class="shop-header d-flex justify-content-between align-items-center mb-3 pb-1" style="border-bottom: 1px solid #333;">
                <div>
                    <i class="fa-solid fa-shop me-2" style="color: #2ecc71; font-size: 0.8rem;"></i>
                    <span class="text-uppercase fw-bold" style="font-size: 0.75rem; color: #bbb;">${shopName}</span>
                </div>
                <span class="badge rounded-pill bg-dark text-success border border-secondary" style="font-size: 0.65rem;">+Delivery: $2.00</span>
            </div>`;

        groupedByCompany[shopName].forEach(function(ci) {
            subTotal += ci.price * ci.qty;
            html += `
            <div class="d-flex align-items-center justify-content-between mb-2 pb-2 cart-item-row">
                <div class="d-flex align-items-center gap-2">
                    <img src="${ci.image}" onerror="this.onerror=null;this.src='items/0.png';" class="cart-item-img" style="width:45px; height:45px; border-radius: 4px;">
                    <div>
                        <div class="small fw-semibold cart-item-title">${ci.title}</div>
                        <div class="small cart-item-price" style="color: #2ecc71;">${money(ci.price)} × ${ci.qty}</div>
                    </div>
                </div>
                <div class="d-flex align-items-center gap-1">
                    <button class="btn btn-sm cart-qty-btn" data-cart-dec="${ci.id}">-</button>
                    <button class="btn btn-sm cart-qty-btn" data-cart-inc="${ci.id}">+</button>
                    <button class="btn btn-sm cart-remove-btn" data-cart-del="${ci.id}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>`;
        });

        html += '</div>';
    }

    list.innerHTML = html;

    // Final Grand Total (Subtotal + All Delivery Fees)
    var finalGrandTotal = subTotal + totalDelivery;

    if(totalEl) {
        totalEl.textContent = money(finalGrandTotal);
                
        // Sync other UI elements if they exist
        if(document.getElementById('subTotal')) document.getElementById('subTotal').innerHTML = money(subTotal);
        if(document.getElementById('checktotal')) document.getElementById('checktotal').innerHTML = money(finalGrandTotal);
        if(document.getElementById('checkouttotaldelivery')) document.getElementById('checkouttotaldelivery').innerHTML = totalDelivery+" $";
        if(document.getElementById('summaryItems')) document.getElementById('summaryItems').innerHTML = document.getElementById('cartCount2').innerHTML;
    }
document.querySelectorAll('.pc-card-main').forEach(card => {
    const btn = card.querySelector('[data-product-id]');
    if (!btn) return;
    
    const productId = btn.getAttribute('data-product-id');
    const overlay = card.querySelector('.pc-cart-overlay');
    
    // Check if THIS specific product is in the cart
    const isInCart = cartItem1.some(item => item.id == productId);
    
    if (isInCart) {
        // Change to Green / Success state
        btn.innerText = 'Added';
        btn.classList.remove('pc-btn-primary');
        btn.classList.add('pc-btn-success');
        if(overlay) overlay.style.display = 'block';
    } else {
        // Change back to Blue / Primary state
        btn.innerText = 'Add to Cart';
        btn.classList.remove('pc-btn-success');
        btn.classList.add('pc-btn-primary');
        if(overlay) overlay.style.display = 'none';
    }
});
}
function renderCartSidebar2(historyData) {
    var list = document.getElementById('cartList');
    var totalEl = document.getElementById('cartTotal');
    if (!list) return;

    if (!Array.isArray(historyData)) {
        console.error("historyData is not an array:", historyData);
        return;
    }

    const groupedByShop = historyData.reduce((acc, product) => {
        const shop = product.company || "General Shop";
        if (!acc[shop]) acc[shop] = [];
        acc[shop].push(product);
        return acc;
    }, {});

    var html = '';
    var subTotal = 0;

    for (const shopName in groupedByShop) {
        html += `
        <div class="shop-container mb-4 p-2 border rounded" style="border-style: dashed !important; border-color: var(--border-color) !important;">
            <div class="shop-header d-flex justify-content-between align-items-center mb-3 pb-1" style="border-bottom: 1px solid var(--border-color);">
                <span class="text-uppercase fw-bold text-success" style="font-size: 0.75rem;">
                    <i class="fa-solid fa-store me-1"></i> ${shopName}
                </span>
                <!-- Replaced bg-dark with a themed border/background style -->
                <span class="badge border" style="font-size: 0.65rem; color: #10b981; border-color: var(--border-color) !important; background: transparent;">
                    +Delivery: 2.00 $
                </span>
            </div>`;

        groupedByShop[shopName].forEach(function(item) {
            subTotal += parseFloat(item.price) * parseInt(item.qty);
            
            html += `
            <div class="d-flex align-items-center justify-content-between mb-2 pb-2">
                <div class="d-flex align-items-center gap-2">
                    <img src="${item.image}" 
                         onerror="this.onerror=null;this.src='items/0.png';" 
                         style="width:40px; height:40px; border-radius: 4px; object-fit: cover; border: 1px solid var(--border-color);">
                    <div>
                        <!-- Changed text-white to default (var(--text-main)) -->
                        <div class="small fw-semibold">${item.title}</div>
                        <!-- Changed text-white-50 to text-muted (which we fixed earlier) -->
                        <div class="small text-muted">${money(item.price)} × ${item.qty}</div>
                    </div>
                </div>
            </div>`;
        });

        html += '</div>';
    }

    const shopCount = Object.keys(groupedByShop).length;
    const totalDelivery = shopCount * 2;
    const finalTotal = subTotal + totalDelivery;

    html += `
    <div class="p-2 mt-2 border-top" style="border-color: var(--border-color) !important;">
        <div class="d-flex justify-content-between small text-muted">
            <span>Subtotal:</span>
            <span>${money(subTotal)}</span>
        </div>
        <div class="d-flex justify-content-between small text-muted">
            <span>Total Delivery:</span>
            <span>${totalDelivery.toFixed(2)} $</span>
        </div>
        <div class="d-flex justify-content-between fw-bold text-success mt-1" style="font-size: 1.1rem;">
            <span>Order Total:</span>
            <span>${money(finalTotal)}</span>
        </div>
    </div>`;

    list.innerHTML = html;

    if (totalEl) {
        totalEl.textContent = money(finalTotal);
    }
}

function changeQty(id,delta)
{
	var ids=""+id;
	var item=cartItems.find(function(ci)
	{
		return ci.id===ids
	});
	if(!item)return;
	item.qty+=delta;
	if(item.qty<=0)
	{
		removeProductOverlay(item.id);
		cartItems=cartItems.filter(function(ci)
		{
			return ci.id!==ids
		})
	}
	saveCart();
	updateCartBadge();
	renderCartSidebar(cartItems)
}
function wireCartSidebar()
{
	var list=document.getElementById('cartList');
	if(!list)return;
	list.addEventListener('click',function(e)
	{
		var t=e.target;
		var inc=t.getAttribute('data-cart-inc')|| (t.closest('[data-cart-inc]')?t.closest('[data-cart-inc]').getAttribute('data-cart-inc'):null);
		var dec=t.getAttribute('data-cart-dec')|| (t.closest('[data-cart-dec]')?t.closest('[data-cart-dec]').getAttribute('data-cart-dec'):null);
		var del=t.getAttribute('data-cart-del')|| (t.closest('[data-cart-del]')?t.closest('[data-cart-del]').getAttribute('data-cart-del'):null);
		if(inc)
		{
			changeQty(parseInt(inc),1)
			playSound('add');
		}
		else if(dec)
		{
			changeQty(parseInt(dec),-1)
			playSound('remove');
		}
		else if(del)
		{
			var item=cartItems.find(function(ci)
			{
				return ci.id===del
			});			
			if(item)changeQty(parseInt(del),-item.qty)
			playSound('remove');
		}
	})
}
function ensureHeroBackgroundFallback()
{
	var slides=document.querySelectorAll('.hero-slide');
	slides.forEach(function(el)
	{
		var bg=el.style.backgroundImage||getComputedStyle(el).backgroundImage;
		if(!bg||bg==='none')return;
		var m=bg.match(/url\(["']?(.*?)["']?\)/);
		if(!m)return;
		var url=m[1];
		var img=new Image();
		img.onload=function(){};
		img.onerror=function()
		{
			el.style.backgroundImage='linear-gradient(90deg,#22c55e,#0ea5e9)'
		};
		img.src=url
	})
}
function ensureImageFallback()
{
	var ph='data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22600%22 height=%22400%22 viewBox=%220 0 600 400%22%3E%3Crect width=%22600%22 height=%22400%22 fill=%22%23ededed%22/%3E%3Ctext x=%22300%22 y=%22205%22 text-anchor=%22middle%22 font-size=%2232%22 fill=%22%23888888%22 font-family=%22Poppins,Arial,sans-serif%22%3ENo Image%3C/text%3E%3C/svg%3E';
	document.querySelectorAll('img').forEach(function(img)
	{
		try
		{
			img.loading='lazy'
		}
		catch(e)
		{
			
		}
		try
		{
			img.referrerPolicy='no-referrer'
		}
		catch(e)
		{
			
		}
		img.addEventListener('error',function()
		{
			if(img.src!==ph)
			{
				img.src=ph
			}
		})
	})
}
function removeSpecialChars(originalText) 
{
    const cleanedText = originalText.replace(/[,":(){}]/g, '');
    return cleanedText;
}

function checkForm()
{
	var name=document.getElementById("fullname");
	var phone=document.getElementById("phone");
	var city=document.getElementById("city");
	var street=document.getElementById("street");
	var cartcount=document.getElementById("cartCount2");
	var order=document.getElementById("place_order");
	if(name!=null&&name.value.length>0&&phone.value.length>0&&city.value.length>0&&street.value.length>0
	&&cartcount&&cartcount.innerHTML!="0")
	{
		if(order!=null)
		{
			order.classList.add('active');
			order.classList.remove('nonactive');
		}	
		return true;
	}
	else
	{
		if(order!=null)
		{
			order.classList.remove('active');
			order.classList.add('nonactive');
		}	
		return false;
	}	
}

async function placeOrder()
{
	if(checkForm())
	{
		var fullname=document.getElementById("fullname");
		var phone=document.getElementById("phone");
		var city=document.getElementById("city");
		var street=document.getElementById("street");
		var note=document.getElementById("note");
		var order=document.getElementById("place_order");
		localStorage.setItem('fullname',fullname.value);
		localStorage.setItem('phone',phone.value);
		localStorage.setItem('city',city.value);
		localStorage.setItem('street',street.value);
		
		var cartList="";
		for (let i = 0; i < cartItems.length;i++) 
		{
			const product = cartItems[i];
			cartList+=product.id+":"+product.title+":"+product.price+":"+product.qty+":"+product.company+";";
		}
		const num = parseFloat(localStorage.getItem('total')); // Converts string to number
		const tot = num.toFixed(2);
		
		const counterRef = ref(db, 'globalCounter/last_request_id');

		// 1. Increment and get the new ID using a Transaction (needed to read the result)
		const result = await runTransaction(counterRef, (current) => 
		{
			return (current || 1) + 1;
		});

		if (result.committed) 
		{
			const newId = "id_"+result.snapshot.val(); // This is your 1, 2, 3...
			let requestlat='';
			let requestlng='';
			if(window.lat!=0&&window.lat!=34)requestlat=window.lat;
			if(window.lng!=0&&window.lng!=36)requestlng=window.lng;
			console.log(window.lat+":"+window.lng);
			window.lat=34;window.lng=36;
			// 2. import data to requests
			await set(ref(db, 'requests/' + newId), 
			{
				fullname: fullname.value,
				phone: phone.value,
				city: city.value,
				street: street.value,
				driver: "0",
				date: getNow(),
				total: tot,
				state: "0",
				read: "0",
				cart: cartList,
				deliveryplusid: localStorage.getItem('deliveryplusids'),
				vault:"0",
				xnote:note.value,
				username:username||"",
				lat:String(requestlat),
				lng:String(requestlng),
				trackorder:'0'
			});
			playSound('order');

			if(username&&username.length>0)
			{
				await set(ref(db, 'historyRequests/' + userid+'/'+newId), 
				{
					fullname: fullname.value,
					phone: phone.value,
					city: city.value,
					street: street.value,
					date: getNow(),
					total: tot,
					state: "0",
					cart: cartList,
					deliveryplusid: localStorage.getItem('deliveryplusids'),
					xnote:note.value
				});
			}
			cartItems=[];
			saveCart();
			var el=document.getElementById('cartCount3');
			if(el)el.textContent=String(0);
			var message=document.getElementById("message-label");
			message.style.display="block";
			window.setTimeout(function() 
			{
				if (message) 
				{
					message.classList.add('hidden');
				}
			}, 3000);
			message.style.display="block";
			message.classList.remove('hidden');
			order.classList.remove('active');
			order.classList.add('nonactive');
			console.log("Success! ID is: " + newId);
		}
		//set(ref(db,'requests/'+generateRequestId()),{fullname:fullname.value,phone:phone.value,city:city.value,street:street.value,driver:"0",date:getNow(),total:tot,state:"0",read:"0",cart:cartList,deliveryplusid:localStorage.getItem('deliveryplusids')});

	}	
}

export async function startPage()
{
	loadCart();
	wireButtons(document);
	updateCartBadge();
	updateTimer();
	setInterval(updateTimer,1000);
	getCompanies();
	renderCategoryPage();
	renderProductDetail();
	renderCartSidebar(cartItems);
	wireCartSidebar();
	loadPersonals();
}
export function function1() 
{
  let id = localStorage.getItem('deliveryplusids');
  if (!id) 
  {
    id = crypto.randomUUID();
    localStorage.setItem('deliveryplusids', id);
  }
  return id;
}

document.addEventListener('DOMContentLoaded',ensureHeroBackgroundFallback);
document.addEventListener('DOMContentLoaded',ensureImageFallback);

var catGrid=document.getElementById('categoryGrid');
if(catGrid)
{
	catGrid.addEventListener('click', function(event) 
	{
		// 1. Identify if a button was clicked
		const btn = event.target.closest('.btn-primary');
		if (!btn) 
		{
			return;
		}	

		// 2. Find the specific card for this button
		const card = btn.closest('.product-card');
		  //    '<button class="btn btn-sm btn-primary" data-product-id="'+p.id+'">Add to Cart</button>'+
		
		// 3. Find the overlay image inside THIS card
		const overlay = card.querySelector('.img-overlay');

		if (overlay) 
		{
			// Show the overlay image
			overlay.style.display = 'block';
			
			// Optional: Change button text to provide feedback
			btn.innerText = 'Added to Cart';
			btn.classList.replace('btn-primary', 'btn-success');
		}
	});
}	
var place_order=document.getElementById('place_order');
if(place_order)
{
	place_order.addEventListener('click', function(event) 
	{
		placeOrder();
	});
}
var back=document.getElementById('back');
if(back)
{
	back.addEventListener('click', function(event) 
	{
		event.preventDefault(); 
		setCompany("-1");
	});
}

const links = document.querySelectorAll('#featuredcompanies a');

links.forEach(link => 
{
  link.addEventListener('click', function(event) 
  {
    event.preventDefault(); 

    const companyname = link.dataset.companyName;
    
	setCompany(companyname);
  });
});
var fullname=document.getElementById('fullname');
var phone=document.getElementById("phone");
var city=document.getElementById("city");
var street=document.getElementById("street");

if(fullname)
{
	fullname.addEventListener('keyup', function(event) 
	{
		checkForm();
	});
	fullname.addEventListener('keydown', function(event) 
	{
		if (event.key === ',')event.preventDefault();
	});
}
if(phone)
{
	phone.addEventListener('keyup', function(event) 
	{
		checkForm();
	});
	phone.addEventListener('keydown', function(event) 
	{
		if (event.key === ',')event.preventDefault();
	});
}
if(city)
{
	city.addEventListener('keyup', function(event) 
	{
		checkForm();
	});
	city.addEventListener('keydown', function(event) 
	{
		if (event.key === ',')event.preventDefault();
	});
}
if(street)
{
	street.addEventListener('keyup', function(event) 
	{
		checkForm();
	});
	street.addEventListener('keydown', function(event) 
	{
		if (event.key === ',')event.preventDefault();
	});
}
const loginForm = document.getElementById('loginForm');
const userInput = document.getElementById('loginUsername');
const passInput = document.getElementById('loginPassword');
const errorMsg = document.getElementById('loginError');

if(loginForm)
{
	[userInput, passInput].forEach(input => 
	{
		input.addEventListener('input', () => 
		{
			input.classList.remove('is-invalid');
			errorMsg.classList.add('d-none');
		});
	});
}
document.addEventListener('DOMContentLoaded', function() 
{
    const loginForm = document.getElementById('loginForm');
    const logoutBtn = document.getElementById('logoutBtn');
    
    // 1. Driver Login Submission
    if(loginForm) 
	{
        loginForm.addEventListener('submit', function(e) 
		{
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const pass = document.getElementById('loginPassword').value;
			
			get(child(dbref,"drivers")).then((snapshot) => 
			{
				if (snapshot.exists()) 
				{
					let isAuthenticated = false;
					let driverData = null;
					let key=null;

					// 2. Loop through results (usually just one if usernames are unique)
					snapshot.forEach((childSnapshot) => 
					{
						const data = childSnapshot.val();
						key = childSnapshot.key;
						if (data.username===username.toLowerCase().trim()&&data.password === pass) 
						{
							isAuthenticated = true;
							driverData = data;
							localStorage.setItem('isLoggedIn', 'true');
							localStorage.removeItem('delivoUser');
							localStorage.setItem('delivoDriver', JSON.stringify(
							{
								id: childSnapshot.key,
								driverusername: driverData.username.toLowerCase().trim(),
								driverowner: driverData.owner
							}));
							onLoginSuccess(key);
							updateColumn('drivers',childSnapshot.key,'timestamp',Date.now());
							updateColumn('drivers',childSnapshot.key,'status','online');
						}
					});

					if (isAuthenticated) 
					{
						updateUI(); // Your existing function to toggle the navbar
						
						const modal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
						modal.hide();
						location.reload(); // Refresh to reset all states
					} 
					else
					{
						userInput.classList.add('is-invalid');
						passInput.classList.add('is-invalid');
						errorMsg.classList.remove('d-none');
					}
				}
			}).catch((error) => 
			{
				console.error(error);
			});
		});
	}
    // 2. Driver Logout
    if(logoutBtn) 
	{
        logoutBtn.addEventListener('click', function(e) 
		{
            e.preventDefault();
			//if(storageData)updateColumn("users",userid,"status","offline");
			if(userid)
			{
				updateColumn('users',userid,'status','offline');
				updateColumn('users',userid,'timestamp',Date.now());
			}	
			if(driverid)
			{
				updateColumn('drivers',driverid,'status','offline');
				updateColumn('drivers',driverid,'timestamp',Date.now());
			}	
			localStorage.removeItem('delivoUser');
			localStorage.removeItem('delivoDriver');
			localStorage.removeItem('driverusername');
			localStorage.removeItem('driverowner');
            localStorage.removeItem('isLoggedIn');
            location.reload(); // Refresh to reset all states
			if (window.AndroidBridge) 
			{
				window.AndroidBridge.stopBackgroundTracking();
			}
        });
    }

    // 3. UI Toggle Logic
    function updateUI() 
	{
        const loginLink = document.getElementById('loginLink');
        const userDropdown = document.getElementById('userDropdown');
        const userLabel = document.getElementById('userLabel');
        
        const loggedIn = localStorage.getItem('isLoggedIn');

        if (driverusername) 
		{
			if(loginLink)
			{
				loginLink.classList.add('d-none');      // Hide "Login"
				userDropdown.classList.remove('d-none'); // Show "Username"
				userLabel.innerText = driverowner;             // Set name
				distributeDriver();
				
			}
        } 
		else
		{
			if(loginLink)
			{
				distributeDriver();
				loginLink.classList.remove('d-none');
				userDropdown.classList.add('d-none');
			}
        }
    }
    updateUI();
});
function updateSideCart(shipnumber) 
{
    // Reference your Offcanvas instance
    const offcanvasElement = document.getElementById('cartSidebar');
    const existingInstance = bootstrap.Offcanvas.getInstance(offcanvasElement) 
                             || new bootstrap.Offcanvas(offcanvasElement);

    get(child(dbref, "requests")).then((snapshot) => 
	{
        if (snapshot.exists()) {
            let foundMatch = false;
            
            snapshot.forEach((childSnapshot) => 
			{
                const key = childSnapshot.key;
                const item = childSnapshot.val();

               if (key == shipnumber) 
			   {
                    foundMatch = true;
                    cartItemsDriver = [];
                    const rawData = item.cart;
                    const items = rawData.split(';').filter(i => i.length > 0);

                    items.forEach(itemStr => {
                        const parts = itemStr.split(':');
                        let row = {
                            id: parts[0],
                            title: parts[1],
                            price: parts[2],
                            image: 'items/' + parts[0] + '.png',
                            qty: parseInt(parts[3]),
							company:parts[4]
                        };
                        cartItemsDriver.push(row);
                    });
                }
            });

            if (foundMatch) 
			{
                // 3. ONLY SHOW THE SIDEBAR NOW (Data is ready)
                renderCartSidebar2(cartItemsDriver); 
                existingInstance.show();
            }
        } 
		else 
		{
            console.log("No data available");
        }
    }).catch((error) => 
	{
        console.error(error);
    });
}
function updateSideCart2(username,shipnumber) 
{
    // Reference your Offcanvas instance
    const offcanvasElement = document.getElementById('cartSidebar');
    const existingInstance = bootstrap.Offcanvas.getInstance(offcanvasElement) 
                             || new bootstrap.Offcanvas(offcanvasElement);

    get(child(dbref, "historyRequests/"+userid+"/"+shipnumber)).then((snapshot) => 
	{
        if (snapshot.exists()) 
		{
			const item = snapshot.val();
            
			let cartItemsHistory = [];
			const rawData = item.cart;
			const items = rawData.split(';').filter(i => i.length > 0);

			items.forEach(itemStr => 
			{
				const parts = itemStr.split(':');
				let row = {
					id: parts[0],
					title: parts[1],
					price: parts[2],
					image: 'items/' + parts[0] + '.png',
					qty: parseInt(parts[3]),
					company:parts[4]
				};
				cartItemsHistory.push(row);
			});
			renderCartSidebar2(cartItemsHistory); 
			existingInstance.show();
        } 
		else 
		{
            console.log("No data available");
        }
    }).catch((error) => 
	{
        console.error(error);
    });
}
function updateSideCart3(username, shipnumber) {
    const offcanvasElement = document.getElementById('cartSidebar');
    const existingInstance = bootstrap.Offcanvas.getOrCreateInstance(offcanvasElement);

    // Use .trim() to ensure the path is clean
    get(child(dbref, "requests/" + shipnumber.trim())).then((snapshot) => {
        if (snapshot.exists()) {
            const item = snapshot.val();
            
            let cartItemsHistory = [];
            const rawData = item.cart;
            // Split by ';' then each item by ':'
            const items = rawData.split(';').filter(i => i.length > 0);

            items.forEach(itemStr => {
                const parts = itemStr.split(':');
                cartItemsHistory.push({
                    id: parts[0],
                    title: parts[1],
                    price: parts[2],
                    image: 'items/' + parts[0] + '.png',
                    qty: parseInt(parts[3]),
                    company: parts[4] || "General Shop" // The categorized shop name
                });
            });

            // 1. IMPORTANT: Set the flag to stop database.js from loading the local cart
            offcanvasElement.skipGlobalRender = true;

            // 2. Call the categorized rendering function (History Style)
            renderCartSidebar2(cartItemsHistory); 

            // 3. Open the sidebar
            existingInstance.show();
            
            console.log("History Loaded Successfully:", cartItemsHistory);
        } else {
            console.log("No data available for ship:", shipnumber);
        }
    }).catch((error) => {
        console.error("Firebase Error:", error);
    });
}
//	historyshiptable
const historyshiptable = document.querySelectorAll('#historyshiptable');
historyshiptable.forEach(container => 
{
    container.addEventListener('click', function (event) 
	{
        // Check if the clicked element is the "Items" button
        const carthistorydetail = event.target.closest('#carthistorydetail');
		if(carthistorydetail)
		{
			const shipNum = carthistorydetail.getAttribute('data-shipnumber');
			updateSideCart2(username,shipNum); 
		}
    });
});

const drivershiptable = document.querySelectorAll('#drivershiptable');
drivershiptable.forEach(container => 
{
    container.addEventListener('click', function (event) 
	{
        // Check if the clicked element is the "Items" button
        const cartdriverdetail = event.target.closest('#cartdriverdetail');
		if(cartdriverdetail)
		{
			const shipNum = cartdriverdetail.getAttribute('data-shipnumber');
			const uname = cartdriverdetail.getAttribute('data-username');
			updateSideCart3(uname,shipNum); 
		}
    });
});
const table = document.querySelector('#drivershiptable');
if(table)
{
	table.addEventListener('click', function (event) 
	{
		const clickedBtn = event.target.closest('.status-btn');
		if (!clickedBtn) return; // Exit if background was clicked

		const rowContainer = clickedBtn.closest('.status-selector');
		const shipNum = rowContainer.getAttribute('data-shipnumber');
		const duserid = rowContainer.getAttribute('data-user');
		console.log(duserid);
		const allButtonsInThisRow = rowContainer.querySelectorAll('.status-btn');
		allButtonsInThisRow.forEach(btn => 
		{
			btn.classList.remove('active');
		});

		clickedBtn.classList.add('active');

		if (clickedBtn.classList.contains('btn-delivered')) 
		{
			updateColumn('requests',shipNum,'trackorder','0');
			updateRequestAndHistory(shipNum, duserid, "1");
		} 
		else if (clickedBtn.classList.contains('btn-ndelivered')) 
		{
			updateRequestAndHistory(shipNum, duserid, "0");
		}
		else if (clickedBtn.classList.contains('btn-delayed')) 
		{
			updateColumn('requests',shipNum,'trackorder','0');
			updateRequestAndHistory(shipNum, duserid, "3");
		}
		else if (clickedBtn.classList.contains('btn-pcanceled')) 
		{
			updateColumn('requests',shipNum,'trackorder','0');
			updateRequestAndHistory(shipNum, duserid, "5");
		}
		else if (clickedBtn.classList.contains('btn-canceled')) 
		{
			updateColumn('requests',shipNum,'trackorder','0');
			updateRequestAndHistory(shipNum, duserid, "2");
		}
	});
}

function updateOnWidth() 
{
	const width = window.innerWidth; // Get current width

	const topcart = document.getElementById('topcart');
	const topcart2 = document.getElementById('topcart2');
	const topcompany = document.getElementById('topcompany2');

	if (width < 992) 
	{
		if(topcart)topcart.style.display="none";
		if(topcart2)topcart2.style.display="none";
		if(topcompany)topcompany.style.display="none";
	}
	else
	{
		if(topcart)topcart.style.display="block";
		if(topcart2)topcart2.style.display="block";
		if(topcompany)topcompany.style.display="block";
	}
}

// Listen for window resize
window.addEventListener('resize', updateOnWidth);

// Trigger once on load to initialize values
updateOnWidth();

export function applyShopTheme(shopType) 
{
    // 1. Remove any existing themes
    document.body.classList.remove('theme-market', 'theme-restaurant','theme-butcher', 'theme-grocery', 'theme-toys', 'theme-bakery', 'theme-sweet','theme-tobbaco');
    
    // 2. Add the new theme based on shopType
    // You can use a simple if/else or switch based on the shop's category
    if (shopType === 'Markets') 
	{
        document.body.classList.add('theme-market');
    } 
	else if (shopType === 'Restaurants') 
	{
        document.body.classList.add('theme-restaurant');
    } 
	else if (shopType === 'Groceries') 
	{
        document.body.classList.add('theme-grocery');
    } 
	else if (shopType === 'ButcherShops') 
	{
        document.body.classList.add('theme-butcher');
    } 
	else if (shopType === 'ToysShops') 
	{
        document.body.classList.add('theme-toys');
    } 
	else if (shopType === 'BakeryShops') 
	{
        document.body.classList.add('theme-bakery');
    } 
	else if (shopType === 'SweetsShops') 
	{
        document.body.classList.add('theme-sweet');
    } 
	else if (shopType === 'TobbacoShops') 
	{
        document.body.classList.add('theme-tobbaco');
    } 
}

export function showPopup(message, type = 'info') 
{
    const alertBox = document.getElementById('customAlert');
    const msgPara = document.getElementById('alertMessage');
    msgPara.innerText = message;
    alertBox.classList.remove('hidden');
}

// Function to close it
window.closeAlert = function() 
{
    document.getElementById('customAlert').classList.add('hidden');
}

// Global variables to store location (default values)
let userLat = 34;
let userLng = 36;

const locationCheckbox2 = document.getElementById('shareLocation');
const registerBtn = document.getElementById('registerBtn');

// Helper function to toggle button state and styles
const setRegisterButtonState = (isDisabled) => {
    if (!registerBtn) return;
    registerBtn.disabled = isDisabled;
    if (isDisabled) {
        registerBtn.style.backgroundColor = "#cccccc"; 
        registerBtn.style.color = "#666666";
        registerBtn.style.borderColor = "#cccccc";
        registerBtn.style.cursor = "not-allowed";
        registerBtn.innerText = "Locating..."; // Optional: update text
    } else {
        registerBtn.style.backgroundColor = "";
        registerBtn.style.color = "";
        registerBtn.style.borderColor = "";
        registerBtn.style.cursor = "pointer";
        registerBtn.innerText = "Register"; // Reset text
    }
};

if (locationCheckbox2) {
    locationCheckbox2.addEventListener('change', async function() {
        if (this.checked) {
            // 1. Lock the button immediately
            setRegisterButtonState(true);

            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 5000
                    });
                });
                
                userLat = position.coords.latitude;
                userLng = position.coords.longitude;
                showPopup("Your Coordinates Set Via Your Phone Location");

            } catch (error) {
                this.checked = false; 
                showPopup("Location access denied or timed out.");
            } finally {
                // 2. This runs whether try SUCCEEDS or FAILS
                setRegisterButtonState(false);
            }
        } else {
            // Re-enable if user unchecks the box
            setRegisterButtonState(false);
        }
    });
}
// Registration Submit:
const registrationForm = document.getElementById('registrationForm');
if (registrationForm) registrationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let isValid = true;
    const inputs = e.target.querySelectorAll('input[required]');

    // Apply Red Blur to empty fields
    inputs.forEach(input => {
        if (!input.value.trim()) {
            input.classList.add('input-error');
            isValid = false;
        } else {
            input.classList.remove('input-error');
        }
    });

    if (!isValid) {
        showPopup("Please fill all fields!");
        return;
    }

    const username = document.getElementById('username').value;
    const phone = document.getElementById('phone').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (password !== confirmPassword) {
        showPopup("Passwords do not match!");
        return;
    }

    if (document.getElementById('username-status').innerHTML.includes('Username Taken')) {
        showPopup("Username Exists!");
        return;
    }

    // --- START OF ASYNC CHECK ---
    const deviceId = localStorage.getItem('deliveryplusids');
    
    countUUIDNoIndex(deviceId, (total) => {
        if (total >= 3) {
            showPopup('Your Device Cannot register more than 3 users');
            return; // Stops execution here
        }

        // --- SUCCESS: NOW SAVE DATA ---
        const requestRef = ref(db, 'users');
        const newPushRef = push(requestRef); 
        const newUserId = newPushRef.key;

        // Prepare data object
        const userData = {
            username: username.toLowerCase().trim(),
            fullname: "",
            phone: phone,
            password: password,
            status: "online",
            timestamp: new Date().toLocaleDateString('en-CA'),
            points: 0,
            uuid: deviceId
        };

        // Add location if available (not default 34)
        if (typeof userLat !== 'undefined' && userLat !== 34) {
            userData.lat = userLat;
            userData.lng = userLng;
        }

        set(newPushRef, userData)
        .then(() => {
            showPopup("Registration Succeed");
            
            const modalElement = document.getElementById('registerModal');
            const modalInstance = bootstrap.Modal.getInstance(modalElement);
            if (modalInstance) modalInstance.hide();
            
            localStorage.setItem('delivoUser', JSON.stringify({
                id: newUserId,
                username: username.toLowerCase().trim()
            }));

            updateNavToLoggedIn(username.toLowerCase().trim());
            distributeHistory(username.toLowerCase().trim());
            document.getElementById('registrationForm').reset();
            
            // Short delay before reload to let user see the popup
            setTimeout(() => { window.location.reload(); }, 1500); 
        
        }).catch((error) => {
            showPopup("Error: " + error.message);
        });
    });
});
let timeout = null;
const usernameInput = document.getElementById('username');
const statusDiv = document.getElementById('username-status');

if (usernameInput) 
{
  usernameInput.addEventListener('input', (e) => 
  {
    const username = e.target.value.trim();

    // 1. Immediate UI Reset
    clearTimeout(timeout);
    statusDiv.innerHTML = '';

    // 2. Client-side validation
    if (username.length === 0) return;
    if (username.length < 3) 
	{
      statusDiv.innerHTML = '<span class="text-muted">Too short</span>';
      return;
    }

    // 3. Show Spinner
    statusDiv.innerHTML = '<div class="spinner-tiny"></div>';

    // 4. Debounced Database Check
    timeout = setTimeout(async () => 
	{
  try 
  {
    const usersRef = ref(db, 'users'); 
    
    // Create the query
    const userQuery = query(
      usersRef, 
      orderByChild('username'), 
      equalTo(username.toLowerCase())
    );

    // Fetch the data
    const snapshot = await get(userQuery);
    // In Realtime DB, if no match is found, snapshot.val() is null
    if (snapshot.exists() && snapshot.val() !== null) 
	{
      statusDiv.innerHTML = '<span class="text-invalid">✖ Username Taken</span>';
    } 
	else 
	{
      statusDiv.innerHTML = '<span class="text-valid">✔ Username Available</span>';
    }
  } 
  catch (error) 
  {
    console.error("Database Error:", error);
  }
}, 500);
  });
}
export function updateNavToLoggedIn(username) {
    const userMenu = document.getElementById('userMenu');
    const navUserName = document.getElementById('navUserName');
    
    if (userMenu) {
        // 1. Kill the Bootstrap Dropdown instance
        const existingDropdown = bootstrap.Dropdown.getInstance(userMenu);
        if (existingDropdown) existingDropdown.dispose();

        // 2. Clear Bootstrap auto-triggers
        userMenu.removeAttribute('data-bs-toggle');
        userMenu.removeAttribute('data-bs-target');

        // 3. Update the UI
        navUserName.innerHTML = username + ' <i class="fas fa-caret-down ms-1"></i>';
        userMenu.classList.remove('dropdown-toggle'); // Clean look

        // 4. Attach your custom sidebar trigger
        userMenu.onclick = function(e) {
            e.preventDefault();
            openUserSidebar(); // This should be your existing function to show the sidebar
        };
    }
}
function updateNavToLoggedOut() {
    const userMenu = document.getElementById('userMenu');
    const navUserName = document.getElementById('navUserName');

    if (userMenu) {
        // Reset Text
        navUserName.innerText = "Public";
        
        // Re-enable Bootstrap Dropdown
        userMenu.onclick = null; // Remove the sidebar click override
        userMenu.setAttribute('data-bs-toggle', 'dropdown');
        userMenu.classList.add('dropdown-toggle');
        
        // Re-initialize Bootstrap dropdown logic
        new bootstrap.Dropdown(userMenu);
    }
}
// Your existing state (set this wherever you handle login)
let currentUsername = "Guest"; 
let isLoggedIn = false;

function refreshUserUI() {
    if (isLoggedIn) {
        updateNavToLoggedIn(currentUsername);
    } else {
        updateNavToLoggedOut();
    }
}

// Listen for the top bar specifically
window.addEventListener('topBarLoaded', () => {
    refreshUserUI();
});

const loginBtn = document.getElementById('loginBtn');
if(loginBtn)loginBtn.addEventListener('click', async function() 
{
    const typedUser = document.getElementById('loginUser').value;
    const typedPass = document.getElementById('loginPass').value;

    try 
	{
        // 1. Point to your 'users' node
        const usersRef = ref(db, 'users');

        // 2. Query for the record where the 'username' column matches
        const userQuery = query(usersRef, orderByChild('username'), equalTo(typedUser.toLowerCase().trim()));
        const snapshot = await get(userQuery);

        if (snapshot.exists()) 
		{
            // Firebase returns an object of results; get the first one
            const userDataObj = snapshot.val();
            const userKey = Object.keys(userDataObj)[0];
            const userData = userDataObj[userKey];

            // 3. Verify Password
            if (userData.password === typedPass) 
			{
				if(userData.status=='offline')
				{
					localStorage.removeItem('delivoDriver');
					// SUCCESS
					
					updateColumn("users",userKey,"status","online");
					updateColumn("users",userKey,"timestamp",new Date().toLocaleDateString('en-CA'));
					updateProfileImage(userData.username);
					updateNavToLoggedIn(userData.username);
					distributeHistory(userData.username);
					localStorage.setItem('delivoUser', JSON.stringify({
						id: userKey,
						username: userData.username
					}));

					// Close Modal
					bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
					document.getElementById('loginUser').value = "";
					document.getElementById('loginPass').value = "";
					window.location.reload(); 
				}
				else showPopup("User Already Logged In");
            } 
			else 
			{
                showPopup("Incorrect password.");
            }
        } else {
            showPopup("Username not found.");
        }
    } catch (error) {
        console.error("Database error:", error);
        alert("An error occurred. Check console for details.");
    }
});

// 2. The Global Initialization (Runs on every page load)
window.addEventListener('DOMContentLoaded', () => 
{
    if (username) 
	{
        updateNavToLoggedIn(username);
    }
});
window.switchUser = function() 
{
    const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
    loginModal.show();
};



window.showPassModal = function() {
    const wrapper = document.getElementById("CP-Modal-Wrapper");
    
    // 1. Close sidebar first
    const sidebar = document.getElementById("userSidebar");
    if (sidebar) sidebar.classList.remove("open");

    // 2. Show wrapper with Flex
    wrapper.style.display = "flex";
    
    // 3. Trigger the animation
    setTimeout(() => {
        wrapper.classList.add("active");
    }, 10);
};

window.hidePassModal = function() {
    const wrapper = document.getElementById("CP-Modal-Wrapper");
    wrapper.classList.remove("active");
    
    // Wait for animation to finish before hiding display
    setTimeout(() => {
        wrapper.style.display = "none";
    }, 300);
};

// Close modal when clicking the 'X' or outside the box
//document.querySelector(".close-modal").onclick = hidePassModal;
const modal = document.getElementById("passwordModal");
if(modal)
window.onclick = function(event) {
    if (event.target == modal) {
        hidePassModal();
    }
};

const changePasswordForm = document.getElementById("changePasswordForm");

if (changePasswordForm) {
    changePasswordForm.onsubmit = async (e) => {
        e.preventDefault();
        
        // Use .trim() to remove any accidental spaces at the start or end
        const oldPass = document.getElementById("oldPassword").value.trim();
        const newPass = document.getElementById("newPassword").value.trim();
        const confirmPass = document.getElementById("confirmPassword2").value.trim();
        
        if (newPass !== confirmPass) {
            showPopup("New passwords do not match!");
            return;
        }

        if (newPass === "") {
            showPopup("Password cannot be empty!");
            return;
        }

        try {
			const userRef = ref(db, 'users/' + userid);
    const snapshot = await get(userRef); // use 'get' instead of 'once'
    const userData = snapshot.val();

    if (userData && userData.password === oldPass) {
        // use 'update' function instead of .update() method
        await update(userRef, { password: newPass });
        
        showPopup("Password updated successfully!");
        if (typeof hidePassModal === "function") hidePassModal();
        e.target.reset();
    } else {
        showPopup("Incorrect old password.");
    }
} catch (error) {
    console.error("Firebase Error:", error);
    showPopup("Error updating password. Check console for details.");
}
    };
}


// Listen for storage changes from other tabs
window.addEventListener('storage', (event) => {
    if (event.key === 'delivoUser'||event.key === 'delivoDriver') {
        console.log('delivoUser changed in another tab. Reloading...');
        location.reload(); // Refresh the page to apply changes
    }
});

function appReady(userid) {
    if (window.AndroidBridge) {
        window.AndroidBridge.startBackgroundTracking(userid);
    }
}

// 2. Keep this for the moment they first log in
function onLoginSuccess(userid) {
    window.localStorage.setItem('userid', userid);
    if (window.AndroidBridge) {
        window.AndroidBridge.startBackgroundTracking(userid);
    }
}
//profile username keyup
const editUsername = document.getElementById('editUsername');
const usernameFeedback = document.getElementById('usernameFeedback');

if(editUsername)
{
	editUsername.addEventListener('keyup', function(event) 
	{
		const username2=editUsername.value.trim();
		// 1. Immediate UI Reset
		clearTimeout(timeout);
		usernameFeedback.innerHTML = '';
		
		// 2. Client-side validation
		if (username2.length === 0) return;
		if (username2.length < 3) 
		{
		  usernameFeedback.innerHTML = '<span class="text-muted">Too short</span>';
		  return;
		}

		// 3. Show Spinner
		usernameFeedback.innerHTML = '<div class="spinner-tiny"></div>';

		// 4. Debounced Database Check
		timeout = setTimeout(async () => 
		{
		  try 
		  {
			const usersRef = ref(db, 'users'); 
			
			// Create the query
			const userQuery = query(
			  usersRef, 
			  orderByChild('username'), 
			  equalTo(username2.toLowerCase())
			);

			// Fetch the data
			const snapshot = await get(userQuery);
			// In Realtime DB, if no match is found, snapshot.val() is null
			if (snapshot.exists()) 
			{
			  snapshot.forEach((childSnapshot) => 
			  {
				const dat = childSnapshot.val(); // Now 'dat' is the actual user object
				
				if(dat.username!=username)usernameFeedback.innerHTML = '<span class="text-invalid">✖ Username Taken</span>';
				else usernameFeedback.innerHTML = '<span class="text-invalid"></span>';
			  });
			} 
			else 
			{
			  usernameFeedback.innerHTML = '<span class="text-valid">✔ Username Available</span>';
			}
		  } 
		  catch (error) 
		  {
			console.error("Database Error:", error);
		  }
		}, 500);
	});
}

const themeList = [
  { name: 'light',    icon: 'fa-sun' },
  { name: 'dark',     icon: 'fa-moon' },
  { name: 'midnight', icon: 'fa-user-astronaut' },
  { name: 'forest',   icon: 'fa-tree' },
  { name: 'purple',   icon: 'fa-bolt' }
];

// 1. Event Delegation: Listen for clicks even on fetched content
document.addEventListener('click', function (event) {
  const btn = event.target.closest('#theme-toggle-btn');
  if (btn) {
    cycleTheme(btn);
  }
});

function cycleTheme(btn) {
  const root = document.documentElement;
  let currentName = root.getAttribute('data-theme') || 'light';
  let currentIndex = themeList.findIndex(t => t.name === currentName);
  
  let nextIndex = (currentIndex + 1) % themeList.length;
  let nextTheme = themeList[nextIndex];

  // Trigger CSS animation via JS
  btn.style.transition = "transform 0.25s ease-in-out";
  btn.style.transform = "translateY(-10px) scale(1.2)";

  setTimeout(() => {
    // Update Theme
    root.setAttribute('data-theme', nextTheme.name);
    localStorage.setItem('preferred-theme', nextTheme.name);
    
    // Update Icon: Replace with fresh <i> so FontAwesome re-renders
    btn.innerHTML = `<i class="fa-solid ${nextTheme.icon}"></i>`;
    
    // Force FontAwesome to process the new icon
    if (window.FontAwesome) {
      window.FontAwesome.dom.i2svg({ node: btn });
    }
    
    // Reset CSS animation
    btn.style.transform = "translateY(0) scale(1)";
  }, 250);
}

// 3. Sync on load/fetch
function syncThemeIcon() {
  const saved = localStorage.getItem('preferred-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  
  const btn = document.getElementById('theme-toggle-btn');
  const active = themeList.find(t => t.name === saved);
  
  if (btn && active) {
    btn.innerHTML = `<i class="fa-solid ${active.icon}"></i>`;
    if (window.FontAwesome) {
      window.FontAwesome.dom.i2svg({ node: btn });
    }
  }
}

// Run sync when the DOM is ready (in case button is already there)
window.addEventListener('DOMContentLoaded', syncThemeIcon);

//play sound function
function playSound(sound) 
{
	console.log('play sound');
    var audio = new Audio('sounds/'+sound+'.mp3'); 
    audio.play();
}
function countUUIDNoIndex(targetUuid, callback) {
    const usersRef = ref(db, 'users');

    get(usersRef).then((snapshot) => {
        let count = 0;

        if (snapshot.exists()) {
            // Loop through every single user manually
            snapshot.forEach((userSnapshot) => {
                const userData = userSnapshot.val();
                
                // Check if this user has the matching uuid
                if (userData.uuid === targetUuid) {
                    count++;
                }
            });
        }
        
        callback(count);
    }).catch((error) => {
        console.error("Error fetching users:", error);
        callback(0);
    });
}

// Usage:
countUUIDNoIndex("DEVICE_ID_123", (total) => {
    //console.log("Found " + total + " users with this ID.");
});

const checkoutbutton = document.getElementById('checkoutbutton');

if (checkoutbutton) {
    checkoutbutton.addEventListener('click', function(e) { // Add 'e' here
        e.preventDefault(); // Fix: Call it on the event object
        // 1. Play the sound first
        playSound('checkout'); 
        // 2. Trigger alert (optional)
        // Note: Alert might still cut off the sound in some browsers.
        setTimeout(() => {
        window.location.href = 'checkout.html';
		}, 600); 
		
    });
}



let liveTrackingMap;
let liveDriverMarker;
let userMarker; 
let directionsService; 
let directionsRenderer;
let liveTrackingListener;
let currentPos = null;

window.openTrackingModal = function(shipNumber, driverId) {
    const modalElement = document.getElementById('trackingModal');
    const modal = new bootstrap.Modal(modalElement);
    modal.show();

    // The listener is marked async to handle the Firebase data fetch
    modalElement.addEventListener('shown.bs.modal', async function () {
        
        // --- NEW: Fetch Ship coordinates from Firebase requests path ---
        let userPos;
        try {
            // Import 'get' and 'child' if not already available in your Firebase config
            const shipRef = ref(db, `requests/${shipNumber}`);
            const snapshot = await get(shipRef);
            
            if (snapshot.exists()) {
                const shipData = snapshot.val();
                userPos = { 
                    lat: parseFloat(shipData.lat), 
                    lng: parseFloat(shipData.lng) 
                };
            } else {
                console.error("Ship number not found in database.");
                return; // Exit if the ship record doesn't exist
            }
        } catch (error) {
            console.error("Error fetching ship data:", error);
            return;
        }
        // ------------------------------------------------------------

        // 1. Initialize Map and Services
        if (!liveTrackingMap) {
            directionsService = new google.maps.DirectionsService();
            directionsRenderer = new google.maps.DirectionsRenderer({
                suppressMarkers: true,
                preserveViewport: true,
                polylineOptions: {
                    strokeColor: "#007bff",
                    strokeOpacity: 0.8,
                    strokeWeight: 6
                }
            });

            liveTrackingMap = new google.maps.Map(document.getElementById("tracking-map"), {
                zoom: 16,
                center: userPos,
                mapTypeId: google.maps.MapTypeId.HYBRID,
                mapTypeControl: true
            });
            directionsRenderer.setMap(liveTrackingMap);
        }

        // 2. Set User Marker (Destination)
        if (!userMarker) {
            userMarker = new google.maps.Marker({
                position: userPos,
                map: liveTrackingMap,
                title: "Delivery Location",
                zIndex: 10000,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: "#007bff",
                    fillOpacity: 1,
                    strokeColor: "#ffffff",
                    strokeWeight: 3,
                    scale: 10
                }
            });
        } else {
            userMarker.setPosition(userPos);
        }

        // 3. Initialize Taxi Marker
        if (!liveDriverMarker) {
            liveDriverMarker = new google.maps.Marker({
                map: liveTrackingMap,
                title: "Your Driver",
                zIndex: 9999,
                optimized: false,
                icon: {
                    path: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
                    fillColor: "#ffc107",
                    fillOpacity: 1,
                    strokeWeight: 2,
                    strokeColor: "#ffffff",
                    scale: 1.5,
                    anchor: new google.maps.Point(12, 12)
                }
            });
        }

        // 4. Start Firebase Listener for Driver
        const driverRef = ref(db, `drivers/${driverId}/location`);
        if (liveTrackingListener) liveTrackingListener(); 

        liveTrackingListener = onValue(driverRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const newPos = { lat: parseFloat(data.lat), lng: parseFloat(data.lng) };

                if (!currentPos) {
                    liveDriverMarker.setPosition(newPos);
                    liveTrackingMap.setCenter(newPos);
                    currentPos = newPos;
                } else {
                    animateMarker(liveDriverMarker, currentPos, newPos);
                    currentPos = newPos;
                }

                // Update the Route Line
                updateRoute(newPos, userPos);
                document.getElementById('tracking-info').innerText = "Driver is on the way!";
            }
        });
    }, { once: true });
};

function updateRoute(origin, destination) {
    directionsService.route({
        origin: origin,
        destination: destination,
        travelMode: google.maps.TravelMode.DRIVING
    }, (response, status) => {
        if (status === "OK") {
            directionsRenderer.setDirections(response);
        }
    });
}

function animateMarker(marker, startPos, endPos) {
    const frames = 60;
    let count = 0;
    const deltaLat = (endPos.lat - startPos.lat) / frames;
    const deltaLng = (endPos.lng - startPos.lng) / frames;

    function move() {
        const lat = startPos.lat + (deltaLat * count);
        const lng = startPos.lng + (deltaLng * count);
        const newPos = new google.maps.LatLng(lat, lng);
        marker.setPosition(newPos);
        if (count % 15 === 0) liveTrackingMap.panTo(newPos);
        if (count < frames) {
            count++;
            requestAnimationFrame(move);
        }
    }
    move();
}

// Visual Pulse Animation for Taxi
let scaleDirection = 1;
setInterval(() => {
    if (liveDriverMarker) {
        const icon = liveDriverMarker.getIcon();
        if (icon && icon.scale) {
            let currentScale = icon.scale;
            currentScale += (0.02 * scaleDirection);
            if (currentScale > 1.7 || currentScale < 1.4) scaleDirection *= -1;
            icon.scale = currentScale;
            liveDriverMarker.setIcon(icon);
        }
    }
}, 100);


document.addEventListener('show.bs.offcanvas', function (event) {
    const sidebar = event.target;
    
    if (sidebar.id === 'cartSidebar') {
        // 1. Check if we are on the orders page
        const isOrdersPage = window.location.pathname.includes('orders.html');

        // 2. If 'skipGlobalRender' is manually set (by the driver function)
        // or if we are on the orders.html page, do NOT load the local cart.
        if (sidebar.skipGlobalRender || isOrdersPage) {
            console.log("Skipping local cart render (History or Orders Page mode).");
            delete sidebar.skipGlobalRender; // Clean up flag
            return; 
        }

        // 3. Otherwise, render the active local cart (Main page behavior)
        if (typeof renderCartSidebar === 'function' && typeof cartItems !== 'undefined') {
            renderCartSidebar(cartItems);
        }
    }
});

