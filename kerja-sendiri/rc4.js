'use strict';
/* RC4 layer — loaded after index.html script and platform.js.
   Adds: landing → login → workspace picker, two separate business workspaces (Recond / Proton),
   workspace-scoped API calls, and the redesigned AI Knowledge Center (Instructions / Cara Jawab Customer).
   No RC3 function is removed; RC3 pages are reused and scoped. Tokens stay in tab memory only. */

const WS={
 recond:{key:'recond',label:'ABANG RECOND',short:'Recond',blurb:'Kereta import Jepun (recond). Stok langsung daripada database stok Abang Recond.',sample:'Voxy 2023 ada tak? Bajet RM150k.'},
 proton:{key:'proton',label:'ABANG PROTON',short:'Proton',blurb:'Kereta baharu Proton. Harga dan promosi hanya daripada katalog yang anda sahkan sendiri.',sample:'X90 ada stok tak? Berapa ansuran?'}
};
const PAGES=[['dashboard','Dashboard','◫'],['leads','CRM & Prospek','♙'],['inbox','WhatsApp Inbox','▤'],['agents','AI Sales Agent','◈'],['followup','AI Follow-up Advisor','◷'],['knowledge','AI Knowledge Center','▧'],['settings','Tetapan','⚙']];
function pagesForBusiness(b){return b==='recond'?[...PAGES.slice(0,-1),['magic','Magic Ads','✦'],['cmo','CMO Advisor','◎'],PAGES.at(-1)]:PAGES;}
const ui={open:{recond:false,proton:false}};
state.business=null;
const biz=()=>WS[state.business]||null;
const pageLabel=(p)=>{const b=biz();return p[1]+(b?' '+b.short:'')};

/* ---------- landing behaviour ---------- */
document.addEventListener('click',e=>{const b=e.target.closest('[data-login]');if(!b)return;e.preventDefault();$('loginDialog').showModal();setTimeout(()=>$('email')?.focus(),50)},true);

/* ---------- API scoping: every data call carries the active workspace ---------- */
const rc4PrevApi=api;
api=async function(fn,action,params={}){
 const b=state.business;
 if(fn==='prospect-dashboard'&&(action==='list'||action==='detail')){
  if(!b)throw Error('Pilih workspace dahulu.');
  return rc4PrevApi('ar-platform-inbox',action==='list'?'crm_list':'crm_detail',{...params,business:b});
 }
 if((fn==='ar-platform-inbox'||fn==='whatsapp-dashboard')&&!['connection_status','capabilities'].includes(action)){
  if(!b)throw Error('Pilih workspace dahulu.');
  params={...params,business:params.business||b};
 }
 return rc4PrevApi(fn,action,params);
};
const rc4PrevWrite=writeAPI;
writeAPI=async function(action,body={},fn='ar-platform-inbox'){
 const b=state.business;if(!b)throw Error('Pilih workspace dahulu.');
 if(fn==='prospect-dashboard'){const map={save:'crm_save',activity:'crm_activity'};if(map[action]){action=map[action];fn='ar-platform-inbox'}}
 if(fn==='ar-platform-inbox'){body={...body,business:b};if(body.business_type==='')delete body.business_type}
 return rc4PrevWrite(action,body,fn);
};

/* ---------- session / load hooks ---------- */
const rc4PrevLoad=load;
load=async function(){
 if(state.session&&!document.body.classList.contains('authed')){state.business=null;state.page='workspaces';document.body.classList.add('authed')}
 if(!state.business){render();return}
 const r=await rc4PrevLoad();waLoad();return r;
};
const rc4PrevClear=clearSession;
clearSession=function(){state.business=null;state.page='dashboard';kc.cfg={};kc.draft={};kc.ver={};kc.verBusy={};kc.out={};kc.loading={};kc.error={};kc.promptShown={};kc.lastSig='';platform.catalogAuto=false;platform.knowledgeAuto={};document.body.classList.remove('authed','picking');delete document.body.dataset.ws;rc4PrevClear();$('view').replaceChildren();window.scrollTo(0,0)};

async function switchWorkspace(key,page){
 if(!WS[key])return;
 if($('moreDialog').open)$('moreDialog').close();
 const changed=state.business!==key;
 if(changed){
  if(typeof refreshPromise!=='undefined'&&refreshPromise){try{await refreshPromise}catch{}}
  state.generation++;state.busy=false;
  state.business=key;state.leads=null;state.threads=null;state.thread=null;state.threadKey='';state.leadError='';state.inboxError='';
  v2.mobileChat=false;v2.search='';v2.filter='all';state.query='';state.status='';
  v3.current=null;v3.draft=null;platform.catalog=[];platform.knowledge=[];
  $('detailContent').replaceChildren();if($('detailDialog').open)$('detailDialog').close();
 }
 if(changed)ui.open={recond:key==='recond',proton:key==='proton'};else ui.open[key]=true;
 state.page=pagesForBusiness(key).some(p=>p[0]===page)?page:'dashboard';
 render();
 if(changed||!state.leads)await load();
}

