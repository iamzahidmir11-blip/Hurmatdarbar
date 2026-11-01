const CACHE="hurmat-owner-shell-v7";
const CORE=["./index.html","../admin.js?v=payments-owner-20261031-4","../icon.svg","./manifest.webmanifest"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));self.skipWaiting()});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener("push",event=>{let payload={title:"Hurmat Darbar alert",body:"A new restaurant update is available.",url:"./"};try{if(event.data)payload={...payload,...event.data.json()}}catch{}event.waitUntil(self.registration.showNotification(payload.title,{body:payload.body,icon:"../assets/hurmat-logo-repo.png",badge:"../assets/hurmat-logo-repo.png",data:{url:payload.url||"./"},tag:payload.tag||"hurmat-owner-alert",renotify:false}));});self.addEventListener("notificationclick",event=>{event.notification.close();const target=new URL(event.notification.data?.url||"./",self.registration.scope).href;event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{for(const client of list){if(client.url.startsWith(self.registration.scope)&&"focus" in client)return client.focus()}return clients.openWindow(target)}));});self.addEventListener("fetch",event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=="GET"||url.origin!==self.location.origin)return;
 if(url.pathname.includes("/functions/")||url.pathname.includes("/rest/"))return;
 if(request.mode==="navigate"){
  event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put("./index.html",copy))}return response}).catch(()=>caches.match("./index.html")));
  return;
 }
 event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy))}return response}).catch(()=>caches.match(request)));
});