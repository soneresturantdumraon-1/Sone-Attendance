/* Service worker for staff.html: network first, saved copy when offline. Never touches Supabase calls. */
const CACHE='staff-v1',SHELL=['./staff.html','./manifest-staff.json','./staff-192.png','./staff-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('staff-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(fetch(r).then(res=>{if(res&&res.ok&&res.type==='basic'){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp)).catch(()=>{})}return res})
    .catch(()=>caches.match(r,{ignoreSearch:true}).then(x=>x||(r.mode==='navigate'?caches.match('./staff.html',{ignoreSearch:true}):Response.error()))));
});

/* ---- Web Push: notification when the app is closed ---- */
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{}}catch(_){d={body:e.data?e.data.text():''}}
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{
    const vis=cs.filter(c=>c.visibilityState==='visible');
    if(vis.length){vis.forEach(c=>c.postMessage({type:'push-refresh'}));return} /* app open: refresh now, in-app banner handles it */
    return self.registration.showNotification(d.title||'SONE RESTAURANT',{body:d.body||'',icon:d.icon||undefined,tag:d.tag||undefined,renotify:true,silent:false,vibrate:[200,100,200],data:{url:d.url||''}});
  }));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const u=(e.notification.data&&e.notification.data.url)||'';
  const norm=x=>new URL(x,self.registration.scope).pathname.replace(/index\.html$/,'');
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{
    const hit=u?cs.find(c=>norm(c.url)===norm(u)):cs[0];
    if(hit&&'focus' in hit)return hit.focus();
    return self.clients.openWindow(u||'./staff.html');
  }));
});
