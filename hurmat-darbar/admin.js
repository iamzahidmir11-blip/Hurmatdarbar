import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://rvrboufrnkzuptfjopwd.supabase.co";
const SUPABASE_KEY = "sb_publishable_n1PWbHcomKpd63FPDdWSEw_iSo6UTi0";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const root = document.getElementById("app");
const navRoot = document.getElementById("nav");
const money = n => "₹" + Number(n || 0).toLocaleString("en-IN");
const isIndianVegCategory = name => String(name||"").trim().toLowerCase() === "indian veg";
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const statusNames = {
  pending_confirmation:"Pending confirmation", confirmed:"Confirmed", preparing:"Preparing",
  ready_for_pickup:"Ready for pickup", picked_up:"Picked up", out_for_delivery:"Out for delivery",
  delivered:"Delivered", cancelled:"Cancelled", rejected:"Rejected", delivery_failed:"Delivery failed"
};
const tabs = [["home","⌂","Dashboard"],["orders","▤","Orders"],["tracking","⌖","Live"],["riders","♧","Riders"],["profile","♙","Profile"],["menu","▦","Menu"],["inventory","▣","Inventory"],["availability","✓","Delivery checks"],["payments","₹","Payments"],["refunds","↩","Refunds"],["reservations","◷","Bookings"],["reports","▥","Reports"],["settings","⚙","Store setup"],["alerts","♢","Alerts"]];
// Temporary development-only UI preview. Live data and all write operations remain protected.
const DEVELOPMENT_PREVIEW = false;
let user=null, role=null, page="home", orders=[], menuItems=[], menuCategories=[], reservations=[], riders=[], riderLocations=[], notifications=[], availabilityRequests=[], cashCollections=[], availabilityLoadError="", payments=[], refunds=[], settings=null, channel=null, busy=false, availabilityRefreshTimer=null;

