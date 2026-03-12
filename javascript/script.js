var cartCount=0
var cartItems=[]
var saleEnd=Date.now()+12*60*60*1000;

var products=[
  {id:1,title:'Organic Milk 1L',price:2.99,image:'https://images.unsplash.com/photo-1586201375761-83865001e31b?q=80&w=600&auto=format&fit=crop',category:'Dairy'},
  {id:2,title:'Red Apples 1kg',price:3.49,image:'png/products/68.png',category:'Fruits'},
  {id:3,title:'Chicken Breast 500g',price:5.99,image:'png/products/68.png',category:'Meat'},
  {id:4,title:'Basmati Rice 5kg',price:12.99,image:'https://images.unsplash.com/photo-1621506282680-0fe1a0f897f2?q=80&w=600&auto=format&fit=crop',category:'Staples'},
  {id:5,title:'Whole Wheat Bread',price:1.99,image:'https://images.unsplash.com/photo-1516683037151-9b6afe7d0f19?q=80&w=600&auto=format&fit=crop',category:'Bakery'},
  {id:6,title:'Orange Juice 1L',price:2.49,image:'https://images.unsplash.com/photo-1506806732259-39c2d0268443?q=80&w=600&auto=format&fit=crop',category:'Beverages'},
  {id:7,title:'Free Range Eggs (12)',price:3.29,image:'https://images.unsplash.com/photo-1589302168068-964664d93dc0?q=80&w=600&auto=format&fit=crop',category:'Dairy'},
  {id:8,title:'Sea Salt Chips',price:1.49,image:'https://images.unsplash.com/photo-1526318472351-c75f3c74d89e?q=80&w=600&auto=format&fit=crop',category:'Snacks'},
  {id:9,title:'Brown Rice 1kg',price:2.99,image:'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?ixid=M3w4MjcwNjd8MHwxfHNlYXJjaHwxfHx2ZWd8ZW58MHx8fHwxNzY1MjYzNjAyfDA&ixlib=rb-4.1.0&fit=max&q=80',category:'Staples'},
  {id:10,title:'Cheddar Cheese 200g',price:3.49,image:'https://images.unsplash.com/photo-1542843134-5db7f0d1cf9a?q=80&w=600&auto=format&fit=crop',category:'Dairy'},
  {id:11,title:'Omega Eggs (12)',price:3.99,image:'https://images.unsplash.com/photo-1589302168068-964664d93dc0?q=80&w=600&auto=format&fit=crop',category:'Dairy'},
  {id:12,title:'Apple Juice 1L',price:2.79,image:'https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?ixid=M3w4MjcwNjd8MHwxfHNlYXJjaHwxfHxtYW5nb3xlbnwwfHx8fDE3NjUyNjM1ODJ8MA&ixlib=rb-4.1.0&fit=max&q=80',category:'Beverages'}
];

function renderCategoryPage()
{
	var grid=document.getElementById('categoryGrid');
	if(!grid)return;
	var cat=getParam('category');
	var list=products.filter(function(p)
	{
		return !cat||p.category===cat
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
	return'$'+v.toFixed(2)
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
	if(el)el.textContent=String(cartCount)
}
function addToCart(id)
{
	var p=window.products.find(function(x)
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
		cartItems.push({id:p.id,title:p.title,price:p.price,image:p.image,qty:1})
	}
	saveCart();
	updateCartBadge();
	renderCartSidebar()
}
function cardTemplate(p)
{
	return(
	
  '<div class="col-6 col-lg-3">'+
    '<div class="card product-card h-100">'+
      '<img src="'+p.image+'" class="card-img-top" alt="'+p.title+'">'+
      '<div class="card-body">'+
        '<h6 class="card-title">'+p.title+'</h6>'+
        '<div class="fw-semibold mb-2">'+money(p.price)+'</div>'+
        '<div class="d-flex gap-2">'+
          '<button class="btn btn-sm btn-primary" data-product-id="'+p.id+'">Add to Cart</button>'+
          '<button class="btn btn-sm btn-outline-secondary" data-quick-id="'+p.id+'" data-bs-toggle="modal" data-bs-target="#quickViewModal">Quick View</button>'+
        '</div>'+
      '</div>'+
    '</div>'+
  '</div>'
	)
}
function renderRecommended()
{
	var grid=document.getElementById('recommendedGrid');
	if(!grid)return;
	var html='';
	for(var i=0;i<window.products.length&&i<8;i++)
	{
		html+=cardTemplate(window.products[i])
	}
	grid.innerHTML=html
}
function wireButtons(context)
{
	var root=context||document;
	root.querySelectorAll('[data-product-id]').forEach(function(btn)
	{
		btn.addEventListener('click',function()
		{
			var id=parseInt(btn.getAttribute('data-product-id'));
			addToCart(id)
		})
	});
	root.querySelectorAll('[data-quick-id]').forEach(function(btn)
	{
		btn.addEventListener('click',function()
		{
			var id=parseInt(btn.getAttribute('data-quick-id'));
			openQuickView(id)
		})
	})
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
	var p=window.products.find(function(x)
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
	if(totalEl)totalEl.textContent=money(total)
}
function changeQty(id,delta)
{
	var item=cartItems.find(function(ci)
	{
		return ci.id===id
	});
	if(!item)return;
	item.qty+=delta;
	if(item.qty<=0)
	{
		cartItems=cartItems.filter(function(ci)
		{
			return ci.id!==id
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
			changeQty(parseInt(del),-item.qty)
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
document.addEventListener('DOMContentLoaded',function()
{
	loadCart();
	renderRecommended();
	wireButtons(document);
	updateCartBadge();
	updateTimer();
	setInterval(updateTimer,1000);
	renderCategoryPage();
	renderProductDetail();
	renderCartSidebar();
	wireCartSidebar();
	var qm=document.getElementById('quickViewModal');
	if(qm)
	{
		qm.addEventListener('hidden.bs.modal',function()
		{
			var i=document.getElementById('quickViewImage');
			var t=document.getElementById('quickViewTitle');
			var pr=document.getElementById('quickViewPrice');
			var b=document.getElementById('quickViewAdd');
			if(i){i.src='';i.alt=''}
			if(t)t.textContent='';
			if(pr)pr.textContent='';
			if(b)b.onclick=null
		})
	}
});

document.addEventListener('DOMContentLoaded',ensureHeroBackgroundFallback);

document.addEventListener('DOMContentLoaded',ensureImageFallback)

