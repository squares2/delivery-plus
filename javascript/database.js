var cartCount=0;
var cartItems=[]
var saleEnd=Date.now()+12*60*60*1000;

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";

	const firebaseConfig = 
	{
	    apiKey: "AIzaSyCyizOZNUcbczGjh1P0sxn85LoiLI9Q0yw",
	    authDomain: "sahashop-97ae5.firebaseapp.com",
	    databaseURL: "https://sahashop-97ae5-default-rtdb.firebaseio.com",
	    projectId: "sahashop-97ae5",
	    storageBucket: "sahashop-97ae5.firebasestorage.app",
	    messagingSenderId: "620364206298",
	    appId: "1:620364206298:web:bb9a99e5e60e4be3dad5e3"
	};
	const app = initializeApp(firebaseConfig);
	import {getDatabase, set, get,update,remove,ref,runTransaction,child,onValue}
	from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

	const db=getDatabase();
	const dbref=ref(db);
	const counterRef = ref(db, 'globalCounter');
	
	onValue(counterRef, (snapshot) => 
	{
	    const likeCount = snapshot.val();
		globalThis.id=likeCount;
	});
	
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
	export let products = [];
export async function distribute()
{
			products = [];
	await get(child(dbref,"products")).then((snapshot) => 
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
				
				let row={id:key,title:item.name,price:item.price,image:'png/products/'+key+'.png',category:item.category2};
				products.push(row);
				i++;
			}
//	console.log(products.length);
//	console.log(JSON.parse(JSON.stringify(products[0])));

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
function incrementCounter() 
{
	runTransaction(counterRef, (currentCounter) => 
	{
		if (currentCounter === null) 
		{
			return 1;
		}
		return currentCounter + 1;
	})
	.then(() => 
	{
		//console.log("Counter incremented successfully!");
	})
	.catch((error) => 
	{
		console.error("Error incrementing counter:", error);
	});
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
	var cat=getParam('category');
	const params = new URLSearchParams(window.location.search);
	const selectedCategories = params.getAll('category');
	var list=products.filter(function(p)
	{
		return !cat||selectedCategories.includes(p.category)
	});
	var html='';
	list.forEach(function(p)
	{
		html+=cardTemplate(p)
	});
	grid.innerHTML=html;
	wireButtons(grid)
};
		
function money(v)
{
	const formatter = new Intl.NumberFormat('en-US', 
	{
		style: 'decimal', // Use for standard number formatting
	});
	const numericValue = Number(v) || 0;
	if(numericValue<=2000)return'$'+numericValue.toFixed(2);
	else return numericValue.toLocaleString()+" L.L."; 
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
		n+=cartItems[i].qty
	}
	return n
}
function updateCartBadge()
{
	cartCount=getCartCount();
	var el=document.getElementById('cartCount');
	if(el)el.textContent=String(cartCount);
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
}
function cardTemplate(p)
{
	let found=false;
	let result='<div class="col-6 col-lg-3">'+
    '<div class="card product-card h-100">'+
      '<img src="'+p.image+'" class="card-img-top" alt="'+p.title+'">';
	  
	for(var i=0;i<cartItems.length;i++)
	{
		if(p.id==cartItems[i].id)found=true;
	}

	if(found)result+='<img src="png/cart2.png" style="display:block"class="img-overlay" alt="Overlay">';
	else result+='<img src="png/cart2.png" style="display:none"class="img-overlay" alt="Overlay">';
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
      '<img src="'+ci.image+'" alt="'+ci.title+'" width="48" height="48" style="object-fit:cover;border-radius:6px">'+
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
		localStorage.setItem('total',total);
		if (window.location.pathname === "/checkout.html"&&document.getElementById('summaryTotal').innerHTML!=totalEl.textContent) 
		{
			document.getElementById('summaryItems').innerHTML=getCartCount();
			document.getElementById('summaryTotal').innerHTML=totalEl.textContent;
		}
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
	if(name.value.length>0&&phone.value.length>0&&street.value.length>0)
	{
		
		return true;
	}
	else
	{
		
		return false;
	}	
}

function placeOrder()
{
	if(checkForm())
	{
		var fullname=document.getElementById("fullname");
		var phone=document.getElementById("phone");
		var city=document.getElementById("city");
		var street=document.getElementById("street");
		
		localStorage.setItem('fullname',fullname.value);
		localStorage.setItem('phone',phone.value);
		localStorage.setItem('city',city.value);
		localStorage.setItem('street',street.value);
		
		var cartList="";
		for (let i = 0; i < cartItems.length;i++) 
		{
			const product = cartItems[i];
			cartList+=product.id+":"+product.qty+";";
		}
		incrementCounter();
		const num = parseFloat(localStorage.getItem('total')); // Converts string to number
		const tot = num.toFixed(2);
		set(ref(db,'requests/'+globalThis.id),{fullname:removeSpecialChars(fullname.value),phone:removeSpecialChars(phone.value),address:removeSpecialChars(street.value),cart:cartList,total:Number(tot),date:getNow(),driver:"-",state:"0"});
		cartItems=[];
		saveCart();
		
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
	}	
}

export async function startPage()
{
	loadCart();
	wireButtons(document);
	updateCartBadge();
	updateTimer();
	setInterval(updateTimer,1000);
	renderCategoryPage();
	renderProductDetail();
	renderCartSidebar();
	wireCartSidebar();
}

document.addEventListener('DOMContentLoaded',ensureHeroBackgroundFallback);

document.addEventListener('DOMContentLoaded',ensureImageFallback)

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