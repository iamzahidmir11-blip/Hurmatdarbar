import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL="https://rvrboufrnkzuptfjopwd.supabase.co";
const SUPABASE_KEY="sb_publishable_n1PWbHcomKpd63FPDdWSEw_iSo6UTi0";
const db=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
document.getElementById("year").textContent=new Date().getFullYear();
document.querySelector(".hamb").onclick=()=>document.querySelector(".top").classList.toggle("nav-open");
const cats=document.getElementById("menu-categories"),grid=document.getElementById("menu-grid"),status=document.getElementById("menu-status"),panel=document.getElementById("cart-panel"),scrim=document.getElementById("cart-scrim");
let items=[],cat="all",query="",cart=[],selectedVariants={},restaurantSettings=null,placingOrder=false;
let availabilityRequestId=localStorage.getItem("hd-availability-request")||"",availabilityPayload=null,availabilityApproved=false,availabilityPolling=false,availabilityMessage="";
try{availabilityPayload=JSON.parse(localStorage.getItem("hd-availability-payload")||"null")}catch{availabilityPayload=null}try{cart=JSON.parse(localStorage.getItem("hd-cart")||"[]");if(!Array.isArray(cart))cart=[]}catch{cart=[]}
const money=n=>"₹"+Number(n).toLocaleString("en-IN");
const isIndianFoodCategory = name => { const key=String(name||"").trim().toLowerCase(); return key.startsWith("indian") || ["wazwan","tandoori","naan and roti","rice"].includes(key); };

