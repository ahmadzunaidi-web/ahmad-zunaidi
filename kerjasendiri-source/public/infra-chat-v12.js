/* Kerja Sendiri Infrastructure Chat V2 read-only • standalone overlay, DeepSeek via owner-gated Supabase. */
(()=>{
'use strict';
if(window.__ksInfraChatV12)return;window.__ksInfraChatV12=true;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const API='/api/supabase/functions/v1/infrastructure-chat';
const stateChat={open:false,busy:false,threads:[],threadId:'',messages:[],input:'',target:'',error:'',drawer:false,inventoryAvailable:null,model:'auto',budget:null,projects:[],projectQuery:'',phase:'',requestId:'',warning:''};
const statusError={AI_ATTEMPT_LIMIT:'Had dua panggilan AI untuk permintaan ini dicapai. Sambung dalam mesej baharu.',AI_DAILY_LIMIT_REACHED:'Had 15 panggilan AI hari ini telah digunakan. Cuba selepas 12 malam waktu Malaysia.',AI_BUDGET_CONFIG_REQUIRED:'Bajet AI tidak dapat disahkan. Hubungi admin.',CHAT_STORAGE_ERROR:'Sejarah chat tidak dapat disimpan. Muat semula sejarah sebelum cuba lagi.',AUDIT_UNAVAILABLE:'Jawapan tersimpan; rekod audit mengalami gangguan.',DEEPSEEK_AUTH_ERROR:'Credential DeepSeek ditolak. Admin perlu semak konfigurasi backend.',OPENAI_AUTH_ERROR:'Credential OpenAI ditolak. Admin perlu semak konfigurasi backend.',DEEPSEEK_RATE_LIMIT:'DeepSeek mencapai had provider. Cuba Auto atau OpenAI.',OPENAI_RATE_LIMIT:'OpenAI mencapai had provider. Cuba kemudian.',OPENAI_UNAVAILABLE:'OpenAI tidak dapat dihubungi. Cuba kemudian.',OPENAI_NOT_CONFIGURED:'OpenAI belum dikonfigurasi.',LOGIN_REQUIRED:'Sila log masuk semula.',UPSTREAM_UNAVAILABLE:'Sambungan backend terganggu. Semak sejarah sebelum cuba lagi.',OWNER_ONLY:'Akses untuk pemilik sahaja.',ADMIN_REQUIRED:'Akaun ini bukan admin.',SESSION_EXPIRED:'Sesi tamat. Log masuk semula.',DAILY_AI_LIMIT:'Had AI harian 15 panggilan telah digunakan.',DEEPSEEK_NOT_CONFIGURED:'DeepSeek API key belum dikonfigurasi.',DEEPSEEK_UNAVAILABLE:'DeepSeek tidak dapat dihubungi sekarang.',THREAD_NOT_FOUND:'Perbualan tidak ditemui.',STORAGE_UNAVAILABLE:'Sejarah chat tidak dapat disimpan.',INVENTORY_UNAVAILABLE:'Scan projek tidak tersedia buat masa ini.'};
const root=()=>document.getElementById('ksInfraChat');
function selectedTarget(){const x=document.querySelector('.ix-project[aria-pressed="true"]');return x?.getAttribute('data-ix-target')||''}
function css(){if(document.getElementById('ksInfraChatStyle'))return;const el=document.createElement('style');el.id='ksInfraChatStyle';el.textContent=`
#ksInfraChat{position:fixed;inset:0;z-index:100000;background:#f5f7fa;color:#0f172a;font-family:inherit;display:flex;flex-direction:column;height:100dvh;max-height:100dvh;overflow:hidden;font-size:15px}
#ksInfraChat *{box-sizing:border-box;min-width:0}#ksInfraChat button,#ksInfraChat textarea,#ksInfraChat select,#ksInfraChat input{font:inherit}#ksInfraChat button{cursor:pointer}#ksInfraChat button:disabled{opacity:.5;cursor:default}
.kc-head{flex:none;display:flex;align-items:center;gap:10px;padding:12px 14px;background:#111b2c;color:white;border-bottom:1px solid #334155}#ksInfraChat .kc-head h2{margin:0;font-size:16px;color:#fff!important}#ksInfraChat .kc-head small{color:#b9c7db!important;font-size:11px}.kc-btn{border:1px solid #d8e0e9;border-radius:10px;background:#fff;color:#111827;padding:9px 12px;min-height:39px}.kc-head .kc-btn{color:#fff;border-color:#526172;background:#23334b}.kc-head-title{flex:1}
.kc-body{flex:1;display:flex;position:relative;overflow:hidden}.kc-sidebar{width:255px;flex:0 0 255px;border-right:1px solid #dae1ea;background:white;overflow:auto;padding:13px}.kc-sidebar h3{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.07em;margin:15px 0 9px}.kc-sidebar .kc-thread{border:1px solid transparent;border-radius:10px;background:white;padding:10px;width:100%;text-align:left;display:flex;justify-content:space-between;gap:6px;margin-bottom:5px;font-size:13px;color:#334155}.kc-sidebar .kc-thread.selected{background:#e6f6fb;border-color:#b4e4ee}.kc-sidebar .kc-thread span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kc-del{border:0;background:transparent;color:#64748b;padding:0 6px;flex:0 0 auto}
.kc-main{display:flex;min-width:0;flex:1;flex-direction:column}.kc-chat{flex:1;overflow:auto;padding:16px max(14px, calc((100% - 800px)/2));display:flex;flex-direction:column;gap:14px;overscroll-behavior:contain}.kc-row{display:flex;gap:10px}.kc-row.user{justify-content:flex-end}.kc-avatar{flex:0 0 31px;width:31px;height:31px;display:flex;align-items:center;justify-content:center;background:#d7edf5;color:#134e62;border-radius:50%;font-size:11px;font-weight:800}.kc-msg{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;padding:12px 15px;border-radius:15px;font-size:14px;max-width:min(92%,780px);background:#fff;border:1px solid #e0e7ef;box-shadow:0 1px 2px rgba(0,0,0,.02)}.kc-row.user .kc-msg{background:#11223b;color:#fff;border-color:#11223b;border-bottom-right-radius:4px}.kc-row.assistant .kc-msg{border-bottom-left-radius:4px}.kc-busy{color:#64748b;font-size:13px;padding:9px 12px}.kc-empty{max-width:600px;margin:auto;text-align:center}.kc-empty h3{font-size:25px;letter-spacing:-.5px}.kc-empty p{color:#64748b}.kc-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}.kc-chip{background:#fff;border:1px solid #dce5ed;border-radius:20px;padding:9px 12px;font-size:13px!important}
.kc-composer{flex:none;display:flex;flex-direction:column;gap:9px;background:linear-gradient(to top,#f5f7fa 94%,transparent);padding:12px max(14px, calc((100% - 800px)/2));border-top:1px solid #e5eaf0;padding-bottom:max(14px,env(safe-area-inset-bottom))}.kc-target{color:#475569;font-size:11px}.kc-target b{color:#075985}.kc-input-row{background:#fff;border:1px solid #cbd5e1;border-radius:16px;display:flex;align-items:flex-end;gap:8px;padding:9px;box-shadow:0 2px 8px rgba(0,0,0,.05)}.kc-input-row textarea{resize:none;flex:1;max-height:170px;min-height:40px;line-height:1.5;padding:9px 7px;border:0;outline:none;color:#111827;background:transparent;overflow:auto}.kc-send{background:#0b1729;color:#fff;border:0;border-radius:11px;padding:10px 14px;flex:0 0 auto;min-height:40px}.kc-error{background:#ffe7ea;color:#9f1239;font-size:12px;padding:10px;border-radius:9px}.kc-footer-note{font-size:10px;color:#64748b;text-align:center}.kc-mobile-menu{display:none}.kc-proof{font-size:10px;color:#64748b;border-top:1px solid #e2e8f0;margin-top:9px;padding-top:6px}.kc-controls{display:flex;gap:7px;flex-wrap:wrap;align-items:flex-end}.kc-controls>.kc-btn{height:38px;min-height:38px;align-self:flex-end}.kc-controls label{font-size:11px;flex:1 1 130px}.kc-controls select,.kc-controls input{display:block;width:100%;min-height:38px;border:1px solid #cbd5e1;border-radius:9px;background:white;color:#0f172a;font-size:12px;padding:6px}.kc-controls input{flex:1 1 100%;max-height:38px}.kc-budget{color:#64748b;font-size:10px}.kc-head .kc-btn{flex-shrink:0}.kc-error button{margin:5px}.kc-busy progress{width:65px}
@media(max-width:700px){.kc-sidebar{display:none;position:absolute;inset:0 auto 0 0;z-index:2;width:min(80vw,300px);box-shadow:3px 0 18px rgba(0,0,0,.15)}.kc-sidebar.open{display:block}.kc-mobile-menu{display:inline-flex}.kc-chat{padding:16px 12px}.kc-composer{padding:10px 12px max(12px,env(safe-area-inset-bottom))}.kc-msg{max-width:95%;font-size:14px}.kc-empty h3{font-size:22px}}
`;document.head.appendChild(el)}
function errorMsg(){return stateChat.error?`<div class="kc-error" role="alert">${esc(stateChat.error)}${stateChat.requestId?`<small> · Rujukan ${esc(stateChat.requestId)}</small>`:''}<button class="kc-btn" data-kc-action="reload">Semak sejarah</button></div>`:''}
function injectOpenButton(){if(!window.__ksInfraNav114)return;const head=document.querySelector('.ix-head');if(!head||head.querySelector('[data-kc-open]'))return;const btn=document.createElement('button');btn.type='button';btn.textContent='💬 Chat AI';btn.className='ix-primary';btn.style.cssText='background:#087f93;min-height:44px;max-width:100%;font-size:13px';btn.setAttribute('data-kc-open','');head.appendChild(btn)}
let observeTimer=null;const observer=new MutationObserver(()=>{if(observeTimer)return;observeTimer=setTimeout(()=>{observeTimer=null;injectOpenButton()},50)});observer.observe(document.documentElement,{subtree:true,childList:true});injectOpenButton();
async function call(payload){
 const token=await access();const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),135000);
 try{const r=await fetch(API,{method:'POST',headers:{Authorization:'Bearer '+token,apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',signal:controller.signal});const json=await r.json().catch(()=>({}));if(!r.ok||json.ok!==true){stateChat.requestId=json.requestId||'';throw Error(statusError[json.error]||(r.status===401?'Sesi tamat. Log masuk semula.':json.error==='REQUEST_FAILED'?'Permintaan gagal. Semak sejarah sebelum cuba lagi.':`Permintaan gagal (HTTP ${r.status}).`))}if(json.budget)stateChat.budget=json.budget;return json}catch(e){if(e.name==='AbortError')throw Error('Permintaan mengambil masa terlalu lama. Jawapan mungkin masih diproses; buka semula sejarah sebelum menghantar lagi.');throw e}finally{clearTimeout(timeout)}
}
function paint(){
 if(!stateChat.open)return;css();let rootNode=root();if(!rootNode){rootNode=document.createElement('div');rootNode.id='ksInfraChat';rootNode.setAttribute('role','dialog');rootNode.setAttribute('aria-modal','true');rootNode.setAttribute('aria-label','Chat AI Infrastructure');document.body.appendChild(rootNode)}
 rootNode.innerHTML=`<header class="kc-head"><button type="button" class="kc-btn kc-mobile-menu" data-kc-action="drawer" aria-label="Senarai chat">☰</button><div class="kc-head-title"><h2>AI Infrastructure · DeepSeek / OpenAI</h2><small>Diagnosis projek • sejarah chat • cadangan patch</small></div><button type="button" class="kc-btn" data-kc-action="new">+ Chat</button><button type="button" class="kc-btn" data-kc-action="close" aria-label="Tutup chat">✕</button></header>
 <div class="kc-body"><aside class="kc-sidebar ${stateChat.drawer?'open':''}" aria-label="Sejarah chat"><button type="button" class="kc-btn" style="width:100%" data-kc-action="new">+ Perbualan baharu</button><h3>Sejarah</h3>${stateChat.threads.map(t=>`<div class="kc-thread ${t.id===stateChat.threadId?'selected':''}"><button type="button" class="kc-thread" data-kc-thread="${esc(t.id)}"><span>${esc(t.title)}</span></button><button type="button" class="kc-del" aria-label="Padam perbualan" data-kc-delete="${esc(t.id)}">×</button></div>`).join('')||'<p style="font-size:12px;color:#94a3b8">Belum ada perbualan.</p>'}</aside>
 <main class="kc-main"><div class="kc-chat" id="kcMessages" aria-live="polite">${stateChat.messages.length?stateChat.messages.map(m=>`<div class="kc-row ${m.role==='user'?'user':'assistant'}">${m.role==='assistant'?(m.model==='openai'?'<span class="kc-avatar">OA</span>':m.model==='deepseek'?'<span class="kc-avatar">DS</span>':'<span class="kc-avatar">AI</span>'):''}<div class="kc-msg">${esc(m.content)}${m.role==='assistant'?`<div class="kc-proof">${esc(m.modelName||m.model||'Rekod lama — model tidak direkod')} · ${esc({primary:'Utama',provider_fallback:'Fallback provider',needs_specialist:'Semakan pakar',owner_escalation:'Pilihan owner',read_tools:'Bacaan bukti'}[m.route]||'Cadangan sahaja')} · ${m.route==='read_tools'?'Metadata/deployment diperiksa':'Metadata sahaja'} · Cadangan sahaja</div>`:''}</div></div>`).join(''):`<div class="kc-empty"><h3>Apa masalah projek hari ini?</h3><p>Berbual dengan DeepSeek untuk cari punca masalah, cadangan pembaikan dan langkah ujian.</p><div class="kc-chips"><button type="button" class="kc-chip" data-kc-suggest="Semak projek yang saya pilih dan kenal pasti risiko konfigurasi.">Audit konfigurasi</button><button type="button" class="kc-chip" data-kc-suggest="Bantu saya diagnose API yang tidak memberi respons. Tanya maklumat tambahan yang relevan.">API tak reply</button><button type="button" class="kc-chip" data-kc-suggest="Tolong susun pelan repair, ujian staging dan rollback bagi bug ini.">Pelan repair</button></div></div>`}${stateChat.busy?`<div class="kc-busy" role="status"><progress aria-label="Menunggu AI"></progress> ${esc(stateChat.phase||'AI sedang menganalisis…')}</div>`:''}</div>
 <div class="kc-composer">${errorMsg()}
 <div class="kc-controls"><label>Model <select id="kcModel" aria-label="Model AI" ${stateChat.busy?'disabled':''}>${[['auto','Auto (DeepSeek → OpenAI)'],['deepseek','DeepSeek'],['openai','OpenAI']].map(([v,t])=>`<option value="${v}" ${stateChat.model===v?'selected':''}>${t}</option>`).join('')}</select></label>
 <label>Projek <select id="kcProject" aria-label="Projek chat" ${stateChat.busy||stateChat.threadId?'disabled':''}><option value="">Semua projek — metadata sahaja</option>${stateChat.target&&!stateChat.projects.some(p=>p.id===stateChat.target)?`<option selected value="${esc(stateChat.target)}">${esc(stateChat.target)}</option>`:''}${stateChat.projects.map(x=>`<option value="${esc(x.id)}" ${x.id===stateChat.target?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>
 <button type="button" class="kc-btn" data-kc-action="projects" ${stateChat.busy?'disabled':''}>Muat projek</button>
 <input id="kcProjectSearch" type="search" aria-label="Cari projek" placeholder="Cari projek…" value="${esc(stateChat.projectQuery)}" ${stateChat.busy?'disabled':''}>
 </div>
 <small class="kc-budget">${stateChat.budget?`${stateChat.budget.remaining}/${stateChat.budget.limit} panggilan AI berbaki · reset 12 malam MYT · fallback boleh guna 2 panggilan`:'Had 15 panggilan AI sehari; fallback boleh guna 2 panggilan.'}</small>
 ${stateChat.warning?`<div class="kc-error">${esc(statusError[stateChat.warning]||'Jawapan tersimpan, sebahagian metadata belum dikemas kini.')}</div>`:''}<div class="kc-target">${stateChat.target?`Konteks: <b>${esc(stateChat.target.split('|')[0])} / ${esc(stateChat.target.split('|').slice(1).join('|'))}</b>`:'Konteks: semua projek (metadata inventori sahaja)'} · <b>Tiada auto-deploy</b></div><div class="kc-input-row"><textarea id="kcInput" rows="1" maxlength="3000" placeholder="Tanya DeepSeek tentang bug, error, atau repair…" aria-label="Mesej kepada DeepSeek" ${stateChat.busy?'disabled':''}>${esc(stateChat.input)}</textarea><button type="button" class="kc-send" data-kc-action="send" ${stateChat.busy?'disabled':''}>Hantar ➤</button></div><div style="display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin:10px 0 8px"><button type="button" class="kc-btn" data-kc-action="openai" style="min-height:42px;font-size:13px;border:1px solid #0e7490;color:#0e7490" ${stateChat.busy?'disabled':''}>↗ OpenAI semak / repair</button><small style="color:#64748b;font-size:11px">DeepSeek → OpenAI automatik jika gagal</small></div><div class="kc-footer-note">AI boleh cadangkan patch, tetapi belum boleh baca log penuh atau mengubah production. Jangan hantar API key.</div></div></main></div>`;
 const scroll=rootNode.querySelector('#kcMessages');if(scroll)scroll.scrollTop=scroll.scrollHeight;
 const t=rootNode.querySelector('#kcInput');if(t){t.style.height='auto';t.style.height=Math.min(t.scrollHeight,170)+'px'}
 ksImproveUI(rootNode);
}
async function loadProjects(){
 if(stateChat.busy)return;stateChat.busy=true;stateChat.phase='Baca inventori projek…';paint();
 try{const token=await access();const r=await fetch('/api/supabase/functions/v1/infrastructure-control',{method:'POST',headers:{Authorization:'Bearer '+token,apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({action:'inventory'}),signal:AbortSignal.timeout(65000)});const d=await r.json();if(!r.ok||!d.ok)throw Error('Inventori projek belum tersedia.');stateChat.projects=Object.entries(d.providers||{}).flatMap(([k,v])=>(v.projects||[]).map(p=>({id:k+'|'+p.id,name:k+' / '+p.name})));if(stateChat.target&&!stateChat.projects.some(p=>p.id===stateChat.target))stateChat.projects.push({id:stateChat.target,name:stateChat.target});stateChat.projectsFetched=true;}
 catch(e){stateChat.error='Inventori projek tidak dapat dimuat. Cuba lagi.'}finally{stateChat.busy=false;paint()}
}
window.addEventListener('change',e=>{if(e.target.id==='kcModel')stateChat.model=e.target.value;if(e.target.id==='kcProject'&&!stateChat.threadId)stateChat.target=e.target.value;},true);
window.addEventListener('input',e=>{if(e.target.id==='kcProjectSearch'){stateChat.projectQuery=e.target.value;const q=e.target.value.toLowerCase();for(const o of root().querySelectorAll('#kcProject option'))o.hidden=!!o.value&&!o.textContent.toLowerCase().includes(q);}},true);
async function loadThreads(){try{const r=await call({action:'list'});stateChat.threads=r.threads||[]}catch(e){stateChat.error=String(e.message||e)}}
async function open(){if(!state?.session){document.getElementById('loginDialog')?.showModal();return}stateChat.open=true;stateChat.drawer=false;stateChat.target=selectedTarget()||sessionStorage.getItem('ksInfraSelectedProject')||stateChat.target;stateChat.error='';stateChat.messages=[];stateChat.threadId='';stateChat.input='';paint();await loadThreads();const last=sessionStorage.getItem('ksInfraLastThread');if(last&&stateChat.threads.some(t=>t.id===last))await loadThread(last);paint()}
function close(){if(stateChat.busy)return;stateChat.open=false;root()?.remove();stateChat.drawer=false}
function newChat(){if(stateChat.busy)return;stateChat.threadId='';sessionStorage.removeItem('ksInfraLastThread');stateChat.messages=[];stateChat.input='';stateChat.error='';stateChat.drawer=false;stateChat.target=selectedTarget()||stateChat.target||sessionStorage.getItem('ksInfraSelectedProject')||'';paint()}
async function loadThread(id){if(stateChat.busy)return;stateChat.phase='Baca sejarah chat…';stateChat.busy=true;stateChat.error='';paint();try{const r=await call({action:'load',threadId:id});stateChat.threadId=id;sessionStorage.setItem('ksInfraLastThread',id);stateChat.messages=(r.messages||[]).map(m=>({...m,modelName:m.model_name}));stateChat.target=r.thread?.target||'';stateChat.input='';stateChat.drawer=false}catch(e){stateChat.error=String(e.message||e)}finally{stateChat.busy=false;paint()}}
async function deleteThread(id){if(stateChat.busy)return;if(!window.confirm('Padam perbualan ini?'))return;stateChat.phase='Padam perbualan…';stateChat.busy=true;paint();try{await call({action:'delete',threadId:id});if(id===stateChat.threadId)newChat();await loadThreads()}catch(e){stateChat.error=String(e.message||e)}finally{stateChat.busy=false;paint()}}
async function send(model=stateChat.model){if(stateChat.busy)return;const manual=model==='openai';if(!stateChat.input.trim()&&!(manual&&stateChat.messages.length))return;const message=stateChat.input.trim()||(manual?'Sila semak semula diagnosis dan cadangan repair dalam perbualan ini menggunakan OpenAI. Cadangkan patch, ujian staging dan rollback dengan jelas.':'');if(!stateChat.target&&/\b(?:get_recent_deployments|get_project_metadata)\b/i.test(message)){stateChat.error='Pilih satu projek dahulu sebelum menggunakan tool deployment. Ketuk Pilih projek, kemudian pilih nama projek daripada senarai.';stateChat.uxExpanded=true;paint();return;}stateChat.input='';stateChat.error='';stateChat.requestId='';stateChat.warning='';stateChat.messages.push({role:'user',content:message});stateChat.busy=true;stateChat.phase='Semak sesi dan inventori; '+(model==='openai'?'OpenAI':model==='deepseek'?'DeepSeek':'DeepSeek → OpenAI jika perlu')+' menganalisis…';paint();try{const r=await call({action:'chat',threadId:stateChat.threadId||undefined,message,target:stateChat.target,model});stateChat.threadId=r.threadId;sessionStorage.setItem('ksInfraLastThread',r.threadId);stateChat.messages.push({role:'assistant',content:r.reply,model:r.model,modelName:r.modelName,route:r.route});stateChat.inventoryAvailable=r.inventoryAvailable;stateChat.warning=r.warning||'';await loadThreads()}catch(e){stateChat.error=String(e.message||e);stateChat.input=message;stateChat.messages.pop()}finally{stateChat.busy=false;paint()}}
window.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-kc-open]');if(b){e.preventDefault();e.stopImmediatePropagation();open();return}
 if(!stateChat.open)return;
 const suggested=e.target.closest?.('[data-kc-suggest]');if(suggested){e.preventDefault();stateChat.input=suggested.dataset.kcSuggest;paint();root()?.querySelector('#kcInput')?.focus();return}
 const thread=e.target.closest?.('[data-kc-thread]');if(thread){e.preventDefault();loadThread(thread.dataset.kcThread);return}
 const del=e.target.closest?.('[data-kc-delete]');if(del){e.preventDefault();deleteThread(del.dataset.kcDelete);return}
 const action=e.target.closest?.('[data-kc-action]')?.dataset.kcAction;
 if(action){e.preventDefault();if(action==='close'){if(!stateChat.busy)close();}else if(action==='new')newChat();else if(action==='drawer'){stateChat.drawer=!stateChat.drawer;paint()}else if(action==='send')send();else if(action==='openai')send('openai');else if(action==='projects')loadProjects();else if(action==='reload'){if(stateChat.threadId)loadThread(stateChat.threadId);else loadThreads().then(paint);}return}
},true);
window.addEventListener('input',e=>{if(stateChat.open&&e.target.id==='kcInput'){stateChat.input=e.target.value;e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,170)+'px'}},true);
window.visualViewport?.addEventListener('resize',()=>{const r=root();if(r)r.style.height=window.visualViewport.height+'px'});
window.addEventListener('keydown',e=>{if(stateChat.open&&e.target.id==='kcInput'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}if(stateChat.open&&e.key==='Escape'&&!stateChat.busy)close()},true);
function ksSafeMarkdown(raw){
 const lines=String(raw||'').replace(/\r\n?/g,'\n').split('\n'), html=[];
 const inline=s=>esc(String(s).replace(/\\([_*`])/g,'$1')).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
 const cell=s=>s.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(v=>v.trim());
 for(let i=0;i<lines.length;i++){
  let s=lines[i], next=lines[i+1]||'';
  if(/^\s*```/.test(s)){let code=[];while(++i<lines.length&&!/^\s*```/.test(lines[i]))code.push(lines[i]);html.push('<pre><code>'+esc(code.join('\n'))+'</code></pre>');continue;}
  if(/^\s*\|.*\|\s*$/.test(s)&&/^\s*\|[- :|]+\|\s*$/.test(next)){
   let t='<div class="kc-table"><table><thead><tr>'+cell(s).map(v=>'<th>'+inline(v)+'</th>').join('')+'</tr></thead><tbody>';i+=2;
   while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i])){t+='<tr>'+cell(lines[i++]).map(v=>'<td>'+inline(v)+'</td>').join('')+'</tr>';}
   html.push(t+'</tbody></table></div>');i--;continue;
  }
  if(!s.trim()){html.push('<div class="kc-blank"></div>');continue;}
  if(/^\s*#{1,4}\s+/.test(s)){html.push('<p class="kc-heading">'+inline(s.replace(/^\s*#{1,4}\s+/,''))+'</p>');continue;}
  if(/^\s*[-*]\s+/.test(s)){html.push('<p class="kc-item">• '+inline(s.replace(/^\s*[-*]\s+/,''))+'</p>');continue;}
  html.push('<p>'+inline(s)+'</p>');
 }
 return html.join('');
}

