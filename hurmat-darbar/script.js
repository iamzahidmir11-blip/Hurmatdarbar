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
const paymentProofBox=el("div","payment-proof-fields");
paymentProofBox.id="payment-proof-fields";
const paymentRefLabel=el("label","","UPI transaction reference / UTR");paymentRefLabel.htmlFor="upi-reference";
const paymentRefInput=el("input","");paymentRefInput.id="upi-reference";paymentRefInput.maxLength=80;paymentRefInput.placeholder="Enter UPI UTR / reference number";
const paymentShotLabel=el("label","","Payment screenshot (JPG, PNG or WebP · max 5 MB)");paymentShotLabel.htmlFor="upi-screenshot";
const paymentShotInput=el("input","");paymentShotInput.id="upi-screenshot";paymentShotInput.type="file";paymentShotInput.accept="image/jpeg,image/png,image/webp";
paymentProofBox.append(paymentRefLabel,paymentRefInput,paymentShotLabel,paymentShotInput);

const checkoutButton=document.getElementById("checkout");
checkoutButton.textContent="Check Availability";
checkoutButton.insertAdjacentElement("beforebegin",paymentLabel);
checkoutButton.insertAdjacentElement("beforebegin",paymentSelect);
checkoutButton.insertAdjacentElement("beforebegin",paymentInfo);
checkoutButton.insertAdjacentElement("beforebegin",paymentProofBox);
checkoutButton.insertAdjacentElement("afterend",orderHelp);
paymentLabel.hidden=true;paymentSelect.hidden=true;paymentInfo.hidden=true;paymentProofBox.hidden=true;
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
    paymentInfo.append(el("span","","Pay Hurmat Darbar using your UPI app. After payment, return here and submit the UTR and receipt. The order stays pending until the restaurant verifies it."));
    const copy=el("button","btn ghost sm","Copy UPI ID");copy.type="button";
    copy.onclick=async()=>{try{await navigator.clipboard.writeText(restaurantSettings.upi_id);copy.textContent="Copied ✓"}catch{window.prompt("Copy UPI ID",restaurantSettings.upi_id)}};
    const open=el("button","btn sm","Open UPI app");open.type="button";
    open.onclick=()=>{
      const amount=(cart.reduce((sum,line)=>sum+(Number(line.price)||0)*(Number(line.qty)||0),0)+Number(restaurantSettings.delivery_fee||0)).toFixed(2);
      const params=new URLSearchParams({pa:restaurantSettings.upi_id,pn:"Hurmat Darbar",am:amount,cu:"INR",tn:"Hurmat Darbar order"});
      window.location.href="upi://pay?"+params.toString();
    };
    paymentInfo.append(copy,open);paymentInfo.hidden=false;
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
    paymentLabel.hidden=false;paymentSelect.hidden=false;updatePaymentInfo();paymentProofBox.hidden=paymentSelect.value!=="upi_manual";
    checkoutButton.textContent=paymentSelect.value==="upi_manual"?"Pay & Place Order":"Place Order";
    checkoutButton.disabled=!orderReady||placingOrder||!paymentSelect.value;
    orderHelp.textContent=availabilityMessage||"Delivery approved. Choose payment and place your order.";
  }else{
    paymentLabel.hidden=true;paymentSelect.hidden=true;paymentInfo.hidden=true;paymentProofBox.hidden=true;
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
  const method=paymentSelect.value;
  const reference=paymentRefInput.value.trim();
  const proofFile=paymentShotInput.files?.[0]||null;
  if(method==="upi_manual"){
    if(reference.length<6||reference.length>80)throw new Error("Enter the UPI transaction reference / UTR number.");
    if(!proofFile)throw new Error("Attach your UPI payment screenshot before placing the order.");
    if(!["image/jpeg","image/png","image/webp"].includes(proofFile.type)||proofFile.size>5*1024*1024)throw new Error("Choose a JPG, PNG or WebP screenshot up to 5 MB.");
  }
  const order={...availabilityPayload,payment_method:method,idempotency_key:idempotencyKey,availability_request_id:availabilityRequestId};
  const result=await callRestaurantApi("POST","",{action:"create_order",order});
  const savedOrder=result.order||{};
  if(method==="upi_manual"&&savedOrder.order_id){
    const {data:{user}}=await db.auth.getUser();
    const ext=proofFile.type==="image/png"?"png":proofFile.type==="image/webp"?"webp":"jpg";
    const path=user.id+"/"+savedOrder.order_id+"/"+Date.now()+"."+ext;
    const {data:uploaded,error:uploadError}=await db.storage.from("payment-proofs").upload(path,proofFile,{cacheControl:"3600",upsert:false,contentType:proofFile.type});
    if(uploadError)throw new Error("Order created, but screenshot upload failed. Open My Orders and submit the payment proof again.");
    await callRestaurantApi("POST","",{action:"submit_upi_payment_proof",order_id:savedOrder.order_id,reference,screenshot_path:uploaded.path});
  }
  cart=[];localStorage.setItem("hd-cart","[]");
  localStorage.removeItem("hd-availability-request");localStorage.removeItem("hd-availability-payload");
  availabilityRequestId="";availabilityPayload=null;availabilityApproved=false;availabilityPolling=false;
  renderCart();toggleCart(false);
  const success=document.getElementById("order-success"),token=savedOrder.tracking_token||"";
  document.getElementById("success-copy").textContent="Order #"+(savedOrder.order_no||"—")+" has been received. "+(method==="upi_manual"?"Your UPI reference and screenshot are submitted for verification. The order will be confirmed after approval.":"Your order is awaiting restaurant confirmation.")+" Total: "+money(savedOrder.total||0)+".";
  document.getElementById("success-token").textContent=token||"Tracking reference unavailable";
  if(success)success.hidden=false;
  document.getElementById("customer-name").value="";
  document.getElementById("customer-phone").value="";
  document.getElementById("customer-address").value="";
  document.getElementById("customer-notes").value="";
  availabilityMessage="";paymentRefInput.value="";paymentShotInput.value="";
  checkoutState();
  await loadMyOrders();
}
checkoutButton.onclick=async()=>{
  const {data:{user}}=await db.auth.getUser();
  if(!user||user.is_anonymous){document.body.classList.add("customer-locked");customerAuthMessage("Create an account or log in before placing an order.",true);return;}
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
  const tools=el("div","menu-tools");tools.append(search);cats.after(tools);render();renderCart();checkoutState();resumeAvailability();loadCustomerProfile();loadMyOrders();if(window.hdOrdersTimer)clearInterval(window.hdOrdersTimer);window.hdOrdersTimer=setInterval(()=>{if(!document.hidden)loadMyOrders()},8000);
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

const myOrdersRoot=document.getElementById("my-orders-list");
function updateCustomerDashboard(signedIn){
  const nav=document.getElementById("customer-bottom-nav");
  const auth=document.getElementById("customer-auth-form");
  const profile=document.getElementById("customer-profile-card");
  if(nav)nav.hidden=!signedIn;
  if(auth)auth.hidden=!!signedIn;
  if(profile)profile.hidden=!signedIn;
  if(!signedIn){document.querySelectorAll("[data-customer-tab]").forEach(b=>b.classList.remove("active"));}
  else if(!document.querySelector("[data-customer-tab].active"))showCustomerTab("profile");
}
function showCustomerTab(tab){
  const menu=document.getElementById("menu"), services=document.getElementById("services"), account=document.getElementById("my-account"), orders=document.getElementById("my-orders"), visit=document.getElementById("visit");
  const auth=document.getElementById("customer-auth-form"), profile=document.getElementById("customer-profile-card");
  if(auth)auth.hidden=document.body.classList.contains("customer-authenticated");
  if(profile)profile.hidden=tab!=="profile";
  if(menu)menu.hidden=tab!=="menu";
  if(services)services.hidden=tab!=="menu";
  if(account)account.hidden=tab!=="profile";
  if(orders)orders.hidden=tab!=="orders";
  if(visit)visit.hidden=tab!=="menu";
  document.querySelectorAll("[data-customer-tab]").forEach(b=>b.classList.toggle("active",b.dataset.customerTab===tab));
  window.scrollTo({top:0,behavior:"smooth"});
}
const customerNav=document.getElementById("customer-bottom-nav");
if(customerNav)customerNav.addEventListener("click",e=>{const b=e.target.closest("[data-customer-tab]");if(b)showCustomerTab(b.dataset.customerTab);});
const customerAuthForm=document.getElementById("customer-auth-form");
let customerAuthMode="signup";
function applyCustomerGate(){
  return db.auth.getUser().then(({data:{user}})=>{
    const signedIn=!!user&&!user.is_anonymous;
    document.body.classList.toggle("customer-locked",!signedIn);
    document.body.classList.toggle("customer-authenticated",signedIn);
    updateCustomerDashboard(signedIn);
    return signedIn;
  }).catch(()=>{document.body.classList.add("customer-locked");return false;});
}
let activeCustomerUserId=null;
let myOrdersLoadVersion=0;
function resetCustomerOrders(message){
  if(!myOrdersRoot)return;
  myOrdersLoadVersion++;
  myOrdersRoot.replaceChildren();
  if(message)myOrdersRoot.append(el("p","my-orders-empty",message));
}
db.auth.onAuthStateChange((event,session)=>{
  const signedIn=!!session?.user&&!session.user.is_anonymous;
  const nextUserId=signedIn?session.user.id:null;
  document.body.classList.toggle("customer-locked",!signedIn);
  document.body.classList.toggle("customer-authenticated",signedIn);
  updateCustomerDashboard(signedIn);
  if(nextUserId!==activeCustomerUserId){
    activeCustomerUserId=nextUserId;
    resetCustomerOrders(signedIn?"Loading your orders…":"Log in to see your orders.");
    if(signedIn)Promise.resolve().then(()=>loadMyOrders(nextUserId));
  }
});
// Keep the page locked until Supabase confirms a registered customer session.
applyCustomerGate();
function customerAuthMessage(message,bad=false){
  const node=document.getElementById("customer-auth-message");
  if(node){node.textContent=message;node.style.color=bad?"#a33":"inherit";}
}
function setCustomerAuthMode(mode){
  customerAuthMode=mode;
  const signup=mode==="signup";
  document.getElementById("customer-auth-title").textContent=signup?"Create your account":"Welcome back";
  document.getElementById("customer-auth-help").textContent=signup?"Create an account with your email address and a password to unlock the menu and ordering.":"Log in with the email address and password you registered with.";
  document.getElementById("account-name").required=signup;
  document.getElementById("account-name").hidden=!signup;
  document.getElementById("account-phone").hidden=!signup;
  const passwordInput=document.getElementById("account-password");
  passwordInput.autocomplete=signup?"new-password":"current-password";
  // Existing accounts may have passwords shorter than the newer signup policy.
  passwordInput.minLength=signup?10:8;
  passwordInput.placeholder=signup?"10+ chars with uppercase, lowercase, number and symbol":"Enter your account password";
  document.getElementById("customer-auth-submit").textContent=signup?"Create account":"Log in";
  document.getElementById("customer-auth-switch").textContent=signup?"Already have an account? Log in":"New here? Create an account";
}
if(customerAuthForm){
  setCustomerAuthMode("login");
  const authSwitchButton=document.getElementById("customer-auth-switch");
  authSwitchButton.addEventListener("click",event=>{
    event.preventDefault();
    setCustomerAuthMode(customerAuthMode==="signup"?"login":"signup");
    customerAuthMessage("");
    document.getElementById("account-email").focus();
  });
  document.getElementById("customer-auth-logout").onclick=async()=>{
    const {error}=await db.auth.signOut();if(error){customerAuthMessage(error.message,true);return;}
    customerAuthMessage("You have logged out.");document.body.classList.add("customer-locked");document.body.classList.remove("customer-authenticated");updateCustomerDashboard(false);await loadCustomerProfile();await loadMyOrders();
  };
  customerAuthForm.addEventListener("submit",async e=>{
    e.preventDefault();
    const button=document.getElementById("customer-auth-submit");
    const email=document.getElementById("account-email").value.trim().toLowerCase();
    const password=document.getElementById("account-password").value;
    const name=document.getElementById("account-name").value.trim();
    const phone=document.getElementById("account-phone").value.trim();
    if(customerAuthMode==="signup"&&name.length<2){customerAuthMessage("Enter your full name.",true);return;}
    if(customerAuthMode==="signup"&&(password.length<10||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password)||!/[^A-Za-z0-9]/.test(password))){customerAuthMessage("Use 10+ characters with uppercase, lowercase, a number and a symbol.",true);return;}
    if(!email||!document.getElementById("account-email").checkValidity()){customerAuthMessage("Enter a valid email address.",true);return;}
    if(password.length<(customerAuthMode==="signup"?10:8)){customerAuthMessage(customerAuthMode==="signup"?"Signup password must be at least 10 characters.":"Password must be at least 8 characters.",true);return;}
    button.disabled=true;button.textContent=customerAuthMode==="signup"?"Creating account…":"Logging in…";
    try{
      if(customerAuthMode==="signup"){
        const {data,error}=await db.auth.signUp({
          email,
          password,
          options:{data:{full_name:name,phone}}
        });
        if(error)throw error;
        if(!data.user)throw new Error("Supabase did not return a new customer account.");
        if(!data.session){
          customerAuthMessage("Account created. Please verify your email, then return and log in.",false);
          setCustomerAuthMode("login");
          return;
        }
        customerAuthMessage("Account created successfully. Your customer account is now active.");
      }else{
        const {data,error}=await db.auth.signInWithPassword({email,password});
        if(error)throw error;
        if(!data.user||data.user.is_anonymous)throw new Error("A registered customer account is required.");
        customerAuthMessage("You are logged in.");
      }
      await applyCustomerGate();await loadCustomerProfile();await loadMyOrders();showCustomerTab("profile");
    }catch(error){customerAuthMessage(error.message||"Account action failed.",true);}
    finally{button.disabled=false;button.textContent=customerAuthMode==="signup"?"Create account":"Log in";}
  });
}
async function loadCustomerProfile(){
  const {data:{user}}=await db.auth.getUser();
  const summary=document.getElementById("customer-profile-summary");
  const logout=document.getElementById("customer-auth-logout");
  const save=document.getElementById("profile-save");
  if(!user||user.is_anonymous){
    if(summary)summary.textContent="Create an account or log in to manage your profile.";
    if(logout)logout.hidden=true;if(save)save.disabled=true;return;
  }
  if(logout)logout.hidden=false;if(save)save.disabled=false;
  const {data,error}=await db.from("customer_profiles").select("full_name,phone,email").eq("user_id",user.id).maybeSingle();
  if(error){if(summary)summary.textContent="Profile could not be loaded: "+error.message;return;}
  document.getElementById("profile-name").value=data?.full_name||user.user_metadata?.full_name||"";
  document.getElementById("profile-phone").value=data?.phone||user.user_metadata?.phone||"";
  summary.textContent=(data?.email||user.email||"")+" · Your account is active.";
  const checkoutName=document.getElementById("customer-name"),checkoutPhone=document.getElementById("customer-phone");
  if(checkoutName&&!checkoutName.value)checkoutName.value=data?.full_name||"";
  if(checkoutPhone&&!checkoutPhone.value)checkoutPhone.value=data?.phone||"";
}
const profileSave=document.getElementById("profile-save");
if(profileSave)profileSave.onclick=async()=>{
  const {data:{user}}=await db.auth.getUser();if(!user||user.is_anonymous){customerAuthMessage("Please create an account or log in first.",true);return;}
  const full_name=document.getElementById("profile-name").value.trim(),phone=document.getElementById("profile-phone").value.trim();
  if(full_name.length<2){customerAuthMessage("Enter a valid display name.",true);return;}
  profileSave.disabled=true;
  const {error}=await db.from("customer_profiles").upsert({user_id:user.id,full_name,phone,email:user.email,updated_at:new Date().toISOString()});
  profileSave.disabled=false;
  if(error){customerAuthMessage(error.message,true);return;}
  const {error:metadataError}=await db.auth.updateUser({data:{full_name,phone}});
  if(metadataError){customerAuthMessage("Profile saved to your customer record, but account metadata did not update: "+metadataError.message,true);return;}
  document.getElementById("customer-profile-summary").textContent=user.email+" · Profile saved.";
  const n=document.getElementById("customer-name"),p=document.getElementById("customer-phone");if(n)n.value=full_name;if(p)p.value=phone;
};
const orderStatusLabels={pending_confirmation:"Awaiting restaurant confirmation",confirmed:"Confirmed",preparing:"Being prepared",ready_for_pickup:"Ready for pickup",picked_up:"Picked up",out_for_delivery:"Out for delivery",delivered:"Delivered",cancelled:"Cancelled",rejected:"Rejected",delivery_failed:"Delivery issue"};
function renderMyOrders(data,payments,refunds=[]){
  if(!myOrdersRoot)return;myOrdersRoot.replaceChildren();
  if(!data.length){myOrdersRoot.append(el("p","my-orders-empty","Your placed orders will appear here."));return;}
  data.forEach(o=>{
    const card=el("article","my-order-card"),head=el("div","my-order-head"),title=el("b","","Order #"+o.order_no),tag=el("span","my-order-status",orderStatusLabels[o.status]||o.status);
    head.append(title,tag);card.append(head,el("p","my-order-meta",new Date(o.created_at).toLocaleString()+" · "+money(o.total)));
    (o.order_items||[]).forEach(i=>card.append(el("p","my-order-line",i.qty+" × "+i.item_name+" ("+i.variant_label+")")));
    card.append(el("p","my-order-meta","Payment: "+o.payment_method+" · "+(o.payment_status==="paid"?"Paid":o.payment_status==="cod_pending"?"Cash on delivery":"Payment pending")));
    const proofs=payments.filter(p=>p.order_id===o.id);
    if(proofs.length)card.append(el("p","my-order-meta","UPI proof: "+proofs[0].status+(proofs[0].review_note?" · "+proofs[0].review_note:"")));
    const refund=refunds.find(r=>r.order_id===o.id);
    if(refund){
      card.append(el("p","my-order-meta","Refund: "+refund.status.replaceAll("_"," ")+" · "+money(refund.amount)));\n      if(Number(refund.cancellation_fee)>0)card.append(el("p","my-order-meta","6% cancellation charge: "+money(refund.cancellation_fee)));
      if(refund.refund_reference)card.append(el("p","my-order-meta","Refund reference: "+refund.refund_reference));
      if(refund.owner_note)card.append(el("p","my-order-meta","Refund update: "+refund.owner_note));
    }else if(["cancelled","rejected","delivery_failed"].includes(o.status)&&o.payment_status==="paid"){
      card.append(el("p","my-order-meta","Refund record is being prepared. Please refresh shortly."));
    }
    if(o.live?.history?.length){const timeline=el("div","my-order-timeline");o.live.history.slice(-5).forEach(h=>timeline.append(el("small","",String(h.status).replaceAll("_"," ")+" · "+new Date(h.at).toLocaleString())));card.append(timeline);}
    if(o.live?.rider){card.append(el("p","my-order-meta","Rider: "+o.live.rider.name+(o.live.rider.phone?" · "+o.live.rider.phone:"")));}
    if(o.live?.rider_location?.lat&&o.live?.rider_location?.lng){const a=el("a","my-order-map","View rider location ↗");a.href="https://www.google.com/maps?q="+o.live.rider_location.lat+","+o.live.rider_location.lng;a.target="_blank";a.rel="noopener";card.append(a);}

    if(o.payment_method==="upi_manual"&&o.payment_status!=="paid"&&(!proofs.length||proofs[0].status==="rejected")){
      const form=el("div","my-order-proof-form"),ref=el("input",""),file=el("input","");
      ref.placeholder="UPI UTR / reference number";ref.maxLength=80;file.type="file";file.accept="image/jpeg,image/png,image/webp";
      const submit=el("button","btn primary","Submit payment proof");submit.type="button";
      submit.onclick=async()=>{
        const f=file.files?.[0],v=ref.value.trim();
        if(v.length<6||!f){alert("Enter UPI reference and attach screenshot.");return;}
        if(!["image/jpeg","image/png","image/webp"].includes(f.type)||f.size>5*1024*1024){alert("Screenshot must be JPG, PNG or WebP up to 5 MB.");return;}
        submit.disabled=true;submit.textContent="Uploading…";
        try{
          const {data:{user}}=await db.auth.getUser();const ext=f.type==="image/png"?"png":f.type==="image/webp"?"webp":"jpg";
          const path=user.id+"/"+o.id+"/"+Date.now()+"."+ext;
          const {data:up,error}=await db.storage.from("payment-proofs").upload(path,f,{upsert:false,contentType:f.type});
          if(error)throw error;
          await callRestaurantApi("POST","",{action:"submit_upi_payment_proof",order_id:o.id,reference:v,screenshot_path:up.path});
          await loadMyOrders();alert("Payment proof submitted. Waiting for restaurant verification.");
        }catch(e){alert(e.message||"Could not submit payment proof.");submit.disabled=false;submit.textContent="Submit payment proof";}
      };
      form.append(ref,file,submit);card.append(form);
    }
    if(["pending_confirmation","confirmed"].includes(o.status)){
      const cancel=el("button","btn ghost sm","Cancel order");cancel.type="button";
      cancel.onclick=()=>{
        if(card.querySelector(".refund-bank-form"))return;
        const form=el("form","my-order-proof-form refund-bank-form");
        const fields=[];
        if(["paid","cod_collected"].includes(o.payment_status)){
          const holder=el("input",""),bank=el("input",""),account=el("input",""),ifsc=el("input","");
          holder.placeholder="Account holder name";holder.autocomplete="name";holder.required=true;holder.maxLength=80;
          bank.placeholder="Bank name";bank.required=true;bank.maxLength=100;
          account.placeholder="Bank account number";account.inputMode="numeric";account.autocomplete="off";account.required=true;account.maxLength=20;
          ifsc.placeholder="IFSC code";ifsc.autocomplete="off";ifsc.required=true;ifsc.maxLength=11;
          fields.push(holder,bank,account,ifsc);
          form.append(el("p","my-order-meta","Refund details (securely encrypted). A 6% cancellation charge applies to paid customer cancellations."));
          form.append(...fields);
        }else{
          form.append(el("p","my-order-meta","Confirm cancellation? No paid refund is due for this order."));
        }
        const submit=el("button","btn primary","Confirm cancellation");submit.type="submit";
        const close=el("button","btn ghost sm","Keep order");close.type="button";close.onclick=()=>form.remove();
        form.append(submit,close);
        form.onsubmit=async event=>{
          event.preventDefault();
          if(!confirm("Cancel order #"+o.order_no+"?"))return;
          submit.disabled=true;submit.textContent="Submitting…";
          try{
            const {error}=await db.rpc("customer_cancel_order_with_refund_details",{
              p_order:o.id,p_reason:"Cancelled by customer",
              p_account_holder:fields[0]?.value.trim()||null,
              p_bank_name:fields[1]?.value.trim()||null,
              p_account_number:fields[2]?.value.trim()||null,
              p_ifsc:fields[3]?.value.trim().toUpperCase()||null
            });
            if(error)throw error;
            await loadMyOrders();
            alert("Order cancelled. The refund request and bank details have been securely sent to the restaurant.");
          }catch(error){alert(error.message||"Could not cancel this order.");submit.disabled=false;submit.textContent="Confirm cancellation";}
        };
        card.append(form);
      };
      card.append(cancel);
    }
    const track=el("button","btn ghost sm","Refresh live status");track.type="button";track.onclick=()=>loadMyOrders();card.append(track);
    myOrdersRoot.append(card);
  });
}
async function loadMyOrders(expectedUserId=null){
  if(!myOrdersRoot)return;
  let requestVersion=0,userId=null;
  try{
    const {data:{user}}=await db.auth.getUser();
    if(!user||user.is_anonymous){
      resetCustomerOrders("Log in to see your orders.");
      return;
    }
    userId=user.id;
    if(expectedUserId&&expectedUserId!==userId)return;
    requestVersion=++myOrdersLoadVersion;
    const data=await callRestaurantApi("GET","view=my_orders");
    const {data:{user:verifiedUser}}=await db.auth.getUser();
    if(requestVersion!==myOrdersLoadVersion||!verifiedUser||verifiedUser.is_anonymous||verifiedUser.id!==userId)return;
    const {data:refundRows}=await db.from("refund_requests").select("id,order_id,amount,reason,status,refund_reference,owner_note,requested_at,processed_at").eq("customer_id",userId).order("requested_at",{ascending:false}).limit(30);
    const enriched=await Promise.all((data.orders||[]).slice(0,12).map(async o=>{
      if(["delivered","cancelled","rejected","delivery_failed"].includes(o.status))return o;
      const {data:live}=await db.rpc("track_order",{p_token:o.tracking_token});
      return {...o,live:live||null};
    }));
    const {data:{user:finalUser}}=await db.auth.getUser();
    if(requestVersion!==myOrdersLoadVersion||!finalUser||finalUser.is_anonymous||finalUser.id!==userId)return;
    renderMyOrders(enriched,data.payments||[],refundRows||[]);
  }
  catch(e){
    if(requestVersion&&requestVersion!==myOrdersLoadVersion)return;
    const {data:{user:currentUser}}=await db.auth.getUser().catch(()=>({data:{user:null}}));
    if(userId&&currentUser?.id!==userId)return;
    resetCustomerOrders("Your order history could not be loaded. Please refresh.");
  }
}

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