function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n}
function toggleCart(on){panel.classList.toggle("open",on);scrim.classList.toggle("open",on)}
document.getElementById("open-cart").onclick=()=>toggleCart(true);document.getElementById("close-cart").onclick=()=>toggleCart(false);scrim.onclick=()=>toggleCart(false);const mobileCart=document.getElementById("mobile-cart-bar");if(mobileCart)mobileCart.onclick=()=>toggleCart(true);
function renderCats(data){cats.replaceChildren();[ {id:"all",name:"All categories"},...data].forEach((x,i)=>{const b=el("button","chip"+(i===0?" active":""),x.name);b.dataset.cat=x.id;cats.append(b)});cats.onclick=e=>{const b=e.target.closest("[data-cat]");if(!b)return;cat=b.dataset.cat;cats.querySelectorAll(".chip").forEach(x=>x.classList.toggle("active",x===b));render()}}
function foodImage(item){return item.image_url&&item.image_url.startsWith("https://")?item.image_url:""}
function foodDescription(item){return item.description&&item.description.trim()?item.description.trim():""}
function cartKey(itemId,variantId){return itemId+":"+variantId}
function cartQty(itemId,variantId){return cart.find(x=>x.key===cartKey(itemId,variantId))?.qty||0}
function render(){
  grid.replaceChildren();
  const list=items.filter(x=>(cat==="all"||x.category_id===cat)&&(!query||(x.name+" "+(x.description||"")+" "+x.category_name).toLowerCase().includes(query)));
  if(!list.length){grid.append(el("p","menu-empty","No matching items found."));return}
  list.forEach(x=>{
    const card=el("article","menu-card"),photo=el("div","food-photo"),image=el("img","food-image");
    const imageUrl=foodImage(x);image.alt=x.name+" food";image.loading="lazy";image.decoding="async";image.referrerPolicy="no-referrer";
    if(imageUrl){image.src=imageUrl;image.onerror=()=>{image.onerror=null;image.remove();photo.classList.add("photo-unavailable");photo.append(el("span","photo-label",x.name));};photo.append(image);}
    else{photo.classList.add("photo-unavailable");photo.append(el("span","photo-label",x.name));}
    const body=el("div","food-body"),title=el("h3","",x.name);
    if(isIndianFoodCategory(x.category_name)&&typeof x.is_veg==="boolean"){const type=el("span","food-type "+(x.is_veg?"veg":"nonveg"),x.is_veg?"VEG":"NON-VEG");body.append(type)}
    body.append(title);const description=foodDescription(x);if(description)body.append(el("p","food-description",description));if(x.track_stock===true){const stockNote=el("small","stock-note",Number(x.stock_qty||0)>0?Number(x.stock_qty)+" available":"Out of stock");body.append(stockNote)}
    const select=el("select","variant-select");
    x.menu_variants.forEach((v,n)=>{const opt=document.createElement("option");opt.value=String(n);opt.textContent=v.label+" · "+money(v.price);select.append(opt)});
    const savedVariantIndex=x.menu_variants.findIndex(v=>v.id===selectedVariants[x.id]);if(savedVariantIndex>=0)select.value=String(savedVariantIndex);
    const foot=el("div","food-bottom"),price=el("div","price-stack",money(x.menu_variants[0].price));
    price.append(el("small","","Selected price"));
    const add=el("button","add-btn card-add","Add to bag");
    add.type="button";const stockLeft=Number(x.stock_qty||0),stockTracked=x.track_stock===true,canBuy=x.available!==false&&(!stockTracked||stockLeft>0);add.disabled=!canBuy;
    const controls=el("div","menu-qty-control"),minus=el("button","qty-minus","−"),qty=el("span","qty-value","0"),plus=el("button","qty-plus","+");
    minus.type=plus.type="button";plus.disabled=!canBuy;
    const sync=()=>{
      const v=x.menu_variants[Number(select.value)],amount=cartQty(x.id,v.id);
      qty.textContent=String(amount);minus.disabled=amount===0;plus.disabled=!canBuy||amount>=50||(stockTracked&&amount>=stockLeft);price.firstChild.textContent=money(v.price);
      add.hidden=amount>0;controls.hidden=amount===0;
      add.textContent=x.available===false?"Paused":(stockTracked&&stockLeft===0?"Out of stock":"Add to bag");
    };
    select.onchange=()=>{selectedVariants[x.id]=x.menu_variants[Number(select.value)].id;sync()};
    add.onclick=()=>{const v=x.menu_variants[Number(select.value)];addItem(x,v,false)};
    minus.onclick=()=>{const v=x.menu_variants[Number(select.value)];qtyChange(cartKey(x.id,v.id),-1)};
    plus.onclick=()=>{const v=x.menu_variants[Number(select.value)];addItem(x,v,false)};
    controls.append(minus,qty,plus);foot.append(price,add,controls);body.append(select,foot);card.append(photo,body);grid.append(card);sync();
  });
}
function addItem(item,v,open=true){const key=cartKey(item.id,v.id),old=cart.find(x=>x.key===key),limit=item.track_stock===true?Number(item.stock_qty||0):50;if(item.available===false||limit<1){alert("This product is currently unavailable.");return}if(old&&old.qty>=Math.min(50,limit)){alert("Only "+limit+" units are currently available.");return}selectedVariants[item.id]=v.id;if(old)old.qty++;else cart.push({key,item_id:item.id,variant_id:v.id,name:item.name,label:v.label,price:+v.price,qty:1});save();render();if(open)toggleCart(true)}
function save(){if(availabilityRequestId)clearAvailability("Your bag changed. Please check delivery availability again.");localStorage.setItem("hd-cart",JSON.stringify(cart));renderCart();checkoutState()}
function renderCart(){
  const root=document.getElementById("cart-lines");root.replaceChildren();let subtotal=0,count=0;
  cart.forEach(x=>{
    subtotal+=x.price*x.qty;count+=x.qty;
    const row=el("article","cart-line"),stockItem=items.find(i=>i.id===x.item_id);
    const thumb=el("div","cart-item-thumb"),photo=foodImage(stockItem||{});
    if(photo){const img=el("img","",undefined);img.src=photo;img.alt=x.name;img.loading="lazy";img.onerror=()=>{img.remove();thumb.textContent="HD"};thumb.append(img)}else thumb.textContent="HD";
    const info=el("div","cart-item-info"),top=el("div","cart-item-top"),name=el("strong","cart-item-name",x.name),remove=el("button","cart-remove","Remove");
    remove.type="button";remove.setAttribute("aria-label","Remove "+x.name+" from bag");remove.onclick=()=>{cart=cart.filter(line=>line.key!==x.key);save();render()};
    top.append(name,remove);
    const small=el("small","cart-item-variant",x.label+" · "+money(x.price));
    const bottom=el("div","cart-item-bottom"),controls=el("div","qty-control"),minus=el("button","qty-minus","−"),qty=el("span","qty-value",x.qty),plus=el("button","qty-plus","+"),lineTotal=el("strong","cart-line-total",money(x.price*x.qty));
    minus.type=plus.type="button";minus.setAttribute("aria-label","Decrease "+x.name);plus.setAttribute("aria-label","Increase "+x.name);
    minus.onclick=()=>qtyChange(x.key,-1);const stockLimit=stockItem?.track_stock===true?Number(stockItem.stock_qty||0):50;plus.disabled=Number(x.qty)>=Math.min(50,stockLimit);plus.onclick=()=>qtyChange(x.key,1);
    controls.append(minus,qty,plus);bottom.append(controls,lineTotal);info.append(top,small,bottom);row.append(thumb,info);root.append(row);
  });
  if(!cart.length){
    const empty=el("div","cart-empty"),mark=el("div","cart-empty-mark","＋"),title=el("h3","","Your bag is empty"),copy=el("p","","Add your favourite dishes and they will appear here."),browse=el("button","cart-browse","Explore the menu");
    browse.type="button";browse.onclick=()=>{toggleCart(false);document.getElementById("menu").scrollIntoView({behavior:"smooth"})};empty.append(mark,title,copy,browse);root.append(empty);
  }
  const summary=document.querySelector(".cart-summary");if(summary)summary.hidden=!cart.length;
  document.getElementById("cart-count").textContent=count;
  document.getElementById("cart-subtotal").textContent=money(subtotal);
  document.getElementById("cart-total").textContent=money(subtotal+(cart.length?Number(restaurantSettings?.delivery_fee??30):0));
  const mobileCount=document.getElementById("mobile-cart-count"),mobileTotal=document.getElementById("mobile-cart-total");
  if(mobileCount)mobileCount.textContent=count+" "+(count===1?"item":"items");
  if(mobileTotal)mobileTotal.textContent=money(subtotal+(cart.length?Number(restaurantSettings?.delivery_fee??30):0));
  if(mobileCart)mobileCart.hidden=count===0;
  const headerCount=document.getElementById("cart-header-count");if(headerCount)headerCount.textContent=count+" "+(count===1?"item":"items");
  const checkout=document.getElementById("checkout");if(checkout&&!placingOrder)checkout.disabled=!cart.length||!restaurantSettings?.is_open||!restaurantSettings?.location_verified||!(restaurantSettings?.cod_enabled||(restaurantSettings?.upi_enabled&&restaurantSettings?.upi_id));
}
function qtyChange(key,d){const x=cart.find(x=>x.key===key);if(!x)return;const item=items.find(i=>i.id===x.item_id),limit=item?.track_stock===true?Number(item.stock_qty||0):50;if(d>0&&Number(x.qty)>=Math.min(50,limit)){alert("Stock limit reached for this product.");return}x.qty=Math.max(0,Math.min(50,Number(x.qty)+d));if(x.qty===0)cart=cart.filter(x=>x.key!==key);save();render()}
const paymentLabel=el("label","payment-label","Payment method");
const paymentSelect=el("select","payment-method");
paymentSelect.id="payment-method";paymentLabel.htmlFor=paymentSelect.id;
const orderHelp=el("small","","Add items and delivery details, then request confirmation from the restaurant.");
orderHelp.id="order-help";
const paymentInfo=el("div","payment-note");
paymentInfo.id="payment-info";
const checkoutButton=document.getElementById("checkout");
checkoutButton.textContent="Check Availability";
checkoutButton.insertAdjacentElement("beforebegin",paymentLabel);
checkoutButton.insertAdjacentElement("beforebegin",paymentSelect);
checkoutButton.insertAdjacentElement("beforebegin",paymentInfo);
checkoutButton.insertAdjacentElement("afterend",orderHelp);
paymentLabel.hidden=true;paymentSelect.hidden=true;paymentInfo.hidden=true;
paymentSelect.onchange=checkoutState;

