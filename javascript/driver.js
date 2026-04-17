import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getDatabase,onDisconnect,query, push ,set, get, update, remove, ref, increment, runTransaction, child, onValue,orderByChild,equalTo } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";
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


let driverData = JSON.parse(localStorage.getItem('delivoDriver'));
let wakeLock = null;

// --- 2. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    if (driverData) {
        startDriverSession();
    }
    setupTableListeners();
});

// --- 3. AUTHENTICATION ---
function initAuth() {
    const loginForm = document.getElementById('loginForm');
    const logoutBtn = document.getElementById('logoutBtn');

    if (loginForm) {
        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            const user = document.getElementById('loginUsername').value.toLowerCase().trim();
            const pass = document.getElementById('loginPassword').value;
            const errorMsg = document.getElementById('loginError');

            const snapshot = await get(child(dbref, "drivers"));
            if (snapshot.exists()) {
                let found = false;
                snapshot.forEach((childSnap) => {
                    const data = childSnap.val();
                    if (data.username === user && data.password === pass) {
                        found = true;
                        localStorage.setItem('isLoggedIn', 'true');
                        localStorage.setItem('delivoDriver', JSON.stringify({
                            id: childSnap.key,
                            driverusername: user,
                            driverowner: data.owner
                        }));
                    }
                });

                if (found) location.reload();
                else errorMsg.classList.remove('d-none');
            }
        };
    }

    if (logoutBtn) {
        logoutBtn.onclick = (e) => {
            e.preventDefault();
            localStorage.clear();
            location.reload();
        };
    }
}

function startDriverSession() {
    // UI Setup
    document.getElementById('loginLink').classList.add('d-none');
    document.getElementById('userDropdown').classList.remove('d-none');
    document.getElementById('userLabel').innerText = driverData.driverowner;

    // Presence (Online/Offline)
    const statusRef = ref(db, `drivers/${driverData.id}/status`);
    onDisconnect(statusRef).set("offline");
    set(statusRef, "online");

    // Geolocation & Wake Lock
    startTracking();
    requestWakeLock();

    // Live Listeners
    onValue(ref(db, "requests"), distributeDriver);
}

// --- 4. TRACKING & WAKE LOCK ---
function startTracking() {
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition((pos) => {
            update(ref(db, `drivers/${driverData.id}/location`), {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                timestamp: Date.now()
            });
        }, (err) => console.warn(err), { enableHighAccuracy: true });
    }
}

async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try { wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
    }
}

// --- 5. SHIPMENT TABLE LOGIC ---
function distributeDriver() {
    const table = document.getElementById('drivershiptable');
    if (!table || !driverData) return;

    const params = new URLSearchParams(window.location.search);
    const historyMode = params.get('history') === '1';

    get(child(dbref, "requests")).then((snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.val();
        let html = "";
        let counts = { n: 0, d: 0, dl: 0, c: 0, pc: 0 };

        const sortedKeys = Object.keys(data).sort((a, b) => {
            const numA = parseInt(a.split('_')[1]) || 0;
            const numB = parseInt(b.split('_')[1]) || 0;
            return numB - numA;
        });

        sortedKeys.forEach(key => {
            const item = data[key];
            if (item.driver === driverData.driverowner && item.vault == (historyMode ? "1" : "0")) {
                const state = item.state;
                if (state == "0") counts.n++;
                else if (state == "1") counts.d++;
                else if (state == "3") counts.dl++;
                else if (state == "2") counts.c++;
                else if (state == "5") counts.pc++;

                const stateMap = {
                    "0": { c: "btn-ndelivered", t: "Not Delivered" },
                    "1": { c: "btn-delivered", t: "Delivered" },
                    "2": { c: "btn-canceled", t: "Canceled" },
                    "3": { c: "btn-delayed", t: "Delayed" },
                    "5": { c: "btn-pcanceled", t: "Canceled Paid" }
                };
                const cur = stateMap[state] || stateMap["0"];

                html += `
                <tr class="expandable">
                    <td data-label='Ship #'>
                        <span class="desktop-only-text">${key}</span>
                        <div class="mobile-summary-row">
                            <span class="toggle-icon" onclick="toggleCard(this)">+</span>
                            <span class="m-ship">#${key}</span>
                            <span class="m-total">${item.total} $</span>
                            <span class="m-status-badge ${cur.c}">${cur.t}</span>
                        </div>
                    </td>
                    <td data-label='Owner'>${item.fullname}</td>
                    <td data-label='Phone'>${item.phone}</td>
                    <td data-label='Address'>${item.city}/${item.street}</td>
                    <td data-label='Amount'>${item.total} $</td>
                    <td data-label='Due Date'>${item.date}</td>
                    <td data-label='Status'>
                        <div class='status-selector' data-username='${item.username}' data-shipnumber='${key}'>
                            ${['0','1','3','2','5'].map(s => `
                                <button class="status-btn ${stateMap[s].c} ${state == s ? 'active' : ''}">
                                    ${stateMap[s].t}
                                </button>
                            `).join('')}
                            <button class='status-btn2 btn-items' data-shipnumber='${key}'>Items</button>
                        </div>
                    </td>
                </tr>`;
            }
        });
        table.querySelector('tbody').innerHTML = html;
        updateBadges(counts);
    });
}

