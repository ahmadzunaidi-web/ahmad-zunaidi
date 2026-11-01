/* Shared navigation uses existing deep links and controllers. No business actions or message sends. */
(() => {
 'use strict';
 if (window.ksV6) return;
 // Window capture runs before legacy target handlers and their session-clearing hooks.
 window.addEventListener('click',e=>{if(e.target.closest?.('#logout')&&!window.confirm('Log keluar daripada Kerja Sendiri?')){e.preventDefault();e.stopImmediatePropagation()}},true);
 const groups = [
  ['Business Overview',[
   ['Overview','/','◫'],['System Health','/?ks=infra','♡'],['Chief of Staff','/ai-sales-command-center?tab=today','◎']]],
  ['Workspaces',[
   ['Abang Recond','/?ws=recond&page=dashboard','▰'],['Abang Proton','/?ws=proton&page=dashboard','▰'],['Takaful Keluarga','/takaful-keluarga?module=dashboard','◈']]],
  ['AI Operations',[
   ['AI Sales Command Center','/ai-sales-command-center','✦'],['AI Agent Management','/ai-sales-command-center?tab=agents','⚙'],['Receptionist & Routing','/ai-sales-command-center?tab=route','⇄'],['AI Infrastructure','/?ks=infra','⌘'],['AI Knowledge Center','/?ks=knowledge','▧']]],
  ['System',[
   ['Integrations','/?ks=infra','⌁'],['Activity & Audit','/ai-sales-command-center?tab=night','◷'],['Settings','/?ks=settings','⚙']]]
 ];
 const all=groups.flatMap(g=>g[1]);
 const businessPages=[['dashboard','Dashboard','◫'],['leads','CRM & Prospek','♙'],['inbox','WhatsApp Inbox','✉'],['agents','AI Sales Agent','◈'],['followup','AI Follow-up Advisor','◷'],['knowledge','AI Knowledge Center','▧'],['settings','Settings','⚙']];
 const forBusiness=(key)=>key==='recond'?[...businessPages,['magic','Magic Ads','✦'],['cmo','CMO Advisor','◎']]:businessPages;
 const takafulPages=[['dashboard','Dashboard','◫'],['crm','CRM & Leads','♙'],['inbox','WhatsApp Inbox','✉'],['agent','AI Sales Agent','◈'],['followup','Follow-up Advisor','◷'],['knowledge','AI Knowledge Center','▧'],['magic','Magic Ads','✦'],['cmo','CMO Advisor','◎'],['settings','Settings','⚙']];
 const workspaceLinks=[...['recond','proton'].flatMap(key=>forBusiness(key).map(p=>[p[1]+' · '+(key==='recond'?'Recond':'Proton'),'/?ws='+key+'&page='+p[0],p[2]])),...takafulPages.map(p=>[p[1]+' · LINDUNG','/takaful-keluarga?module='+p[0],p[2]])];
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const link=(x,cls='ks-v6-link')=>`<a class="${cls}" href="${x[1]}"><span class="ks-v6-icon" aria-hidden="true">${x[2]}</span><span>${esc(x[0])}</span></a>`;
 const root=document.documentElement;root.dataset.ksV6='1';
 try{if(sessionStorage.getItem('ks.v6.theme')==='light')root.dataset.ksTheme='light'}catch{}
 const landing=document.getElementById('landing');
 if(landing)landing.innerHTML=`<div class="ks-v6-welcome"><header><b>KERJA SENDIRI <small>V6</small></b><button type="button" data-login>Log masuk</button></header><section class="ks-v6-intro"><div class="eyebrow">BUSINESS CONTROL CENTER</div><h1>Semua bisnes.<br>Satu tempat kawalan.</h1><p>Urus prospek, perbualan pelanggan dan operasi AI dalam workspace yang tersusun.</p><button type="button" class="primary" data-login>Buka dashboard →</button><p><small>Gunakan akaun owner sedia ada.</small></p></section><div class="ks-v6-workspaces">${[['Abang Recond','Stok, prospek dan operasi jualan.'],['Abang Proton','Prospek, inbox dan pengurusan AI.'],['Takaful Keluarga','LINDUNG, knowledge dan pemasaran.']].map((x,i)=>`<section class="card"><small>0${i+1} / WORKSPACE</small><strong>${x[0]}</strong><p class="muted">${x[1]}</p></section>`).join('')}</div><small>Data pelanggan hanya dibuka selepas pengesahan akaun.</small></div>`;
 if(typeof workspacesPage==='function'){
  const previous=workspacesPage;
  workspacesPage=function(...args){
   if(action==='knowledge'||action==='settings'){
    const isKnowledge=action==='knowledge';
    return `<section class="ks-v6-hub"><div class="eyebrow">AI OPERATIONS</div><h1>${isKnowledge?'AI Knowledge Center':'Workspace Settings'}</h1><p class="muted">Pilih workspace untuk membuka ${isKnowledge?'knowledge yang dipetakan kepada agent dan projek masing-masing':'tetapan sedia ada'}.</p><div class="grid">${[['Recond','/?ws=recond&page='],['Proton','/?ws=proton&page='],['Takaful LINDUNG','/takaful-keluarga?module=']].map(([name,url])=>`<section class="card"><h2>${name}</h2><p class="muted">${isKnowledge?'Arahan, sumber knowledge dan status penerbitan workspace.':'Tetapan akaun, sambungan dan operasi workspace.'}</p><a class="btn primary" href="${url+(isKnowledge?'knowledge':'settings')}">Buka ${isKnowledge?'Knowledge':'Settings'} ${name} →</a></section>`).join('')}</div></section>`;
   }
   return previous(...args).replace('LANGKAH 2 · PILIH WORKSPACE','BUSINESS OVERVIEW').replace('Mahu bekerja di mana hari ini?','Apa yang perlu diurus hari ini?')+`<section class="card"><h2>Operasi hari ini</h2><p class="muted">Buka ringkasan Chief of Staff untuk follow-up, tahap prospek dan isu yang memerlukan perhatian.</p><a class="btn primary" href="/ai-sales-command-center?tab=today">Buka ringkasan jualan →</a></section>`;
  };
 }
 let action=new URL(location.href).searchParams.get('ks'),actionDone=false;
 let requestedTab=new URL(location.href).searchParams.get('tab'),tabDone=false;
 const shell=document.createElement('div');shell.id='ks-v6-shell';shell.hidden=true;
 shell.innerHTML=`<a class="ks-v6-skip" href="#ks-v6-main">Langkau ke kandungan</a><aside class="ks-v6-side" aria-label="Navigation utama"><a class="ks-v6-logo" href="/"><span class="ks-v6-mark">KS</span><span>KERJA SENDIRI<small>BUSINESS CONTROL CENTER</small></span></a>${groups.map(g=>`<div class="ks-v6-group">${g[0]}</div>${g[1].map(x=>link(x)).join('')}`).join('')}</aside><header class="ks-v6-top"><button type="button" data-ks-back aria-label="Kembali ke halaman sebelumnya">←</button><div class="ks-v6-title">Business Control Center</div><button type="button" data-ks-theme aria-label="Tukar tema">◐</button><button type="button" data-ks-menu>Cari / Menu</button></header><nav class="ks-v6-bottom" aria-label="Navigation telefon; leret untuk lagi">${link(all[0],'')}${link(['Workspace','/?ks=workspaces','▦'],'')}${link(['AI Sales','/ai-sales-command-center','✦'],'')}${link(['Inbox','/ai-sales-command-center?tab=inbox','✉'],'')}${link(['AI Infra','/?ks=infra','⌘'],'')}<button type="button" data-ks-menu><span class="ks-v6-icon" aria-hidden="true">•••</span>Menu</button></nav>`;
 document.body.append(shell);
 const menu=document.createElement('dialog');menu.className='ks-v6-menu';menu.setAttribute('aria-label','Cari modul Kerja Sendiri');
 menu.innerHTML=`<header><h2>Cari modul</h2><button type="button" data-ks-close aria-label="Tutup menu">✕</button></header><label for="ks-v6-search">Nama modul atau workspace</label><input id="ks-v6-search" type="search" placeholder="Contoh: Knowledge, Recond, Routing"><nav aria-label="Semua modul">${all.filter(x=>!['/?ks=knowledge','/?ks=settings'].includes(x[1])).map(x=>link(x,'')).join('')}${link(['Knowledge Recond','/?ws=recond&page=knowledge','▧'],'')}${link(['Knowledge Proton','/?ws=proton&page=knowledge','▧'],'')}${link(['Knowledge LINDUNG','/takaful-keluarga?module=knowledge','▧'],'')}${link(['Settings Recond','/?ws=recond&page=settings','⚙'],'')}${link(['Settings Proton','/?ws=proton&page=settings','⚙'],'')}${link(['Settings Takaful','/takaful-keluarga?module=settings','⚙'],'')}${link(['SEO LINDUNG','/takaful-keluarga/seo/','⌕'],'')}</nav><p id="ks-v6-empty" hidden>Tiada modul sepadan. Cuba nama lain.</p>`;
 document.body.append(menu);
 menu.querySelector('nav').insertAdjacentHTML('beforeend',workspaceLinks.map(x=>link(x,'')).join('')+link(['SEO Recond + Kakak Recond','/?ks=seo','⌕'],''));
 menu.querySelector('input').addEventListener('input',e=>{const q=e.target.value.toLocaleLowerCase();let count=0;menu.querySelectorAll('nav a').forEach(a=>{a.hidden=!a.textContent.toLocaleLowerCase().includes(q);if(!a.hidden)count++});menu.querySelector('#ks-v6-empty').hidden=!!count});
 document.addEventListener('click',e=>{
  if(e.target.closest('[data-ks-menu]')){menu.showModal();menu.querySelector('input').focus()}
  if(e.target.closest('[data-ks-close]'))menu.close();
  if(e.target.closest('[data-ks-theme]')){const t=root.dataset.ksTheme==='light'?'dark':'light';root.dataset.ksTheme=t;try{sessionStorage.setItem('ks.v6.theme',t)}catch{}}
  if(e.target.closest('[data-ks-back]')){if(history.length>1&&document.referrer.startsWith(location.origin))history.back();else location.assign('/')}
 });
 function session(){try{return JSON.parse(sessionStorage.getItem('rc4.sess')||'null')?.r||null}catch{return null}}
 function currentHref(){
  const u=new URL(location.href);
  if(u.pathname==='/'&&typeof state!=='undefined'&&state.session){if(state.business)return '/?ws='+state.business+'&page='+state.page;return '/'}
  return u.pathname+u.search;
 }
 function tables(){document.querySelectorAll('table:not([data-ks-cardified])').forEach(t=>{const headings=[...t.querySelectorAll('thead th')].map(th=>th.textContent.trim());if(!headings.length)return;t.dataset.ksCardified='1';t.classList.add('ks-v6-table');t.querySelectorAll('tbody tr').forEach(tr=>[...tr.children].forEach((td,i)=>{if(td.tagName==='TD')td.dataset.ksLabel=headings[i]||''}))})}
 function refresh(){
  const mainState=typeof state!=='undefined'?state:null;
  const ready=mainState?!!mainState.session:!!session();
  shell.hidden=!ready;document.body.classList.toggle('ks-v6-ready',ready);
  const m=document.querySelector('#view')||document.querySelector('#panel')||document.querySelector('main');if(m&&!m.id)m.id='ks-v6-main';
  let context=document.getElementById('ks-v6-context');
  const workspace=mainState?.business||(location.pathname==='/takaful-keluarga'||location.pathname==='/takaful-keluarga/'?'ilindung':null);
  if(ready&&workspace&&m){
   if(!context){context=document.createElement('nav');context.id='ks-v6-context';context.setAttribute('aria-label','Modul workspace');m.before(context)}
   if(context.dataset.workspace!==workspace){context.dataset.workspace=workspace;context.innerHTML=(workspace==='ilindung'?takafulPages.map(p=>[p[1],'/takaful-keluarga?module='+p[0],p[2]]):forBusiness(workspace).map(p=>[p[1],'/?ws='+workspace+'&page='+p[0],p[2]])).map(x=>link(x,'')).join('')}
   context.hidden=false;
  }else if(context)context.hidden=true;
  const skip=shell.querySelector('.ks-v6-skip');if(m)skip.href='#'+m.id;
  shell.querySelector('.ks-v6-title').textContent=document.querySelector('#view h1,#panel h1,#app h1')?.textContent||document.querySelector('h1')?.textContent||document.title;
  const href=currentHref();shell.querySelectorAll('a[href]').forEach(a=>{if(a.getAttribute('href')===href)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  tables();
  // The existing Command Center currently consumes ?tab only for LINDUNG. Reuse its tab handler.
  if(ready&&!tabDone&&requestedTab&&['today','leads','inbox','fu','agents','night','route'].includes(requestedTab)){
   const b=document.querySelector('#tabs [data-tab="'+requestedTab+'"]');if(b&&document.querySelector('#cc-data:not(.hidden)')){tabDone=true;b.click()}
  }
  if(ready&&!mainState?.busy&&!actionDone&&location.pathname==='/'){
   if(action==='infra'){const b=document.querySelector('[data-infra-open]');if(b){actionDone=true;b.click()}}
   else if(action==='seo'){const b=document.querySelector('[data-seo-open]');if(b){actionDone=true;b.click()}}
   else if(action==='knowledge'||action==='settings'){const picker=document.querySelector('[data-picker]');if(picker){actionDone=true;picker.click()}}
   else if(action==='workspaces'){actionDone=true;document.querySelector('[data-picker]')?.click()}
  }
 }
 let timer;function start(){if(!timer)timer=setInterval(refresh,1000);refresh()}
 window.ksV6={refresh};start();
 window.addEventListener('pageshow',start);window.addEventListener('pagehide',()=>{clearInterval(timer);timer=null});
 window.ksSessionSync?.on(refresh);
})();