function clearAvailability(message){
  localStorage.removeItem("hd-availability-request");
  localStorage.removeItem("hd-availability-payload");
  availabilityRequestId="";availabilityPayload=null;availabilityApproved=false;availabilityPolling=false;
  availabilityMessage=message||"";
  paymentLabel.hidden=true;paymentSelect.hidden=true;paymentInfo.hidden=true;
  if(orderHelp&&availabilityMessage)orderHelp.textContent=availabilityMessage;
  checkoutState();
}
function ensureGuestSession(){
  return db.auth.getSession().then(async ({data:{session}})=>{
    if(session)return session;
    const anon=await db.auth.signInAnonymously();
    if(anon.error)throw new Error("Secure guest checkout is not enabled on the restaurant account yet. Please contact the restaurant.");
    return anon.data.session;
  });
}
async function callRestaurantApi(method,query,body){
  const session=await ensureGuestSession();
  const url=SUPABASE_URL+"/functions/v1/restaurant-api"+(query?"?"+query:"");
  const response=await fetch(url,{method,headers:{
    "Content-Type":"application/json","apikey":SUPABASE_KEY,"Authorization":"Bearer "+session.access_token
  },body:body?JSON.stringify(body):undefined});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.code||result.error||"Restaurant system could not complete this request.");
  return result;
}
function getPosition(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation)return reject(new Error("This browser does not support location. Please use a device with location access."));
    navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude}),()=>reject(new Error("Location permission is required to check delivery coverage.")),{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
  });
}
function currentCartItems(){
  return cart.map(x=>({variant_id:x.variant_id,qty:Math.max(1,Math.min(50,Number(x.qty)||1))}))
    .sort((a,b)=>a.variant_id.localeCompare(b.variant_id));
}
function availabilityDetailsMatch(){
  if(!availabilityPayload)return false;
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  return document.getElementById("customer-name").value.trim()===availabilityPayload.name
    &&document.getElementById("customer-phone").value.trim()===availabilityPayload.phone
    &&document.getElementById("customer-address").value.trim()===availabilityPayload.address
    &&document.getElementById("customer-notes").value.trim().slice(0,300)===availabilityPayload.notes
    &&same(currentCartItems(),(availabilityPayload.items||[]).slice().sort((a,b)=>a.variant_id.localeCompare(b.variant_id)));
}
function updatePaymentInfo(){
  paymentInfo.replaceChildren();
  const method=paymentSelect.value;
  if(method==="upi_manual"&&restaurantSettings?.upi_id){
    paymentInfo.append(el("span","","Pay using UPI to: "+restaurantSettings.upi_id+". Complete payment in your UPI app, then return here and tap Pay & Place Order. The payment remains pending until the restaurant verifies it."));
    const copy=el("button","btn ghost sm","Copy UPI ID");copy.type="button";
    copy.onclick=async()=>{try{await navigator.clipboard.writeText(restaurantSettings.upi_id);copy.textContent="Copied ✓"}catch{window.prompt("Copy UPI ID",restaurantSettings.upi_id)}};
    paymentInfo.append(copy);paymentInfo.hidden=false;
  }else if(method==="cod"){
    paymentInfo.textContent="Cash on delivery selected.";paymentInfo.hidden=false;
  }else paymentInfo.hidden=true;
}
function checkoutState(){
  const methods=[];
  if(restaurantSettings?.cod_enabled)methods.push({value:"cod",label:"Cash on delivery"});
  if(restaurantSettings?.upi_enabled&&restaurantSettings?.upi_id)methods.push({value:"upi_manual",label:"Manual UPI (staff verifies payment)"});
  const previous=paymentSelect.value;
  paymentSelect.replaceChildren();
  methods.forEach(m=>{const o=document.createElement("option");o.value=m.value;o.textContent=m.label;paymentSelect.append(o);});
  if(previous&&methods.some(m=>m.value===previous))paymentSelect.value=previous;
  if(!methods.length){const o=document.createElement("option");o.value="";o.textContent="No payment method enabled";paymentSelect.append(o);}
  const stockOk=cart.every(line=>{const item=items.find(i=>i.id===line.item_id);return item&&item.available!==false&&(item.track_stock!==true||Number(item.stock_qty||0)>=Number(line.qty))});
  const subtotal=cart.reduce((sum,line)=>sum+Number(line.price)*Number(line.qty),0);
  const enough=subtotal>=Number(restaurantSettings?.min_order||0);
  const availabilityReady=cart.length>0&&stockOk&&!!restaurantSettings?.is_open&&enough;
  const orderReady=availabilityReady&&methods.length>0;
  if(availabilityApproved){
    paymentLabel.hidden=false;paymentSelect.hidden=false;updatePaymentInfo();
    checkoutButton.textContent=paymentSelect.value==="upi_manual"?"Pay & Place Order":"Place Order";
    checkoutButton.disabled=!orderReady||placingOrder||!paymentSelect.value;
    orderHelp.textContent=availabilityMessage||"Delivery approved. Choose payment and place your order.";
  }else{
    paymentLabel.hidden=true;paymentSelect.hidden=true;paymentInfo.hidden=true;
    checkoutButton.textContent=availabilityRequestId?(availabilityPolling?"Waiting for Owner…":"Check approval status"):"Check Availability";
    checkoutButton.disabled=!availabilityReady||placingOrder||availabilityPolling;
    orderHelp.textContent=availabilityRequestId?"Your request has been sent to Hurmat Darbar. Waiting for the Owner to confirm delivery.":!cart.length?"Add at least one menu item before checking delivery availability.":!stockOk?"One or more products no longer have enough stock. Update your bag quantity.":!restaurantSettings?"Restaurant setup could not be loaded.":!restaurantSettings.is_open?"The restaurant is currently not accepting orders.":!enough?"Minimum order is "+money(restaurantSettings.min_order)+". Add more items to continue.":availabilityMessage||"Check delivery availability first. Payment is selected only after Owner approval.";
  }
}
async function submitAvailabilityRequest(){
  const name=document.getElementById("customer-name").value.trim();
  const phone=document.getElementById("customer-phone").value.trim();
  const address=document.getElementById("customer-address").value.trim();
  const notes=document.getElementById("customer-notes").value.trim().slice(0,300);
  if(name.length<2||address.length<8||phone.replace(/\D/g,"").length<10)throw new Error("Enter your name, valid mobile number and complete delivery address.");
  const position=await getPosition();
  const request={name,phone,address,lat:position.lat,lng:position.lng,notes,items:currentCartItems()};
  const result=await callRestaurantApi("POST","",{action:"request_delivery_availability",request});
  availabilityRequestId=result.availability.request_id;
  availabilityPayload=request;
  localStorage.setItem("hd-availability-request",availabilityRequestId);
  localStorage.setItem("hd-availability-payload",JSON.stringify(availabilityPayload));
  availabilityMessage="Request sent. The Owner is checking whether delivery is possible.";
  availabilityPolling=false;
  checkoutState();
  pollAvailabilityStatus();
}
async function pollAvailabilityStatus(){
  if(!availabilityRequestId||availabilityPolling)return;
  const id=availabilityRequestId;availabilityPolling=true;checkoutState();
  try{
    const result=await callRestaurantApi("GET","view=availability_status&request_id="+encodeURIComponent(id));
    if(id!==availabilityRequestId)return;
    const statusValue=result.availability?.status;
    if(statusValue==="approved"){
      availabilityPolling=false;availabilityApproved=true;
      availabilityMessage="Owner approved delivery. You can now continue to payment and place the order.";
      checkoutState();return;
    }
    if(statusValue==="rejected"){
      const reason=result.availability?.decision_reason||"Hurmat Darbar cannot deliver to this address right now.";
      clearAvailability("Not available: "+reason);return;
    }
    if(statusValue==="ordered"){
      clearAvailability("This availability request has already been used to place an order. Check your tracking reference or contact the restaurant.");return;
    }
    if(statusValue==="expired"){
      clearAvailability("This availability request expired. Please check again.");return;
    }
    availabilityPolling=false;
    availabilityMessage="Request sent. Waiting for Owner approval…";
    checkoutState();
    setTimeout(()=>{if(id===availabilityRequestId)pollAvailabilityStatus()},5000);
  }catch(error){
    availabilityPolling=false;availabilityMessage="Waiting for Owner response. Connection will retry automatically.";
    checkoutState();
    setTimeout(()=>{if(id===availabilityRequestId)pollAvailabilityStatus()},7000);
  }
}
function resumeAvailability(){
  if(!availabilityRequestId||!availabilityPayload)return;
  document.getElementById("customer-name").value=availabilityPayload.name||"";
  document.getElementById("customer-phone").value=availabilityPayload.phone||"";
  document.getElementById("customer-address").value=availabilityPayload.address||"";
  document.getElementById("customer-notes").value=availabilityPayload.notes||"";
  availabilityMessage="Restoring your delivery availability request…";
  pollAvailabilityStatus();
}
async function placeApprovedOrder(){
  if(!availabilityApproved||!availabilityRequestId||!availabilityPayload)throw new Error("Owner approval is required before placing an order.");
  if(!availabilityDetailsMatch()){
    clearAvailability("Your delivery details or bag changed. Please check availability again.");
    throw new Error("Your delivery details or bag changed. Please check availability again.");
  }
  const idempotencyKey=availabilityPayload.idempotency_key||(crypto.randomUUID?crypto.randomUUID():"hd-"+Date.now()+"-"+Math.random().toString(36).slice(2));
  availabilityPayload.idempotency_key=idempotencyKey;
  localStorage.setItem("hd-availability-payload",JSON.stringify(availabilityPayload));
  const order={...availabilityPayload,payment_method:paymentSelect.value,idempotency_key:idempotencyKey,availability_request_id:availabilityRequestId};
  const result=await callRestaurantApi("POST","",{action:"create_order",order});
  const savedOrder=result.order||{};
  cart=[];localStorage.setItem("hd-cart","[]");
  localStorage.removeItem("hd-availability-request");localStorage.removeItem("hd-availability-payload");
  availabilityRequestId="";availabilityPayload=null;availabilityApproved=false;availabilityPolling=false;
  renderCart();toggleCart(false);
  const success=document.getElementById("order-success"),token=savedOrder.tracking_token||"";
  document.getElementById("success-copy").textContent="Order #"+(savedOrder.order_no||"—")+" has been sent to Hurmat Darbar. Payment status: pending restaurant verification. Total: "+money(savedOrder.total||0)+".";
  document.getElementById("success-token").textContent=token||"Tracking reference unavailable";
  if(success)success.hidden=false;
  document.getElementById("customer-name").value="";
  document.getElementById("customer-phone").value="";
  document.getElementById("customer-address").value="";
  document.getElementById("customer-notes").value="";
  availabilityMessage="";
  checkoutState();
}
checkoutButton.onclick=async()=>{
  if(placingOrder)return;
  placingOrder=true;checkoutButton.disabled=true;
  try{
    if(availabilityApproved){
      checkoutButton.textContent="Placing order…";
      await placeApprovedOrder();
    }else if(availabilityRequestId){
      checkoutButton.textContent="Checking…";
      await pollAvailabilityStatus();
    }else{
      checkoutButton.textContent="Checking availability…";
      await submitAvailabilityRequest();
    }
  }catch(error){availabilityMessage=error.message||"Unable to continue checkout.";if(orderHelp)orderHelp.textContent=availabilityMessage;alert(availabilityMessage);}
  finally{placingOrder=false;checkoutState();}
};
async function load(){
  status.textContent="Loading live menu and restaurant settings…";
  const [a,b,c]=await Promise.all([
    db.from("menu_categories").select("id,name,sort_order").eq("active",true).order("sort_order"),
    db.from("menu_items").select("id,category_id,name,description,image_url,is_veg,available,track_stock,stock_qty,sort_order,menu_categories(name),menu_variants(id,label,price,sort_order,active)").eq("active",true).order("sort_order"),
    db.from("restaurant_settings").select("name,is_open,location_verified,lat,lng,delivery_fee,min_order,cod_enabled,upi_enabled,upi_id").eq("id",1).single()
  ]);
  if(a.error||b.error){status.textContent="Menu unavailable. Please call +91 97971 51590.";return;}
  if(c.error){status.textContent="Menu is live, but checkout settings are unavailable. Please call the restaurant.";return;}
  restaurantSettings=c.data;
  const openBadge=document.getElementById("restaurant-open-state");
  if(openBadge){openBadge.textContent=restaurantSettings.is_open?"● Accepting orders":"● Orders paused";openBadge.classList.toggle("closed",!restaurantSettings.is_open);}
  items=(b.data||[]).map(x=>({...x,category_name:x.menu_categories?.name||"",menu_variants:(x.menu_variants||[]).filter(v=>v.active!==false&&v.price!==null).sort((p,q)=>p.sort_order-q.sort_order)})).filter(x=>x.menu_variants.length);
  cart=cart.flatMap(line=>{const item=items.find(x=>x.id===line.item_id&&x.available!==false),variant=item?.menu_variants.find(v=>v.id===line.variant_id);return item&&variant?[{...line,key:cartKey(item.id,variant.id),name:item.name,label:variant.label,price:Number(variant.price),qty:Math.max(1,Math.min(50,Number(line.qty)||1))}]:[]});
  localStorage.setItem("hd-cart",JSON.stringify(cart));cart.forEach(line=>{selectedVariants[line.item_id]=line.variant_id});
  renderCats(a.data||[]);
  status.textContent=items.length+" menu items loaded · live restaurant prices";
  const search=el("input","menu-search");search.placeholder="Search dishes, drinks and more…";search.oninput=()=>{query=search.value.toLowerCase().trim();render();};
  const tools=el("div","menu-tools");tools.append(search);cats.after(tools);render();renderCart();checkoutState();resumeAvailability();
}
renderCart();load();if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}))}
const reservationForm=document.getElementById("reservation-form");
if(reservationForm)reservationForm.addEventListener("submit",async e=>{
 e.preventDefault();const button=reservationForm.querySelector("button[type=submit]"),message=document.getElementById("res-message");
 const name=document.getElementById("res-name").value.trim(),phone=document.getElementById("res-phone").value.trim(),party=Number(document.getElementById("res-party").value),when=document.getElementById("res-time").value,notes=document.getElementById("res-notes").value.trim();
 if(name.length<2||phone.replace(/[^0-9]/g,"").length<10||!Number.isInteger(party)||party<1||party>30||!when||new Date(when)<=new Date()){message.textContent="Please check your name, mobile number, guest count and future date/time.";return;}
 button.disabled=true;button.textContent="Sending request…";
 try{const {error}=await db.from("reservations").insert({name,phone,party_size:party,reserve_at:new Date(when).toISOString(),notes:notes||null,status:"pending"});if(error)throw error;message.textContent="Reservation request received. The restaurant will confirm it.";reservationForm.reset();document.getElementById("res-party").value="2";}
 catch(err){message.textContent="Could not send request: "+(err.message||"Please call the restaurant.");}
 finally{button.disabled=false;button.textContent="Request reservation ↗";}
});
const trackingForm=document.getElementById("tracking-form");
if(trackingForm)trackingForm.addEventListener("submit",async e=>{
 e.preventDefault();const button=trackingForm.querySelector("button[type=submit]"),box=document.getElementById("tracking-result"),token=document.getElementById("tracking-token").value.trim();
 if(token.length<16){box.textContent="Enter the complete tracking reference.";return;}
 button.disabled=true;button.textContent="Checking…";box.replaceChildren();
 try{const {data,error}=await db.rpc("track_order",{p_token:token});if(error)throw error;if(!data){box.textContent="No order found for this tracking reference.";return;}
 const heading=el("b","", "Order #"+data.order_no+" · "+String(data.status||"").replaceAll("_"," "));
 box.append(heading);(data.items||[]).forEach(it=>box.append(el("p","",it.qty+" × "+it.name+" ("+it.variant+")")));
 box.append(el("p","tracking-total","Total "+money(data.total)));
 (data.history||[]).forEach(h=>box.append(el("small","tracking-step",String(h.status).replaceAll("_"," ")+" · "+new Date(h.at).toLocaleString())));
 }catch(err){box.textContent="Tracking is temporarily unavailable: "+(err.message||"Try again later.");}
 finally{button.disabled=false;button.textContent="Track order ↗";}
});

const successModal=document.getElementById("order-success");
const successClose=document.getElementById("success-close");
if(successClose)successClose.onclick=()=>{if(successModal)successModal.hidden=true;};
const copyTracking=document.getElementById("copy-tracking");
if(copyTracking)copyTracking.onclick=async()=>{
 const value=document.getElementById("success-token").textContent;
 if(!value||value==="Tracking reference unavailable")return;
 try{await navigator.clipboard.writeText(value);copyTracking.textContent="Copied ✓";}
 catch{window.prompt("Copy your tracking reference:",value);}
};
if(successModal)successModal.addEventListener("click",e=>{if(e.target===successModal)successModal.hidden=true;});
