package com.hurmatdarbar.delivery
import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.graphics.Color
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
 private val ink=Color.rgb(33,31,24); private val gold=Color.rgb(181,138,75); private val paper=Color.rgb(245,241,232)
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
 private fun setup(title:String) {
  root=LinearLayout(this).apply { orientation=1; setPadding(22,24,22,24); setBackgroundColor(paper) }
  root.addView(TextView(this).apply { text="H U R M A T   D A R B A R"; textSize=13f; setTextColor(gold) })
  root.addView(TextView(this).apply { text=title; textSize=27f; setTextColor(ink); setPadding(0,12,0,10) })
  status=TextView(this).apply { text="Ready"; textSize=13f; setTextColor(Color.DKGRAY); setPadding(0,4,0,12) }; root.addView(status)
  setContentView(ScrollView(this).apply { addView(root) })
 }
 private fun label(s:String,size:Float=14f)=TextView(this).apply { text=s; textSize=size; setTextColor(ink); setPadding(0,6,0,6) }
 private fun button(s:String,action:()->Unit)=Button(this).apply { text=s; isAllCaps=false; setOnClickListener { action() } }
 private fun field(s:String,secret:Boolean=false)=EditText(this).apply { hint=s; setSingleLine(true); if(secret) inputType=129 }
 private fun login() {
  setup("Rider Sign In")
  root.addView(label("Use the rider account created by the restaurant owner."))
  val email=field("Email address"); email.inputType=33
  val pass=field("Password",true); root.addView(email); root.addView(pass)
  root.addView(button("Sign in") {
   val e=email.text.toString().trim(); val p=pass.text.toString()
   if(e.isBlank()||p.isBlank()){status.text="Email and password required.";return@button}
   status.text="Signing in…"
   worker.execute { try {
    val s=request(base+"/auth/v1/token?grant_type=password","POST",JSONObject().put("email",e).put("password",p).toString(),null)
    val t=s.optString("access_token"); if(t.isBlank()) throw Exception("No access token returned")
    saveSession(t,s.optString("refresh_token")); runOnUiThread { orders() }
   } catch(ex:Exception){runOnUiThread{status.text=message(ex)}} }
  })
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
  root.addView(button("Pending orders"){orderFilter="pending";orders()})
  root.addView(button("Active deliveries"){orderFilter="active";orders()})
  root.addView(button("Delivery history"){orderFilter="history";orders()})
  root.addView(button("All assigned orders"){orderFilter="all";orders()})
  root.addView(button("Refresh"){orders()})
  root.addView(button("Sign Out"){stopPolling();stopLocationSharing();clearSession();online=false;knownOrderIds.clear();firstOrdersLoad=true;login()})
  status.text="Loading assigned orders…"
  worker.execute { try {
   val self=request(base+"/functions/v1/restaurant-api?view=rider_self","GET",null,token)
   online=self.optBoolean("is_online",false)
   val rows=request(base+"/functions/v1/restaurant-api","GET",null,token).optJSONArray("orders")?:JSONArray()
   val loaded=(0 until rows.length()).mapNotNull { rows.optJSONObject(it) }
   val ids=loaded.map { it.optString("id") }.filter { it.isNotBlank() }
   val newlyAssigned=if(firstOrdersLoad){firstOrdersLoad=false;knownOrderIds.addAll(ids);emptyList()}else loaded.filter { !knownOrderIds.contains(it.optString("id")) }
   knownOrderIds.addAll(ids)
   if(newlyAssigned.isNotEmpty()) runOnUiThread {
    val numbers=newlyAssigned.take(3).joinToString(", ") { "#"+it.optString("order_no") }
    Toast.makeText(this,"New delivery assigned: "+numbers,Toast.LENGTH_LONG).show()
   }
   runOnUiThread {
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
 private fun render(o:JSONObject) {
  val card=LinearLayout(this).apply{orientation=1;setPadding(14,12,14,12);setBackgroundColor(Color.WHITE)}
  val id=o.optString("id"); val state=o.optString("status")
  val stageLabel=when(state){"pending_confirmation"->"Waiting for restaurant confirmation";"confirmed"->"Confirmed • waiting for kitchen";"preparing"->"Kitchen is preparing";"ready_for_pickup"->"Ready for pickup";"picked_up"->"Picked up";"out_for_delivery"->"Out for delivery";"delivered"->"Delivered";"delivery_failed"->"Delivery failed";"cancelled"->"Cancelled";"rejected"->"Rejected";else->state.replace('_',' ')}
  card.addView(label("Order #"+o.optString("order_no")+" • "+stageLabel,17f))
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
  root.addView(card,LinearLayout.LayoutParams(-1,-2).apply{topMargin=10})
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
   request(base+"/functions/v1/restaurant-api","POST",b.toString(),token);runOnUiThread{if(next=="delivery_failed"||next=="delivered")stopLocationSharing();orders()}}
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