/* ---------- head / nav / render ---------- */
head=function(title,desc){const b=biz();return `<div class="hero"><div><div class="eyebrow">${b?b.label:'KERJA SENDIRI'}</div><h1>${title}</h1><p>${desc}</p></div><span class="badge">${b?'Workspace '+b.short:'Business Platform'} · V5</span></div>`};
function navHTML(forceOpen,pre='grp'){
 return ['recond','proton'].map(k=>{
  const open=forceOpen||ui.open[k],B=WS[k];
  return `<div class="ws-grp ${k}"><button type="button" class="ws-head" data-grp="${k}" aria-expanded="${open}" aria-controls="${pre}-${k}"><span class="dot"></span><b>${B.label}</b><i aria-hidden="true">▾</i></button><div class="ws-sub" id="${pre}-${k}" ${open?'':'hidden'}>${pagesForBusiness(k).map(p=>`<button type="button" data-biz="${k}" data-page="${p[0]}" title="${p[1]} ${B.short}" aria-label="${p[1]} ${B.short}" class="${state.business===k&&state.page===p[0]?'active':''}"><span>${p[2]}</span><span class="nav-label">${p[1]}</span></button>`).join('')}</div></div>`;
 }).join('');
}
function bottomHTML(){
 const act=p=>state.page===p?'active':'';
 return `<button data-page="dashboard" class="${act('dashboard')}"><span>◫</span>Home</button><button data-page="inbox" class="${act('inbox')}"><span>▤</span>Inbox</button><button data-page="leads" class="${act('leads')}"><span>♙</span>CRM</button><button data-page="followup" class="${act('followup')}"><span>◷</span>Follow-up</button><button id="moreOpen"><span>•••</span>Menu</button>`;
}
function decorate(){
 $('sideNav').innerHTML=navHTML();$('bottomNav').innerHTML=bottomHTML();
 $('moreBody').innerHTML=`<p class="muted" style="margin:6px 0 10px">Pilih workspace dan halaman.</p>`+navHTML(true,'mgrp')+`<p><button type="button" data-picker class="smallbtn">Tukar workspace</button></p>`;
 const b=biz(),label=$('bizLabel');
 label.textContent=b?b.label:'PILIH WORKSPACE';label.className='preview-label biz-pill '+(b?b.key:'');
 let sw=$('bizSwitch');if(!sw){sw=document.createElement('button');sw.id='bizSwitch';sw.type='button';sw.className='smallbtn';sw.dataset.picker='1';sw.textContent='Tukar';label.after(sw)}
 sw.classList.toggle('hidden',!b);
 $('loginOpen').classList.add('hidden');
 document.querySelectorAll('[data-v2thread]').forEach(btn=>{const t=state.threads?.find(t=>t.customer_id===btn.dataset.v2thread);if(t&&(t.business==='both'||t.business==='unknown')&&!btn.querySelector('.biz-tag')){const s=document.createElement('span');s.className='badge biz-tag';s.textContent=t.business==='both'?'Kongsi Recond+Proton':'Belum dikelaskan';btn.querySelector('small')?.after(s)}});
}
function workspacesPage(){
 return `<div class="picker"><div class="eyebrow">LANGKAH 2 · PILIH WORKSPACE</div><h1>Mahu bekerja di mana hari ini?</h1><p class="muted">Setiap workspace mempunyai prospek, perbualan, arahan AI dan tetapan sendiri. Anda boleh bertukar bila-bila masa.</p><div class="picker-grid">${['recond','proton'].map(k=>`<button type="button" class="picker-card ${k}" data-biz="${k}" data-page="dashboard"><span class="pc-tag">${WS[k].label}</span><b>Masuk ${WS[k].short}</b><small>${WS[k].blurb}</small><em>Buka Dashboard ${WS[k].short} →</em></button>`).join('')}</div></div>`;
}
const rc4PrevRender=render;
render=function(){
 if(!state.session){document.body.classList.remove('authed');return}
 const sig=state.business+'|'+state.page+'|'+kc.tab;
 if(state.page==='knowledge'&&kc.tab!=='docs'&&kcFocusInEditor()&&sig===kc.lastSig&&!kc.force){decorate();return}
 kc.lastSig=sig;
 document.body.classList.add('authed');
 const b=state.business;
 document.body.dataset.ws=b||'';document.body.classList.toggle('picking',!b);
 if(!b||state.page==='workspaces'){state.page='workspaces';v2Nav();$('view').innerHTML=workspacesPage()}
 else rc4PrevRender();
 decorate();
 if(state.page==='knowledge')kcAfterRender();
 if(state.page==='settings'&&b?.key==='proton'&&!platform.catalogAuto){platform.catalogAuto=true;setTimeout(()=>document.querySelector('[data-platform="catalog"]')?.click(),30)}
};
document.addEventListener('click',e=>{
 const g=e.target.closest('[data-grp]');if(g){e.stopImmediatePropagation();const k=g.dataset.grp;ui.open[k]=!ui.open[k];g.setAttribute('aria-expanded',String(ui.open[k]));const panel=g.parentElement.querySelector('.ws-sub');if(panel)panel.hidden=!ui.open[k];return}
 const p=e.target.closest('[data-picker]');if(p){e.stopImmediatePropagation();if($('moreDialog').open)$('moreDialog').close();state.business=null;state.page='workspaces';ui.open={recond:false,proton:false};render();return}
 const s=e.target.closest('[data-biz]');if(s){e.stopImmediatePropagation();e.preventDefault();switchWorkspace(s.dataset.biz,s.dataset.page)}
},true);
/* page change inside a workspace must refetch nothing but re-render; reset catalogue auto-load flag on leaving settings */
document.addEventListener('click',e=>{const b=e.target.closest('[data-page],[data-go]');if(b&&!b.dataset.biz&&(b.dataset.page||b.dataset.go)!=='settings')platform.catalogAuto=false});

/* ---------- workspace-aware pages ---------- */
const rc4Dashboard=dashboard;
dashboard=function(){
 const wb=waBadge();
 const analytics=analyticsPage().replace(/^<div class="hero">[\s\S]*?<\/span><\/div>/,'');
 return head('Dashboard '+biz().short,'Urus prospek. Fahami perbualan. Susun tindakan seterusnya.')+rc4Dashboard().replace(/^<div class="hero">[\s\S]*?<\/span><\/div>/,'').replace('<span class="badge warn">WhatsApp API · Belum disahkan</span><button data-verify>Verify WhatsApp ↗</button>','<span class="badge '+wb.cls+'">'+esc(wb.t)+'</span><button data-verify>Semak sambungan</button>')+`<details class="card section"><summary><b>Analitik jualan ${esc(biz().short)}</b></summary>${analytics}</details>`;
};
const rc4PrevInbox=inboxPage;
inboxPage=function(){const b=biz();return rc4PrevInbox().replace('Carian perbualan Recond dan Proton; satu rekod pelanggan.','Perbualan '+b.short+' sahaja. Pelanggan yang berminat kedua-dua bisnes ditandakan “Kongsi”.').replace('AI Conversation Inbox','WhatsApp Inbox '+b.short)};
const rc4PrevLeadCards=leadCards;
leadCards=function(rows){
 let html=rc4PrevLeadCards(rows);
 for(const l of rows){if(l.business_type==='both'||l.business_type==='unknown'){const marker='data-lead="'+esc(l.id)+'"';const i=html.indexOf(marker);if(i<0)continue;const j=html.indexOf('</strong>',i);if(j<0)continue;html=html.slice(0,j+9)+'<span class="badge biz-tag">'+(l.business_type==='both'?'Kongsi Recond+Proton':'Belum dikelaskan')+'</span>'+html.slice(j+9)}}
 return html;
};
const rc4PrevDetail=detail;
detail=async function(id){
 await rc4PrevDetail(id);
 const f=$('crmEdit'),l=v3.current?.lead;
 if(!f||!l||f.elements.business_type)return;
 const wrap=document.createElement('div');
 wrap.innerHTML=`<label>Minat bisnes</label><select name="business_type"><option value="" ${['recond','proton','both'].includes(l.business_type)?'disabled':'selected'}>Belum dikelaskan</option><option value="recond" ${l.business_type==='recond'?'selected':''}>Recond sahaja</option><option value="proton" ${l.business_type==='proton'?'selected':''}>Proton sahaja</option><option value="both" ${l.business_type==='both'?'selected':''}>Kedua-dua (rekod kongsi, tiada duplikat)</option></select>`;
 f.insertBefore(wrap,f.querySelector('p'));
};
exportCSV=function(){
 if(!state.leads)return;const keys=['name','phone','model_interest','budget','area','channel','prospect_status','resolution','next_follow_up_date','unit_number','business_type'];
 const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
 const csv='﻿'+[keys.map(cell).join(','),...state.leads.map(l=>keys.map(k=>cell(l[k])).join(','))].join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Leads-'+biz().short+'-'+day()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
};
const rc4PrevSettings=settingsPage;
settingsPage=function(){
 const b=biz();let html=rc4PrevSettings();
 html=html.replace(/^<div class="hero">[\s\S]*?<\/span><\/div>/,head('Tetapan '+b.short,'Sambungan, eksport dan tetapan khusus untuk workspace '+b.short+'.'));
 html=html.replace('<p><button id="export" ','<p><button id="export" title="Eksport prospek workspace '+b.short+'" ');
 if(b.key==='recond')html=html.replace(/<section class="card section"><h2>Katalog Proton<\/h2>[\s\S]*?<\/section>/,`<section class="card section"><h2>Stok Recond</h2><p class="muted">AI Recond membaca stok langsung daripada database stok Abang Recond. Tiada stok diurus atau disalin di sini, jadi tiada harga atau unit boleh direka. Urus stok di sistem stok sedia ada.</p></section>`);
 return html.replace('<h2>WhatsApp Business Platform</h2>','<h2>WhatsApp Business Platform (kongsi Recond &amp; Proton)</h2>');
};
const rc4PrevFollow=followPage;
followPage=function(){return rc4PrevFollow().replace('Follow-up Advisor','AI Follow-up Advisor '+biz().short)};

