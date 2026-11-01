'use strict';
/* AI Infrastructure module: read-only inventory + AI diagnostic plan.
   Never sends credentials, customer chat, source files or raw database rows to an LLM.
   This is an additive module, loaded after all existing workspace layers. */
(function(){
  if(typeof UI_EN!=='undefined')Object.assign(UI_EN,{"Semua projek Netlify, Supabase dan Cloudflare dalam satu dashboard.": "All your Netlify, Supabase and Cloudflare projects in one dashboard.", "Belum scan": "Not scanned", "↻ Scan semua projek": "↻ Scan all projects", "Belum ada hasil API.": "No API results yet.", "Keselamatan:": "Security:", "Tiada token provider atau API key dihantar ke browser. AI menerima metadata projek yang dihadkan, bukan data pelanggan. Semua tindakan perubahan production tidak tersedia dalam versi ini.": "Provider tokens and API keys stay on the server. AI receives limited project metadata. Production changes are unavailable in this version.", "Inventori projek": "Project inventory", "Inventori separa. Had pagination atau kebenaran API mengehadkan hasil.": "Partial inventory. Pagination limits or API permissions restrict these results.", "Cloudflare: Workers dan DNS zones sahaja. Kesihatan, logs dan penggunaan request belum diperiksa.": "Cloudflare: Workers and DNS zones only. Health, logs and request usage have not been inspected.", "Projek / Worker": "Project / Worker", "Jenis": "Type", "Pilih": "Select", "Tekan Scan semua projek. Jika token sambungan tiada, panel akan menunjukkan CONFIG_REQUIRED — bukan berpura-pura berjaya.": "Select Scan all projects. Missing connection tokens are reported explicitly.", "Diagnose bersama AI": "Diagnose with AI", "Diagnosis berpandukan inventori daripada API sebenar. Tiada pembacaan secret, mesej pelanggan atau database rows.": "Diagnosis uses API inventory metadata. Secrets, customer messages and database rows are excluded.", "Fokus projek": "Project focus", "Semua projek (ringkasan)": "All projects (summary)", "Arahan diagnosis": "Diagnosis instructions", "Diagnose & cadangkan repair": "Diagnose & suggest repairs", "Salin laporan": "Copy report", "Export laporan": "Export report", "Auto Repair Production · Locked": "Auto Repair Production · Locked", "AI tidak melakukan repair dalam versi ini. Hasil diagnosis boleh digunakan sebagai handover untuk Work/agent coding dan kemudian diuji di staging.": "AI does not perform repairs in this version. Use its findings as a coding handover and verify changes in staging.", "Memanggil API provider…": "Calling provider APIs…", "Menganalisis konfigurasi…": "Analysing configuration…"});
  const ih={active:false,busy:false,data:null,report:null,error:'',selected:'',model:'deepseek',question:'Semak risiko konfigurasi, deployment dan connectivity. Cadangkan punca utama serta ujian seterusnya.',loadingText:'',generation:0,controller:null};
  const el=id=>document.getElementById(id);
  const clean=x=>esc(x==null?'':String(x));
  const hasLogin=()=>!!state.session;
  const key=(provider,id)=>provider+'|'+id;
  const escapeAttr=clean;
  function menu(){return `<div class="ws-grp infra-workspace"><button type="button" class="infra-inmenu ${ih.active?'is-active':''}" data-infra-open aria-label="AI Infrastructure, semua projek"><span>▦</span><b>AI INFRASTRUCTURE</b><span style="margin-left:auto;font-size:11px">${ih.active?'●':'↗'}</span></button></div>`}
  // Third top-level menu below both existing businesses, including the mobile More menu.
  const oldNav=navHTML;
  navHTML=function(forceOpen,pre){return oldNav(forceOpen,pre)+menu()};
  function projectRows(){
    const a=ih.data?.providers||{};
    const rows=[];
    for(const provider of ['cloudflare','netlify','supabase']){
      const d=a[provider];if(!d||!Array.isArray(d.projects))continue;
      for(const item of d.projects)rows.push({provider,id:String(item.id||''),name:String(item.name||item.id||'—'),kind:String(item.kind||''),status:String(item.status||''),url:String(item.url||'')});
    }
    return rows;
  }
  function stat(provider,label){const d=ih.data?.providers?.[provider];return `<section class="infra-panel"><div class="infra-muted">${label}</div><div class="infra-stat">${d?.projects?.length ?? '—'}</div><span class="infra-tag ${!d?'':d.ok?'ok':'warn'}">${!d?'Belum scan':d.ok?(d.partial?'API connected · PARTIAL':'API connected'):clean(d.error||'Not connected')}</span></section>`}
  function view(){
    const rows=projectRows();const target=rows.find(x=>key(x.provider,x.id)===ih.selected);
    const opts=`<option value="">Semua projek (ringkasan)</option>`+rows.map(x=>`<option value="${escapeAttr(key(x.provider,x.id))}" ${key(x.provider,x.id)===ih.selected?'selected':''}>${clean(x.provider)} · ${clean(x.name)}</option>`).join('');
    return `<section class="infra-page">
      <div class="infra-hero"><div><div class="infra-eyebrow">KERJA SENDIRI · ADMIN TOOLS</div><h1>AI Infrastructure</h1><p>Semua projek Netlify, Supabase dan Cloudflare dalam satu dashboard.</p></div><span class="infra-pill">READ-ONLY · REPAIR LOCKED</span></div>
      <div class="infra-grid">${stat('cloudflare','Cloudflare · Workers / Zones')}${stat('netlify','Netlify · Sites')}${stat('supabase','Supabase · Projects')}</div>
      <div class="infra-panel"><div class="infra-actions"><button type="button" class="primary" data-infra-action="inventory" ${ih.busy?'disabled':''}>↻ Scan semua projek</button><span class="infra-muted">${ih.data?.at?'Disemak: '+clean(ih.data.at):'Belum ada hasil API.'}</span></div><p class="infra-note"><b>Keselamatan:</b> Tiada token provider atau API key dihantar ke browser. AI menerima metadata projek yang dihadkan, bukan data pelanggan. Semua tindakan perubahan production tidak tersedia dalam versi ini.</p></div>
      <section class="infra-panel section"><h2>Inventori projek</h2>${Object.values(ih.data?.providers||{}).some(p=>p.partial)?'<p class="infra-error">Inventori separa. Had pagination atau kebenaran API mengehadkan hasil.</p>':''}<p class="infra-note">Cloudflare: Workers dan DNS zones sahaja. Kesihatan, logs dan penggunaan request belum diperiksa.</p>${rows.length?`<div class="infra-tablewrap"><table class="infra-table"><thead><tr><th>Platform</th><th>Projek / Worker</th><th>Jenis</th><th>Status</th><th></th></tr></thead><tbody data-no-i18n>${rows.map(x=>`<tr><td>${clean(x.provider)}</td><td><strong>${clean(x.name)}</strong><div class="infra-muted">${clean(x.id)}</div></td><td>${clean(x.kind||'—')}</td><td><span class="infra-tag">${clean(x.status||'—')}</span></td><td><button data-infra-select="${escapeAttr(key(x.provider,x.id))}">Pilih</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="infra-muted">Tekan Scan semua projek. Jika token sambungan tiada, panel akan menunjukkan CONFIG_REQUIRED — bukan berpura-pura berjaya.</p>'}</section>
      <section class="infra-panel section"><h2>Diagnose bersama AI</h2><p class="infra-muted">Diagnosis berpandukan inventori daripada API sebenar. Tiada pembacaan secret, mesej pelanggan atau database rows.</p><div class="infra-pair"><label>Fokus projek<select id="infraTarget" data-no-i18n>${opts}</select></label><label>Model<select id="infraModel"><option value="deepseek" ${ih.model==='deepseek'?'selected':''}>DeepSeek (utama)</option><option value="openai" ${ih.model==='openai'?'selected':''}>OpenAI</option></select></label></div><p class="infra-muted">${target?'Dipilih: '+clean(target.name):'Seluruh infrastruktur — penilaian ringkas'}</p><label for="infraQuestion">Arahan diagnosis</label><textarea id="infraQuestion" maxlength="1200" placeholder="Contoh: Semak route deployment dan risiko downtime">${clean(ih.question)}</textarea><div class="infra-actions"><button type="button" class="primary" data-infra-action="diagnose" ${ih.busy||!ih.data?'disabled':''}>Diagnose & cadangkan repair</button><button type="button" data-infra-action="copy" ${!ih.report?'disabled':''}>Salin laporan</button><button type="button" data-infra-action="download" ${!ih.report?'disabled':''}>Export laporan</button><button type="button" class="infra-repair" disabled title="Perlu repo, isolated tests dan approval sebelum action">Auto Repair Production · Locked</button></div>${ih.busy?`<div role="status"><span class="infra-spinner"></span>${clean(ih.loadingText)}</div>`:''}${ih.error?`<p role="alert" class="infra-error">${clean(ih.error)}</p>`:''}${ih.report?`<article data-no-i18n class="infra-report" aria-live="polite">${clean(ih.report.text||'')}<p class="infra-note">${clean(ih.report.model_name||ih.report.model)} · ${clean(ih.report.at)}<br>Token input: ${clean(ih.report.usage?.prompt_tokens??'—')} · output: ${clean(ih.report.usage?.completion_tokens??'—')}<br>Kos: belum dikira; rujuk billing provider.</p></article>`:'<p class="infra-note">AI tidak melakukan repair dalam versi ini. Hasil diagnosis boleh digunakan sebagai handover untuk Work/agent coding dan kemudian diuji di staging.</p>'}</section>
    </section>`;
  }
  const prevRender=render;
  render=function(){prevRender();if(!hasLogin()){ih.active=false;ih.report=null;ih.data=null;return}if(ih.active){document.body.dataset.ws='';if(el('bizLabel'))el('bizLabel').textContent='AI INFRASTRUCTURE';el('view').innerHTML=view();for(const b of document.querySelectorAll('[data-infra-open]'))b.classList.add('is-active');}};
  const prevClear=clearSession;
  clearSession=function(){ih.controller?.abort();ih.controller=null;ih.busy=false;ih.active=false;ih.data=null;ih.report=null;ih.selected='';ih.error='';ih.generation++;prevClear()};
  async function call(action){
    const g=state.generation,v=++ih.generation;
    const token=await access();if(v!==ih.generation||g!==state.generation)throw Error('Sesi bertukar.');
    ih.controller=new AbortController();const timer=setTimeout(()=>ih.controller?.abort(),65000);
    let r;try{r=await fetch('/api/supabase/functions/v1/infrastructure-control',{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json',apikey:KEY,Authorization:'Bearer '+token},body:JSON.stringify({action,model:ih.model,target:ih.selected,question:ih.question}),signal:ih.controller.signal});}finally{clearTimeout(timer)}
    const data=await r.json().catch(()=>({}));if(v!==ih.generation||g!==state.generation)throw Error('Sesi bertukar.');
    if(!r.ok)throw Error(data.error||`Server error ${r.status}`);return data;
  }
  async function doAction(action){
    if(!hasLogin())return; if(ih.busy)return;
    if(action==='copy'){if(ih.report)navigator.clipboard?.writeText(ih.report.text||'').then(()=>toast('Laporan disalin')).catch(()=>toast('Clipboard tidak tersedia'));return}
    if(action==='download'){if(!ih.report)return;const blob=new Blob([ih.report.text||''],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='AI-Infrastructure-Diagnosis-'+new Date().toISOString().slice(0,10)+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return}
    if(!['inventory','diagnose'].includes(action))return;
    ih.busy=true;ih.error='';ih.loadingText=action==='inventory'?'Memanggil API provider…':'Menganalisis konfigurasi…';render();
    const sessionGeneration=state.generation;
    try{const r=await call(action);if(sessionGeneration!==state.generation)return;if(action==='inventory'){ih.data=r;ih.report=null;}else{ih.report=r;}}
    catch(e){if(sessionGeneration===state.generation)ih.error=String(e.message||e).slice(0,250)}finally{if(sessionGeneration===state.generation){ih.busy=false;if(hasLogin()&&ih.active)render()}}
  }
  // Existing RC4 uses a document CAPTURE handler for [data-biz] and [data-picker].
  // Clear hub state at WINDOW capture first; otherwise legacy render could repaint hub.
  window.addEventListener('click',e=>{
    if(e.target.closest?.('[data-page],[data-go],[data-biz],[data-picker],#logout'))ih.active=false;
  },true);
  const originalSwitchWorkspace=switchWorkspace;
  switchWorkspace=function(k,p){ih.active=false;return originalSwitchWorkspace(k,p)};
  // Capture navigation and prevent legacy buttons from treating this as a Recond/Proton page.
  document.addEventListener('click',e=>{
    const open=e.target.closest?.('[data-infra-open]');if(open){e.preventDefault();e.stopImmediatePropagation();if(!hasLogin()){el('loginDialog').showModal();return}if(el('moreDialog')?.open)el('moreDialog').close();ih.active=true;render();return}
    const act=e.target.closest?.('[data-infra-action]');if(act&&ih.active){e.preventDefault();e.stopImmediatePropagation();doAction(act.dataset.infraAction);return}
    const sel=e.target.closest?.('[data-infra-select]');if(sel&&ih.active){e.preventDefault();e.stopImmediatePropagation();ih.selected=sel.dataset.infraSelect;render();return}
    if(e.target.closest?.('[data-page],[data-go],[data-biz],[data-picker],#logout')){ih.active=false;}
  },true);
  document.addEventListener('change',e=>{if(!ih.active)return;if(e.target.id==='infraTarget')ih.selected=e.target.value;if(e.target.id==='infraModel')ih.model=e.target.value},true);
  document.addEventListener('input',e=>{if(ih.active&&e.target.id==='infraQuestion')ih.question=e.target.value},true);
  if(hasLogin())render();
})();
