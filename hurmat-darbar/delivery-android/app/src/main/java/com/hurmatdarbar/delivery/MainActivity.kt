package com.hurmatdarbar.delivery
import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.content.Intent
import android.net.Uri
import android.Manifest
import android.content.pm.PackageManager
import android.widget.*
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.io.OutputStreamWriter
import java.util.concurrent.Executors

class MainActivity : Activity() {
 private val base="https://rvrboufrnkzuptfjopwd.supabase.co"
 private val apiKey="sb_publishable_n1PWbHcomKpd63FPDdWSEw_iSo6UTi0"
 private val worker=Executors.newSingleThreadExecutor()
 private val pollHandler=Handler(Looper.getMainLooper())
 private var polling=false
 private var firstOrdersLoad=true
 private val knownOrderIds=mutableSetOf<String>()
 private val pollTask=object:Runnable {
  override fun run() {
   if(token.isNullOrBlank()){polling=false;return}
   if(!isFinishing && hasWindowFocus() && currentScreen=="orders") orders()
   pollHandler.postDelayed(this,20000L)
  }
 }
 private var token:String?=null
 private var refreshToken:String?=null
 private var online=false
 private var currentScreen="orders"
 private var orderFilter="active"
 private var sharingOrderId:String?=null
 private lateinit var root:LinearLayout
 private lateinit var status:TextView
 private val ink=Color.rgb(25,43,33); private val gold=Color.rgb(190,151,83); private val paper=Color.rgb(244,242,235); private val forest=Color.rgb(22,57,39)
 override fun onCreate(savedInstanceState:Bundle?) { super.onCreate(savedInstanceState); restoreSessionOrLogin() }
 private fun sessionPrefs()=EncryptedSharedPreferences.create(
  this,"hurmat_rider_session",
  MasterKey.Builder(this).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
  EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
  EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
 )
 private fun saveSession(access:String,refresh:String) {
  token=access;refreshToken=refresh
  sessionPrefs().edit().putString("refresh_token",refresh).apply()
 }
 private fun clearSession() {
  token=null;refreshToken=null
  try{sessionPrefs().edit().clear().apply()}catch(_:Exception){}
 }
 private fun restoreSessionOrLogin() {
  val saved=try{sessionPrefs().getString("refresh_token",null)}catch(_:Exception){null}
  if(saved.isNullOrBlank()){login();return}
  setup("Restoring rider session")
  worker.execute {
   try{
    val response=request(base+"/auth/v1/token?grant_type=refresh_token","POST",JSONObject().put("refresh_token",saved).toString(),null)
    val access=response.optString("access_token");val refresh=response.optString("refresh_token",saved)
    if(access.isBlank())throw Exception("Session refresh failed")
    runOnUiThread{saveSession(access,refresh);orders()}
   }catch(ex:Exception){runOnUiThread{clearSession();login();status.text="Please sign in again. "+message(ex)}}
  }
 }
 private fun rounded(color:Int,radius:Float=18f)=GradientDrawable().apply { setColor(color); cornerRadius=radius }
 private fun setup(title:String) {
  window.statusBarColor=Color.rgb(7,35,25);window.navigationBarColor=Color.rgb(7,35,25)
  val shell=LinearLayout(this).apply{orientation=1;setBackgroundColor(paper)}
  root=LinearLayout(this).apply{orientation=1;setPadding(16,16,16,22);setBackgroundColor(paper)}
  val hero=LinearLayout(this).apply{orientation=1;setPadding(20,20,20,20);background=GradientDrawable(GradientDrawable.Orientation.TL_BR,intArrayOf(Color.rgb(17,75,51),Color.rgb(7,37,27))).apply{cornerRadius=28f;setStroke(1,Color.argb(100,226,199,139))};elevation=8f}
  val brand=LinearLayout(this).apply{orientation=0;gravity=android.view.Gravity.CENTER_VERTICAL}
  val logo=ImageView(this).apply{setImageResource(R.drawable.hurmat_owner_logo);scaleType=ImageView.ScaleType.FIT_CENTER}
  brand.addView(logo,LinearLayout.LayoutParams(58,58).apply{rightMargin=13})
  val brandText=LinearLayout(this).apply{orientation=1}
  brandText.addView(TextView(this).apply{text="HURMAT DARBAR";textSize=18f;letterSpacing=1.1f;setTextColor(Color.WHITE);setTypeface(null,Typeface.BOLD)})
  brandText.addView(TextView(this).apply{text="DELIVERY PARTNER";textSize=10f;letterSpacing=2f;setTextColor(Color.rgb(225,202,151))})
  brand.addView(brandText);hero.addView(brand)
  hero.addView(TextView(this).apply{text=title;textSize=27f;setTextColor(Color.WHITE);setTypeface(null,Typeface.BOLD);setPadding(0,18,0,3)})
  hero.addView(TextView(this).apply{text="Every order. Every mile. With care.";textSize=12f;setTextColor(Color.rgb(214,229,217))})
  root.addView(hero,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=14})
  val sc=LinearLayout(this).apply{orientation=1;setPadding(15,12,15,12);background=rounded(Color.WHITE,18f);elevation=3f}
  status=TextView(this).apply{text="●  Connected to delivery system";textSize=13f;setTextColor(ink)}
  sc.addView(status);root.addView(sc,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=12})
  shell.addView(ScrollView(this).apply{isFillViewport=true;addView(root)},LinearLayout.LayoutParams(-1,0,1f))
  val nav=LinearLayout(this).apply{orientation=0;gravity=android.view.Gravity.CENTER;setPadding(8,7,8,7);setBackgroundColor(forest);visibility=if(token.isNullOrBlank()) android.view.View.GONE else android.view.View.VISIBLE}
  fun navItem(t:String,fn:()->Unit)=TextView(this).apply{text=t;gravity=android.view.Gravity.CENTER;textSize=14f;setTextColor(Color.WHITE);setTypeface(null,Typeface.BOLD);setPadding(8,13,8,13);setOnClickListener{fn()}}
  nav.addView(navItem("⌂  Home"){home()},LinearLayout.LayoutParams(0,-2,1f))
  nav.addView(navItem("▤  Orders"){orderFilter="active";orders()},LinearLayout.LayoutParams(0,-2,1f))
  nav.addView(navItem("●  Profile"){profile()},LinearLayout.LayoutParams(0,-2,1f))
  shell.addView(nav,LinearLayout.LayoutParams(-1,-2));setContentView(shell)
 }
 private fun label(s:String,size:Float=14f)=TextView(this).apply { text=s; textSize=size; setTextColor(ink); setPadding(0,7,0,7) }
 private fun button(s:String,action:()->Unit)=Button(this).apply {
  text=s; isAllCaps=false; textSize=13f; typeface=Typeface.create("sans-serif-medium",Typeface.BOLD)
  setTextColor(Color.WHITE)
  background=android.graphics.drawable.GradientDrawable(android.graphics.drawable.GradientDrawable.Orientation.LEFT_RIGHT,intArrayOf(Color.rgb(24,83,56),Color.rgb(9,48,33))).apply{cornerRadius=16f;setStroke(1,Color.argb(90,224,194,133))}
  minHeight=52; setPadding(18,10,18,10); elevation=5f
  setOnClickListener { action() }
 }
 private fun field(s:String,secret:Boolean=false)=EditText(this).apply {
  hint=s;setSingleLine(true);textSize=14f;setTextColor(ink);setHintTextColor(Color.rgb(125,139,129))
  setPadding(16,14,16,14);background=android.graphics.drawable.GradientDrawable().apply{setColor(Color.rgb(248,250,247));cornerRadius=15f;setStroke(1,Color.rgb(219,228,220))}
  if(secret)inputType=129
 }
 private fun login() {
  setup("Welcome, Rider")
  val panel=LinearLayout(this).apply{orientation=1;setPadding(19,20,19,20);background=android.graphics.drawable.GradientDrawable().apply{setColor(Color.argb(245,255,255,255));cornerRadius=25f;setStroke(1,Color.rgb(220,229,220))};elevation=8f}
  panel.addView(TextView(this).apply{text="Sign in to your shift";textSize=21f;setTextColor(ink);setTypeface(null,Typeface.BOLD);setPadding(0,0,0,5)})
  panel.addView(TextView(this).apply{text="Use the secure rider account provided by the restaurant owner.";textSize=12f;setTextColor(Color.rgb(105,119,109));setPadding(0,0,0,17)})
  val email=field("Email address");email.inputType=33
  val pass=field("Password",true)
  panel.addView(email,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=11})
  panel.addView(pass,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=17})
  panel.addView(button("Sign in securely  →") {
   val e=email.text.toString().trim();val p=pass.text.toString()
   if(e.isBlank()||p.isBlank()){status.text="●  Email and password required.";return@button}
   status.text="●  Signing in…"
   worker.execute{try{
    val response=request(base+"/auth/v1/token?grant_type=password","POST",JSONObject().put("email",e).put("password",p).toString(),null)
    val t=response.optString("access_token");if(t.isBlank())throw Exception("No access token returned")
    saveSession(t,response.optString("refresh_token"));runOnUiThread{orders()}
   }catch(ex:Exception){runOnUiThread{status.text="●  "+message(ex)}}}
  })
  root.addView(panel,LinearLayout.LayoutParams(-1,-2).apply{topMargin=3;bottomMargin=14})
  root.addView(TextView(this).apply{text="SECURE RIDER ACCESS  •  HURMAT DARBAR";textSize=9f;letterSpacing=1.2f;gravity=android.view.Gravity.CENTER;setTextColor(Color.rgb(230,221,194));setPadding(4,13,4,8)})
 }
 private fun startPolling() {
  if(polling)return
  polling=true
  pollHandler.postDelayed(pollTask,20000L)
 }
 private fun stopPolling() {
  polling=false
  pollHandler.removeCallbacks(pollTask)
 }
 private fun home() {
  currentScreen="home"
  setup("My Deliveries")
  val card=LinearLayout(this).apply{orientation=1;setPadding(16,16,16,16);background=rounded(Color.WHITE,20f);elevation=3f}
  card.addView(label(if(online)"You are online" else "You are offline",19f))
  card.addView(label(if(online)"Ready to receive delivery requests" else "Go online to receive new pickup requests",12f))
  card.addView(button(if(online)"Go Offline" else "Go Online"){availability(!online)})
  root.addView(card,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=14})
  root.addView(label("YOUR DELIVERIES",12f))
  listOf("Available to pick" to "available","Pending orders" to "pending","Active deliveries" to "active","Delivery history" to "history","All assigned orders" to "all").forEach{(t,f)->root.addView(button(t+"  →"){orderFilter=f;orders()},LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=9})}
  root.addView(button("Refresh orders"){orderFilter="active";orders()})
 }
 private fun orders() {
  currentScreen="orders"
  startPolling();setup("Orders")
  root.addView(button(if(online)"Go Offline" else "Go Online"){availability(!online)},LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=10})
  listOf("Available" to "available","Pending" to "pending","Active" to "active","History" to "history","All" to "all").forEach{(t,f)->root.addView(button((if(orderFilter==f)"✓  " else "")+t){orderFilter=f;orders()},LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=6})}
  root.addView(button("Refresh"){orders()},LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=8})
  status.text=if(orderFilter=="available")"Finding pickup-ready orders…" else "Loading assigned orders…"
  worker.execute{try{
   val self=request(base+"/functions/v1/restaurant-api?view=rider_self","GET",null,token);online=self.optBoolean("is_online",false)
   if(online)request(base+"/functions/v1/restaurant-api","POST",JSONObject().put("action","set_rider_availability").put("is_online",true).toString(),token)
   val endpoint=if(orderFilter=="available")base+"/functions/v1/restaurant-api?view=available_orders" else base+"/functions/v1/restaurant-api"
   val rows=request(endpoint,"GET",null,token).optJSONArray("orders")?:JSONArray()
   val loaded=(0 until rows.length()).mapNotNull{rows.optJSONObject(it)}
   val ids=loaded.map{it.optString("id")}.filter{it.isNotBlank()}
   val newly=if(orderFilter=="available"||firstOrdersLoad){if(orderFilter!="available"){firstOrdersLoad=false;knownOrderIds.addAll(ids)};emptyList()}else loaded.filter{!knownOrderIds.contains(it.optString("id"))}
   if(orderFilter!="available")knownOrderIds.addAll(ids)
   if(newly.isNotEmpty())runOnUiThread{Toast.makeText(this,"New delivery assigned: "+newly.take(3).joinToString(", "){"#"+it.optString("order_no")},Toast.LENGTH_LONG).show()}
   runOnUiThread{
    if(orderFilter=="available"){
     status.text=if(!online)"You are offline. Go online to see pickup requests." else loaded.size.toString()+" pickup-ready order(s) available"
     if(!online||loaded.isEmpty())root.addView(label(if(!online)"Switch to Online to receive available orders." else "No unassigned pickup-ready orders right now."))
     loaded.forEach{renderAvailable(it)};return@runOnUiThread
    }
    val pending=setOf("pending_confirmation","confirmed","preparing");val active=setOf("ready_for_pickup","picked_up","out_for_delivery");val history=setOf("delivered","delivery_failed","cancelled","rejected")
    val filtered=loaded.filter{o->when(orderFilter){"pending"->o.optString("status") in pending;"history"->o.optString("status") in history;"all"->true;else->o.optString("status") in active}}
    status.text=filtered.size.toString()+" order(s) • "+when(orderFilter){"pending"->"Pending";"history"->"History";"all"->"All assigned";else->"Active"}
    if(filtered.isEmpty())root.addView(label(when(orderFilter){"pending"->"No pending orders.";"history"->"No completed or failed deliveries in your history.";"all"->"No assigned deliveries. Wait for the manager to assign an order.";else->"No active deliveries right now."}))
    filtered.forEach{render(it)}
   }
  }catch(ex:Exception){runOnUiThread{status.text=message(ex)}}}
 }
 private fun profile() {
  currentScreen="profile"
  setup("My Profile");status.text="Loading your rider profile…"
  worker.execute{try{
   val self=request(base+"/functions/v1/restaurant-api?view=rider_self","GET",null,token);online=self.optBoolean("is_online",false)
   runOnUiThread{
    val card=LinearLayout(this).apply{orientation=1;setPadding(18,18,18,18);background=rounded(Color.WHITE,22f);elevation=4f}
    card.addView(label(self.optString("name","Delivery Partner"),23f));card.addView(label(self.optString("phone","Phone not added"),15f))
    card.addView(label("Rider account: Active",13f));card.addView(label(if(online)"Availability: Online" else "Availability: Offline",13f))
    card.addView(label("Last active: "+self.optString("last_seen","Not available"),11f))
    root.addView(card,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=14})
    root.addView(button(if(online)"Go Offline" else "Go Online"){availability(!online)},LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=9})
    root.addView(button("Refresh profile"){profile()},LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=9})
    root.addView(button("Sign Out"){signOutRider()});status.text="Profile loaded from delivery system."
   }
  }catch(ex:Exception){runOnUiThread{status.text=message(ex)}}}
 }
 private fun renderAvailable(o:JSONObject) {
  val card=LinearLayout(this).apply{orientation=1;setPadding(16,14,16,14);background=android.graphics.drawable.GradientDrawable().apply{setColor(Color.argb(246,255,255,255));cornerRadius=23f;setStroke(1,Color.rgb(222,231,223))};elevation=7f}
  val id=o.optString("id")
  card.addView(label("✦  NEW PICKUP REQUEST",10f))
  card.addView(label("ORDER #"+o.optString("order_no"),20f))
  card.addView(label(o.optString("customer_name")+"\n"+o.optString("address_text")))
  card.addView(label("Total: ₹"+o.optInt("total")+"  ·  "+o.optString("payment_method")))
  val items=o.optJSONArray("order_items")?:JSONArray()
  for(i in 0 until items.length()){val it=items.optJSONObject(i)?:continue;card.addView(label(it.optString("item_name")+" × "+it.optInt("qty"),13f))}
  card.addView(button("Accept delivery"){claimOrder(id)})
  root.addView(card,LinearLayout.LayoutParams(-1,-2).apply{topMargin=10;bottomMargin=4})
 }
 private fun claimOrder(id:String) {
  status.text="Accepting order…"
  worker.execute { try {
   request(base+"/functions/v1/restaurant-api","POST",JSONObject().put("action","claim_delivery_order").put("order_id",id).toString(),token)
   runOnUiThread { Toast.makeText(this,"Order accepted. It is now assigned to you.",Toast.LENGTH_LONG).show();orderFilter="active";orders() }
  } catch(ex:Exception){runOnUiThread{status.text=message(ex)}}
  }
 }
 private fun render(o:JSONObject) {
  val card=LinearLayout(this).apply{orientation=1;setPadding(16,14,16,14);background=android.graphics.drawable.GradientDrawable().apply{setColor(Color.argb(246,255,255,255));cornerRadius=23f;setStroke(1,Color.rgb(222,231,223))};elevation=7f}
  val id=o.optString("id"); val state=o.optString("status")
  val stageLabel=when(state){"pending_confirmation"->"Waiting for restaurant confirmation";"confirmed"->"Confirmed • waiting for kitchen";"preparing"->"Kitchen is preparing";"ready_for_pickup"->"Ready for pickup";"picked_up"->"Picked up";"out_for_delivery"->"Out for delivery";"delivered"->"Delivered";"delivery_failed"->"Delivery failed";"cancelled"->"Cancelled";"rejected"->"Rejected";else->state.replace('_',' ')}
  card.addView(label("HURMAT DELIVERY  •  ACTIVE ORDER",9f))
  card.addView(label("Order #"+o.optString("order_no"),21f))
  card.addView(label("●  "+stageLabel,12f))
  card.addView(label(o.optString("customer_name")+" • "+o.optString("customer_phone")))
  card.addView(label(o.optString("address_text")))
  card.addView(label("Payment: "+o.optString("payment_method")+" ("+o.optString("payment_status")+")"))
  card.addView(label("Total: ₹"+o.optInt("total")))
  val items=o.optJSONArray("order_items")?:JSONArray()
  for(i in 0 until items.length()){val it=items.optJSONObject(i)?:continue;card.addView(label("• "+it.optString("item_name")+" — "+it.optString("variant_label")+" × "+it.optInt("qty"),13f))}
  val lat=o.optDouble("lat",Double.NaN);val lng=o.optDouble("lng",Double.NaN)
  if(lat.isFinite()&&lng.isFinite()) card.addView(button("Navigate to customer"){
   val uri=Uri.parse("google.navigation:q="+lat+","+lng)
   try{startActivity(Intent(Intent.ACTION_VIEW,uri).setPackage("com.google.android.apps.maps"))}
   catch(_:Exception){startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://www.google.com/maps/dir/?api=1&destination="+lat+","+lng)))}
  })
  if(state=="picked_up" || state=="out_for_delivery") {
   card.addView(button(if(sharingOrderId==id) "Stop location sharing" else "Share live location") {
    if(sharingOrderId==id) stopLocationSharing() else startLocationSharing(id)
   })
  }
  val next=when(state){"ready_for_pickup"->"picked_up";"picked_up"->"out_for_delivery";else->null}
  if(next!=null) card.addView(button(next.replace('_',' ').uppercase()){update(id,next,null)})
  if(state=="delivered" && o.optString("payment_method")=="cod" && o.optString("payment_status")=="cod_pending") card.addView(button("Record COD cash collected"){recordCash(id)})
  if(state=="out_for_delivery") card.addView(button("Verify customer code & complete delivery"){
   val code=EditText(this).apply{hint="Enter the 8-character customer code";setSingleLine(true);filters=arrayOf(android.text.InputFilter.LengthFilter(8));}
   android.app.AlertDialog.Builder(this).setTitle("Confirm delivery").setMessage("Ask the customer to open My Orders and show their delivery verification code.").setView(code).setNegativeButton("Back",null)
    .setPositiveButton("Verify & mark delivered"){_,_->val value=code.text.toString().trim().uppercase();if(value.length!=8)status.text="Enter the complete 8-character code." else verifyDelivery(id,value)}.show()
  })
  if(state=="out_for_delivery") card.addView(button("Report delivery failed"){
   val reason=EditText(this).apply{hint="Reason required";setSingleLine(true)}
   android.app.AlertDialog.Builder(this).setTitle("Delivery failed").setView(reason).setNegativeButton("Back",null)
    .setPositiveButton("Submit"){_,_->val r=reason.text.toString().trim();if(r.isBlank())status.text="Reason is required." else update(id,"delivery_failed",r)}.show()
  })
  root.addView(card,LinearLayout.LayoutParams(-1,-2).apply{topMargin=10;bottomMargin=4})
 }

 private fun startLocationSharing(orderId:String) {
  if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED &&
     checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED) {
   sharingOrderId=orderId
   requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION),7101)
   status.text="Allow location permission to start background sharing."
   return
  }
  if(android.os.Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){sharingOrderId=orderId;requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),7102);status.text="Allow notifications for visible live-location sharing.";return}
  val accessToken=token
  if(accessToken.isNullOrBlank()){status.text="Sign in again before sharing location.";return}
  try {
   val intent=Intent(this,RiderLocationService::class.java)
    .putExtra(RiderLocationService.EXTRA_ORDER_ID,orderId)
    .putExtra(RiderLocationService.EXTRA_ACCESS_TOKEN,accessToken)
    .putExtra(RiderLocationService.EXTRA_REFRESH_TOKEN,refreshToken)
   if(android.os.Build.VERSION.SDK_INT>=26)startForegroundService(intent) else startService(intent)
   sharingOrderId=orderId
   status.text="Live location is sharing in the background for this delivery."
   orders()
  } catch(ex:Exception) { status.text="Unable to start live location: "+(ex.message?: "try again") }
 }
 private fun stopLocationSharing() {
  stopService(Intent(this,RiderLocationService::class.java))
  sharingOrderId=null
  status.text="Location sharing stopped."
 }
 override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray) {
  super.onRequestPermissionsResult(requestCode,permissions,grantResults)
  if(requestCode==7101 || requestCode==7102) {
   val orderId=sharingOrderId
   if(grantResults.any { it==PackageManager.PERMISSION_GRANTED } && orderId!=null) startLocationSharing(orderId)
   else { sharingOrderId=null; status.text="Required permission denied; location sharing is off." }
  }
 }
 private fun signOutRider(){
  status.text="Signing out securely…"
  stopPolling()
  worker.execute{
   try{
    val current=token
    if(!current.isNullOrBlank()) request(base+"/functions/v1/restaurant-api","POST",JSONObject().put("action","set_rider_availability").put("is_online",false).toString(),current)
   }catch(_:Exception){}
   runOnUiThread{
    stopLocationSharing();clearSession();online=false;knownOrderIds.clear();firstOrdersLoad=true;login()
   }
  }
 }
 private fun recordCash(id:String){
  status.text="Recording COD collection…"
  worker.execute{try{
   request(base+"/functions/v1/restaurant-api","POST",JSONObject().put("action","record_cod_cash").put("order_id",id).toString(),token)
   runOnUiThread{Toast.makeText(this,"COD collection recorded. Hand the cash to the owner.",Toast.LENGTH_LONG).show();orders()}
  }catch(ex:Exception){runOnUiThread{status.text=message(ex)}}}
 }
 private fun availability(value:Boolean){
  status.text="Updating availability…"
  worker.execute{try{request(base+"/functions/v1/restaurant-api","POST",JSONObject().put("action","set_rider_availability").put("is_online",value).toString(),token);online=value;runOnUiThread{when(currentScreen){"home"->home();"profile"->profile();else->orders()}}}
   catch(ex:Exception){runOnUiThread{status.text=message(ex)}}}
 }
 private fun verifyDelivery(id:String,code:String){
  status.text="Verifying customer delivery code…"
  worker.execute{try{
   val payload=JSONObject().put("action","verify_delivery_code").put("order_id",id).put("code",code)
   request(base+"/functions/v1/restaurant-api","POST",payload.toString(),token)
   runOnUiThread{stopLocationSharing();Toast.makeText(this,"Delivery verified and completed.",Toast.LENGTH_LONG).show();orders()}
  }catch(ex:Exception){runOnUiThread{status.text=message(ex)}}
  }
 }
 private fun update(id:String,next:String,reason:String?){
  status.text="Updating order…"
  worker.execute{try{val b=JSONObject().put("action","update_order_status").put("order_id",id).put("status",next);if(reason!=null)b.put("reason",reason)
   request(base+"/functions/v1/restaurant-api","POST",b.toString(),token);runOnUiThread{if(next=="picked_up")startLocationSharing(id);if(next=="delivery_failed"||next=="delivered")stopLocationSharing();orders()}}
   catch(ex:Exception){runOnUiThread{status.text=message(ex)}}}
 }
 private fun request(url:String,method:String,body:String?,bearer:String?):JSONObject{
  val c=URL(url).openConnection() as HttpURLConnection;c.requestMethod=method;c.connectTimeout=15000;c.readTimeout=20000
  c.setRequestProperty("apikey",apiKey);c.setRequestProperty("Accept","application/json")
  if(bearer!=null)c.setRequestProperty("Authorization","Bearer "+bearer)
  if(body!=null){c.doOutput=true;c.setRequestProperty("Content-Type","application/json")}
  try{if(body!=null)OutputStreamWriter(c.outputStream,Charsets.UTF_8).use{it.write(body)}
   val code=c.responseCode;val stream=if(code in 200..299)c.inputStream else c.errorStream
   val raw=stream?.bufferedReader()?.use{it.readText()}?:"{}";val json=try{JSONObject(raw)}catch(_:Exception){JSONObject()}
   if(code !in 200..299)throw Exception(json.optString("error","HTTP "+code));return json
  }finally{c.disconnect()}
 }
 private fun message(ex:Exception):String{val m=ex.message?:"Request failed";return when{
  m.contains("401")||m.contains("invalid_session")->"Session expired. Sign in again."
  m.contains("403")||m.contains("forbidden")->"This account is not an active authorized rider."
  m.contains("riders")||m.contains("availability")->"Rider profile missing or unavailable. Ask owner to register this rider."
  else->m.take(180)
 }}
 override fun onDestroy(){stopPolling();worker.shutdownNow();super.onDestroy()}
}