/* ---------- AI test panel (shared by Agents and Knowledge Center) ---------- */
function testPanel(){
 const b=biz(),dirty=kcAnyDirty(b.key);
 return `<section class="card section kc-test"><h2>Uji AI ${esc(b.short)} <span class="badge">Preview</span></h2><p class="muted">Tiada mesej WhatsApp dihantar dan tiada lead dicipta. Jawapan menggunakan konfigurasi sebenar yang dipakai runtime.</p><label for="aiTestMsg">Mesej pelanggan (contoh)</label><textarea id="aiTestMsg" maxlength="4000" style="min-height:84px">${esc(kc.testMsg[b.key]||b.sample)}</textarea><label class="check-label" style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="aiTestDraft" style="width:auto;min-height:0" ${dirty?'checked':''}> Guna teks dalam editor (termasuk yang belum disimpan)</label><div class="row"><button class="primary" id="aiTestRun" type="button">Uji AI</button></div><pre id="aiTestOut" class="knowledge-text" aria-live="polite">${esc(kc.out[b.key]||'')}</pre></section>`;
}
document.addEventListener('click',async e=>{
 const btn=e.target.closest('#aiTestRun');if(!btn)return;e.stopImmediatePropagation();
 const b=biz(),gen=state.generation,out=$('aiTestOut'),msg=$('aiTestMsg').value.trim();
 if(!msg){toast('Taip mesej ujian dahulu.');return}
 kc.testMsg[b.key]=msg;btn.disabled=true;out.textContent='Menjana respons…';
 try{
  const useDraft=$('aiTestDraft').checked;
  const d=await writeAPI('test_agent',{message:msg,use_draft:useDraft,draft_instructions:kcText('instructions'),draft_reply_style:kcText('reply_style')});
  const meta=`\n\n— Model ${d.model} · ${d.used_draft?'guna teks editor (belum tentu disimpan)':'guna versi tersimpan'} · Instructions v${d.config.instructions_version} · Cara Jawab v${d.config.reply_style_version} · Tiada WhatsApp dihantar · Tiada lead dicipta`;
  kc.out[b.key]=d.answer+meta;
 }catch(err){kc.out[b.key]='Ujian gagal: '+err.message}
 if(gen===state.generation&&state.business===b.key&&$('aiTestOut'))$('aiTestOut').textContent=kc.out[b.key];
 btn.disabled=false;
},true);

/* ---------- AI Sales Agent page ---------- */
agentsPage=function(){
 const b=biz();
 return head('AI Sales Agent '+b.short,'Model, arahan dan ujian AI untuk workspace ini sahaja.')+`<div class="grid"><section class="card agent-card"><div class="agent-icon">01</div><span class="badge">CUSTOMER-FACING</span><h2>AI Sales Agent ${esc(b.short)}</h2><p class="muted">${esc(b.blurb)}</p><div class="agent-model"><small>MODEL</small><h3>ILMUchat · ilmu-v3.1</h3></div><p class="muted">Semakan dokumen dan kelulusan pembiayaan kekal tugas Human Sales Advisor.</p><div class="row"><button class="primary" data-kc-open="instructions">Edit Instructions</button><button data-kc-open="reply_style">Edit Cara Jawab Customer</button></div></section><section class="card agent-card"><div class="agent-icon">02</div><span class="badge">DALAMAN</span><h2>AI Follow-up Advisor</h2><p class="muted">Analisis sedia ada (DeepSeek). Draf disemak dan dihantar sendiri oleh Sales Advisor.</p><button data-go="followup">Lihat cadangan ${esc(b.short)}</button></section><section class="card agent-card"><div class="agent-icon">03</div><span class="badge">MANUSIA</span><h2>Human Sales Advisor</h2><p class="muted">Seorang SA. Boleh ambil alih perbualan di WhatsApp Inbox ${esc(b.short)}.</p><button data-go="inbox">Buka Inbox ${esc(b.short)}</button></section></div>`+testPanel();
};
document.addEventListener('click',e=>{const o=e.target.closest('[data-kc-open]');if(!o)return;e.stopImmediatePropagation();kc.tab=o.dataset.kcOpen;if(typeof v5Knowledge!=='undefined')v5Knowledge.section=kc.tab;state.page='knowledge';render()},true);

/* =====================================================================================
   AI KNOWLEDGE CENTER — Instructions · Cara Jawab Customer · Dokumen & Knowledge
   ===================================================================================== */
