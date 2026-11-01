/* Kerja Sendiri | Shared session sync V1 (owner single login).
 * Problem fixed: Supabase rotates the refresh token on every refresh and revokes the WHOLE session when an
 * already-rotated token is reused. The dashboard kept its refresh token only in memory, so after the AI
 * Command Center (same tab after Back/bfcache, or a second tab) rotated it, the dashboard's next refresh
 * reused the stale token and the owner was logged out everywhere.
 * Fix: before any refresh the dashboard adopts the newest token of this tab (sessionStorage rc4.sess), and
 * every page announces rotations/logout to other open tabs of this origin with BroadcastChannel.
 * Nothing is written to localStorage, cookies, URLs or logs. Backend checks (ai_is_owner, admin) are unchanged.
 */
(function(){
'use strict';
if(window.ksSessionSync)return;
var KEY='rc4.sess',ch=null,listeners=[],last=null;
try{ch=new BroadcastChannel('ks-session-v1')}catch(_){ch=null}
function read(){try{var d=JSON.parse(sessionStorage.getItem(KEY)||'null');return d&&typeof d.r==='string'&&d.r.length?d.r:null}catch(_){return null}}
function write(r){try{sessionStorage.setItem(KEY,JSON.stringify({r:r}))}catch(_){}}
function clear(){try{sessionStorage.removeItem(KEY)}catch(_){}}
function post(m){if(ch)try{ch.postMessage(m)}catch(_){}}
var api={
 read:read,
 rotated:function(r){if(typeof r!=='string'||!r||r===last)return;last=r;write(r);post({t:'rotated',r:r})},
 loggedOut:function(){last=null;clear();post({t:'logout'})},
 on:function(fn){listeners.push(fn)}
};
if(ch)ch.onmessage=function(e){
 var m=e&&e.data;if(!m||typeof m!=='object')return;
 if(m.t==='rotated'&&typeof m.r==='string'&&m.r.length&&m.r.length<4096){
  if(!read())return;           // a signed-out tab never gains a session from another tab
  last=m.r;write(m.r);
 }else if(m.t==='logout'){last=null;clear()}
 else return;
 listeners.forEach(function(fn){try{fn(m)}catch(_){}});
};
window.ksSessionSync=api;

// ---- dashboard integration (index.html + platform.js + rc4.js). Absent on other pages.
if(typeof state==='undefined'||typeof access!=='function')return;
var desc=Object.getOwnPropertyDescriptor(state,'session');
if(desc&&desc.set&&desc.get){
 Object.defineProperty(state,'session',{configurable:true,enumerable:true,get:desc.get,set:function(v){desc.set.call(state,v);if(v&&v.refresh_token)api.rotated(v.refresh_token)}});
}
var prevAccess=access;
access=async function(){
 // Adopt the newest refresh token of this tab before Supabase is asked for a new access token.
 var s=state.session,r=read();
 if(s&&r&&r!==s.refresh_token)state.session=Object.assign({},s,{refresh_token:r,expires_at:0});
 return prevAccess.apply(this,arguments);
};
api.on(function(m){
 if(m.t==='rotated'&&state.session&&state.session.refresh_token!==m.r)state.session=Object.assign({},state.session,{refresh_token:m.r,expires_at:0});
 if(m.t==='logout'&&state.session&&typeof clearSession==='function')clearSession();
});
var lo=document.getElementById('logout');
if(lo)lo.addEventListener('click',function(){api.loggedOut()},true);
// Page restored from the back/forward cache: memory may hold a token that another page already rotated.
window.addEventListener('pageshow',function(e){
 if(!e.persisted||!state.session)return;
 var r=read();if(!r){if(typeof clearSession==='function')clearSession();return}
 if(r!==state.session.refresh_token)state.session=Object.assign({},state.session,{refresh_token:r,expires_at:0});
});
})();
