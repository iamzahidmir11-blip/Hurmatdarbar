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
   if(!isFinishing && hasWindowFocus()) orders()
   pollHandler.postDelayed(this,20000L)
  }
 }
 private var token:String?=null
 private var refreshToken:String?=null
 private var online=false
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
  window.statusBarColor=Color.rgb(7,35,25); window.navigationBarColor=Color.rgb(7,35,25)
  root=LinearLayout(this).apply {
   orientation=1; setPadding(18,22,18,32)
   background=android.graphics.drawable.GradientDrawable(android.graphics.drawable.GradientDrawable.Orientation.TOP_BOTTOM,intArrayOf(Color.rgb(7,39,28),Color.rgb(16,62,43),Color.rgb(235,239,231))).apply{cornerRadius=0f}
  }
  val hero=LinearLayout(this).apply {
   orientation=1; gravity=android.view.Gravity.CENTER; setPadding(22,24,22,23)
   background=android.graphics.drawable.GradientDrawable(android.graphics.drawable.GradientDrawable.Orientation.TL_BR,intArrayOf(Color.rgb(17,75,51),Color.rgb(7,37,27))).apply{cornerRadius=30f;setStroke(1,Color.argb(100,226,199,139))}
   elevation=12f
  }
  val brandRow=LinearLayout(this).apply{orientation=0;gravity=android.view.Gravity.CENTER_VERTICAL}
  val mark=ImageView(this).apply{setImageResource(com.hurmatdarbar.delivery.R.drawable.ic_hurmat_delivery);scaleType=ImageView.ScaleType.FIT_CENTER}
  brandRow.addView(mark,LinearLayout.LayoutParams(58,58).apply{rightMargin=13})
  val brandText=LinearLayout(this).apply{orientation=1}
  brandText.addView(TextView(this).apply{text="HURMAT DARBAR";textSize=17f;letterSpacing=1.2f;setTextColor(Color.WHITE);setTypeface(null,Typeface.BOLD)})
  brandText.addView(TextView(this).apply{text="DELIVERY PARTNER";textSize=9f;letterSpacing=2f;setTextColor(Color.rgb(225,202,151));setPadding(0,5,0,0)})
  brandRow.addView(brandText);hero.addView(brandRow)
  hero.addView(TextView(this).apply{text=title;textSize=28f;setTextColor(Color.WHITE);setTypeface(null,Typeface.BOLD);setPadding(0,22,0,5);gravity=android.view.Gravity.CENTER})
  hero.addView(TextView(this).apply{text="Every order. Every mile. With care.";textSize=12f;setTextColor(Color.rgb(214,229,217));gravity=android.view.Gravity.CENTER})
  root.addView(hero,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=17})
  val statusCard=LinearLayout(this).apply{orientation=1;setPadding(16,12,16,12);background=android.graphics.drawable.GradientDrawable().apply{setColor(Color.argb(232,255,255,255));cornerRadius=18f;setStroke(1,Color.argb(90,255,255,255))};elevation=5f}
  status=TextView(this).apply{text="●  Connecting to delivery system…";textSize=12f;setTextColor(ink);setPadding(2,2,2,2)}
  statusCard.addView(status);root.addView(statusCard,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=12})
  setContentView(ScrollView(this).apply{isFillViewport=true;addView(root)})
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
 private fun orders() {
  startPolling()
  setup("My Deliveries")
  root.addView(button(if(online) "Go Offline" else "Go Online"){availability(!online)})
  root.addView(button("Available to pick"){orderFilter="available";orders()})
  root.addView(button("Pending orders"){orderFilter="pending";orders()})
  root.addView(button("Active deliveries"){orderFilter="active";orders()})
  root.addView(button("Delivery history"){orderFilter="history";orders()})
  root.addView(button("All assigned orders"){orderFilter="all";orders()})
  root.addView(button("Refresh"){orders()})
  root.addView(button("Sign Out"){signOutRider()})
  status.text=if(orderFilter=="available") "Finding pickup-ready orders…" else "Loading assigned orders…"
  worker.execute { try {
   val self=request(base+"/functions/v1/restaurant-api?view=rider_self","GET",null,token)
   online=self.optBoolean("is_online",false)
   if(online) request(base+"/functions/v1/restaurant-api","POST",JSONObject().put("action","set_rider_availability").put("is_online",true).toString(),token)
   val endpoint=if(orderFilter=="available") base+"/functions/v1/restaurant-api?view=available_orders" else base+"/functions/v1/restaurant-api"
   val rows=request(endpoint,"GET",null,token).optJSONArray("orders")?:JSONArray()
   val loaded=(0 until rows.length()).mapNotNull { rows.optJSONObject(it) }
   val ids=loaded.map { it.optString("id") }.filter { it.isNotBlank() }
   val newlyAssigned=if(orderFilter=="available"||firstOrdersLoad){if(orderFilter!="available"){firstOrdersLoad=false;knownOrderIds.addAll(ids)};emptyList()}else loaded.filter { !knownOrderIds.contains(it.optString("id")) }
   if(orderFilter!="available")knownOrderIds.addAll(ids)
   if(newlyAssigned.isNotEmpty()) runOnUiThread {
    val numbers=newlyAssigned.take(3).joinToString(", ") { "#"+it.optString("order_no") }
    Toast.makeText(this,"New delivery assigned: "+numbers,Toast.LENGTH_LONG).show()
   }
   runOnUiThread {
    if(orderFilter=="available"){
     status.text=if(!online) "You are offline. Go online to see pickup requests." else loaded.size.toString()+" pickup-ready order(s) available"
     if(!online||loaded.isEmpty())root.addView(label(if(!online)"Switch to Online to receive available orders." else "No unassigned pickup-ready orders right now."))
     loaded.forEach { renderAvailable(it) }
     return@runOnUiThread
    }
    val pending=setOf("pending_confirmation","confirmed","preparing")
    val active=setOf("ready_for_pickup","picked_up","out_for_delivery")
    val history=setOf("delivered","delivery_failed","cancelled","rejected")
    val filtered=(0 until rows.length()).mapNotNull { rows.optJSONObject(it) }.filter { order ->
     val s=order.optString("status")
     when(orderFilter) { "pending"->s in pending; "history"->s in history; "all"->true; else->s in active }
    }
    status.text=filtered.size.toString()+" order(s) • "+when(orderFilter){"pending"->"Pending";"history"->"History";"all"->"All assigned";else->"Active"}
    if(filtered.isEmpty()) root.addView(label(when(orderFilter){"pending"->"No pending orders. New assigned orders waiting for restaurant confirmation or preparation will appear here.";"history"->"No completed or failed deliveries in your history.";"all"->"No assigned deliveries. Wait for the manager to assign an order.";else->"No pickup-ready or ongoing deliveries right now. Check Pending orders for earlier stages."}))
    filtered.forEach { render(it) }
   }
  } catch(ex:Exception){runOnUiThread{status.text=message(ex)}} }
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
  worker.execute{try{request(base+"/functions/v1/restaurant-api","POST",JSONObject().put("action","set_rider_availability").put("is_online",value).toString(),token);online=value;runOnUiThread{orders()}}
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