const kc={tab:'instructions',cfg:{},draft:{},ver:{},verBusy:{},out:{},testMsg:{},loading:{},error:{},busy:false,promptShown:{},verAll:{},conflict:{},lastSig:'',force:false};
const KC_SEC={
 instructions:{title:'System Instructions',tag:'Arahan utama AI',help:['Peranan AI Sales Agent','Maklumat bisnes','Peraturan jualan','Apa yang AI boleh dan tidak boleh buat','Bila perlu serahkan kepada Human SA','Cara semak stok dan sumber data','Larangan mereka harga atau maklumat stok'],ph:'Contoh: Anda ialah AI Sales Agent untuk…'},
 reply_style:{title:'Cara Jawab Customer',tag:'Gaya komunikasi',help:['Bahasa Melayu Malaysia yang natural dan santai','Gaya perbualan setanding ILMUchat','Panggilan tuan/puan','Panjang jawapan','Cara bertanya soalan','Cara handle bantahan (objection)','Cara follow-up','Cara beri harga, ansuran dan pautan stok','Bila tawarkan bantuan Human SA'],ph:'Contoh: Bahasa Melayu Malaysia santai…'}
};
const kcKey=(sec,b=state.business)=>b+':'+sec;
const kcSaved=(sec,b=state.business)=>kc.cfg[b]?.sections?.[sec];
function kcText(sec,b=state.business){const k=kcKey(sec,b);return k in kc.draft?kc.draft[k]:(kcSaved(sec,b)?.content??'')}
function kcDirty(sec,b=state.business){const s=kcSaved(sec,b),k=kcKey(sec,b);return !!s&&k in kc.draft&&kc.draft[k]!==s.content}
function kcAnyDirty(b=state.business){return kcDirty('instructions',b)||kcDirty('reply_style',b)}
function kcAnyDirtyAll(){return ['recond','proton'].some(b=>kcAnyDirty(b))}
const fmtBy=v=>!v?'—':v==='rc4-seed'?'sistem (teks asal RC3)':v;
async function kcLoad(force){
 const b=state.business,gen=state.generation;if(!b||kc.loading[b]||(kc.cfg[b]&&!force))return;
 kc.loading[b]=true;kc.error[b]='';
 try{const d=await api('ar-platform-inbox','config',{business:b});if(gen!==state.generation)return;kc.cfg[b]=d}
 catch(err){if(gen===state.generation)kc.error[b]=err.message}
 finally{kc.loading[b]=false;if(gen===state.generation&&state.page==='knowledge'&&state.business===b&&!kcFocusInEditor())render()}
}
const kcFocusInEditor=()=>document.activeElement?.id==='kcText';
async function kcLoadVersions(sec){
 const b=state.business,gen=state.generation,k=kcKey(sec);
 if(kc.verBusy[k])return;kc.verBusy[k]=true;
 try{const d=await api('ar-platform-inbox','config_versions',{business:b,section:sec});if(gen!==state.generation)return;kc.ver[k]=d.versions}
 catch(err){kc.ver[k]={error:err.message}}
 finally{kc.verBusy[k]=false}
 if(gen===state.generation&&state.page==='knowledge'&&state.business===b&&kc.tab===sec)kcPaintVersions();
}
function kcAfterRender(){
 if(kc.tab!=='docs'){kcLoad();const k=kcKey(kc.tab);if(kc.cfg[state.business]&&!(k in kc.ver))kcLoadVersions(kc.tab);kcPaintVersions();kcRefreshUI()}
 else if(!platform.knowledgeAuto?.[state.business]){platform.knowledgeAuto={...(platform.knowledgeAuto||{}),[state.business]:true};setTimeout(()=>document.querySelector('[data-platform="knowledge"]')?.click(),30)}
}
function kcStatusBadge(sec){
 const s=kcSaved(sec);if(!s)return '<span class="badge">Memuatkan…</span>';
 if(kcDirty(sec))return '<span class="badge warn kc-dirty">● Belum disimpan</span>';
 return `<span class="badge green kc-saved">✓ Aktif · v${s.version}</span>`;
}
function kcEditor(sec){
 const b=biz(),S=KC_SEC[sec],s=kcSaved(sec),max=kc.cfg[b.key]?.max_chars||20000;
 if(kc.error[b.key])return `<div class="notice"><b>Tidak dapat memuatkan.</b> ${esc(kc.error[b.key])}<p><button type="button" data-kc-reload>Cuba lagi</button></p></div>`;
 if(!s)return `<div class="card"><span class="spinner"></span> Memuatkan ${esc(S.title)} ${esc(b.short)}…</div>`;
 const fallbackNote=s.source==='fallback'?`<div class="notice">Belum ada versi tersimpan dalam database. Teks di bawah ialah teks asal sistem yang sedang digunakan. Tekan <b>Publish Changes</b> untuk mula versi 1.</div>`:'';
 return `${fallbackNote}<section class="card kc-editor"><div class="row between"><div><h2>${esc(S.title)} · ${esc(b.short)}</h2><p class="muted">${esc(S.tag)}. Edit, uji dan Publish Changes untuk mengaktifkan. Draf sesi hilang apabila refresh atau log keluar.</p></div><span id="kcBadge">${kcStatusBadge(sec)}</span></div><details class="kc-help"><summary>Apa yang boleh ditulis di sini?</summary><ul>${S.help.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details><textarea id="kcText" class="kc-text" spellcheck="false" maxlength="${max}" aria-label="${esc(S.title)} ${esc(b.short)}" placeholder="${esc(S.ph)}">${esc(kcText(sec))}</textarea><div class="row between kc-meta"><small id="kcCount"></small><small id="kcUpdated">Last updated: ${s.updated_at?date(s.updated_at)+' · oleh '+esc(fmtBy(s.updated_by)):'belum pernah disimpan'}</small></div><div class="row kc-actions"><button class="primary" id="kcSave" type="button">Publish Changes</button><button id="kcDraft" type="button">Save Draft · sesi ini</button><button id="kcRevert" type="button">Buang perubahan</button><button id="kcCopy" type="button">Salin</button><button id="kcPrompt" type="button">Lihat prompt sebenar</button></div><p id="kcMsg" class="kc-msg" role="status"></p><div id="kcPromptBox"></div></section><section class="card section kc-floor"><h3>Peraturan keselamatan sistem</h3><p class="muted">Sentiasa ditambah selepas teks anda dan tidak boleh diubah di sini:</p><pre class="knowledge-text">${esc(kc.cfg[b.key]?.safety_floor||'')}</pre></section><section class="card section kc-history"><div class="row between"><h3>Log perubahan</h3><button type="button" class="smallbtn" id="kcVerAll"></button></div><div id="kcVersions"></div></section>`;
}
function kcDocs(){
 const b=biz(),isP=b.key==='proton';
 return `<section class="card"><div class="row between"><div><h2>Dokumen & Knowledge ${esc(b.short)}</h2><p class="muted">Bahan rujukan tambahan (polisi, kewangan, produk). Hanya entri berstatus <b>Approved</b> digunakan oleh AI ${esc(b.short)}.</p></div><button type="button" data-platform="knowledge">Muat semula senarai</button></div><div id="knowledgeRows"></div></section><section class="card section"><h3>Tambah / kemas kini entri</h3><form id="knowledgeForm"><label>Key unik</label><input name="knowledge_key" required ${isP?'pattern="proton_[a-z0-9_-]+" placeholder="proton_sales_rules"':'pattern="(?!proton_)[a-z0-9_-]+" placeholder="finance_standard"'}><p class="muted" style="font-size:12px;margin:4px 0 10px">${isP?'Key Proton mesti bermula dengan <code>proton_</code>.':'Key Recond tidak boleh bermula dengan <code>proton_</code> (itu milik Proton).'}</p><label>Tajuk</label><input name="title" required maxlength="200"><label>Modul</label><select name="module">${['sales','product','financing','company_policy','learning','promotion'].map(x=>`<option>${x}</option>`).join('')}</select><label>Kandungan</label><textarea name="content" required maxlength="30000" style="min-height:200px"></textarea><label>Import teks TXT (disemak sebelum simpan)</label><input id="importKnowledge" type="file" accept="text/plain,.txt"><label>Status</label><select name="status"><option value="draft">Draft</option><option value="approved">Approved — digunakan runtime</option><option value="archived">Archived</option></select><p class="muted" style="font-size:12px">PDF/DOCX belum diimport; hanya teks.</p><button class="primary">Simpan knowledge</button><p id="knowledgeError" class="error"></p></form></section>`;
}
knowledgePage=function(){
 const b=biz(),tab=kc.tab;
 const tabs=[['instructions','Instructions'],['reply_style','Cara Jawab Customer'],['docs','Dokumen & Knowledge']];
 const dirtyList=['recond','proton'].flatMap(k=>['instructions','reply_style'].filter(s=>kcDirty(s,k)).map(s=>WS[k].short+' · '+KC_SEC[s].title));
 return head('AI Knowledge Center '+b.short,'Dua bahagian jelas: apa AI patut buat (Instructions) dan bagaimana AI bercakap (Cara Jawab Customer).')
  +`<div id="kcBanner">${dirtyList.length?`<div class="notice">● Perubahan belum disimpan: ${esc(dirtyList.join(', '))}</div>`:''}</div>`
  +`<div class="kc-tabs" role="tablist">${tabs.map(t=>`<button type="button" role="tab" aria-selected="${tab===t[0]}" class="${tab===t[0]?'primary':''}" data-kc-tab="${t[0]}">${t[1]}</button>`).join('')}</div>`
  +(tab==='docs'?kcDocs():kcEditor(tab)+testPanel());
};
function kcRefreshUI(){
 const sec=kc.tab;if(sec==='docs'||!$('kcText'))return;
 const s=kcSaved(sec);if(!s)return;
 const t=$('kcText').value,max=kc.cfg[state.business]?.max_chars||20000,dirty=kcDirty(sec);
 $('kcCount').textContent=t.length.toLocaleString('ms-MY')+' / '+max.toLocaleString('ms-MY')+' aksara';
 $('kcBadge').innerHTML=kcStatusBadge(sec);
 $('kcSave').disabled=!dirty||!t.trim()||kc.busy;$('kcRevert').disabled=!dirty;
 const ban=$('kcBanner');if(ban){const list=['recond','proton'].flatMap(k=>['instructions','reply_style'].filter(x=>kcDirty(x,k)).map(x=>WS[k].short+' · '+KC_SEC[x].title));ban.innerHTML=list.length?`<div class="notice">● Perubahan belum disimpan: ${esc(list.join(', '))}</div>`:''}
 const cb=$('aiTestDraft');if(cb&&!cb.dataset.touched)cb.checked=kcAnyDirty();
}
function kcPaintVersions(){
 const box=$('kcVersions');if(!box)return;const sec=kc.tab,k=kcKey(sec),v=kc.ver[k],s=kcSaved(sec);
 const btn=$('kcVerAll');
 if(!v){box.innerHTML='<span class="spinner"></span> Memuatkan log…';if(btn)btn.hidden=true;return}
 if(v.error){box.innerHTML=`<p class="error">${esc(v.error)}</p>`;if(btn)btn.hidden=true;return}
 if(!v.length){box.innerHTML='<p class="muted">Belum ada versi. Versi pertama dicipta apabila anda Publish Changes.</p>';if(btn)btn.hidden=true;return}
 const all=!!kc.verAll[k],rows=all?v:v.slice(0,3);
 if(btn){btn.hidden=v.length<=3;btn.textContent=all?'Tunjuk 3 terkini':'Tunjuk semua ('+v.length+')'}
 box.innerHTML=rows.map(x=>`<article class="timeline"><div class="row between"><b>v${x.version}${s&&x.version===s.version?' · semasa':''}</b>${s&&x.version===s.version?'<span class="badge green">Aktif</span>':`<button type="button" class="smallbtn" data-kc-restore="${x.version}">Guna versi ini</button>`}</div><small>${date(x.created_at)} · ${esc(fmtBy(x.created_by))} · ${x.chars.toLocaleString('ms-MY')} aksara${x.note?' · '+esc(x.note):''}</small><p class="muted" style="margin:6px 0 0;font-size:12.5px">${esc(x.preview)}${x.chars>160?'…':''}</p></article>`).join('');
}
function kcMsg(text,kind){const m=$('kcMsg');if(!m)return;m.textContent=text;m.className='kc-msg '+(kind||'')}
async function kcSave(){
 const sec=kc.tab,b=state.business,gen=state.generation,s=kcSaved(sec),text=kcText(sec);
 if(!s||kc.busy)return;
 if(!text.trim()){kcMsg('Teks tidak boleh kosong.','bad');return}
 kc.busy=true;kcRefreshUI();kcMsg('Menyimpan…');
 try{
  const d=await writeAPI('save_config',{section:sec,content:text,expected_version:s.version,note:''});
  if(gen!==state.generation)return;
  kc.cfg[b].sections[sec]={content:text,version:d.version,updated_at:d.updated_at,updated_by:state.session?.user?.email||'anda',source:'db'};
  delete kc.draft[kcKey(sec,b)];delete kc.ver[kcKey(sec,b)];
  delete kc.conflict[kcKey(sec,b)];
  toast('Disimpan ✓ '+KC_SEC[sec].title+' '+WS[b].short+' · versi '+d.version);
  if(state.page==='knowledge'&&kc.tab===sec&&state.business===b&&$('kcText')){
   $('kcUpdated').textContent='Last updated: '+date(d.updated_at)+' · oleh '+(state.session?.user?.email||'anda');
   kcRefreshUI();kcLoadVersions(sec);kcMsg('✓ Disimpan versi '+d.version+' pada '+date(d.updated_at)+'. AI '+WS[b].short+' guna teks ini bermula mesej seterusnya.','good')}
 }catch(err){
  if(/Versi telah berubah/.test(err.message)){
   try{const fresh=await api('ar-platform-inbox','config',{business:b});if(gen===state.generation){const was=kc.cfg[b].sections[sec];kc.cfg[b].sections[sec]={...fresh.sections[sec],content:was.content};kc.conflict[kcKey(sec,b)]=fresh.sections[sec]}}catch{}
   kcMsg('Versi di server sudah berubah (disimpan dari peranti lain). Teks anda dikekalkan. Tekan Publish Changes sekali lagi untuk menggantikan dengan teks anda, atau Buang perubahan untuk ambil versi server.','bad');
  }else kcMsg('Gagal menyimpan: '+err.message,'bad');
 }finally{kc.busy=false;kcRefreshUI()}
}
async function kcRestore(version){
 const sec=kc.tab,b=state.business,gen=state.generation,s=kcSaved(sec);if(!s||kc.busy)return;
 const warn=kcDirty(sec)?'\n\nPerubahan yang belum disimpan dalam editor akan diganti.':'';
 if(!confirm('Guna versi v'+version+'?\nTeks semasa (v'+s.version+') kekal dalam log; versi lama disalin sebagai versi baharu.'+warn))return;
 kc.busy=true;kcMsg('Memulihkan…');
 try{
  const d=await writeAPI('restore_config',{section:sec,version,expected_version:s.version});
  if(gen!==state.generation)return;
  kc.cfg[b].sections[sec]={content:d.content,version:d.version,updated_at:d.updated_at,updated_by:state.session?.user?.email||'anda',source:'db'};
  delete kc.draft[kcKey(sec,b)];delete kc.ver[kcKey(sec,b)];
  toast('Dipulihkan ✓ v'+version+' → versi baharu v'+d.version);
  if(state.page==='knowledge'&&kc.tab===sec&&state.business===b&&$('kcText')){
   $('kcText').value=d.content;$('kcUpdated').textContent='Last updated: '+date(d.updated_at)+' · oleh '+(state.session?.user?.email||'anda');
   kcRefreshUI();kcLoadVersions(sec);kcMsg('✓ v'+version+' dipulihkan sebagai v'+d.version+'.','good')}
 }catch(err){kcMsg('Gagal memulihkan: '+err.message,'bad')}
 finally{kc.busy=false;kcRefreshUI()}
}
async function kcShowPrompt(){
 const b=state.business,box=$('kcPromptBox');if(!box)return;
 if(kc.promptShown[b]){kc.promptShown[b]=false;box.innerHTML='';return}
 kc.promptShown[b]=true;box.innerHTML='<span class="spinner"></span> Memuatkan…';
 try{const d=await api('ar-platform-inbox','prompt_preview',{business:b});if(!$('kcPromptBox')||!kc.promptShown[b])return;
  $('kcPromptBox').innerHTML=`<div class="notice"><b>Prompt sebenar (versi tersimpan: Instructions v${d.instructions_version}, Cara Jawab v${d.reply_style_version}).</b> Teks dalam editor yang belum disimpan tidak termasuk.<br>${esc(d.note)}<br>Knowledge approved digunakan: ${d.knowledge_keys.length}${d.proton_catalog_verified_rows!=null?' · Baris katalog Proton disahkan (30 hari): '+d.proton_catalog_verified_rows:''}</div><pre class="knowledge-text">${esc(d.owner_block)}</pre>`}
 catch(err){if($('kcPromptBox'))$('kcPromptBox').innerHTML=`<p class="error">${esc(err.message)}</p>`}
}
document.addEventListener('click',e=>{
 const t=e.target.closest('[data-kc-tab]');if(t){e.stopImmediatePropagation();kc.tab=t.dataset.kcTab;if(typeof v5Knowledge!=='undefined')v5Knowledge.section=kc.tab;kc.force=true;render();kc.force=false;return}
 if(e.target.closest('[data-kc-reload]')){e.stopImmediatePropagation();delete kc.error[state.business];kc.force=true;render();kc.force=false;kcLoad(true);return}
 const id=e.target.closest('button')?.id;
 if(id==='kcDraft'){e.stopImmediatePropagation();kc.draft[kcKey(kc.tab)]=$('kcText').value;kcRefreshUI();kcMsg('Draf dikekalkan dalam sesi tab ini sahaja. Belum diterbitkan ke server.');return}
 if(id==='kcSave'){e.stopImmediatePropagation();kcSave();return}
 if(id==='kcRevert'){e.stopImmediatePropagation();const sec=kc.tab;delete kc.draft[kcKey(sec)];$('kcText').value=kcSaved(sec)?.content??'';kcRefreshUI();kcMsg('Perubahan dibuang.');return}
 if(id==='kcCopy'){e.stopImmediatePropagation();copyText($('kcText').value);return}
 if(id==='kcPrompt'){e.stopImmediatePropagation();kcShowPrompt();return}
 if(id==='kcVerAll'){e.stopImmediatePropagation();const k=kcKey(kc.tab);kc.verAll[k]=!kc.verAll[k];kcPaintVersions();return}
 const r=e.target.closest('[data-kc-restore]');if(r){e.stopImmediatePropagation();kcRestore(Number(r.dataset.kcRestore))}
},true);
document.addEventListener('input',e=>{
 if(e.target.id==='kcText'){kc.draft[kcKey(kc.tab)]=e.target.value;kcRefreshUI();kcMsg('')}
 if(e.target.id==='aiTestMsg')kc.testMsg[state.business]=e.target.value;
});
document.addEventListener('change',e=>{if(e.target.id==='aiTestDraft')e.target.dataset.touched='1'});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'&&e.target.id==='kcText'){e.preventDefault();if(!$('kcSave').disabled)kcSave()}});
window.addEventListener('beforeunload',e=>{if(kcAnyDirtyAll()){e.preventDefault();e.returnValue=''}});

