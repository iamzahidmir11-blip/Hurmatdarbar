package com.hurmatdarbar.delivery

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.Manifest
import android.widget.Toast
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.io.OutputStreamWriter
import java.util.concurrent.Executors

class RiderLocationService : Service() {
 companion object {
  const val EXTRA_ORDER_ID="rider_order_id"
  const val EXTRA_ACCESS_TOKEN="rider_access_token"
  private const val CHANNEL_ID="hurmat_rider_location"
  private const val NOTIFICATION_ID=7102
  private const val BASE_URL="https://rvrboufrnkzuptfjopwd.supabase.co"
  private const val PUBLISHABLE_KEY="sb_publishable_n1PWbHcomKpd63FPDdWSEw_iSo6UTi0"
 }
 private val network=Executors.newSingleThreadExecutor()
 private var manager:LocationManager?=null
 private var listener:LocationListener?=null
 private var orderId:String?=null
 private var accessToken:String?=null

 override fun onCreate() {
  super.onCreate()
  val channel=NotificationChannel(CHANNEL_ID,"Rider live location",NotificationManager.IMPORTANCE_LOW).apply {
   description="Shows when a rider is sharing location for an active delivery."
   setShowBadge(false)
  }
  (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
 }

 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
  if(intent?.action=="STOP") { stopSharing(); return START_NOT_STICKY }
  orderId=intent?.getStringExtra(EXTRA_ORDER_ID) ?: orderId
  accessToken=intent?.getStringExtra(EXTRA_ACCESS_TOKEN) ?: accessToken
  if(orderId.isNullOrBlank()||accessToken.isNullOrBlank()) { stopSelf(); return START_NOT_STICKY }
  val openApp=PendingIntent.getActivity(this,7103,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val notification=if(Build.VERSION.SDK_INT>=26) Notification.Builder(this,CHANNEL_ID)
   .setSmallIcon(android.R.drawable.ic_menu_mylocation)
   .setContentTitle("Hurmat Darbar delivery")
   .setContentText("Sharing live location for an active order")
   .setContentIntent(openApp).setOngoing(true).build()
  else Notification.Builder(this)
   .setSmallIcon(android.R.drawable.ic_menu_mylocation)
   .setContentTitle("Hurmat Darbar delivery")
   .setContentText("Sharing live location for an active order")
   .setContentIntent(openApp).setOngoing(true).build()
  if(Build.VERSION.SDK_INT>=29) startForeground(NOTIFICATION_ID,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
  else startForeground(NOTIFICATION_ID,notification)
  startUpdates()
  return START_NOT_STICKY
 }

 private fun startUpdates() {
  if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED &&
     checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED) {
   stopSharing(); return
  }
  try {
   val lm=getSystemService(Context.LOCATION_SERVICE) as LocationManager
   val provider=if(lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) LocationManager.GPS_PROVIDER else LocationManager.NETWORK_PROVIDER
   val locationListener=object:LocationListener {
    override fun onLocationChanged(location:Location) { postLocation(location) }
    @Deprecated("Deprecated by Android")
    override fun onStatusChanged(provider:String?,status:Int,extras:android.os.Bundle?) {}
    override fun onProviderEnabled(provider:String) {}
    override fun onProviderDisabled(provider:String) {}
   }
   lm.requestLocationUpdates(provider,10000L,10f,locationListener)
   manager=lm; listener=locationListener
   lm.getLastKnownLocation(provider)?.let { postLocation(it) }
  } catch(_:SecurityException) { stopSharing() }
    catch(_:Exception) { stopSharing() }
 }

 private fun postLocation(location:Location) {
  val id=orderId ?: return
  val bearer=accessToken ?: return
  val payload=JSONObject().put("action","post_location").put("order_id",id)
   .put("lat",location.latitude).put("lng",location.longitude).put("accuracy",location.accuracy.toDouble())
  network.execute {
   var connection:HttpURLConnection?=null
   try {
    connection=URL(BASE_URL+"/functions/v1/restaurant-api").openConnection() as HttpURLConnection
    connection.requestMethod="POST";connection.connectTimeout=12000;connection.readTimeout=15000
    connection.setRequestProperty("apikey",PUBLISHABLE_KEY)
    connection.setRequestProperty("Authorization","Bearer "+bearer)
    connection.setRequestProperty("Content-Type","application/json")
    connection.doOutput=true
    OutputStreamWriter(connection.outputStream,Charsets.UTF_8).use { it.write(payload.toString()) }
    val code=connection.responseCode
    if(code==401) stopSelf()
   } catch(_:Exception) {
    // Do not log location, address, phone number or access token.
   } finally { connection?.disconnect() }
  }
 }

 private fun stopSharing() {
  try { if(listener!=null) manager?.removeUpdates(listener!!) } catch(_:Exception) {}
  listener=null;manager=null
  stopForeground(STOP_FOREGROUND_REMOVE)
  stopSelf()
 }

 override fun onDestroy() {
  try { if(listener!=null) manager?.removeUpdates(listener!!) } catch(_:Exception) {}
  network.shutdownNow()
  super.onDestroy()
 }
 override fun onBind(intent:Intent?):IBinder?=null
}