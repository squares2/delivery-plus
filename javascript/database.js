var cartCount=0;
var cartItems=[];
//[{id: '6', title: 'bananas', price: 1, image: 'items/6.png', qty: 1}]
var saleEnd=Date.now()+12*60*60*1000;

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getDatabase,query, push ,set, get, update, remove, ref, increment, runTransaction, child, onValue,orderByChild,equalTo } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";
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
//setLogLevel('debug'); 
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
	
	const patternRef = ref(db, "pattern");

	onValue(patternRef, (snapshot) => 
	{
	    if (snapshot.exists()) 
		{
	        getCompanies();
	    }
	});
window.onload = function() 
{
    const storedData = localStorage.getItem('delivoUser');
    
    if (storedData) 
	{
        const user = JSON.parse(storedData);
        // Use the function we made earlier to swap the menu
        updateNavToLoggedIn(user.username);
    }
};
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
				inner+="<div class='col-6 col-lg-3'><h6 class='fw-semibold'>"+key+"</h6>"
				while (j < item.length)
				{
					compname=item[j].companyname;
					if(item[j].soon=="1")soon="soon";
					else soon="";
					inner+="<a class='dropdown-item "+soon+"' href='category.html?category="+compname+"&pattern="+key+"'>"+compname+"</a>"
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
function distributeDriver()
{
	const params = new URLSearchParams(window.location.search);
	var historyValue = params.get('history');
		
	if(historyValue&&historyValue==1)
	{
		const link1 = document.getElementById('history');
		if(link1)
		{
			link1.href="?history=0";
			link1.innerHTML="<i class='fa-solid fa-house me-2'></i>Main</a>";
		}	
	}
	else
	{
		const link1 = document.getElementById('history');
		if(link1)
		{
			link1.href="?history=1";
			link1.innerHTML="<i class='fa-solid fa-clock-rotate-left me-2'></i>History</a>";
		}	
	}
	if(!historyValue)var historyValue=0;
	var owner=localStorage.getItem('owner');
	const drivershiptable = document.getElementById('drivershiptable');
	if(owner&&owner.length==0)
	{
		drivershiptable.innerHTML="";
	}
	else
	{
		var inner1="<thead><tr><th>Ship Number</th><th>Owner</th><th>Owner Phone</th><th>Owner Address</th>";
		inner1+="<th>Amount</th><th>Due Date</th><th>Status</th></tr></thead><tbody>";
		var inner2="";
		var delivered="";
		var ndelivered="";
		var delayed="";
		var canceled="";
		var pcanceled="";
		
		var countndelivered=document.getElementById('count-ndelivered');
		var countdelivered=document.getElementById('count-delivered');
		var countdelayed=document.getElementById('count-delayed');
		var countcanceled=document.getElementById('count-canceled');
		var countpcanceled=document.getElementById('count-pcanceled');
		
		var totdel=0,totndel=0,totdelayed=0,totcancel=0,totpcancel=0;

		get(child(dbref,"requests")).then((snapshot) => 
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
					if(item.driver===localStorage.getItem('owner')&&((item.vault=="1"&&historyValue&&historyValue==1)||(item.vault=="0"&&(!historyValue||historyValue==0))))
					{
						if(item.state=="0")
						{
							ndelivered="active";
							totndel++;
						}	
						else ndelivered="";
						if(item.state=="1")
						{
							delivered="active";
							totdel++;
						}	
						else delivered="";
						if(item.state=="2")
						{
							canceled="active";
							totcancel++;
						}	
						else canceled="";
						if(item.state=="3")
						{
							delayed="active";
							totdelayed++;
						}	
						else delayed="";
						if(item.state=="5")
						{
							pcanceled="active";
							totpcancel++;
						}	
						else pcanceled="";

						inner2+="<tr><td data-label='Ship Number'>"+key+"</td>";
						inner2+="<td data-label='Owner'>"+item.fullname+"</td>";
						inner2+="<td data-label='Owner Phone'>"+item.phone+"</td>";
						inner2+="<td data-label='Owner Address'>"+item.city+"/"+item.street+"</td>";
						inner2+="<td data-label='Amount'>"+item.total+"</td>";
						inner2+="<td data-label='Due Date'>"+item.date+"</td>";
						inner2+="<td data-label='Status'><div class='status-selector'data-shipnumber='"+key+"'>";
						if((item.state=="0"&&historyValue==1)||historyValue==0)inner2+="<button class='status-btn btn-ndelivered "+ndelivered+"'>Not Delivered</button>";
						if((item.state=="1"&&historyValue==1)||historyValue==0)inner2+="<button class='status-btn btn-delivered "+delivered+"'>Delivered</button>";
						if((item.state=="3"&&historyValue==1)||historyValue==0)inner2+="<button class='status-btn btn-delayed "+delayed+"'>Delayed</button>";
						if((item.state=="2"&&historyValue==1)||historyValue==0)inner2+="<button class='status-btn btn-canceled "+canceled+"'>Canceled</button>";
						if((item.state=="5"&&historyValue==1)||historyValue==0)inner2+="<button class='status-btn btn-pcanceled "+pcanceled+"'>Canceled Payed</button>";
						if(historyValue==0)inner2+="<button id='cartdriverdetail' data-shipnumber='"+key+"' class='status-btn2 btn-items'>Items</button>";
						inner2+="</div></td></tr>";
					}
					i++;
				}
				inner2+="</tbody>";
				if(drivershiptable)drivershiptable.innerHTML=inner1+inner2;
				
				if(countndelivered)countndelivered.innerHTML=""+totndel;
				if(countdelivered)countdelivered.innerHTML=""+totdel;
				if(countdelayed)countdelayed.innerHTML=""+totdelayed;
				if(countcanceled)countcanceled.innerHTML=""+totcancel;
				if(countpcanceled)countpcanceled.innerHTML=""+totpcancel;
				
			} 
			else 
			{
				inner2+="</tbody>";
				if(drivershiptable)drivershiptable.innerHTML=inner1+inner2;
				//console.log("No data available");
			}
		}).catch((error) => 
		{
			console.error(error);
		});
	}
}
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
				const key = childSnapshot.key;    // This is your multi-key (e.g., "-N123...")
				const item = childSnapshot.val(); // This is your multi-item data object
				if(key==companyname)
				{
					for (const [subKey, value] of Object.entries(item)) 
					{
						inner+="<div class='col-6 col-lg-3'><h6 class='fw-semibold'>"+subKey+"</h6>"
						val=value.slice(0, -1);
						subs=[];
						const values = val.split(",");
						for(let i=0;i<values.length;i++)
						{
							inner+="<a class='dropdown-item' href='#"+values[i]+"'>"+values[i]+"</a>"
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
					let row={id:key,title:item.name,price:item.price,image:'items/'+key+'.png',category:item.cat};
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
				
				let row={id:key,title:item.name,price:item.price,image:'items/'+key+'.png',category:item.cat};
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
function setCompany(comp)
{
	const back = document.getElementById('back');
	const featured = document.getElementById('featuredcompanies');
	var inner="";
	
	if(comp=="-1")
	{
		inner="<div class='col-6 col-lg-2'><a href='' data-company-name='Restaurants'"
		inner+="class='card category-card text-center'><img src='png/restaurants.jpg' "
		inner+="class='card-img-top'><div class='card-body'><h6>Restaurants</h6></div></a></div>"
		inner+="<div class='col-6 col-lg-2'><a href='' data-company-name='Markets'";
		inner+="class='card category-card text-center'><img src='png/markets.jpg' ";
		inner+="class='card-img-top' alt='Dairy'><div class='card-body'><h6>Markets</h6></div></a></div>";
		inner+="<div class='col-6 col-lg-2'><a href='' data-company-name='Groceries'";
		inner+="class='card category-card text-center'><img src='png/groceries.jpg' ";
		inner+="class='card-img-top' alt='Snacks'><div class='card-body'><h6>Groceries</h6></div>  ";
		inner+="</a></div><div class='col-6 col-lg-2'><a href='' data-company-name='Butchers'";
		inner+="class='card category-card text-center'><img src='png/butchershops.jpg' ";
		inner+="class='card-img-top' alt='Staples'><div class='card-body'><h6>Butchers</h6></div></a></div>";
		inner+="<div class='col-6 col-lg-2'><a href='' data-company-name='Toys shop'";
		inner+="class='card category-card text-center'><img src='png/toys.jpg' class='card-img-top'";
		inner+="alt='Staples'><div class='card-body'><h6>Toys shop</h6></div></a></div>";
		inner+="<div class='col-6 col-lg-2'><a href='' data-company-name='Bakery'";
		inner+="class='card category-card text-center'><img src='png/bakery.jpg' ";
		inner+="class='card-img-top' alt='Meat'><div class='card-body'><h6>Bakery</h6></div></a></div>";
		inner+="<div class='col-6 col-lg-2'><a href='' data-company-name='Sweets'";
		inner+="class='card category-card text-center'><img src='png/sweets.jpg' ";
		inner+="class='card-img-top' alt='Household'><div class='card-body'><h6>Sweets</h6></div></a></div>";
		inner+="<div class='col-6 col-lg-2'><a href='' data-company-name='Tobbaco'";
		inner+="class='card category-card text-center'><img src='png/tobacco.jpg' ";
		inner+="class='card-img-top' alt='Household'><div class='card-body'><h6>Tobbaco</h6></div></a></div>";
		featured.innerHTML=inner;
	}	
	else
	{
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
				inner="";
				while (i < keys.length) 
				{
					const key = keys[i];
					const item = data[key];
					j=0;
					while (j < item.length)
					{
						compname=item[j].companyname;
						soon=item[j].soon;
						if(comp==key&&parseInt(soon)>1)
						{
							inner+="<div class='col-6 col-lg-2'><a href='category.html?category="+compname+"&pattern="+key+"' data-company-name='"+compname+"'"
							inner+="class='card category-card text-center'><img src='png/"+comp.toLowerCase()+".jpg' "
							inner+="class='card-img-top'><div class='card-body'><h6>"+compname+"</h6></div></a></div>";
						}
						j++
					}	
					i++;
				}	
				featured.innerHTML=inner;
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
	if(comp=="-1")back.style.display="none";
	else back.style.display="block";
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
	//console.log(year+"-"+month+"-"+day+" "+hour+":"+minute+":"+second);
	return year+"-"+month+"-"+day+" "+hour+":"+minute+":"+second;
}
//document.addEventListener('DOMContentLoaded',distribute);

/*document.addEventListener('DOMContentLoaded', () => 
{
	const categoryUL = document.getElementById('category');
	const mycart = document.getElementById('mycart');
	const emptycart = document.getElementById('emptycart');
	const login_form = document.getElementById('login_form');
	login_form.addEventListener('click', (event) => 
	{
		deliverDatabase();
	});
	mycart.addEventListener('click', (event) => 
	{
		distributeMyCart();
	});
	emptycart.addEventListener('click', (event) => 
	{
		let lastcat=localStorage.getItem('lastcat');
		if(lastcat.length>0)distribute(lastcat);
		else 
		{
			distributeMyCart();
		}
	});
	if(categoryUL!=null)
	{
		categoryUL.addEventListener('click', (event) => 
		{
			// Check if the clicked element (event.target) or one of its parents is a `.block`
			const clickedCategory = event.target.closest('a');

			if (clickedCategory) 
			{
				event.preventDefault(); 
				const catName = clickedCategory.getAttribute('id');
				distribute(catName);
			}
		});
	}
});*/

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
		//console.log(prev+":"+p.category);
		prehtml='';
		posthtml='';
		if(prev.length==0)
		{
			prev=p.category;
			prehtml="<section id='"+p.category+"'class='py-5'><div class='container'>";
			prehtml+="<div class='d-flex justify-content-between align-items-center mb-4'>";
			prehtml+="<h2 style='background: linear-gradient(to right, #42adad 30%, #0c2626 70%);color:#fff;border-radius: 10px;padding: 10px 5px;'class='fw-bold'>"+p.category+"</h2></div><div class='row g-3'>";
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
			prehtml+="<h2 style='background: linear-gradient(to right, #42adad 30%, #0c2626 70%);color:#fff;border-radius: 10px;padding: 10px 5px;'class='fw-bold'>"+p.category+"</h2></div><div class='row g-3'>";
			posthtml="</div></div></section>";
			html+=posthtml+prehtml+cardTemplate(p);
		}
		
	});
	html+=posthtml;
	grid.innerHTML=html;
	wireButtons(grid)
};
		
function money(v)
{
	const formatter = new Intl.NumberFormat('en-US', 
	{
		style: 'decimal', // Use for standard number formatting
	});
	var numericValue = Number(v) || 0;
	return numericValue.toFixed(2)+' $'; 
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
function updateCartBadge()
{
	cartCount=getCartCount();
	var el=document.getElementById('cartCount');
	if(el)el.textContent=String(cartCount);
	el=document.getElementById('cartCount2');
	if(el)el.textContent=String(cartCount);
	el=document.getElementById('cartCount3');
	if(el)el.textContent=String(cartCount);
	checkForm();
	/*const elements = document.querySelectorAll('#cartCount');
	elements.forEach(el => 
	{
		el.textContent=String(cartCount);
	});*/
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
	}
	else
	{
		let cost=Number(p.price);
		if(cost>2000)cost=cost/90000;
		cartItems.push({id:p.id,title:p.title,price:cost,image:p.image,qty:1})
	}
	saveCart();
	updateCartBadge();
	renderCartSidebar()
}
function removeProductOverlay(productId) 
{
    // 1. Find the card in the main grid with that ID
    const card2 = document.querySelector(`#categoryGrid [data-product-id="${productId}"]`);
    
    if (card2) 
	{
		const card = card2.closest('.product-card');
		
        const overlay = card.querySelector('.img-overlay');
        if (overlay) 
		{
            overlay.style.display = 'none'; // Hide overlay
        }
        
        // Optional: Reset button text
        const btn = card.querySelector('.btn-success');
        if (btn) 
		{
			btn.innerText = 'Add to Cart';
			btn.classList.replace('btn-success', 'btn-primary');
		}	
    }
	checkForm();
}
function cardTemplate(p)
{
	let found=false;
	let result='<div class="col-3 col-lg-3">'+
    '<div class="card product-card h-100">'+
      '<img src="' + p.image + '" onerror="this.onerror=null;this.src=\'items/0.png\';" class="card-img-top" alt="'+p.title+'">';
	  
	for(var i=0;i<cartItems.length;i++)
	{
		if(p.id==cartItems[i].id)found=true;
	}

	if(found)result+='<img src="png/cart3.png" style="display:block"class="img-overlay" alt="Overlay">';
	else result+='<img src="png/cart3.png" style="display:none"class="img-overlay" alt="Overlay">';
	  result+=
      '<div class="card-body">'+
        '<h6 class="card-title">'+p.title+'</h6>'+
        '<div class="fw-semibold mb-2">'+money(p.price)+'</div>'+
        '<div class="d-flex gap-2">';
          if(found)result+='<button class="btn btn-sm btn-success" data-product-id="'+p.id+'">Added to Cart</button>';
          else result+='<button class="btn btn-sm btn-primary" data-product-id="'+p.id+'">Add to Cart</button>';
          result+='</div>'+
      '</div>'+
    '</div>'+
  '</div>';
	return result
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
        '<a class="btn btn-outline-secondary" href="checkout.html">Buy Now</a>'+
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
function renderCartSidebar()
{
	var list=document.getElementById('cartList');
	var totalEl=document.getElementById('cartTotal');
	if(!list||!totalEl)return;
	var html='';
	var total=0;
	cartItems.forEach(function(ci)
	{
		total+=ci.price*ci.qty;
		html+=
  '<div class="list-group-item d-flex align-items-center justify-content-between">'+
    '<div class="d-flex align-items-center gap-2">'+
      '<img src="'+ci.image+'" onerror="this.onerror=null;this.src=\'items/0.png\';" alt="'+ci.title+'" width="48" height="48" style="object-fit:cover;border-radius:6px">'+
      '<div><div class="small fw-semibold">'+ci.title+'</div><div class="small text-muted">'+money(ci.price)+' × '+ci.qty+'</div></div>'+
    '</div>'+
    '<div class="d-flex align-items-center gap-2">'+
      '<button class="btn btn-sm btn-outline-secondary" data-cart-dec="'+ci.id+'">-</button>'+
      '<button class="btn btn-sm btn-outline-secondary" data-cart-inc="'+ci.id+'">+</button>'+
      '<button class="btn btn-sm btn-outline-danger" data-cart-del="'+ci.id+'"><i class="fa-solid fa-trash"></i></button>'+
    '</div>'+
  '</div>'
	});
	list.innerHTML=html;
	if(totalEl)
	{
		totalEl.textContent=money(total)
		localStorage.setItem('count',getCartCount());
		localStorage.setItem('total',total+2);
		var sumitems=document.getElementById('summaryItems');
		var subTotal=document.getElementById('subTotal');
		var checkTotal=document.getElementById('checktotal');
		if(sumitems!=null)sumitems.innerHTML=getCartCount();
		if(subTotal!=null)subTotal.innerHTML=totalEl.textContent;
		if(checkTotal!=null)checkTotal.innerHTML=parseFloat(totalEl.textContent)+2;
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
	renderCartSidebar()
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
		}
		else if(dec)
		{
			changeQty(parseInt(dec),-1)
		}
		else if(del)
		{
			var item=cartItems.find(function(ci)
			{
				return ci.id===del
			});			
			if(item)changeQty(parseInt(del),-item.qty)
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
	var cartcount=document.getElementById("cartCount3");
	var order=document.getElementById("place_order");
	if(name!=null&&name.value.length>0&&phone.value.length>0&&city.value.length>0&&street.value.length>0&&cartcount.innerHTML!="0")
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
			cartList+=product.id+":"+product.title+":"+product.price+":"+product.qty+";";
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
			const newId = result.snapshot.val(); // This is your 1, 2, 3...

			// 2. Use that ID as the key
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
				xnote:note.value
			});
			
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
	renderCartSidebar();
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
    
    // 1. Handle Login Submission
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

					// 2. Loop through results (usually just one if usernames are unique)
					snapshot.forEach((childSnapshot) => 
					{
						const data = childSnapshot.val();
						if (data.username===username&&data.password === pass) 
						{
							isAuthenticated = true;
							driverData = data;
						}
					});

					if (isAuthenticated) 
					{
						// Success: Save to local storage
						localStorage.setItem('isLoggedIn', 'true');
						localStorage.setItem('userName', driverData.username);
						localStorage.setItem('owner', driverData.owner);
						
						//alert("Login successful!");
						updateUI(); // Your existing function to toggle the navbar
						
						const modal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
						modal.hide();
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
    // 2. Handle Logout
    if(logoutBtn) 
	{
        logoutBtn.addEventListener('click', function(e) 
		{
            e.preventDefault();
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('owner');
            location.reload(); // Refresh to reset all states
        });
    }

    // 3. UI Toggle Logic
    function updateUI() 
	{
        const loginLink = document.getElementById('loginLink');
        const userDropdown = document.getElementById('userDropdown');
        const userLabel = document.getElementById('userLabel');
        
        const loggedIn = localStorage.getItem('isLoggedIn');
        const name = localStorage.getItem('owner');

        if (loggedIn === 'true') 
		{
			if(loginLink)
			{
				loginLink.classList.add('d-none');      // Hide "Login"
				userDropdown.classList.remove('d-none'); // Show "Username"
				userLabel.innerText = name;             // Set name
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
                    let cartItems = [];
                    const rawData = item.cart;
                    const items = rawData.split(';').filter(i => i.length > 0);

                    items.forEach(itemStr => {
                        const parts = itemStr.split(':');
                        let row = {
                            id: parts[0],
                            title: parts[1],
                            price: parts[2],
                            image: 'items/' + parts[0] + '.png',
                            qty: parseInt(parts[3])
                        };
                        cartItems.push(row);
                    });

                  // 2. Save to localStorage AFTER processing
                    localStorage.setItem('grocer_cart', JSON.stringify(cartItems));
                }
            });

            if (foundMatch) 
			{
				var s=localStorage.getItem('grocer_cart');
				cartItems=s?JSON.parse(s):[]

                // 3. ONLY SHOW THE SIDEBAR NOW (Data is ready)
                renderCartSidebar(); 
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
			updateSideCart(shipNum); 
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
		const allButtonsInThisRow = rowContainer.querySelectorAll('.status-btn');
		
		allButtonsInThisRow.forEach(btn => 
		{
			btn.classList.remove('active');
		});

		clickedBtn.classList.add('active');

		if (clickedBtn.classList.contains('btn-delivered')) 
		{
			updateRequestState(shipNum, "1");
		} 
		else if (clickedBtn.classList.contains('btn-ndelivered')) 
		{
			updateRequestState(shipNum, "0");
		}
		else if (clickedBtn.classList.contains('btn-delayed')) 
		{
			updateRequestState(shipNum, "3");
		}
		else if (clickedBtn.classList.contains('btn-pcanceled')) 
		{
			updateRequestState(shipNum, "5");
		}
		else if (clickedBtn.classList.contains('btn-canceled')) 
		{
			updateRequestState(shipNum, "2");
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

function showPopup(message, type = 'info') 
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

// Update your Register Submit Logic:
const registrationForm=document.getElementById('registrationForm')
if(registrationForm)registrationForm.addEventListener('submit', (e) => 
{
    e.preventDefault();

    const username = document.getElementById('username').value;
    const phone = document.getElementById('phone').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password !== confirmPassword) {
        showPopup("Passwords do not match!");
        return;
    }

const requestRef = ref(db, 'users');

// 1. Capture the 'newPushRef' to get the auto-generated ID (key)
const newPushRef = push(requestRef); 
const newUserId = newPushRef.key; // <--- This is your ID!

// 2. Use 'set' on that specific reference to save the data
set(newPushRef, {
    username: username,
    phone: phone,
    password: password,
    status: "active",
    timestamp: Date.now(),
    points: 0
}).then(() => {
    showPopup("Registration Succeed");
    
    // Hide the modal
    const modalElement = document.getElementById('registerModal');
    const modalInstance = bootstrap.Modal.getInstance(modalElement);
    if (modalInstance) modalInstance.hide();
    
    // 3. Store the captured ID in localStorage
    localStorage.setItem('delivoUser', JSON.stringify({
        id: newUserId, // Successfully used here
        username: username
    }));

    updateNavToLoggedIn(username);
    document.getElementById('registrationForm').reset();
    
}).catch((error) => {
    showPopup("Error: " + error.message);
});});

if(registrationForm)registrationForm.addEventListener('submit', (e) => 
{    e.preventDefault();
    
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

    if (!isValid) 
	{
        showPopup("Please fill all fields!");
        return;
    }

    // ... your Firebase push code ...
    // Inside .then() call: showPopup("Request Sent Successfully!");
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
function updateNavToLoggedIn(username) 
{
    // 1. Update the display name
    document.getElementById('navUserName').textContent = username;

    // 2. Define the new menu items
    const loggedInItems = `
        <li><a class="dropdown-item" href="javascript:alert('Profile')">Profile</a></li>
        <li><a class="dropdown-item" href="javascript:alert('My Orders')">My Orders</a></li>
        <li><a class="dropdown-item" href="javascript:alert('My Balance')">My Balance</a></li>
		<li><a class="dropdown-item" href="#"onclick="switchUser()">Switch User</a></li>
        <li><hr class="dropdown-divider"></li>
        <li><a class="dropdown-item text-danger" href="#" onclick="logout()">Logout</a></li>
    `;

    // 3. Inject into the dropdown
    document.getElementById('userDropdownMenu').innerHTML = loggedInItems;
}
const loginBtn = document.getElementById('loginBtn');

if(loginBtn)document.getElementById('loginBtn').addEventListener('click', async function() 
{
    const typedUser = document.getElementById('loginUser').value;
    const typedPass = document.getElementById('loginPass').value;

    try 
	{
        // 1. Point to your 'users' node
        const usersRef = ref(db, 'users');

        // 2. Query for the record where the 'username' column matches
        const userQuery = query(usersRef, orderByChild('username'), equalTo(typedUser));
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
                // SUCCESS
                updateNavToLoggedIn(userData.username);
                localStorage.setItem('delivoUser', JSON.stringify({
                    id: userKey,
                    username: userData.username
                }));

                // Close Modal
                bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
				document.getElementById('loginUser').value = "";
				document.getElementById('loginPass').value = "";
            } else {
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
// 1. The Logout Logic
window.logout = function() 
{
    // Remove the specific key from storage
    localStorage.removeItem('delivoUser');
    
    // Refresh the page to reset the UI to "Public" state
    window.location.reload();
};

// 2. The Global Initialization (Runs on every page load)
window.addEventListener('DOMContentLoaded', () => 
{
    const storedData = localStorage.getItem('delivoUser');
    
    if (storedData) {
        const user = JSON.parse(storedData);
        // This function must also be in your shared JS file
        updateNavToLoggedIn(user.username);
    }
});
window.switchUser = function() 
{
    const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
    loginModal.show();
};