render();

// Ask the browser to offer saving the admin credentials (password manager). Credentials are never stored by this app.
document.addEventListener('submit',e=>{
 if(!e.target||e.target.id!=='loginForm')return;
 const em=$('email').value,pw=$('password').value;
 if(!em||!pw||!window.PasswordCredential||!navigator.credentials||!navigator.credentials.store)return;
 let n=0;const t=setInterval(()=>{
  if(state.session){clearInterval(t);try{navigator.credentials.store(new PasswordCredential({id:em,password:pw,name:em})).catch(()=>{})}catch{}return}
  if(++n>40)clearInterval(t);
 },250);
});

/* ---------- session survives refresh (per tab) ----------
   Only the refresh token + workspace choice go to sessionStorage (cleared when the tab closes or on logout).
   The access token stays in memory. Nothing is written to localStorage. */
(function(){
 const KEY='rc4.sess',WSK='rc4.ws';
 const get=()=>{try{return sessionStorage.getItem(KEY)}catch{return null}};
 const del=()=>{try{sessionStorage.removeItem(KEY);sessionStorage.removeItem(WSK)}catch{}};
 let cur=state.session;
 Object.defineProperty(state,'session',{configurable:true,enumerable:true,get:()=>cur,set(v){cur=v;if(v&&v.refresh_token){try{sessionStorage.setItem(KEY,JSON.stringify({r:v.refresh_token}))}catch{}}}});
 const prevClear=clearSession;
 clearSession=function(){del();prevClear()};
 const prevSW=switchWorkspace;
 switchWorkspace=function(k,p){try{sessionStorage.setItem(WSK,k)}catch{}return prevSW(k,p)};
 let saved=null;try{saved=JSON.parse(get()||'null')}catch{}
 if(!saved||!saved.r)return;
 document.body.classList.add('authed');
 $('view').innerHTML='<p class="muted" style="padding:24px">Memulihkan sesi…</p>';
 (async()=>{
  try{
   const gen=++state.generation;
   const d=await raw('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:saved.r})});
   if(gen!==state.generation)return;
   state.session=d;
   await api('prospect-dashboard','me');
   $('account').textContent=d.user.email;$('logout').classList.remove('hidden');$('loginOpen').classList.add('hidden');
   await load();
   let ws=null;try{ws=sessionStorage.getItem(WSK)}catch{}
   if(ws==='recond'||ws==='proton')await switchWorkspace(ws,'dashboard');
   await applyDeep();
  }catch(e){clearSession()}
 })();
})();

/* ---------- WhatsApp status from real evidence (webhook events), not a fixed label ---------- */
const wa={s:null,err:'',at:0};
function waBadge(){
 const s=wa.s,e=s&&s.latest_event;
 if(!s)return{cls:'warn',t:wa.err?'WhatsApp API · status tidak dapat dibaca':'WhatsApp API · menyemak…'};
 if(e&&e.processing_status==='processed'&&['sent','delivered','read'].includes(e.delivery_status))return{cls:'green',t:'WhatsApp API · Aktif · balasan terakhir '+date(e.created_at)};
 if(e)return{cls:'warn',t:'WhatsApp API · mesej terakhir '+date(e.created_at)+' ('+e.processing_status+'/'+(e.delivery_status||'-')+')'};
 return{cls:'warn',t:'WhatsApp API · belum ada mesej diterima'};
}
async function waLoad(){
 if(!state.session||Date.now()-wa.at<30000)return;wa.at=Date.now();const gen=state.generation;
 try{const d=await api('ar-platform-inbox','connection_status');if(gen!==state.generation)return;wa.s=d;wa.err=''}catch(e){wa.err=String(e.message||e)}
 if(gen===state.generation&&state.page==='dashboard'&&state.business)render();
}
verify=async function(){
 if(!state.session){$('loginDialog').showModal();toast('Login admin diperlukan untuk menyemak sambungan.');return}
 state.page='settings';render();
 const box=()=>$('verifyResult');if(box()){box().style.whiteSpace='pre-wrap';box().textContent='Menyemak sambungan…'}
 const gen=state.generation;wa.at=0;
 const r=await Promise.allSettled([api('ar-platform-inbox','connection_status'),api('ar-platform-inbox','capabilities')]);
 if(gen!==state.generation||!box())return;
 const L=[];
 if(r[0].status==='fulfilled'){
  wa.s=r[0].value;wa.err='';const s=wa.s,e=s.latest_event,b=waBadge();
  L.push('Nombor: '+(s.number||'-'));
  L.push(e?'Mesej terakhir diterima: '+date(e.created_at)+'\nPemprosesan: '+e.processing_status+'\nPenghantaran balasan: '+(e.delivery_status||'-'):'Belum ada mesej diterima oleh webhook.');
  L.push('Keputusan: '+b.t);
 }else L.push('Status sambungan gagal dibaca: '+r[0].reason.message);
 if(r[1].status==='fulfilled'){const c=r[1].value;L.push('AI: ILMU '+(c.ilmu_configured?'dikonfigurasi':'BELUM dikonfigurasi')+' · model '+(c.sales_model||'-')+' · backend '+(c.version||'-'))}
 L.push('\nNota: ini bukti operasi sebenar (mesej diterima dan balasan dihantar). Ia bukan semakan pendaftaran Meta; token dan Phone Number ID tidak dipaparkan.');
 box().textContent=L.join('\n');
};


/* ---------- deep links from notifications: /?ws=recond|proton&page=inbox|leads|followup ---------- */
let deepPending=null;
const DEEP_PAGES=['dashboard','leads','inbox','agents','followup','knowledge','settings','magic','cmo'];
function takeDeep(u){
 try{
  const x=new URL(u,location.origin),ws=x.searchParams.get('ws'),pg=x.searchParams.get('page');
  if((ws==='recond'||ws==='proton')&&x.origin===location.origin)deepPending={ws,page:DEEP_PAGES.includes(pg)?pg:'dashboard'};
 }catch{}
}
async function applyDeep(){
 const d=deepPending;if(!d||!state.session)return;deepPending=null;
 try{await switchWorkspace(d.ws,d.page)}catch{}
}
takeDeep(location.href);
if(deepPending){try{history.replaceState(null,'',location.pathname)}catch{}}
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',async e=>{
 if(e.data&&e.data.type==='open'){takeDeep(e.data.url);await applyDeep();}
});
(function(){
 const prev=load;
 load=async function(){const r=await prev.apply(this,arguments);if(deepPending&&state.session&&!state.business)await applyDeep();return r};
})();

