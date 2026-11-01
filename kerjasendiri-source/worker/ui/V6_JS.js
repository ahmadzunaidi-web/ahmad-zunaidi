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
 try{const t=sessionStorage.getItem('ks.v6.theme');if(t==='light'||t==='dark')root.dataset.ksTheme=t}catch{}
 const landing=document.getElementById('landing');
 if(landing)landing.innerHTML=`<h1>Kerja Sendiri</h1><button type="button" data-login>Log masuk</button>`;
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
 const ICONS={home:`<path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.8 9.8V19h12.4V9.8"/>`,grid:`<rect x="4" y="4" width="6.6" height="6.6" rx="1.6"/><rect x="13.4" y="4" width="6.6" height="6.6" rx="1.6"/><rect x="4" y="13.4" width="6.6" height="6.6" rx="1.6"/><rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.6"/>`,spark:`<path d="M12 3.5l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z"/>`,inbox:`<path d="M4 13.5 6.4 5.5h11.2L20 13.5V19H4z"/><path d="M4 13.5h4.6l1 2.4h4.8l1-2.4H20"/>`,cpu:`<rect x="6.5" y="6.5" width="11" height="11" rx="2.4"/><rect x="10" y="10" width="4" height="4" rx=".8"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>`,menu:`<path d="M4 7.5h16M4 12h16M4 16.5h16"/>`};
 const dock=(x,extra='')=>`<a class="${extra.trim()}" href="${x[1]}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[x[2]]}</svg><span>${esc(x[0])}</span></a>`;
 const shell=document.createElement('div');shell.id='ks-v6-shell';shell.hidden=true;
 shell.innerHTML=`<a class="ks-v6-skip" href="#ks-v6-main">Langkau ke kandungan</a><button type="button" class="ks-v6-back" data-ks-back aria-label="Kembali ke halaman sebelumnya"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button><nav class="ks-v6-dock" aria-label="Navigasi utama">${dock(['Utama','/','home'])}${dock(['Workspace','/?ks=workspaces','grid'])}${dock(['AI Sales','/ai-sales-command-center','spark'])}${dock(['Inbox','/ai-sales-command-center?tab=inbox','inbox'])}${dock(['AI Infra','/?ks=infra','cpu'],' ks-v6-desk')}<button type="button" data-ks-menu aria-label="Buka menu dan carian"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16M4 12h16M4 16.5h16"/></svg><span>Menu</span></button></nav>`;
 document.body.append(shell);
 const menu=document.createElement('dialog');menu.className='ks-v6-menu';menu.setAttribute('aria-label','Cari modul Kerja Sendiri');
 menu.innerHTML=`<header><h2>Menu</h2><div class="ks-v6-tools"><button type="button" data-ks-theme aria-label="Tukar tema cerah atau gelap"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></svg></button><button type="button" data-ks-close aria-label="Tutup menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div></header><label for="ks-v6-search" class="muted">Cari modul atau workspace</label><input id="ks-v6-search" type="search" placeholder="Contoh: Knowledge, Recond, Routing">${[...groups.map(g=>[g[0],g[1]]),['Modul workspace',[...workspaceLinks,['SEO LINDUNG','/takaful-keluarga/seo/','⌕'],['SEO Recond + Kakak Recond','/?ks=seo','⌕']]]].map(g=>`<section><h3>${esc(g[0])}</h3><nav aria-label="${esc(g[0])}">${g[1].map(x=>link(x,'')).join('')}</nav></section>`).join('')}<p id="ks-v6-empty" hidden>Tiada modul sepadan. Cuba nama lain.</p>`;
 document.body.append(menu);
  menu.querySelector('input').addEventListener('input',e=>{const q=e.target.value.toLocaleLowerCase();let count=0;menu.querySelectorAll('nav a').forEach(a=>{a.hidden=!a.textContent.toLocaleLowerCase().includes(q);if(!a.hidden)count++});menu.querySelectorAll('section').forEach(sec=>{sec.hidden=!sec.querySelector('a:not([hidden])')});menu.querySelector('#ks-v6-empty').hidden=!!count});
 document.addEventListener('click',e=>{
  if(e.target.closest('[data-ks-menu]')){menu.showModal();menu.querySelector('input').focus()}
  if(e.target.closest('[data-ks-close]'))menu.close();
  if(e.target.closest('[data-ks-theme]')){const eff=root.dataset.ksTheme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');const t=eff==='light'?'dark':'light';root.dataset.ksTheme=t;try{sessionStorage.setItem('ks.v6.theme',t)}catch{}}
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
  const back=shell.querySelector('[data-ks-back]');if(back){const u=new URL(location.href);back.hidden=u.pathname==='/'&&!u.search&&!(typeof state!=='undefined'&&state.business)}
  const href=currentHref();[...shell.querySelectorAll('a[href]'),...document.querySelectorAll('#ks-v6-context a[href]')].forEach(a=>{if(a.getAttribute('href')===href)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
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