function toast(message, bad=false){
  let el=document.getElementById("admin-toast");
  if(!el){el=document.createElement("div");el.id="admin-toast";el.className="toast";document.body.append(el);}
  el.textContent=message;el.style.background=bad?"#8b342c":"var(--gold)";el.style.color=bad?"white":"#16281e";
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.remove(),2600);
}
async function api(view, body){
  if(DEVELOPMENT_PREVIEW) throw new Error("Development preview: live actions are disabled until secure phone login is integrated.");
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) throw new Error("Please sign in again.");
  const url=SUPABASE_URL+"/functions/v1/restaurant-api"+(body?"":"?view="+encodeURIComponent(view||"orders"));
  const res=await fetch(url,{method:body?"POST":"GET",headers:{
    "apikey":SUPABASE_KEY,"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json"
  },body:body?JSON.stringify(body):undefined});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||"The server could not complete this request.");
  return data;
}
async function verifyAccess(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){user=null;role=null;return false;}
  user=session.user;
  const {data,error}=await supabase.from("user_roles").select("role,active").eq("user_id",user.id).eq("active",true);
  if(error) throw error;
  const match=(data||[]).find(x=>["owner","manager","kitchen","delivery_manager"].includes(x.role));
  if(!match){await supabase.auth.signOut();user=null;role=null;throw new Error("This account is not active for the Owner dashboard. Ask the Owner to assign an access role in Supabase.");}
  role=match.role;
  return true;
}
function passwordSetupView(){
  navRoot.innerHTML="";
  root.innerHTML='<div class="auth-card card"><div class="logo"><img src="./../assets/hurmat-logo-repo.png" alt="Hurmat Darbar"></div><h1>Set owner password</h1><p>Your secure owner invitation is accepted. Create a private password to finish account setup.</p><form id="owner-password-form"><label>New password</label><input id="owner-new-password" type="password" autocomplete="new-password" minlength="10" required placeholder="At least 10 characters"><label>Confirm password</label><input id="owner-confirm-password" type="password" autocomplete="new-password" minlength="10" required placeholder="Enter it again"><button class="btn wide" id="owner-password-submit" type="submit">Save password & open Hurmat Owner</button></form></div>';
  document.getElementById("owner-password-form").onsubmit=async e=>{
    e.preventDefault();
    const password=document.getElementById("owner-new-password").value,confirmPassword=document.getElementById("owner-confirm-password").value,button=document.getElementById("owner-password-submit");
    if(password.length<10||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password)||!/[^A-Za-z0-9]/.test(password)){toast("Use 10+ characters with uppercase, lowercase, a number and a symbol.",true);return;}
    if(password!==confirmPassword){toast("Passwords do not match.",true);return;}
    button.disabled=true;button.textContent="Saving securely…";
    try{const {error}=await supabase.auth.updateUser({password,data:{owner_password_setup_required:false}});if(error)throw error;await verifyAccess();await startApp();}
    catch(err){toast(err.message||"Password setup failed.",true);button.disabled=false;button.textContent="Save password & open Hurmat Owner";}
  };
}
function loginView(message){
  navRoot.innerHTML="";
  root.innerHTML='<div class="auth-card card"><div class="logo"><img src="../assets/hurmat-logo-repo.png" alt="Hurmat Darbar"></div><span class="auth-kicker">PRIVATE STAFF ACCESS</span><h1>Hurmat Owner</h1><p>Sign in with the email and password created and activated by the account administrator in Supabase.</p>'+
    (message?'<div class="notice">'+esc(message)+'</div>':'')+
    '<form id="login-form"><label>Email address</label><input id="login-email" type="email" autocomplete="username" required placeholder="Enter your registered email"><label>Password</label><input id="login-password" type="password" autocomplete="current-password" required placeholder="Enter your password"><button class="btn wide" id="login-submit" type="submit">Sign in</button></form><p class="auth-footnote">Accounts are created and activated by the system administrator. Contact them if you cannot sign in.</p></div>';
  document.getElementById("login-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const button=document.getElementById("login-submit");
    const email=document.getElementById("login-email").value.trim().toLowerCase();
    const password=document.getElementById("login-password").value;
    button.disabled=true;button.textContent="Signing in…";
    try{
      const {error}=await supabase.auth.signInWithPassword({email,password});
      if(error) throw error;
      await verifyAccess();await startApp();
    }catch(err){
      await supabase.auth.signOut().catch(()=>{});
      loginView(err.message||"Sign-in failed. Check your email and password.");
    }
  });
}
function nav(){
  const mainTabs=tabs.slice(0,5);
  navRoot.innerHTML=mainTabs.map(t=>'<button class="dock-item '+(page===t[0]?"on":"")+'" data-tab="'+t[0]+'"><span class="dock-icon">'+t[1]+'</span><small>'+t[2]+'</small></button>').join("");
  navRoot.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{page=b.dataset.tab;render();});
}
function header(){
  const open=!!settings?.is_open;
  const unread=notifications.filter(n=>!n.is_read).length;
  const moreTabs=tabs.filter(t=>!["home","orders","tracking","riders","profile"].includes(t[0]));
  const status=DEVELOPMENT_PREVIEW?'<span class="pill">PREVIEW MODE</span>':'<span class="pill owner-role-pill">'+esc(role||"STAFF").toUpperCase()+'</span>';
  return '<header class="partner-topbar"><div class="topbar-brand"><div class="logo"><img src="../assets/hurmat-logo-repo.png" alt="Hurmat Darbar"></div><div><b>HURMAT OWNER</b><small>'+(DEVELOPMENT_PREVIEW?'DEVELOPMENT WORKSPACE':'LIVE RESTAURANT OPERATIONS')+'</small></div></div><div class="owner-header-actions">'+status+
  '<button class="header-icon notification-trigger" id="owner-notifications" aria-label="Notifications"><span>♧</span>'+(unread?'<i>'+Math.min(unread,99)+'</i>':'')+'</button>'+
  '<button class="header-icon menu-trigger" id="owner-menu" aria-label="More options" aria-expanded="false"><span>☰</span></button>'+
  '<div class="owner-more-menu" id="owner-more-menu" hidden>'+'<div class="menu-panel-head"><b>QUICK CONTROLS</b><small>'+esc(role||"STAFF").toUpperCase()+' ACCESS</small></div>'+(DEVELOPMENT_PREVIEW?"":'<button class="menu-control" id="outlet-toggle" data-open="'+String(open)+'"><span class="menu-item-icon">◉</span><span class="menu-item-label">Store status</span><strong>'+(open?"Accepting orders":"Paused")+'</strong></button>')+'<div class="menu-divider"></div>'+moreTabs.map(t=>'<button data-tab="'+t[0]+'" class="'+(page===t[0]?"on":"")+'"><span class="menu-item-icon">'+t[1]+'</span><span class="menu-item-label">'+t[2]+'</span><span class="menu-item-arrow">›</span></button>').join("")+(DEVELOPMENT_PREVIEW?"":'<div class="menu-divider"></div><button id="signout" class="menu-signout"><span class="menu-item-icon">↪</span><span class="menu-item-label">Sign out</span></button>')+'</div></div></header>';
}
function shell(title,desc,content){
  const previewNotice=DEVELOPMENT_PREVIEW?'<div class="notice" style="margin:16px 0 20px"><b>Development preview</b> · Login temporarily hidden. Live restaurant data and saving changes are disabled. Phone OTP + Admin approval will be added before launch.</div>':"";
  root.innerHTML=header()+previewNotice+'<main class="partner-main"><div class="page-heading"><div><span class="eyebrow">HURMAT OWNER</span><h1>'+esc(title)+'</h1><p class="sub">'+esc(desc||"Live data from the restaurant database.")+'</p></div><div class="page-updated">Live database · '+new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})+'</div></div>'+content+'</main>';
  const notify=document.getElementById("owner-notifications");
  if(notify)notify.onclick=()=>{page="alerts";render();};
  const menuBtn=document.getElementById("owner-menu"),moreMenu=document.getElementById("owner-more-menu");
  if(menuBtn)menuBtn.onclick=()=>{moreMenu.hidden=!moreMenu.hidden;menuBtn.setAttribute("aria-expanded",String(!moreMenu.hidden));};
  if(moreMenu)moreMenu.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{page=b.dataset.tab;render();});
  const signout=document.getElementById("signout");
  if(signout)signout.onclick=async()=>{if(channel)await supabase.removeChannel(channel);await supabase.auth.signOut();user=null;role=null;loginView("You have signed out.");};
}
function card(title,body){return '<section class="card" style="margin:10px 0"><h2 style="margin:0 0 12px">'+title+'</h2>'+body+'</section>';}
function empty(text){return '<div class="empty">'+esc(text)+'</div>';}
function nextStatus(s){
  return ({pending_confirmation:"confirmed",confirmed:"preparing",preparing:"ready_for_pickup"})[s]||null;
}
function orderCard(o){
  const items=(o.order_items||[]).map(i=>esc(i.qty)+" × "+esc(i.item_name)+" ("+esc(i.variant_label)+")").join("<br>");
  const next=nextStatus(o.status);
  const canAdvance=next&&next!=="delivered"&&!(next==="confirmed"&&o.payment_method==="upi_manual"&&o.payment_status!=="paid");
  const riderOptions=riders.map(r=>'<option value="'+esc(r.user_id)+'">'+esc(r.name||"Rider")+(r.is_online?" · Online":" · Offline")+'</option>').join("");
  return '<article class="card" style="margin:10px 0"><div class="row"><b>Order #'+esc(o.order_no)+'</b><span class="tag s-'+(o.status==="delivered"?"served":o.status==="cancelled"||o.status==="rejected"?"cancelled":o.status==="preparing"?"preparing":o.status==="ready_for_pickup"?"ready":"new")+'">'+esc(statusNames[o.status]||o.status)+'</span></div>'+
    '<p class="mute" style="margin:8px 0">'+esc(o.customer_name)+' · '+esc(o.customer_phone)+'</p><p class="mute">'+esc(o.address_text)+'</p><p style="margin:10px 0;line-height:1.7">'+(items||"No item details")+'</p>'+
    '<div class="row"><span class="mute">'+new Date(o.created_at).toLocaleString()+'</span><b class="price">'+money(o.total)+'</b></div>'+
    '<p class="mute" style="margin-top:7px">Payment: '+esc(o.payment_method)+' · '+esc(o.payment_status)+'</p>'+
    (canAdvance?'<div class="actions"><button class="btn sm" data-order="'+esc(o.id)+'" data-status="'+next+'">Mark '+esc(statusNames[next])+'</button><button class="btn sm ghost" data-cancel="'+esc(o.id)+'">Cancel / reject</button></div>':'')+
    (next==="delivered"?'<p class="mute">Delivery completion is locked. The rider must verify the customer delivery code in the Rider App.</p>':"")+    (next==="confirmed"&&o.payment_method==="upi_manual"&&o.payment_status!=="paid"?'<p class="mute">Awaiting UPI payment verification. Review it in Payments before confirming this order.</p>':"")+
    (o.status==="ready_for_pickup"&&riderOptions?'<div class="actions"><select id="rider-'+esc(o.id)+'"><option value="">Choose rider</option>'+riderOptions+'</select><button class="btn sm ghost" data-assign="'+esc(o.id)+'">Assign rider</button></div>':'')+
    '</article>';
}
function homeView(){
  const now=new Date(),today=now.toDateString();
  const todays=orders.filter(o=>new Date(o.created_at).toDateString()===today);
  const deliveredToday=todays.filter(o=>o.status==="delivered");
  const revenue=deliveredToday.reduce((a,o)=>a+Number(o.total||0),0);
  const pending=orders.filter(o=>o.status==="pending_confirmation").length;
  const active=orders.filter(o=>["confirmed","preparing","ready_for_pickup","picked_up","out_for_delivery"].includes(o.status)).length;
  const low=menuItems.filter(i=>i.track_stock&&Number(i.stock_qty||0)<=5).length;
  const stages=[["New","pending_confirmation"],["Confirmed","confirmed"],["Preparing","preparing"],["Ready","ready_for_pickup"],["On delivery","out_for_delivery"]];
  const pipeline=stages.map(([label,status])=>'<div class="pipeline-step"><b>'+orders.filter(o=>o.status===status).length+'</b><span>'+label+'</span></div>').join("");
  return availabilityRequestsView()+'<section class="welcome-strip"><div><span class="eyebrow">TODAY AT HURMAT DARBAR</span><h2>Restaurant overview</h2><p>Orders, kitchen activity and sales — all in one place.</p></div><div class="welcome-date">'+now.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"short",year:"numeric"})+'</div></section>'+
  '<div class="partner-metrics"><article class="metric-card"><span>ORDERS TODAY</span><b>'+todays.length+'</b><small>'+pending+' awaiting confirmation</small></article><article class="metric-card"><span>SALES TODAY</span><b>'+money(revenue)+'</b><small>Delivered orders only</small></article><article class="metric-card"><span>ACTIVE ORDERS</span><b>'+active+'</b><small>Across kitchen and delivery</small></article><article class="metric-card"><span>STOCK ALERTS</span><b>'+low+'</b><small>Low or out-of-stock items</small></article></div>'+
  '<div class="dashboard-columns"><section class="partner-panel"><div class="panel-heading"><div><h2>Order workflow</h2><p>Live status across the restaurant</p></div><button class="text-action" data-go="orders">Open orders →</button></div><div class="order-pipeline">'+pipeline+'</div></section>'+
  '<section class="partner-panel"><div class="panel-heading"><div><h2>Quick operations</h2><p>Common restaurant controls</p></div></div><div class="quick-links"><button data-go="menu"><span>▦</span><b>Manage menu</b><small>Items, photos & prices</small></button><button data-go="inventory"><span>▣</span><b>Inventory</b><small>Stock counts & alerts</small></button><button data-go="payments"><span>₹</span><b>Payments</b><small>Verify UPI screenshots</small></button><button data-go="settings"><span>⚙</span><b>Store setup</b><small>Hours, location & payments</small></button><button data-go="reports"><span>▥</span><b>Business reports</b><small>Sales & popular dishes</small></button></div></section></div>'+
  '<section class="partner-panel"><div class="panel-heading"><div><h2>Recent orders</h2><p>Latest customer activity</p></div><button class="text-action" data-go="orders">View all orders →</button></div>'+(orders.slice(0,6).map(orderCard).join("")||empty("No real orders have been received yet."))+'</section>'+
  '<div class="dashboard-columns"><section class="partner-panel"><div class="panel-heading"><div><h2>Inventory attention</h2><p>Items with five or fewer units</p></div><button class="text-action" data-go="inventory">Manage stock →</button></div>'+(menuItems.filter(i=>i.track_stock&&Number(i.stock_qty||0)<=5).slice(0,5).map(i=>'<div class="item-row"><b>'+esc(i.name)+'</b><span class="stock-state '+(Number(i.stock_qty||0)===0?'out':'low')+'">'+(Number(i.stock_qty||0)===0?'Out of stock':i.stock_qty+' left')+'</span></div>').join("")||empty("No low-stock alerts."))+'</section><section class="partner-panel"><div class="panel-heading"><div><h2>Account connection</h2><p>Development status</p></div><span class="connection-dot">'+(DEVELOPMENT_PREVIEW?'● Preview only':'● Connected')+'</span></div><p class="mute">'+(DEVELOPMENT_PREVIEW?'Live restaurant data and realtime updates are disabled in this development workspace.':'Signed in with a verified '+esc(role)+' account. Order and notification updates are subscribed in real time.')+'</p></section></div>';
}
function ordersView(){
  const groups=[["New orders","pending_confirmation"],["Confirmed","confirmed"],["Preparing","preparing"],["Ready for pickup","ready_for_pickup"],["Delivery / completed",["picked_up","out_for_delivery","delivered"]],["Cancelled / rejected",["cancelled","rejected","delivery_failed"]]];
  return availabilityRequestsView()+'<div class="orders-toolbar"><div><b>'+orders.length+' total orders</b><span> · Latest orders appear first</span></div><input id="order-search" type="search" placeholder="Search order number, customer or phone"></div><div class="order-groups">'+groups.map(([label,status])=>{const list=orders.filter(o=>Array.isArray(status)?status.includes(o.status):o.status===status);return '<section class="order-group"><div class="group-heading"><h2>'+label+'</h2><span>'+list.length+'</span></div>'+(list.map(orderCard).join("")||'<div class="empty compact">No orders in this stage.</div>')+'</section>';}).join("")+'</div>';
}
function menuView(){
  const search='<div class="store-toolbar"><input id="menu-search" type="search" placeholder="Search dishes, e.g. Chicken Biryani"><select id="menu-filter"><option value="all">All items</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="stock">Stock tracking on</option><option value="low">Low stock</option><option value="out">Out of stock</option></select><button class="btn" id="add-category">+ Category</button><button class="btn" id="add-item">+ Add menu item</button></div>';
  const cards=menuItems.map(i=>{
    const photo=i.image_url?'<img src="'+esc(i.image_url)+'" alt="'+esc(i.name)+'" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'"><div class="store-photo-fallback" style="display:none">HD</div>':'<div class="store-photo-fallback">HD</div>';
    const variants=(i.menu_variants||[]).map(v=>'<div class="store-variant"><span>'+esc(v.label)+' <b>'+money(v.price)+'</b> '+(v.active?'':'<small>Hidden</small>')+'</span><div class="actions"><button class="btn ghost sm" data-price="'+esc(v.id)+'" data-current="'+esc(v.price)+'">Edit price</button><button class="btn ghost sm" data-variant-toggle="'+esc(v.id)+'" data-active="'+String(v.active)+'">'+(v.active?'Disable':'Enable')+'</button></div></div>').join("");
    const stock=Number(i.stock_qty||0);
    const stockBlock=i.track_stock?'<div class="inventory-panel"><div><small>AVAILABLE STOCK</small><b class="inventory-number">'+stock+'</b></div><div class="inventory-stepper"><button class="qty-step" data-stock-minus="'+esc(i.id)+'" '+(stock<=0?'disabled':'')+'>−</button><button class="qty-step" data-stock-plus="'+esc(i.id)+'">+</button><button class="btn ghost sm" data-stock-set="'+esc(i.id)+'">Set</button></div><span class="stock-state '+(stock===0?'out':stock<=5?'low':'in')+'">'+(stock===0?'Out':stock<=5?'Low stock':'In stock')+'</span></div>':'<div class="inventory-panel inventory-off"><span>Stock tracking is off</span><button class="btn ghost sm" data-stock-enable="'+esc(i.id)+'">Set opening stock</button></div>';
    const foodType=isIndianVegCategory(i.menu_categories?.name)?'<span class="store-photo-type">'+('VEG')+'</span>':"";
    return '<article class="store-product" data-product-card data-name="'+esc((i.name+" "+(i.description||"")+" "+(i.menu_categories?.name||"")).toLowerCase())+'" data-published="'+String(i.active)+'" data-tracked="'+String(i.track_stock)+'" data-stock-value="'+stock+'"><div class="store-product-photo">'+photo+foodType+'<span class="store-publish-tag '+(i.active?'published':'hidden')+'">'+(i.active?'PUBLISHED':'HIDDEN')+'</span></div><div class="store-product-info"><div class="store-product-heading"><div><small>'+esc(i.menu_categories?.name||"Uncategorised")+'</small><h3>'+esc(i.name)+'</h3></div><b class="store-product-price">'+money(Math.min(...(i.menu_variants||[]).filter(v=>v.active&&v.price!==null).map(v=>Number(v.price)).concat([0]).filter(n=>n>0))||0)+'</b></div><p>'+esc(i.description||"No product description added.")+'</p>'+stockBlock+'<div class="store-variants"><div class="store-section-label">PORTIONS & PRICING</div>'+(variants||'<small>No variants configured.</small>')+'</div><div class="store-product-actions"><button class="btn ghost sm" data-upload-image="'+esc(i.id)+'">Photo</button><button class="btn ghost sm" data-edit-item="'+esc(i.id)+'">Edit</button><button class="btn ghost sm" data-add-variant="'+esc(i.id)+'">+ Variant</button><button class="btn ghost sm" data-toggle="'+esc(i.id)+'" data-available="'+String(i.available)+'">'+(i.available?'Pause item':'Enable item')+'</button><button class="btn sm" data-publish="'+esc(i.id)+'" data-active="'+String(i.active)+'">'+(i.active?'Hide':'Publish')+'</button></div></div></article>';
  }).join("");
  const catCards=menuCategories.map(c=>'<span class="store-category-chip">'+esc(c.name)+'</span>').join("");
  return '<section class="menu-summary"><div><span class="eyebrow">CUSTOMER CATALOGUE</span><h2>Menu management</h2><p>Changes to items, prices, photos and availability sync to the live customer website.</p></div><div class="store-metrics"><div><small>MENU ITEMS</small><b>'+menuItems.length+'</b></div><div><small>LIVE</small><b>'+menuItems.filter(i=>i.active&&i.available).length+'</b></div><div><small>HIDDEN / PAUSED</small><b>'+menuItems.filter(i=>!i.active||!i.available).length+'</b></div><div><small>CATEGORIES</small><b>'+menuCategories.length+'</b></div></div></section>'+search+'<div class="store-category-list">'+catCards+'</div><div class="store-product-grid" id="store-product-grid">'+(cards||empty("No menu items yet. Add your first dish."))+'</div>';
}
function inventoryView(){
  const tracked=menuItems.filter(i=>i.track_stock),untracked=menuItems.filter(i=>!i.track_stock);
  const low=tracked.filter(i=>Number(i.stock_qty||0)>0&&Number(i.stock_qty||0)<=5),out=tracked.filter(i=>Number(i.stock_qty||0)===0);
  const rows=[...tracked,...untracked].map(i=>'<div class="inventory-row"><div class="inventory-product"><div class="inventory-thumb">'+(i.image_url?'<img src="'+esc(i.image_url)+'" alt="">':'HD')+'</div><div><b>'+esc(i.name)+'</b><small>'+esc(i.menu_categories?.name||"Uncategorised")+'</small></div></div><div class="inventory-count">'+(i.track_stock?'<b>'+Number(i.stock_qty||0)+'</b><small>units on hand</small>':'<span class="not-tracked">Not tracked</span>')+'</div><div class="inventory-actions">'+(i.track_stock?'<button class="qty-step" data-stock-minus="'+esc(i.id)+'" '+(Number(i.stock_qty||0)<=0?'disabled':'')+'>−</button><button class="qty-step" data-stock-plus="'+esc(i.id)+'">+</button><button class="btn ghost sm" data-stock-set="'+esc(i.id)+'">Set quantity</button>':'<button class="btn ghost sm" data-stock-enable="'+esc(i.id)+'">Start tracking</button>')+'</div><span class="stock-state '+(!i.track_stock?'':Number(i.stock_qty||0)===0?'out':Number(i.stock_qty||0)<=5?'low':'in')+'">'+(!i.track_stock?'Unlimited':Number(i.stock_qty||0)===0?'Out of stock':Number(i.stock_qty||0)<=5?'Low stock':'In stock')+'</span></div>').join("");
  return '<section class="menu-summary"><div><span class="eyebrow">KITCHEN INVENTORY</span><h2>Inventory control</h2><p>Set actual quantities. Customer ordering automatically respects tracked stock.</p></div><div class="store-metrics"><div><small>TRACKED ITEMS</small><b>'+tracked.length+'</b></div><div><small>LOW STOCK</small><b>'+low.length+'</b></div><div><small>OUT OF STOCK</small><b>'+out.length+'</b></div><div><small>NOT TRACKED</small><b>'+untracked.length+'</b></div></div></section><section class="partner-panel"><div class="panel-heading"><div><h2>Stock register</h2><p>Use Set quantity for a physical stock count; plus/minus for adjustments.</p></div><input id="inventory-search" class="compact-search" type="search" placeholder="Search menu item"></div><div class="inventory-list">'+(rows||empty("No menu items found."))+'</div></section><p class="inventory-footnote">Inventory tracking stays off until actual opening quantities are entered. Avoid estimated counts.</p>';
}
function reservationsView(){
  return reservations.map(r=>'<article class="card" style="margin:10px 0"><div class="row"><b>'+esc(r.name)+'</b><span class="tag s-new">'+esc(r.status)+'</span></div><p class="mute">'+esc(r.phone)+' · '+esc(r.party_size)+' guests</p><p class="mute">'+new Date(r.reserve_at).toLocaleString()+'</p><p class="mute">'+esc(r.notes||"")+'</p><div class="actions">'+["confirmed","rejected","cancelled"].filter(s=>r.status==="pending"||s==="cancelled").map(s=>'<button class="btn sm '+(s==="cancelled"?"ghost":"")+'" data-reservation="'+esc(r.id)+'" data-res-status="'+s+'">'+s+'</button>').join("")+'</div></article>').join("")||empty("No reservations have been received.");
}
function ridersView(){
  const list=riders.map(r=>'<div class="item-row"><div class="item-meta"><b>'+esc(r.name||"Rider")+'</b><span class="mute">'+esc(r.phone||"No phone on file")+'</span></div><span class="tag '+(r.is_online?"s-ready":"s-served")+'">'+(r.is_online?"Online":"Offline")+'</span></div>').join("")||empty("No rider accounts are linked yet.");
  const create=role==="owner"?'<section class="partner-panel" style="margin:12px 0"><div class="panel-heading"><div><h2>Create rider account</h2><p>Creates the secure sign-in, rider role and delivery profile together.</p></div></div><form id="rider-create-form" class="card"><label>Rider full name</label><input id="rider-name" required minlength="2" maxlength="80" placeholder="Full name"><label>Rider phone</label><input id="rider-phone" required type="tel" minlength="7" maxlength="20" placeholder="Phone number"><label>Rider email</label><input id="rider-email" required type="email" autocomplete="off" placeholder="rider@example.com"><label>Temporary password (10+ chars, uppercase, lowercase, number and symbol)</label><input id="rider-password" required type="password" minlength="10" autocomplete="new-password" placeholder="Create a temporary password"><button class="btn wide" id="rider-create-submit" type="submit">Create rider account</button><p class="mute" style="font-size:11px;line-height:1.6;margin-top:10px">Share the temporary password privately. The rider can sign in to the separate Hurmat Darbar Delivery app.</p></form></section>':"";
  const cashRows=cashCollections.map(c=>'<article class="card" style="margin:10px 0"><div class="row"><b>Order #'+esc(c.orders?.order_no||"—")+'</b><span class="tag '+(c.handed_over?"s-served":"s-new")+'">'+(c.handed_over?"Handed over":"Cash with rider")+'</span></div><p class="mute">'+esc(c.rider_name||"Rider")+' · '+money(c.amount)+' · '+new Date(c.collected_at).toLocaleString()+'</p>'+(c.handed_over?'<p class="mute">Received '+(c.handed_over_at?new Date(c.handed_over_at).toLocaleString():"")+'</p>':'<button class="btn sm" data-cash-handover="'+esc(c.order_id)+'">Confirm cash received</button>')+'</article>').join("")||empty("No COD cash collections recorded yet.");
  const locationRows=riderLocations.map(p=>{const rider=riders.find(r=>r.user_id===p.rider_id);return '<div class="item-row"><div class="item-meta"><b>'+esc(rider?.name||"Rider")+' · Order #'+esc(p.order_no||"—")+'</b><span class="mute">GPS '+esc(new Date(p.created_at).toLocaleTimeString())+' · accuracy '+esc(Math.round(Number(p.accuracy||0)))+'m</span></div><a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps?q='+encodeURIComponent(p.lat+","+p.lng)+'">View live location ↗</a></div>';}).join("")||empty("No recent GPS location. Rider must be online and share location during an active delivery.");
  return create+'<section class="partner-panel"><div class="panel-heading"><div><h2>Registered riders</h2><p>Online availability updates from the delivery app.</p></div></div>'+list+'</section><section class="partner-panel" style="margin-top:14px"><div class="panel-heading"><div><h2>Live GPS tracker</h2><p>Recent rider positions for active deliveries. Refreshes automatically.</p></div><span class="pill">GPS</span></div>'+locationRows+'</section><section class="partner-panel" style="margin-top:14px"><div class="panel-heading"><div><h2>COD cash reconciliation</h2><p>Cash recorded by riders after customer delivery.</p></div><span class="pill">'+cashCollections.filter(c=>!c.handed_over).length+' pending</span></div>'+cashRows+'</section>';
}
function trackingView(){
  const rows=riderLocations.map(p=>{
    const rider=riders.find(r=>r.user_id===p.rider_id);
    const stamp=p.created_at?new Date(p.created_at):null;
    const age=stamp?Math.max(0,Math.round((Date.now()-stamp.getTime())/60000)):null;
    return '<article class="tracking-card"><div class="tracking-pin">⌖</div><div class="tracking-copy"><b>'+esc(rider?.name||"Delivery partner")+' · Order #'+esc(p.order_no||"—")+'</b><span>Last GPS update '+(age===null?"unknown":age===0?"just now":age+" min ago")+' · accuracy '+esc(Math.round(Number(p.accuracy||0)))+'m</span><small>'+esc(stamp?stamp.toLocaleString():"")+'</small></div><a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps?q='+encodeURIComponent(p.lat+","+p.lng)+'">Open map ↗</a></article>';
  }).join("");
  const online=riders.filter(r=>r.is_online).length;
  return '<section class="tracking-summary"><div><span class="eyebrow">DELIVERY OPERATIONS</span><h2>Live rider locations</h2><p>Location updates refresh automatically while this screen is open. GPS is shared only for active deliveries.</p></div><div class="tracking-count"><b>'+online+'</b><span>Riders online</span></div></section><section class="partner-panel"><div class="panel-heading"><div><h2>Active GPS signals</h2><p>Latest position reported by each active rider delivery</p></div><span class="pill">AUTO REFRESH · 8 SEC</span></div>'+(rows||empty("No active GPS location is available yet. A rider must be online, accept an order and start delivery location sharing."))+'</section><section class="partner-panel"><div class="panel-heading"><div><h2>Delivery team</h2><p>Current online status from Hurmat Delivery</p></div><button class="text-action" data-go="riders">Manage riders ↗</button></div>'+(riders.map(r=>'<div class="item-row"><div class="item-meta"><b>'+esc(r.name||"Rider")+'</b><span class="mute">'+esc(r.phone||"No phone on file")+'</span></div><span class="tag '+(r.is_online?"s-ready":"s-served")+'">'+(r.is_online?"Online":"Offline")+'</span></div>').join("")||empty("No riders registered."))+'</section>';
}
function profileView(){
  const meta=user?.user_metadata||{};
  return '<section class="profile-hero"><div class="profile-avatar">'+esc((meta.full_name||user?.email||"O").trim().charAt(0).toUpperCase())+'</div><div><span class="eyebrow">HURMAT OWNER ACCOUNT</span><h2>My Profile</h2><p>Update your display details. Login email and access role are managed securely.</p></div></section><section class="partner-panel"><form id="owner-profile-form"><label>Full name</label><input id="owner-profile-name" maxlength="80" value="'+esc(meta.full_name||meta.name||"")+'" placeholder="Your full name"><label>Phone number</label><input id="owner-profile-phone" maxlength="20" value="'+esc(meta.phone||"")+'" placeholder="Phone number"><label>Login email</label><input value="'+esc(user?.email||"")+'" disabled><label>Access role</label><input value="'+esc(role||"")+'" disabled><button class="btn" type="submit">Save profile</button></form></section><section class="partner-panel"><div class="panel-heading"><div><h2>Account security</h2><p>Signed-in account and session</p></div></div><div class="item-row"><span class="mute">Last sign in</span><b>'+esc(user?.last_sign_in_at?new Date(user.last_sign_in_at).toLocaleString():"Current session")+'</b></div><div class="item-row"><span class="mute">Account ID</span><b>Protected</b></div></section>';
}
function reportsView(){
  const now=new Date(),days=[];
  for(let n=6;n>=0;n--){const d=new Date(now);d.setDate(now.getDate()-n);const key=d.toDateString();const done=orders.filter(o=>o.status==="delivered"&&new Date(o.created_at).toDateString()===key);days.push({label:d.toLocaleDateString("en-IN",{weekday:"short"}),sales:done.reduce((s,o)=>s+Number(o.total||0),0),count:done.length});}
  const delivered=orders.filter(o=>o.status==="delivered"),total=delivered.reduce((s,o)=>s+Number(o.total||0),0);
  const products={};delivered.forEach(o=>(o.order_items||[]).forEach(i=>{const k=i.item_name||"Menu item";products[k]=(products[k]||0)+Number(i.qty||0);}));
  const top=Object.entries(products).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const max=Math.max(1,...days.map(x=>x.sales));
  return '<section class="menu-summary"><div><span class="eyebrow">BUSINESS PERFORMANCE</span><h2>Reports & insights</h2><p>Calculated from order records currently available in the restaurant database.</p></div><div class="store-metrics"><div><small>DELIVERED ORDERS</small><b>'+delivered.length+'</b></div><div><small>DELIVERED VALUE</small><b>'+money(total)+'</b></div><div><small>AVERAGE ORDER</small><b>'+money(delivered.length?total/delivered.length:0)+'</b></div><div><small>MENU ITEMS SOLD</small><b>'+Object.values(products).reduce((a,b)=>a+b,0)+'</b></div></div></section><div class="dashboard-columns"><section class="partner-panel"><div class="panel-heading"><div><h2>Delivered sales · last 7 days</h2><p>Daily totals, based on order creation date</p></div></div><div class="sales-bars">'+days.map(d=>'<div class="sales-bar-col"><b>'+money(d.sales)+'</b><i style="height:'+Math.max(3,Math.round(d.sales/max*100))+'%"></i><small>'+d.label+'</small></div>').join("")+'</div></section><section class="partner-panel"><div class="panel-heading"><div><h2>Top dishes</h2><p>Units in delivered orders</p></div></div>'+(top.map(([name,qty],i)=>'<div class="item-row"><b>'+esc(name)+'</b><span class="top-rank">#'+(i+1)+' · '+qty+' sold</span></div>').join("")||empty("No delivered item data yet."))+'</section></div><p class="inventory-footnote">Operational summary only, not an accounting statement. Refunds, discounts, taxes and settlement may need separate reconciliation.</p>';
}
function availabilityRequestCard(r){
  const items=(r.items_snapshot||[]).map(i=>esc(i.qty)+" × "+esc(i.item_name)+" ("+esc(i.variant_label)+") · "+money(i.line_total)).join("<br>");
  const distance=r.distance_m==null?"Restaurant map pin not verified":(Number(r.distance_m).toLocaleString("en-IN")+" m · "+(r.within_radius?"inside configured radius":"outside configured radius"));
  const pending=r.status==="pending";
  const canApprove=pending&&r.within_radius===true;
  return '<article class="card" style="margin:10px 0"><div class="row"><b>Delivery check · '+esc(r.customer_name)+'</b><span class="tag '+(r.status==="approved"?"s-ready":r.status==="rejected"||r.status==="expired"?"cancelled":"s-new")+'">'+esc(r.status.toUpperCase())+'</span></div>'+
    '<p class="mute" style="margin:8px 0">'+esc(r.customer_phone)+' · '+new Date(r.created_at).toLocaleString()+'</p>'+
    '<p class="mute">'+esc(r.address_text)+'</p><p class="mute">Distance: '+esc(distance)+'</p>'+
    '<p style="margin:10px 0;line-height:1.7">'+(items||"No item details")+'</p>'+
    '<div class="row"><span class="mute">Subtotal '+money(r.subtotal)+' · Delivery '+money(r.delivery_fee)+'</span><b class="price">'+money(r.total)+'</b></div>'+
    (r.notes?'<p class="mute">Note: '+esc(r.notes)+'</p>':'')+
    (pending?'<div class="actions"><button class="btn sm" data-avail-id="'+esc(r.id)+'" data-avail-decision="approved" '+(canApprove?"":'disabled title="Verify the restaurant pin and delivery radius first"')+'>YES — Available</button><button class="btn sm ghost" data-avail-id="'+esc(r.id)+'" data-avail-decision="rejected">NO — Not available</button></div>':'')+
    (r.decision_reason?'<p class="mute">Decision: '+esc(r.decision_reason)+'</p>':'')+
    (r.status==="approved"?'<p class="mute">Customer can now continue to payment. Approval expires '+new Date(r.expires_at).toLocaleString()+'</p>':'')+
    '</article>';
}
function availabilityRequestsView(){
  const pending=availabilityRequests.filter(r=>r.status==="pending");
  const recent=availabilityRequests.filter(r=>r.status!=="pending").slice(0,8);
  return '<section class="partner-panel"><div class="panel-heading"><div><h2>Delivery availability requests</h2><p>Review customer address and confirm delivery before payment.</p></div><div class="actions"><span class="pill">'+pending.length+' pending</span><button class="btn ghost sm" id="availability-refresh" type="button">Refresh requests</button></div></div>'+
    (availabilityLoadError?'<div class="notice" role="alert">Could not load delivery requests: '+esc(availabilityLoadError)+'. Tap Refresh requests to retry.</div>':'')+
    (pending.map(availabilityRequestCard).join("")||empty("No delivery checks waiting for approval."))+
    (recent.length?'<div class="mute" style="margin-top:16px">Recent requests</div>'+recent.map(availabilityRequestCard).join(""):'')+
    '</section>';
}
function paymentsView(){
  const pending=payments.filter(p=>p.status==="pending");
  return '<section class="partner-panel"><div class="panel-heading"><div><h2>UPI payment verification</h2><p>Check the customer UTR/reference and payment screenshot before confirming the order.</p></div><span class="pill">'+pending.length+' awaiting review</span></div>'+
    (payments.map(p=>'<article class="card" style="margin:12px 0"><div class="row"><b>Order #'+esc(p.orders?.order_no||"—")+'</b><span class="tag '+(p.status==="approved"?"s-served":p.status==="rejected"?"s-cancelled":"s-new")+'">'+esc(p.status)+'</span></div>'+
    '<p class="mute">'+esc(p.orders?.customer_name||"Customer")+' · '+esc(p.orders?.customer_phone||"")+'</p><p><b>Amount: '+money(p.orders?.total||0)+'</b></p><p class="mute">UPI reference: <b>'+esc(p.upi_reference)+'</b></p>'+
    (p.screenshot_url?'<a href="'+esc(p.screenshot_url)+'" target="_blank" rel="noopener" class="btn ghost sm">View payment screenshot ↗</a>':'<small>Screenshot link unavailable. Refresh to request a new secure link.</small>')+
    (p.status==="pending"?'<div class="actions"><button class="btn sm" data-payment-review="'+esc(p.id)+'" data-decision="approved">Verify & confirm order</button><button class="btn ghost sm" data-payment-review="'+esc(p.id)+'" data-decision="rejected">Reject proof</button></div>':'<p class="mute">Review note: '+esc(p.review_note||"—")+'</p>')+
    '</article>').join("")||empty("No UPI payment submissions yet."))+'</section>';
}
function refundsView(){
  const active=refunds.filter(r=>["pending_review","approved","processing"].includes(r.status));
  return '<section class="partner-panel"><div class="panel-heading"><div><h2>Customer refunds</h2><p>Only mark a refund completed after the money has actually been returned. Enter the real UPI/bank reference.</p></div><span class="pill">'+active.length+' active</span></div>'+
    (refunds.map(r=>'<article class="card" style="margin:12px 0"><div class="row"><b>Order #'+esc(r.orders?.order_no||"—")+' · '+esc(r.orders?.customer_name||"Customer")+'</b><span class="tag '+(r.status==="completed"?"s-served":r.status==="rejected"?"s-cancelled":"s-new")+'">'+esc(r.status.replaceAll("_"," "))+'</span></div>'+
    '<p class="mute">'+esc(r.orders?.customer_phone||"")+' · '+new Date(r.requested_at).toLocaleString()+'</p><p><b>Refund amount: '+money(r.amount)+'</b></p>'+
    (Number(r.cancellation_fee)>0?'<p class="mute">6% cancellation charge: '+money(r.cancellation_fee)+'</p>':'')+
    (r.bank_details?'<div class="card" style="margin:8px 0;padding:12px"><b>Customer bank details</b><p class="mute">Account holder: '+esc(r.bank_details.account_holder)+'</p><p class="mute">Bank: '+esc(r.bank_details.bank_name)+'</p><p class="mute">Account number: '+esc(r.bank_details.account_number)+'</p><p class="mute">IFSC: '+esc(r.bank_details.ifsc)+'</p></div>':r.bank_details_restricted?'<p class="mute">Bank details: Owner-only access</p>':'<p class="mute">Bank details: Not submitted yet</p>')+
    '<p class="mute">Reason: '+esc(r.reason)+'</p>'+
    (r.refund_reference?'<p class="mute">Refund reference: '+esc(r.refund_reference)+'</p>':'')+(r.owner_note?'<p class="mute">Note: '+esc(r.owner_note)+'</p>':'')+
    (r.status==="pending_review"?'<div class="actions"><button class="btn sm" data-refund="'+esc(r.id)+'" data-refund-status="approved">Approve refund</button><button class="btn ghost sm" data-refund="'+esc(r.id)+'" data-refund-status="rejected">Reject</button></div>':'')+
    (r.status==="approved"?'<div class="actions"><button class="btn sm" data-refund="'+esc(r.id)+'" data-refund-status="processing">Mark processing</button></div>':'')+
    (r.status==="processing"?'<div class="actions"><button class="btn sm" data-refund="'+esc(r.id)+'" data-refund-status="completed">Mark refunded</button></div>':'')+
    '</article>').join("")||empty("No refund requests yet."))+'</section>';
}
const OWNER_VAPID_PUBLIC_KEY="BIVTMUyOjw9WqTLz6pXy84FmsgnjTvU0gF0u7ve64qGR0_355CLatQExhK5l_v-j0ISvFzKF8GlUw4uQvhDZ5Nk";
function ownerBase64ToBytes(value){const padding="=".repeat((4-value.length%4)%4);const raw=atob((value+padding).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function ownerPushState(){
 const enable=document.getElementById("owner-push-enable"),disable=document.getElementById("owner-push-disable");
 if(!enable||!("serviceWorker" in navigator))return;
 try{const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();enable.textContent=sub?"Push notifications enabled":"Enable push on this device";if(disable)disable.hidden=!sub;}catch{if(disable)disable.hidden=true;}
}
async function enableOwnerPush(){
 try{
  if(!("Notification" in window)||!("PushManager" in window)||!("serviceWorker" in navigator))throw new Error("This browser does not support push notifications. Use Chrome on Android.");
  const {data:{user:current}}=await supabase.auth.getUser();if(!current)throw new Error("Sign in first.");
  const permission=await Notification.requestPermission();if(permission!=="granted")throw new Error("Notification permission was not granted.");
  const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:ownerBase64ToBytes(OWNER_VAPID_PUBLIC_KEY)});
  const data=sub.toJSON();if(!data.endpoint||!data.keys?.p256dh||!data.keys?.auth)throw new Error("Browser returned an incomplete push subscription.");
  const {error}=await supabase.from("push_subscriptions").upsert({user_id:current.id,endpoint:data.endpoint,p256dh:data.keys.p256dh,auth:data.keys.auth,user_agent:navigator.userAgent,updated_at:new Date().toISOString()},{onConflict:"user_id,endpoint"});
  if(error)throw error;toast("Owner/staff push notifications enabled on this device.");await ownerPushState();
 }catch(error){toast(error.message||"Could not enable push notifications.",true);}
}
async function disableOwnerPush(){
 try{
  const {data:{user:current}}=await supabase.auth.getUser();const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
  if(sub){const {error}=await supabase.from("push_subscriptions").delete().eq("user_id",current.id).eq("endpoint",sub.endpoint);if(error)throw error;await sub.unsubscribe();}
  toast("Push notifications disabled on this device.");await ownerPushState();
 }catch(error){toast(error.message||"Could not disable push notifications.",true);}
}
function alertsView(){
  return '<section class="card" style="margin-bottom:14px"><b>Push notifications on this device</b><p class="mute" style="margin:6px 0 12px">Receive new orders, delivery checks, payment and refund alerts even when this dashboard is closed.</p><div class="actions"><button class="btn sm" id="owner-push-enable" type="button">Enable push on this device</button><button class="btn ghost sm" id="owner-push-disable" type="button" hidden>Disable on this device</button></div></section>'+
  (notifications.map(n=>'<div class="item-row"><div class="item-meta"><b>'+esc(n.title)+'</b><span class="mute">'+esc(n.body||"")+'</span><span class="mute">'+new Date(n.created_at).toLocaleString()+'</span></div>'+(n.is_read?"":'<button class="btn ghost sm" data-read="'+esc(n.id)+'">Mark read</button>')+'</div>').join("")||empty("No notifications yet."));
}
function settingsView(){
  const s=settings||{};
  return '<div class="notice">Enter the restaurant’s exact map-pin coordinates and confirm them only after checking the pin. Orders remain blocked until the location is verified and a real payment method is enabled.</div>'+
    '<form id="settings-form" class="card"><h2 style="margin:0 0 12px">Restaurant details</h2>'+
    '<label>Restaurant name</label><input id="set-name" required value="'+esc(s.name||"Hurmat Darbar")+'">'+
    '<label>Contact phone</label><input id="set-phone" value="'+esc(s.phone||"")+'">'+
    '<label>Full address</label><input id="set-address" value="'+esc(s.address||"")+'">'+
    '<div class="grid"><div><label>Latitude</label><input id="set-lat" type="number" step="any" min="-90" max="90" value="'+(s.lat==null?"":esc(s.lat))+'"></div><div><label>Longitude</label><input id="set-lng" type="number" step="any" min="-180" max="180" value="'+(s.lng==null?"":esc(s.lng))+'"></div></div>'+
    '<label>Delivery radius (metres)</label><input id="set-radius" type="number" min="100" max="50000" value="'+esc(s.delivery_radius_m||5000)+'">'+
    '<div class="grid"><div><label>Delivery fee (₹)</label><input id="set-fee" type="number" min="0" max="100000" value="'+esc(s.delivery_fee||0)+'"></div><div><label>Minimum order (₹)</label><input id="set-min" type="number" min="0" max="100000" value="'+esc(s.min_order||0)+'"></div></div>'+
    '<label style="display:flex;align-items:center;gap:8px;margin:10px 0"><input id="set-open" type="checkbox" style="width:auto;margin:0" '+(s.is_open?"checked":"")+'> Accept orders while restaurant is open</label>'+
    '<label style="display:flex;align-items:center;gap:8px;margin:10px 0"><input id="set-cod" type="checkbox" style="width:auto;margin:0" '+(s.cod_enabled?"checked":"")+'> Enable cash on delivery</label>'+
    '<label style="display:flex;align-items:center;gap:8px;margin:10px 0"><input id="set-upi" type="checkbox" style="width:auto;margin:0" '+(s.upi_enabled?"checked":"")+'> Enable manual UPI (not automatic payment verification)</label>'+
    '<label>UPI ID (required only if manual UPI is enabled)</label><input id="set-upi-id" value="'+esc(s.upi_id||"")+'">'+
    '<label style="display:flex;align-items:center;gap:8px;margin:14px 0"><input id="set-verified" type="checkbox" style="width:auto;margin:0" '+(s.location_verified?"checked":"")+'> I have checked and verified the restaurant map pin</label>'+
    '<button class="btn wide" type="submit">Save restaurant settings</button></form>'+
    (role==="owner"?    '<section class="partner-panel" style="margin-top:16px"><div class="panel-heading"><div><h2>Team access</h2><p>Create staff sign-in accounts. Owner access is managed directly in Supabase.</p></div></div>'+
    '<form id="staff-create-form" class="card"><label>Staff email</label><input id="staff-email" type="email" autocomplete="off" required placeholder="staff@example.com">'+
    '<label>Temporary password (at least 10 characters)</label><input id="staff-password" type="password" autocomplete="new-password" minlength="10" required placeholder="Create a temporary password">'+
    '<label>Access role</label><select id="staff-role"><option value="manager">Manager — orders, menu and bookings</option><option value="kitchen">Kitchen — order workflow</option><option value="delivery_manager">Delivery manager — riders and delivery</option></select>'+
    '<button class="btn wide" id="staff-create-submit" type="submit">Create staff account</button><p class="mute" style="font-size:11px;line-height:1.6;margin-top:10px">The account is created as email-confirmed in Supabase. Share the temporary password securely and ask the staff member to change it after first sign-in. Never reuse passwords.</p></form></section>'
:"")+
    '';
}
function riderFormEditing(){return !!document.getElementById("rider-create-form");}
function render(){
  nav();
  const titles={tracking:["Live tracking","Live rider positions and active delivery locations."],profile:["My Profile","Your secure owner account details."],home:["Overview","Live restaurant operations and business pulse."],orders:["Order desk","Manage incoming orders through kitchen and delivery stages."],availability:["Delivery checks","Review every customer delivery request and respond YES or NO."],payments:["Payments","Verify UPI references and customer payment screenshots."],refunds:["Refunds","Review cancellations and record verified customer refunds."],menu:["Menu management","Control dishes, categories, prices, photos and availability."],inventory:["Inventory","Physical stock counts synced with customer ordering."],reservations:["Bookings","Customer reservation requests."],riders:["Delivery team","Rider accounts and availability."],reports:["Reports","Sales trends and top-selling menu items."],settings:["Store setup","Restaurant profile, operating status, delivery and payment configuration."],alerts:["Notifications","Live operational alerts and order updates."]};
  const t=titles[page]||titles.home;
  let content=page==="home"?homeView():page==="orders"?ordersView():page==="tracking"?trackingView():page==="profile"?profileView():page==="availability"?availabilityRequestsView():page==="payments"?paymentsView():page==="refunds"?refundsView():page==="menu"?menuView():page==="inventory"?inventoryView():page==="reservations"?reservationsView():page==="riders"?ridersView():page==="reports"?reportsView():page==="settings"?settingsView():alertsView();
  shell(t[0],t[1],content);
  bindActions();
}
async function refresh(){
  if(DEVELOPMENT_PREVIEW){
    orders=[];menuItems=[];menuCategories=[];reservations=[];riders=[];notifications=[];
    settings={name:"Hurmat Darbar",phone:"+91 97971 51590",address:"Opposite Tehsil, Uri, Baramulla, J&K 193123",is_open:true,location_verified:false,cod_enabled:false,upi_enabled:false,delivery_radius_m:5000,delivery_fee:0,min_order:0};
    render();return;
  }
  const results=await Promise.allSettled([api("orders"),api("menu"),api("reservations"),api("riders"),
    supabase.from("notifications").select("id,title,body,order_id,is_read,created_at").order("created_at",{ascending:false}).limit(60),
    supabase.from("restaurant_settings").select("*").eq("id",1).single(),
    role==="owner"?api("availability"):Promise.resolve({requests:[]}),
    ["owner","manager","delivery_manager"].includes(role)?api("cash_collections"):Promise.resolve({cash_collections:[]}),
    (role==="owner"||role==="manager")?api("payments"):Promise.resolve({payments:[]}),(role==="owner"||role==="manager")?api("refunds"):Promise.resolve({refunds:[]})]);
  if(results[0].status==="fulfilled")orders=results[0].value.orders||[];
  if(results[1].status==="fulfilled")menuItems=results[1].value.items||[];
  if(results[2].status==="fulfilled")reservations=results[2].value.reservations||[];
  if(results[3].status==="fulfilled"){riders=results[3].value.riders||[];riderLocations=results[3].value.locations||[];}
  if(results[4].status==="fulfilled"&&!results[4].value.error)notifications=results[4].value.data||[];
  if(results[5].status==="fulfilled"&&!results[5].value.error)settings=results[5].value.data;
  if(results[6].status==="fulfilled"){availabilityRequests=results[6].value.requests||[];availabilityLoadError="";}
  else{availabilityLoadError=results[6].reason?.message||"Owner availability API is unavailable.";}
  if(results[7].status==="fulfilled")cashCollections=results[7].value.cash_collections||[];
  if(results[8].status==="fulfilled")payments=results[8].value.payments||[];
  if(results[9].status==="fulfilled")refunds=results[9].value.refunds||[];
  const categoryResult=await supabase.from("menu_categories").select("id,name,active,sort_order").order("sort_order");if(!categoryResult.error)menuCategories=categoryResult.data||[];
  if(!riderFormEditing())render();
}
function bindActions(){
  document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>{page=b.dataset.go;render();});
  const availabilityRefresh=document.getElementById("availability-refresh");
  if(availabilityRefresh)availabilityRefresh.onclick=async()=>{
    availabilityRefresh.disabled=true;availabilityRefresh.textContent="Refreshing…";
    try{await refresh();if(!availabilityLoadError)toast("Delivery requests refreshed.");}
    catch(error){toast(error.message||"Could not refresh delivery requests.",true);}
  };
  if(DEVELOPMENT_PREVIEW){
    document.querySelectorAll("button,input,select,textarea").forEach(el=>{
      if(el.matches("[data-tab],[data-go],#menu-search,#menu-filter,#order-search,#inventory-search")) return;
      el.disabled=true;
      if(el.tagName==="BUTTON" && !el.title) el.title="Disabled in development preview";
    });
    const filterInputs=["menu-search","menu-filter","order-search","inventory-search"];
    filterInputs.forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=false;});
    const orderSearch=document.getElementById("order-search");
    if(orderSearch)orderSearch.oninput=()=>{const q=orderSearch.value.trim().toLowerCase();document.querySelectorAll(".order-groups article.card").forEach(el=>{el.hidden=!el.textContent.toLowerCase().includes(q);});};
    const inventorySearch=document.getElementById("inventory-search");
    if(inventorySearch)inventorySearch.oninput=()=>{const q=inventorySearch.value.trim().toLowerCase();document.querySelectorAll(".inventory-row").forEach(el=>{el.hidden=!el.textContent.toLowerCase().includes(q);});};
    const menuSearch=document.getElementById("menu-search"),menuFilter=document.getElementById("menu-filter");
    const filterMenu=()=>{const q=(menuSearch?.value||"").trim().toLowerCase(),f=menuFilter?.value||"all";document.querySelectorAll("[data-product-card]").forEach(card=>{const tracked=card.dataset.tracked==="true",qty=Number(card.dataset.stockValue||0),published=card.dataset.published==="true";const match=card.dataset.name.includes(q);const state=f==="all"||(f==="published"&&published)||(f==="hidden"&&!published)||(f==="stock"&&tracked)||(f==="low"&&tracked&&qty>0&&qty<=5)||(f==="out"&&tracked&&qty===0);card.hidden=!(match&&state);});};
    if(menuSearch)menuSearch.oninput=filterMenu;if(menuFilter)menuFilter.onchange=filterMenu;
    return;
  }
  const outletToggle=document.getElementById("outlet-toggle");
  if(outletToggle)outletToggle.onclick=async()=>{
    const next=outletToggle.dataset.open!=="true";
    outletToggle.disabled=true;
    const {error}=await supabase.from("restaurant_settings").update({is_open:next,updated_at:new Date().toISOString()}).eq("id",1);
    if(error){toast(error.message,true);outletToggle.disabled=false;return;}
    await refresh();toast(next?"Restaurant is accepting orders.":"Restaurant orders paused.");
  };
  const orderSearch=document.getElementById("order-search");
  if(orderSearch)orderSearch.oninput=()=>{
    const q=orderSearch.value.trim().toLowerCase();
    document.querySelectorAll(".order-groups article.card").forEach(el=>{el.hidden=!el.textContent.toLowerCase().includes(q);});
  };
  const inventorySearch=document.getElementById("inventory-search");
  if(inventorySearch)inventorySearch.oninput=()=>{
    const q=inventorySearch.value.trim().toLowerCase();
    document.querySelectorAll(".inventory-row").forEach(el=>{el.hidden=!el.textContent.toLowerCase().includes(q);});
  };
  document.querySelectorAll("[data-avail-id]").forEach(b=>b.onclick=async()=>{
    const decision=b.dataset.availDecision;
    const reason=decision==="rejected"?(prompt("Optional reason for not accepting this delivery:")||""):null;
    if(decision==="rejected"&&!confirm("Reject this delivery availability request?"))return;
    if(decision==="approved"&&!confirm("Confirm that Hurmat Darbar can deliver to this address?"))return;
    b.disabled=true;
    try{
      await api("",{action:"decide_delivery_availability",request_id:b.dataset.availId,decision,reason});
      await refresh();
      toast(decision==="approved"?"Delivery approved. Customer can now pay and place the order.":"Delivery request rejected.");
    }catch(e){toast(e.message||"Availability decision failed.",true);b.disabled=false;}
  });
  document.querySelectorAll("[data-refund]").forEach(b=>b.onclick=async()=>{
    const status=b.dataset.refundStatus;
    const reference=status==="completed"?prompt("Enter the actual UPI/bank refund reference (UTR):"):null;
    if(status==="completed"&&(!reference||reference.trim().length<6)){toast("A valid refund reference is required.",true);return;}
    const note=status==="rejected"?(prompt("Reason for rejecting this refund request:")||"Refund request not approved"):null;
    if(!confirm("Update refund status to "+status.replaceAll("_"," ")+"?"))return;
    b.disabled=true;
    try{await api("",{action:"update_refund",refund_id:b.dataset.refund,status,reference,note});await refresh();toast(status==="completed"?"Refund marked completed.":"Refund status updated.");}
    catch(e){toast(e.message||"Refund update failed.",true);b.disabled=false;}
  });
  document.querySelectorAll("[data-payment-review]").forEach(b=>b.onclick=async()=>{
    const decision=b.dataset.decision;
    const note=decision==="rejected"?(prompt("Reason for rejecting this payment proof:")||"Payment proof not accepted"): "Payment verified by staff";
    if(decision==="rejected"&&!confirm("Reject this payment proof? The customer can submit a corrected proof."))return;
    if(decision==="approved"&&!confirm("Confirm payment received and move this order to Confirmed?"))return;
    b.disabled=true;
    try{await api("",{action:"review_upi_payment",submission_id:b.dataset.paymentReview,decision,note});await refresh();toast(decision==="approved"?"Payment verified. Order confirmed.":"Payment proof rejected.");}
    catch(e){toast(e.message||"Payment review failed.",true);b.disabled=false;}
  });
  document.querySelectorAll("[data-order]").forEach(b=>b.onclick=async()=>{
    b.disabled=true;try{await api("",{action:"update_order_status",order_id:b.dataset.order,status:b.dataset.status});await refresh();toast("Order status updated.");}catch(e){toast(e.message,true);b.disabled=false;}
  });
  document.querySelectorAll("[data-cancel]").forEach(b=>b.onclick=async()=>{
    const reason=prompt("Enter a reason for cancelling or rejecting this order:");if(!reason||!reason.trim())return;
    try{await api("",{action:"update_order_status",order_id:b.dataset.cancel,status:"cancelled",reason:reason.trim()});await refresh();toast("Order cancelled.");}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll("[data-cash-handover]").forEach(b=>b.onclick=async()=>{
    if(!confirm("Confirm that cash for this order has been received from the rider?"))return;
    b.disabled=true;
    try{await api("",{action:"mark_cash_handed_over",order_id:b.dataset.cashHandover});await refresh();toast("Cash handover recorded.");}
    catch(e){toast(e.message||"Cash handover failed.",true);b.disabled=false;}
  });
  document.querySelectorAll("[data-assign]").forEach(b=>b.onclick=async()=>{
    const rider=document.getElementById("rider-"+b.dataset.assign).value;if(!rider){toast("Choose a rider first.",true);return;}
    try{await api("",{action:"assign_rider",order_id:b.dataset.assign,rider_id:rider});await refresh();toast("Rider assigned.");}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll("[data-stock-set]").forEach(b=>b.onclick=async()=>{
    const item=menuItems.find(x=>x.id===b.dataset.stockSet);if(!item)return;
    const raw=prompt("Set the exact physical stock quantity for "+item.name+":",String(item.stock_qty||0));if(raw===null)return;
    const qty=Number(raw);if(!Number.isInteger(qty)||qty<0||qty>1000000){toast("Enter a whole number from 0 to 1,000,000.",true);return;}
    b.disabled=true;
    try{await api("",{action:"update_menu_item",item_id:item.id,track_stock:true,stock_qty:qty});await refresh();toast("Inventory count saved: "+qty+" units.");}catch(e){toast(e.message,true);b.disabled=false;}
  });
  document.querySelectorAll("[data-stock-enable]").forEach(b=>b.onclick=async()=>{
    const item=menuItems.find(x=>x.id===b.dataset.stockEnable);if(!item)return;
    const raw=prompt("Enter the current physical stock quantity for "+item.name+":","0");if(raw===null)return;
    const qty=Number(raw);if(!Number.isInteger(qty)||qty<0||qty>1000000){toast("Enter a whole number from 0 to 1,000,000.",true);return;}
    b.disabled=true;
    try{await api("",{action:"update_menu_item",item_id:item.id,track_stock:true,stock_qty:qty});await refresh();toast("Inventory tracking enabled.");}catch(e){toast(e.message,true);b.disabled=false;}
  });
  document.querySelectorAll("[data-stock-plus],[data-stock-minus]").forEach(b=>b.onclick=async()=>{
    const id=b.dataset.stockPlus||b.dataset.stockMinus,item=menuItems.find(x=>x.id===id);if(!item)return;
    const delta=b.hasAttribute("data-stock-plus")?1:-1,current=Number(item.stock_qty||0);
    b.disabled=true;
    try{await api("",{action:"adjust_menu_stock",item_id:id,delta});await refresh();toast("Stock updated: "+(current+delta)+" units remaining.");}catch(e){toast(e.message,true);b.disabled=false;}
  });
  const menuSearch=document.getElementById("menu-search"),menuFilter=document.getElementById("menu-filter");
  const applyStoreFilter=()=>{
    const q=(menuSearch?.value||"").trim().toLowerCase(),filter=menuFilter?.value||"all";
    document.querySelectorAll("[data-product-card]").forEach(card=>{
      const tracked=card.dataset.tracked==="true",qty=Number(card.dataset.stockValue||0),published=card.dataset.published==="true";
      const matchName=card.dataset.name.includes(q);
      const matchFilter=filter==="all"||(filter==="published"&&published)||(filter==="hidden"&&!published)||(filter==="stock"&&tracked)||(filter==="low"&&tracked&&qty>0&&qty<=5)||(filter==="out"&&tracked&&qty===0);
      card.hidden=!(matchName&&matchFilter);
    });
  };
  if(menuSearch)menuSearch.oninput=applyStoreFilter;if(menuFilter)menuFilter.onchange=applyStoreFilter;
  document.querySelectorAll("[data-upload-image]").forEach(b=>b.onclick=()=>{
    const item=menuItems.find(x=>x.id===b.dataset.uploadImage);if(!item)return;
    const picker=document.createElement("input");picker.type="file";picker.accept="image/jpeg,image/png,image/webp";
    picker.onchange=async()=>{
      const file=picker.files&&picker.files[0];if(!file)return;
      if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5*1024*1024){toast("Choose a JPG, PNG or WebP image up to 5 MB.",true);return;}
      b.disabled=true;b.textContent="Uploading…";
      try{
        const safeName=file.name.replace(/[^a-z0-9._-]/gi,"-");
        const path=item.id+"/"+Date.now()+"-"+safeName;
        const {data,error}=await supabase.storage.from("menu-images").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
        if(error)throw error;
        const {data:publicData}=supabase.storage.from("menu-images").getPublicUrl(data.path);
        await api("",{action:"update_menu_item",item_id:item.id,image_url:publicData.publicUrl});
        await refresh();toast("Product photo uploaded and published on the customer website.");
      }catch(e){toast(e.message||"Photo upload failed.",true);b.disabled=false;b.textContent="Photo";}
    };
    picker.click();
  });
  document.querySelectorAll("[data-edit-item]").forEach(b=>b.onclick=async()=>{
    const item=menuItems.find(x=>x.id===b.dataset.editItem);if(!item)return;
    const name=prompt("Product name:",item.name);if(name===null)return;
    const description=prompt("Product description:",item.description||"");if(description===null)return;
    const imageUrl=prompt("Food photo URL (https://) — leave blank for no photo:",item.image_url||"");if(imageUrl===null)return;
    if(imageUrl.trim()&&!imageUrl.trim().startsWith("https://")){toast("Photo URL must start with https://",true);return;}
    const indianFood=isIndianVegCategory(item.menu_categories?.name);
    let vegValue=null;
    if(indianFood){const veg=prompt("Indian food type: enter VEG or NON-VEG",item.is_veg===true?"VEG":item.is_veg===false?"NON-VEG":"");if(veg===null)return;if(!["veg","non-veg"].includes(veg.trim().toLowerCase())){toast("Enter VEG or NON-VEG for Indian food.",true);return;}vegValue=veg.trim().toLowerCase()==="veg";}
    if(!name.trim()||name.trim().length<2||name.length>120||description.length>500){toast("Check product name and description.",true);return;}
    try{const patch={action:"update_menu_item",item_id:item.id,name:name.trim(),description,image_url:imageUrl.trim()||null};if(indianFood)patch.is_veg=vegValue;else patch.is_veg=null;await api("",patch);await refresh();toast("Product details and photo updated on the website.");}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll("[data-publish]").forEach(b=>b.onclick=async()=>{
    try{await api("",{action:"update_menu_item",item_id:b.dataset.publish,active:b.dataset.active!=="true"});await refresh();toast("Product publishing status updated.");}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=async()=>{
    try{await api("",{action:"update_menu_item",item_id:b.dataset.toggle,available:b.dataset.available!=="true"});await refresh();toast("Website menu availability updated.");}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll("[data-variant-toggle]").forEach(b=>b.onclick=async()=>{
    try{await api("",{action:"update_menu_variant",variant_id:b.dataset.variantToggle,active:b.dataset.active!=="true"});await refresh();toast("Variant availability updated.");}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll("[data-add-variant]").forEach(b=>b.onclick=async()=>{
    const item=menuItems.find(x=>x.id===b.dataset.addVariant);if(!item)return;
    const label=prompt("Variant name (e.g. Half, Full, Regular):");if(!label||!label.trim())return;
    const price=Number(prompt("Variant price in rupees:","100"));
    if(!Number.isInteger(price)||price<1||price>1000000){toast("Enter a valid whole-number price.",true);return;}
    try{await api("",{action:"create_menu_variant",item_id:item.id,label:label.trim(),price});await refresh();toast("New product variant added.");}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll("[data-price]").forEach(b=>b.onclick=async()=>{
    const value=prompt("New price in rupees:",b.dataset.current);if(value===null)return;const price=Number(value);
    if(!Number.isInteger(price)||price<1||price>1000000){toast("Enter a valid whole-number price.",true);return;}
    try{await api("",{action:"update_menu_variant",variant_id:b.dataset.price,price});await refresh();toast("Menu price updated.");}catch(e){toast(e.message,true);}
  });
  document.querySelectorAll("[data-reservation]").forEach(b=>b.onclick=async()=>{
    try{await api("",{action:"update_reservation_status",reservation_id:b.dataset.reservation,status:b.dataset.resStatus});await refresh();toast("Reservation updated.");}catch(e){toast(e.message,true);}
  });
  const ownerPushEnable=document.getElementById("owner-push-enable");if(ownerPushEnable)ownerPushEnable.onclick=enableOwnerPush;
  const ownerPushDisable=document.getElementById("owner-push-disable");if(ownerPushDisable)ownerPushDisable.onclick=disableOwnerPush;
  ownerPushState();
  document.querySelectorAll("[data-read]").forEach(b=>b.onclick=async()=>{
    const {error}=await supabase.from("notifications").update({is_read:true}).eq("id",b.dataset.read);if(error){toast(error.message,true);return;}await refresh();
  });
  const ownerInviteForm=document.getElementById("owner-invite-form");
  if(ownerInviteForm)ownerInviteForm.onsubmit=async e=>{e.preventDefault();const button=document.getElementById("owner-invite-submit"),email=document.getElementById("owner-invite-email").value.trim().toLowerCase();if(!email)return;button.disabled=true;button.textContent="Sending invitation…";try{await api("",{action:"invite_owner",email});ownerInviteForm.reset();toast("Owner invitation sent. Ask them to check their email.");}catch(err){toast(err.message==="owner_email_already_registered"?"This email already has an account. Use the existing account or another email.":err.message==="owner_invites_not_configured"?"Owner invitations need server mail configuration.":err.message||"Owner invitation failed.",true);}finally{button.disabled=false;button.textContent="Send secure owner invitation";}};
  const staffForm=document.getElementById("staff-create-form");
  if(staffForm)staffForm.onsubmit=async e=>{
    e.preventDefault();
    const button=document.getElementById("staff-create-submit");
    const email=document.getElementById("staff-email").value.trim().toLowerCase();
    const password=document.getElementById("staff-password").value;
    const staffRole=document.getElementById("staff-role").value;
    if(password.length<10||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password)||!/[^A-Za-z0-9]/.test(password)){toast("Use 10+ characters with uppercase, lowercase, a number and a symbol.",true);return;}
    button.disabled=true;button.textContent="Creating secure account…";
    try{
      await api("",{action:"create_staff_account",email,password,role:staffRole});
      staffForm.reset();
      toast("Staff account created and activated in Supabase. Share the login details securely.");
    }catch(err){
      const messages={staff_accounts_not_configured:"Secure account creation is not configured on the server.",staff_email_already_registered:"This email already has a Supabase account.",invalid_staff_role:"Select a permitted staff role.",invalid_staff_email:"Enter a valid email address.",weak_staff_password:"Use a password with at least 10 characters."};
      toast(messages[err.message]||err.message||"Staff account could not be created.",true);
    }finally{button.disabled=false;button.textContent="Create staff account";}
  };
  const riderForm=document.getElementById("rider-create-form");
  if(riderForm)riderForm.onsubmit=async e=>{
    e.preventDefault();
    const button=document.getElementById("rider-create-submit");
    const name=document.getElementById("rider-name").value.trim();
    const phone=document.getElementById("rider-phone").value.trim();
    const email=document.getElementById("rider-email").value.trim().toLowerCase();
    const password=document.getElementById("rider-password").value;
    if(password.length<10){toast("Use a temporary password with at least 10 characters.",true);return;}
    button.disabled=true;button.textContent="Creating secure rider account…";
    try{
      await api("",{action:"create_rider_account",name,phone,email,password});
      riderForm.reset();await refresh();render();toast("Rider account and delivery profile created.");
    }catch(err){
      const messages={rider_accounts_not_configured:"Secure rider account creation is not configured on the server.",rider_email_already_registered:"This email already has a Supabase account. Use a new rider email, or ask the owner to activate the existing account.",rider_account_creation_failed:"Supabase could not create this rider login. Check the email and try again.",rider_role_activation_failed:"The login was created but rider access could not be activated. Contact support before trying again.",rider_profile_creation_failed:"Rider login/profile setup failed. Contact support before retrying.",invalid_rider_email:"Enter a valid rider email address.",weak_rider_password:"Use 10+ characters with uppercase, lowercase, a number and a symbol.",invalid_rider_profile:"Enter a valid rider name and phone number."};
      toast(messages[err.message]||err.message||"Rider account could not be created.",true);
    }finally{button.disabled=false;button.textContent="Create rider account";}
  };
  const profileForm=document.getElementById("owner-profile-form");
  if(profileForm)profileForm.onsubmit=async e=>{
    e.preventDefault();
    const full_name=document.getElementById("owner-profile-name").value.trim();
    const phone=document.getElementById("owner-profile-phone").value.trim();
    if(full_name.length<2||full_name.length>80||phone.length>20){toast("Enter a valid name and phone number.",true);return;}
    try{const {data,error}=await supabase.auth.updateUser({data:{...(user?.user_metadata||{}),full_name,phone}});if(error)throw error;user=data.user||user;toast("Profile updated.");render();}
    catch(error){toast(error.message||"Profile could not be updated.",true);}
  };
  const settingsForm=document.getElementById("settings-form");
  if(settingsForm)settingsForm.onsubmit=async e=>{
    e.preventDefault();
    const latRaw=document.getElementById("set-lat").value.trim(),lngRaw=document.getElementById("set-lng").value.trim();
    const lat=latRaw===""?null:Number(latRaw),lng=lngRaw===""?null:Number(lngRaw);
    const verified=document.getElementById("set-verified").checked;
    if(verified&&(lat===null||lng===null||!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -90||lat > 90||lng < -180||lng > 180)){toast("Enter valid map-pin coordinates before verifying.",true);return;}
    const cod=document.getElementById("set-cod").checked,upi=document.getElementById("set-upi").checked,upiId=document.getElementById("set-upi-id").value.trim();
    if(upi&&(!upiId||!upiId.includes("@"))){toast("Enter a valid UPI ID before enabling manual UPI.",true);return;}
    const patch={
      name:document.getElementById("set-name").value.trim(),
      phone:document.getElementById("set-phone").value.trim(),
      address:document.getElementById("set-address").value.trim(),
      lat:lat,lng:lng,location_verified:verified,
      delivery_radius_m:Number(document.getElementById("set-radius").value),
      delivery_fee:Number(document.getElementById("set-fee").value),
      min_order:Number(document.getElementById("set-min").value),
      is_open:document.getElementById("set-open").checked,
      cod_enabled:cod,upi_enabled:upi,upi_id:upi?upiId:null,updated_at:new Date().toISOString()
    };
    if(!patch.name||!patch.address||!Number.isInteger(patch.delivery_radius_m)||patch.delivery_radius_m<100||!Number.isInteger(patch.delivery_fee)||patch.delivery_fee<0||!Number.isInteger(patch.min_order)||patch.min_order<0){toast("Check the restaurant details and numeric settings.",true);return;}
    const {error}=await supabase.from("restaurant_settings").update(patch).eq("id",1);
    if(error){toast(error.message,true);return;}
    await refresh();toast("Restaurant settings saved.");
  };
  const addCategory=document.getElementById("add-category");
  if(addCategory)addCategory.onclick=async()=>{
    const name=prompt("New category name:");if(!name||!name.trim())return;
    const {error}=await supabase.from("menu_categories").insert({name:name.trim(),active:true});
    if(error){toast(error.message,true);return;}await refresh();toast("Category added.");
  };
  const addItem=document.getElementById("add-item");
  if(addItem)addItem.onclick=async()=>{
    const name=prompt("Product name:");if(!name||name.trim().length<2)return;
    const categoryName=prompt("Category name (choose an existing category):",menuCategories[0]?.name||"");
    const match=menuCategories.find(x=>x.name.toLowerCase()===String(categoryName||"").trim().toLowerCase());
    if(!match){toast("Category not found. Add the category first.",true);return;}
    const description=prompt("Short product description:","Freshly prepared at Hurmat Darbar");if(description===null)return;
    const imageUrl=prompt("Food photo URL (https://), optional:","");if(imageUrl===null)return;
    if(imageUrl.trim()&&!imageUrl.trim().startsWith("https://")){toast("Photo URL must start with https://",true);return;}
    const indianFood=isIndianVegCategory(match.name);
    let vegValue=null;
    if(indianFood){const veg=prompt("Indian food type: VEG or NON-VEG","");if(!["veg","non-veg"].includes(String(veg||"").trim().toLowerCase())){toast("Enter VEG or NON-VEG for Indian food.",true);return;}vegValue=String(veg).trim().toLowerCase()==="veg";}
    const price=Number(prompt("Regular price in rupees:","100"));if(!Number.isInteger(price)||price<1){toast("Enter a valid price.",true);return;}
    const trackStock=confirm("Track inventory for this product? Choose OK to enter stock quantity; Cancel keeps stock unlimited.");
    let initialStock=null;
    if(trackStock){const raw=prompt("Current stock quantity:","0");if(raw===null)return;initialStock=Number(raw);if(!Number.isInteger(initialStock)||initialStock<0||initialStock>1000000){toast("Enter a whole number from 0 to 1,000,000.",true);return;}}
    const {data,error}=await supabase.from("menu_items").insert({category_id:match.id,name:name.trim(),description,image_url:imageUrl.trim()||null,is_veg:vegValue,active:true,available:true,track_stock:trackStock,stock_qty:initialStock}).select("id").single();
    if(error){toast(error.message,true);return;}
    const variant=await supabase.from("menu_variants").insert({item_id:data.id,label:"Regular",price,active:true});
    if(variant.error){toast("Item saved, but price variant failed: "+variant.error.message,true);return;}
    await refresh();toast("Menu item added to the live website.");
  };
}
async function startApp(){
  await refresh();
  if(DEVELOPMENT_PREVIEW) return;
  if(availabilityRefreshTimer)clearInterval(availabilityRefreshTimer);
  availabilityRefreshTimer=setInterval(async()=>{
    if(document.hidden)return;
    try{
      let changed=false;
      if(role==="owner"){
        const result=await api("availability"),next=result.requests||[];
        if(JSON.stringify(next)!==JSON.stringify(availabilityRequests)){availabilityRequests=next;changed=true;}
      }
      if(page==="riders"||page==="tracking"){
        const riderResult=await api("riders"),nextRiders=riderResult.riders||[],nextLocations=riderResult.locations||[];
        if(JSON.stringify(nextRiders)!==JSON.stringify(riders)||JSON.stringify(nextLocations)!==JSON.stringify(riderLocations)){riders=nextRiders;riderLocations=nextLocations;changed=true;}
      }
      if(role==="owner"||role==="manager"){
        const result=await api("payments"),next=result.payments||[];
        if(JSON.stringify(next)!==JSON.stringify(payments)){payments=next;changed=true;}
        const refundResult=await api("refunds"),nextRefunds=refundResult.refunds||[];
        if(JSON.stringify(nextRefunds)!==JSON.stringify(refunds)){refunds=nextRefunds;changed=true;}
      }
      if(changed&&!riderFormEditing())render();
    }catch(error){console.warn("Live dashboard refresh failed:",error);}
  },8000);
  if(channel)await supabase.removeChannel(channel);
  channel=supabase.channel("hurmat-admin-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"orders"},()=>refresh())
    .on("postgres_changes",{event:"*",schema:"public",table:"payment_submissions"},()=>refresh())
    .on("postgres_changes",{event:"*",schema:"public",table:"refund_requests"},()=>refresh())
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications"},()=>{refresh();toast("New restaurant notification.");})
    .on("postgres_changes",{event:"*",schema:"public",table:"menu_items"},()=>refresh())
    .on("postgres_changes",{event:"*",schema:"public",table:"menu_variants"},()=>refresh())
    .on("postgres_changes",{event:"*",schema:"public",table:"reservations"},()=>refresh())
    .on("postgres_changes",{event:"*",schema:"public",table:"restaurant_settings"},()=>refresh())
    .subscribe();
}
async function init(){
  if(DEVELOPMENT_PREVIEW){await startApp();return;}
  try{const {data:{session}}=await supabase.auth.getSession();if(await verifyAccess()){if(new URLSearchParams(location.search).get("tab")==="notifications")page="alerts";await startApp();}else loginView("");}
  catch(e){loginView(e.message||"Unable to verify account.");}
}
if(!DEVELOPMENT_PREVIEW)supabase.auth.onAuthStateChange((event,session)=>{
  if(event==="SIGNED_OUT"){if(channel)supabase.removeChannel(channel);user=null;role=null;loginView("You have signed out.");}
});
init();
if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./owner-sw.js",{scope:"./"}).catch(()=>{}));}