/* ---------- Push notifications (Tetapan) ---------- */
const np={supported:false,ios:false,standalone:false,perm:'default',sub:null,prefs:null,devices:0,busy:false,msg:'',loaded:false,hide:false};
(function(){
 np.supported='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
 np.ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 np.standalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
 np.perm=('Notification' in window)?Notification.permission:'denied';
})();
const NP_EV=[['handoff','Handoff ke manusia (perlu Sales Advisor)'],['message','Mesej WhatsApp baharu'],['lead','Lead baharu'],['followup','Follow-up tertunggak (ringkasan 9 pagi)']];
function npB64(k){const p='='.repeat((4-k.length%4)%4),b=(k+p).replace(/-/g,'+').replace(/_/g,'/'),r=atob(b);return Uint8Array.from(r,c=>c.charCodeAt(0))}
async function npReg(){return navigator.serviceWorker.ready}
async function npPush(action,body){return writeAPI(action,body||{},'ar-platform-push')}
async function npLoad(force){
 if(!np.supported||!state.session||(np.loaded&&!force))return;
 const gen=state.generation;np.loaded=true;
 try{
  const reg=await npReg();np.sub=await reg.pushManager.getSubscription();
  const s=await npPush('status',{endpoint:np.sub?np.sub.endpoint:''});
  if(gen!==state.generation)return;
  np.devices=s.devices||0;np.prefs=s.subscribed?s.prefs:null;
  if(np.sub&&!s.subscribed)np.sub=null;   // server forgot this device
 }catch(e){np.msg='Status notifikasi gagal dibaca: '+(e.message||e)}
 if(gen===state.generation&&state.page==='settings')render();
}
function npCard(){
 if(!np.supported){
  return `<section class="card section" id="npCard"><h2>Notifikasi</h2><p class="muted">${np.ios&&!np.standalone?'Di iPhone, notifikasi hanya berfungsi selepas portal ditambah ke Home Screen: tekan butang Kongsi (Share) di Safari → "Add to Home Screen" → buka portal dari ikon itu, kemudian kembali ke sini (iOS 16.4 ke atas).':'Pelayar ini tidak menyokong notifikasi push. Cuba Chrome, Edge atau Safari terkini.'}</p></section>`;
 }
 const on=!!(np.sub&&np.prefs);const p=np.prefs||{events:NP_EV.map(x=>x[0]),businesses:['recond','proton'],hide_preview:false};
 const iosHint=np.ios&&!np.standalone?`<p class="muted"><b>iPhone:</b> tambah portal ke Home Screen dahulu (Share → Add to Home Screen), buka dari ikon itu, kemudian aktifkan di sini.</p>`:'';
 const denied=np.perm==='denied'?`<p class="muted" style="color:var(--danger,#b3261e)">Kebenaran notifikasi disekat untuk laman ini. Benarkan semula dalam tetapan pelayar/telefon, kemudian muat semula.</p>`:'';
 const opts=on?`<div class="np-opts"><p><b>Beritahu saya apabila:</b></p>${NP_EV.map(([k,t])=>`<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" style="width:auto;min-height:0" data-np-ev="${k}" ${p.events.includes(k)?'checked':''}> ${esc(t)}</label>`).join('')}<p style="margin-top:12px"><b>Workspace:</b></p>${[['recond','Recond'],['proton','Proton']].map(([k,t])=>`<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" style="width:auto;min-height:0" data-np-bz="${k}" ${p.businesses.includes(k)?'checked':''}> ${t}</label>`).join('')}<label style="display:flex;gap:8px;align-items:center;margin:12px 0"><input type="checkbox" style="width:auto;min-height:0" id="npHide" ${p.hide_preview?'checked':''}> Sembunyikan kandungan mesej (paparkan "Buka portal" sahaja)</label></div>`:'';
 return `<section class="card section" id="npCard"><h2>Notifikasi <span class="badge">${on?'AKTIF PADA PERANTI INI':'MATI'}</span></h2><p class="muted">Terima amaran di telefon atau komputer ini walaupun portal tidak dibuka. Setiap peranti didaftar sendiri. ${np.devices?np.devices+' peranti berdaftar.':''}</p>${iosHint}${denied}${opts}<div class="row">${on?`<button id="npTest" type="button">Hantar notifikasi ujian</button><button id="npOff" type="button">Matikan pada peranti ini</button>`:`<button class="primary" id="npOn" type="button" ${np.busy?'disabled':''}>Aktifkan notifikasi</button>`}</div><p class="muted" id="npMsg" aria-live="polite">${esc(np.msg)}</p></section>`;
}
(function(){
 const prev=settingsPage;
 settingsPage=function(){const h=prev();setTimeout(()=>npLoad(false),0);return h+npCard()};
})();
function npSay(t){np.msg=t;const m=$('npMsg');if(m)m.textContent=t}
async function npSave(){
 if(!np.sub)return;
 const ev=[...document.querySelectorAll('[data-np-ev]')].filter(x=>x.checked).map(x=>x.dataset.npEv);
 const bz=[...document.querySelectorAll('[data-np-bz]')].filter(x=>x.checked).map(x=>x.dataset.npBz);
 const hide=!!($('npHide')&&$('npHide').checked);
 try{await npPush('prefs',{endpoint:np.sub.endpoint,events:ev,businesses:bz,hide_preview:hide});np.prefs={...np.prefs,events:ev,businesses:bz,hide_preview:hide};npSay('Pilihan disimpan.')}
 catch(e){npSay('Gagal simpan: '+(e.message||e))}
}
document.addEventListener('change',e=>{if(e.target.closest('#npCard')&&(e.target.matches('[data-np-ev],[data-np-bz],#npHide')))npSave()});
document.addEventListener('click',async e=>{
 const t=e.target.closest('#npOn,#npOff,#npTest');if(!t)return;
 if(t.id==='npOn'){
  np.busy=true;t.disabled=true;npSay('Meminta kebenaran…');
  try{
   const perm=await Notification.requestPermission();np.perm=perm;
   if(perm!=='granted'){npSay(perm==='denied'?'Kebenaran ditolak. Benarkan dalam tetapan pelayar/telefon.':'Kebenaran tidak diberi.');return}
   const reg=await npReg();
   const cfg=await npPush('config');
   let sub=await reg.pushManager.getSubscription();
   if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:npB64(cfg.public_key)});
   const j=sub.toJSON();
   await npPush('subscribe',{subscription:{endpoint:j.endpoint,keys:j.keys},events:NP_EV.map(x=>x[0]),businesses:['recond','proton'],hide_preview:false});
   np.sub=sub;np.msg='Notifikasi diaktifkan pada peranti ini.';await npLoad(true);
  }catch(err){np.msg='Gagal mengaktifkan: '+(err.message||err)}
  finally{np.busy=false;if(state.page==='settings')render()}
 }else if(t.id==='npOff'){
  t.disabled=true;
  try{const ep=np.sub.endpoint;try{await np.sub.unsubscribe()}catch{}await npPush('unsubscribe',{endpoint:ep});np.sub=null;np.prefs=null;np.msg='Notifikasi dimatikan pada peranti ini.';await npLoad(true)}
  catch(err){np.msg='Gagal mematikan: '+(err.message||err)}
  finally{if(state.page==='settings')render()}
 }else{
  t.disabled=true;npSay('Menghantar…');
  try{const r=await npPush('test',{endpoint:np.sub.endpoint});npSay(r.ok?'Notifikasi ujian dihantar. Semak peranti anda.':'Server tidak dapat menghantar (peranti mungkin tamat tempoh). Cuba matikan dan aktifkan semula.')}
  catch(err){npSay('Ujian gagal: '+(err.message||err))}
  finally{t.disabled=false}
 }
});
(function(){const prev=clearSession;clearSession=function(){np.loaded=false;np.prefs=null;np.msg='';prev()}})();