function setupTableListeners() {
    const table = document.getElementById('drivershiptable');
    if (!table) return;

    table.addEventListener('click', async (e) => {
        const btn = e.target.closest('.status-btn');
        const itemBtn = e.target.closest('.btn-items');

        if (btn) {
            const selector = btn.closest('.status-selector');
            const shipId = selector.dataset.shipnumber;
            const username = selector.dataset.username;
            
            let newState = "0";
            if (btn.classList.contains('btn-delivered')) newState = "1";
            else if (btn.classList.contains('btn-canceled')) newState = "2";
            else if (btn.classList.contains('btn-delayed')) newState = "3";
            else if (btn.classList.contains('btn-pcanceled')) newState = "5";

            const updates = {};
            updates[`/requests/${shipId}/state`] = newState;
            if (username && username !== "undefined") updates[`/historyRequests/${username}/${shipId}/state`] = newState;
            await update(ref(db), updates);
        }

        if (itemBtn) {
            const shipNum = itemBtn.dataset.shipnumber;
            const snapshot = await get(child(dbref, `requests/${shipNum}`));
            if (snapshot.exists()) {
                const item = snapshot.val();
                const cartItems = item.cart.split(';').filter(i => i.length > 0).map(str => {
                    const p = str.split(':');
                    return { title: p[1], price: p[2], qty: p[3], image: `items/${p[0]}.png` };
                });
                renderCartSidebar(cartItems);
                new bootstrap.Offcanvas(document.getElementById('cartSidebar')).show();
            }
        }
    });
}

// --- 6. HELPERS ---
function renderCartSidebar(items) {
    let html = "", total = 0;
    items.forEach(ci => {
        total += ci.price * ci.qty;
        html += `<div class="list-group-item d-flex justify-content-between align-items-center">
                    <div><b>${ci.title}</b><br><small>${ci.price}$ × ${ci.qty}</small></div>
                    <img src="${ci.image}" width="40" height="40" style="border-radius:4px" onerror="this.src='items/0.png'">
                 </div>`;
    });
    document.getElementById('cartList').innerHTML = html;
    document.getElementById('cartTotal').innerText = total.toFixed(2) + " $";
}

function updateBadges(c) {
    const ids = ['ndelivered','delivered','delayed','canceled','pcanceled'];
    const vals = [c.n, c.d, c.dl, c.c, c.pc];
    ids.forEach((id, i) => { 
        const el = document.getElementById(`count-${id}`);
        if(el) el.innerText = vals[i]; 
    });
}

window.toggleCard = (btn) => {
    const row = btn.closest('tr');
    const wasExp = row.classList.contains('expanded');
    document.querySelectorAll('tr.expanded').forEach(r => { 
        r.classList.remove('expanded'); 
        r.querySelector('.toggle-icon').innerText = '+'; 
    });
    if (!wasExp) { 
        row.classList.add('expanded'); 
        btn.innerText = '−'; 
    }
};