function ksSelectProject(id){
 if(stateChat.busy)return;
 if(id===stateChat.target){stateChat.pickerOpen=false;stateChat.projectQuery='';paint();return;}
 if(stateChat.threadId){stateChat.threadId='';sessionStorage.removeItem('ksInfraLastThread');stateChat.messages=[];stateChat.input='';stateChat.warning='';}
 stateChat.target=id;sessionStorage.setItem('ksInfraSelectedProject',id);
 stateChat.projectQuery='';stateChat.pickerOpen=false;stateChat.error='';paint();
}

async function ksCopy(value,btn){
 let success=false;
 try{await navigator.clipboard.writeText(value);success=true;}catch{
  try{const t=document.createElement('textarea');t.value=value;t.style.cssText='position:fixed;left:-9999px';document.body.append(t);t.select();success=document.execCommand('copy');t.remove();}catch{}
 }
 btn.textContent=success?'✓ Disalin':'Gagal salin';
}

function ksImproveUI(node){
 const cssId='ksMobilePickerV203';
 if(!document.getElementById(cssId)){
  const style=document.createElement('style');style.id=cssId;
  style.textContent=`
#ksInfraChat .kc-msg{user-select:text;-webkit-user-select:text}
#ksInfraChat .kc-rendered{white-space:normal;overflow-wrap:anywhere;line-height:1.6}
#ksInfraChat .kc-rendered p{margin:0 0 8px}
#ksInfraChat .kc-rendered p:last-child{margin-bottom:0}
#ksInfraChat .kc-rendered code{padding:2px 4px;background:#f1f5f9;border-radius:4px}
#ksInfraChat .kc-rendered pre{background:#17202d;color:white;padding:10px;border-radius:8px;max-width:100%;overflow:auto;white-space:pre}
#ksInfraChat .kc-rendered pre code{background:transparent;color:inherit}
#ksInfraChat .kc-table{max-width:100%;overflow-x:auto;border:1px solid #dae2eb;border-radius:8px;margin:7px 0}
#ksInfraChat .kc-table table{border-collapse:collapse;min-width:290px;font-size:12px;width:100%}
#ksInfraChat .kc-table td,#ksInfraChat .kc-table th{padding:8px;border-bottom:1px solid #e2e8f0;text-align:left}
#ksInfraChat .kc-table th{background:#f1f5f9}
#ksInfraChat .kc-heading{font-weight:750!important}
#ksInfraChat .kc-item{padding-left:8px!important}
#ksInfraChat .kc-blank{height:7px}
#ksInfraChat .kc-actions{display:grid;grid-template-columns:minmax(0,1fr) 138px 110px;gap:8px;align-items:center}
#ksInfraChat .kc-actions>button,#ksInfraChat .kc-actions>select{min-height:43px;background:#fff;color:#142033;border:1px solid #cbd5e1;border-radius:12px;padding:9px 11px;font-size:13px;max-width:100%}
#ksInfraChat .kc-actions>select{min-width:0}
#ksInfraChat .kc-pick-trigger{text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:650}
#ksInfraChat .kc-copy-msg{display:block;margin:8px 0 0 auto;background:white;border:1px solid #cbd5e1;color:#334155;padding:5px 10px;border-radius:8px;font-size:12px;min-height:34px}
#ksInfraChat .kc-project-mask{position:absolute;inset:0;z-index:20;background:rgba(9,17,30,.63);display:flex;align-items:center;justify-content:center;padding:12px}
#ksInfraChat .kc-project-modal{width:min(640px,100%);max-height:min(670px,93%);display:flex;flex-direction:column;background:#fff;border-radius:20px;color:#0f172a;box-shadow:0 15px 40px #0004;overflow:hidden}
#ksInfraChat .kc-project-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:16px 16px 8px}
#ksInfraChat .kc-project-head h3{font-size:19px;margin:0 0 3px}
#ksInfraChat .kc-project-head p{font-size:12px;color:#64748b;margin:0;line-height:1.4}
#ksInfraChat .kc-project-close{border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;min-width:38px;min-height:38px;font-size:19px}
#ksInfraChat .kc-project-search{margin:10px 14px;padding:13px 14px;border:1px solid #cbd5e1;background:#fff;color:#101827;font-size:16px;border-radius:12px;outline-offset:2px}
#ksInfraChat .kc-project-scroll{flex:1;overflow-y:auto;min-height:0;padding:0 12px 13px}
#ksInfraChat .kc-project-section{font-size:11px;color:#64748b;font-weight:800;letter-spacing:.05em;text-transform:uppercase;margin:14px 6px 6px}
#ksInfraChat .kc-project-option{width:100%;display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid #e2e8f0;background:#fff;color:#0f172a;border-radius:12px;padding:12px 13px;margin:6px 0;text-align:left;min-height:58px}
#ksInfraChat .kc-project-option:active{background:#eaf4fa}
#ksInfraChat .kc-project-option[data-selected="true"]{background:#ecf7ff;border-color:#0e7490}
#ksInfraChat .kc-project-option .kc-project-name{display:block;font-weight:700;font-size:14px;overflow-wrap:anywhere}
#ksInfraChat .kc-project-option .kc-project-type{display:block;color:#64748b;font-size:11px;margin-top:3px}
#ksInfraChat .kc-project-option .kc-project-check{flex:none;color:#0369a1;font-size:13px;font-weight:700}
#ksInfraChat .kc-project-hint{font-size:13px;color:#64748b;margin:12px}
#ksInfraChat .kc-project-footer{padding:10px 14px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;color:#64748b}
#ksInfraChat .kc-refresh{border:1px solid #dae2eb;background:#fff;border-radius:9px;color:#0f172a;padding:9px 10px;font-size:12px}
#ksInfraChat .kc-project-option[hidden],#ksInfraChat .kc-project-section[hidden]{display:none!important}
@media(max-width:700px){
#ksInfraChat .kc-head{min-height:56px;padding:8px 10px;gap:7px}
#ksInfraChat .kc-head h2{font-size:14px!important;line-height:1.3}
#ksInfraChat .kc-head small{display:none}
#ksInfraChat .kc-head .kc-btn{padding:7px 10px;min-height:38px}
#ksInfraChat .kc-chat{padding:10px 8px;gap:10px}
#ksInfraChat .kc-msg{font-size:14px;max-width:calc(100% - 34px);padding:10px 12px}
#ksInfraChat .kc-composer{padding:7px 10px max(8px,env(safe-area-inset-bottom));gap:7px;max-height:48dvh;overflow-y:auto}
#ksInfraChat .kc-actions{grid-template-columns:1fr 110px;gap:7px}
#ksInfraChat .kc-actions .kc-pick-trigger{grid-column:1/-1;width:100%;min-height:48px;font-size:14px}
#ksInfraChat .kc-actions>select{font-size:14px}
#ksInfraChat .kc-input-row{padding:5px;border-radius:12px}
#ksInfraChat .kc-input-row textarea{font-size:16px}
#ksInfraChat .kc-footer-note{display:none}
#ksInfraChat .kc-budget,#ksInfraChat .kc-target{font-size:10px;line-height:1.2}
#ksInfraChat .kc-project-mask{align-items:flex-end;padding:0}
#ksInfraChat .kc-project-modal{width:100%;max-height:92%;border-radius:23px 23px 0 0;padding-bottom:env(safe-area-inset-bottom)}
}`;
  document.head.appendChild(style);
 }
 const controls=node.querySelector('.kc-controls');
 if(controls){
  const actions=document.createElement('div');actions.className='kc-actions';
  const selected=stateChat.projects.find(p=>p.id===stateChat.target);
  const projectTitle=stateChat.target?(selected?.name||stateChat.target.split('|').at(-1).split(':').at(-1)):'Pilih projek';
  const choose=document.createElement('button');choose.type='button';choose.className='kc-pick-trigger';
  choose.textContent='▦  '+projectTitle+'  ▾';choose.setAttribute('aria-label','Pilih projek untuk diagnosis');
  choose.addEventListener('click',()=>{
   stateChat.pickerOpen=true;stateChat.projectQuery='';paint();
   if(!stateChat.projectsFetched&&!stateChat.busy)loadProjects();
  });
  const model=document.createElement('select');model.id='kcModel';model.setAttribute('aria-label','Model AI');
  [['auto','Auto'],['deepseek','DeepSeek'],['openai','OpenAI']].forEach(([value,label])=>{
   const opt=document.createElement('option');opt.value=value;opt.textContent=label;opt.selected=stateChat.model===value;model.appendChild(opt);
  });
  const copy=document.createElement('button');copy.type='button';copy.textContent='⧉ Salin chat';
  copy.addEventListener('click',()=>ksCopy(stateChat.messages.map(m=>(m.role==='user'?'Anda':'AI')+':\n'+m.content).join('\n\n'),copy));
  actions.append(choose,model,copy);
  controls.replaceWith(actions);
 }
 const target=node.querySelector('.kc-target');
 if(target){
  const selected=stateChat.projects.find(p=>p.id===stateChat.target);
  target.textContent=stateChat.target?'Projek aktif: '+(selected?.name||stateChat.target.split('|').at(-1).split(':').at(-1))+' · Read-only':'Semua projek: metadata sahaja · Pilih projek untuk baca deployment';
 }
 node.querySelectorAll('.kc-row').forEach((row,i)=>{
  const m=stateChat.messages[i];if(!m||m.role!=='assistant')return;
  const box=row.querySelector('.kc-msg');if(!box)return;
  const first=box.firstChild;
  if(first?.nodeType===3){const div=document.createElement('div');div.className='kc-rendered';div.innerHTML=ksSafeMarkdown(m.content);box.replaceChild(div,first);}
  const copy=document.createElement('button');copy.type='button';copy.className='kc-copy-msg';copy.textContent='⧉ Salin jawapan';
  copy.addEventListener('click',()=>ksCopy(m.content,copy));box.append(copy);
 });
 if(stateChat.pickerOpen){
  const mask=document.createElement('div');mask.className='kc-project-mask';
  mask.setAttribute('role','presentation');
  mask.innerHTML='<section class="kc-project-modal" role="dialog" aria-modal="true" aria-label="Pilih projek">'+
    '<div class="kc-project-head"><div><h3>Pilih projek</h3><p>Ketuk projek di bawah untuk sambungkan chat. Perbualan lama kekal dalam sejarah.</p></div><button type="button" class="kc-project-close" aria-label="Tutup pemilih">×</button></div>'+
    '<input class="kc-project-search" type="search" inputmode="search" placeholder="Cari nama projek, contoh: kerjasendiri" aria-label="Cari projek" value="'+esc(stateChat.projectQuery||'')+'">'+
    '<div class="kc-project-scroll"></div><div class="kc-project-footer"><span>Deployment hanya untuk projek yang dipilih</span><button type="button" class="kc-refresh">↻ Refresh senarai</button></div></section>';
  node.appendChild(mask);
  const scroll=mask.querySelector('.kc-project-scroll');
  const buckets=[['cloudflare','Cloudflare'],['netlify','Netlify'],['supabase','Supabase']];
  let total=0;
  for(const [provider,title] of buckets){
   const data=stateChat.projects.filter(p=>p.id.startsWith(provider+'|'));
   if(!data.length)continue;
   const heading=document.createElement('p');heading.className='kc-project-section';heading.textContent=title;heading.dataset.provider=provider;scroll.appendChild(heading);
   for(const p of data){
    const btn=document.createElement('button');btn.type='button';btn.className='kc-project-option';
    btn.dataset.ksProject=p.id;btn.dataset.selected=String(p.id===stateChat.target);
    const prettyName=String(p.name).replace(new RegExp('^'+provider+'\\s*/\\s*','i'),'');
    btn.innerHTML='<span><span class="kc-project-name">'+esc(prettyName)+'</span><span class="kc-project-type">'+esc(title)+'</span></span><span class="kc-project-check">'+(p.id===stateChat.target?'✓ Dipilih':'Pilih →')+'</span>';
    btn.addEventListener('click',()=>ksSelectProject(p.id));
    scroll.appendChild(btn);total++;
   }
  }
  if(!total){
   const hint=document.createElement('p');hint.className='kc-project-hint';
   hint.textContent=stateChat.busy?'Sedang memuat senarai projek…':stateChat.error||'Tiada projek dimuatkan. Tekan Refresh senarai.';
   scroll.appendChild(hint);
  }
  mask.querySelector('.kc-project-close').addEventListener('click',()=>{stateChat.pickerOpen=false;paint();});
  mask.addEventListener('click',e=>{if(e.target===mask){stateChat.pickerOpen=false;paint();}});
  mask.querySelector('.kc-refresh').addEventListener('click',()=>{if(!stateChat.busy){stateChat.projectsFetched=false;loadProjects();}});
  const search=mask.querySelector('.kc-project-search');
  search.addEventListener('input',()=>{
   const q=search.value.toLowerCase().trim();stateChat.projectQuery=search.value;let found=0;
   scroll.querySelectorAll('.kc-project-option').forEach(btn=>{
    const visible=(btn.textContent+' '+btn.dataset.ksProject).toLowerCase().includes(q);
    btn.hidden=!visible;if(visible)found++;
   });
   scroll.querySelectorAll('.kc-project-section').forEach(title=>{
    const children=Array.from(scroll.querySelectorAll('.kc-project-option')).filter(b=>b.dataset.ksProject.startsWith(title.dataset.provider+'|'));
    title.hidden=!children.some(b=>!b.hidden);
   });
   let empty=scroll.querySelector('[data-no-results]');
   if(!empty){empty=document.createElement('p');empty.dataset.noResults='';empty.className='kc-project-hint';scroll.appendChild(empty);}
   empty.textContent='Tiada projek sepadan.';empty.hidden=found!==0||!total;
  });
  if(stateChat.projectQuery)search.dispatchEvent(new Event('input'));
 }
}
})();
