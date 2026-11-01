'use strict';
/* Kerja Sendiri AI Infrastructure production V1.3.
   UI for read-only inventory and metadata-only diagnosis.
   No secret keys, write methods or repair operations. */
(()=>{
  if(window.__ksInfraNav114)return;
  window.__ksInfraNav114=true;
  let active=false,busy=false,inventory=null,report=null,error='',model='deepseek';
  let filter='all',query='',limit=24,target='',question='Semak konfigurasi projek, risiko deployment dan punca masalah yang mungkin berlaku.';
  const title={cloudflare:'Cloudflare',netlify:'Netlify',supabase:'Supabase'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeText=(v,n=140)=>esc(String(v??'').slice(0,n));
  const items=()=>['cloudflare','netlify','supabase'].flatMap(provider=>(inventory?.providers?.[provider]?.projects||[]).map(x=>({...x,provider})));
  const counts=()=>Object.fromEntries(['cloudflare','netlify','supabase'].map(k=>[k,inventory?.providers?.[k]?.projects?.length||0]));
  function status(s){
    const k=String(s||'').toUpperCase();
    if(k==='ACTIVE_HEALTHY')return ['Sihat (DB)','good'];
    if(k==='ACTIVE')return ['Aktif','good'];
    if(k==='INACTIVE')return ['Tidak aktif','idle'];
    if(k==='DEPLOYED')return ['Dideploy','blue'];
    if(k==='ERROR'||k==='FAILED')return ['Ralat','bad'];
    return ['Belum disahkan','idle'];
  }
  const list=()=>items().filter(x=>(filter==='all'||x.provider===filter)&&(!query||`${x.name||x.id} ${x.status||''} ${x.provider}`.toLowerCase().includes(query.toLowerCase())));
  function rows(){
    const found=list(),shown=found.slice(0,limit);
    if(!inventory)return '<p class="ix-empty">Belum ada inventori. Tekan <b>Scan semua projek</b>.</p>';
    if(!found.length)return '<p class="ix-empty">Tiada projek sepadan dengan carian.</p>';
    return '<div class="ix-results">'+shown.map(x=>{
      const key=`${x.provider}|${x.id}`;const [label,kind]=status(x.status);
      return `<button type="button" class="ix-project ${target===key?'chosen':''}" data-ix-target="${safeText(key,180)}" aria-pressed="${target===key}"><span class="ix-top"><span class="ix-provider">${safeText(title[x.provider]||x.provider)}</span><span class="ix-status ${kind}">${safeText(label)}</span></span><strong>${safeText(x.name||x.id,140)}</strong><small>${safeText(x.kind||x.region||'Pilih untuk diagnosis khusus projek ini.',140)}</small></button>`;
    }).join('')+'</div>'+(found.length>shown.length?`<button type="button" class="ix-more" data-ix-action="more">Papar lagi ${found.length-shown.length} projek <span aria-hidden="true">↓</span></button>`:'');
  }
  function updateRows(){const h=document.getElementById('ixProjects');if(h)h.innerHTML=rows();const f=document.getElementById('ixShown');if(f)f.textContent=`${Math.min(limit,list().length)} daripada ${list().length} projek`;}
  function injectStyles(){
    if(document.getElementById('ix-v114-style'))return;
    const css=`.ix{--ink:#101827;--muted:#667085;--line:#e5eaf0;max-width:1080px;margin:auto;color:var(--ink);overflow-wrap:anywhere;min-width:0;font:inherit;line-height:1.45}.ix *{box-sizing:border-box;min-width:0}.ix button,.ix input,.ix textarea,.ix select{font:inherit}.ix button{cursor:pointer}.ix-head{background:#101827;color:#fff;padding:22px;border-radius:20px;display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}.ix-head h1{font-size:clamp(24px,5vw,32px);margin:3px 0}.ix-head p{margin:3px 0;color:#cbd5e1;font-size:14px}.ix-eyebrow{font-weight:750;font-size:11px;letter-spacing:1.2px;color:#98d9e9}.ix-tag{font-size:10px;border:1px solid #64748b;padding:6px 10px;border-radius:24px;white-space:nowrap}.ix-back{margin:14px 0;border:1px solid var(--line);background:#fff;padding:10px 14px;border-radius:12px}.ix-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:9px 0 16px}.ix-kpi{background:#fff;border:1px solid var(--line);padding:12px;border-radius:15px}.ix-kpi b{display:block;font-size:26px}.ix-kpi small,.ix-kpi span{display:block;font-size:12px;color:var(--muted);overflow-wrap:anywhere}.ix-panel{background:#fff;border:1px solid var(--line);padding:18px;border-radius:18px;margin:0 0 14px}.ix-panel h2{font-size:18px;margin:0 0 5px}.ix-note{font-size:12px;color:var(--muted);margin:7px 0 15px}.ix-primary{border:0;color:white;background:#101827;padding:12px 16px;border-radius:12px;min-height:44px;font-weight:700}.ix button:disabled{opacity:.48;cursor:default}.ix-toolbar{display:flex;flex-direction:column;gap:10px;margin:14px 0}.ix-search{padding:13px 14px;border:1px solid #ccd3df;background:#fff;border-radius:13px;width:100%;min-height:48px}.ix-filters{display:flex;gap:7px;overflow-x:auto;padding:2px 0 8px}.ix-filter{white-space:nowrap;border:1px solid #d9e0e8;padding:9px 12px;background:white;color:#334155;border-radius:30px;font-size:13px!important}.ix-filter.selected{background:#101827;color:white;border-color:#101827}.ix-count{font-size:12px;color:var(--muted);margin:0 0 9px}.ix-results{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}.ix-project{display:flex;flex-direction:column;text-align:left;gap:6px;width:100%;border:1px solid #dfe5ed;background:#fff;padding:14px;border-radius:14px;max-width:100%;overflow-wrap:anywhere}.ix-project.chosen{border-color:#0284c7;background:#f0f9ff;box-shadow:inset 0 0 0 1px #0284c7}.ix-project strong{font-size:14px;line-height:1.4;overflow-wrap:anywhere}.ix-project small{color:var(--muted);font-size:12px}.ix-top{display:flex;justify-content:space-between;align-items:center;gap:8px}.ix-provider{font-size:11px;font-weight:750;color:#475569}.ix-status{font-size:11px;font-weight:700;padding:5px 8px;border-radius:50px;text-align:center}.ix-status.good{color:#166534;background:#dcfce7}.ix-status.blue{color:#075985;background:#e0f2fe}.ix-status.idle{color:#52525b;background:#f4f4f5}.ix-status.bad{color:#9f1239;background:#ffe4e6}.ix-more{display:block;width:100%;margin-top:10px;border:1px solid var(--line);border-radius:12px;padding:12px;background:#f8fafc}.ix-empty{padding:15px;background:#f8fafc;border-radius:12px;font-size:14px}.ix label{display:block;margin:10px 0 6px;font-weight:650;font-size:13px}.ix select,.ix textarea{width:100%;padding:12px;border:1px solid #ccd3df;border-radius:12px;background:white}.ix textarea{resize:vertical;min-height:106px}.ix-report{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.65;background:#f8fafc;border:1px solid var(--line);padding:14px;border-radius:12px;max-height:70vh;overflow:auto}.ix-error{color:#9f1239;background:#fff0f2;border-radius:12px;padding:12px;font-size:13px}.ix-muted{color:var(--muted);font-size:12px}.ix-choice{background:#f0f9ff;color:#075985;border:1px solid #b9e6fe;padding:10px 12px;border-radius:11px;font-size:13px;margin:9px 0}.ix-summary{margin:14px 0 0}.ix-summary small{color:var(--muted)}@media(min-width:750px){.ix-kpi{padding:18px}.ix-kpi b{font-size:34px}.ix-results{grid-template-columns:repeat(2,minmax(0,1fr))}.ix-toolbar{flex-direction:row;align-items:center}.ix-search{flex:1}}@media(max-width:420px){.ix-head{padding:17px}.ix-panel{padding:13px}.ix-kpi{padding:10px 7px}.ix-kpi b{font-size:24px}.ix-kpi span{font-size:11px}.ix-status{font-size:10px}.ix-project{padding:12px}.ix-filter{padding:9px 11px}}`;
    const style=document.createElement('style');style.id='ix-v114-style';style.textContent=css;document.head.appendChild(style);
  }
  function paint(){
    if(!active)return;const host=document.getElementById('view');if(!host)return;
    injectStyles();const c=counts(),n=items().length;
    const kpis=['cloudflare','netlify','supabase'].map(p=>{const s=inventory?.providers?.[p];return `<div class="ix-kpi"><span>${title[p]}</span><b>${s?.projects?.length??'—'}</b><small>${!s?'Belum scan':s.ok?'Inventori diterima':safeText(s.error||'Sambungan gagal',60)}</small></div>`}).join('');
    const filters=[['all','Semua',n],...['cloudflare','netlify','supabase'].map(k=>[k,title[k],c[k]])].map(([id,label,count])=>`<button type="button" class="ix-filter ${filter===id?'selected':''}" data-ix-filter="${id}" aria-pressed="${filter===id}">${label} (${count})</button>`).join('');
    const selected=items().find(x=>`${x.provider}|${x.id}`===target);
    host.innerHTML=`<section class="ix" aria-label="AI Infrastructure"><header class="ix-head"><div><span class="ix-eyebrow">KERJA SENDIRI · ADMIN</span><h1>AI Infrastructure</h1><p>Inventori dan diagnosis projek Netlify, Supabase serta Cloudflare.</p></div><span class="ix-tag">PRODUCTION · READ ONLY</span></header><button type="button" class="ix-back" data-ix-action="back">← Pilih workspace</button><div class="ix-kpis">${kpis}</div><section class="ix-panel"><h2>Semua projek</h2><p class="ix-note">Status ini ialah metadata daripada platform, bukan semakan uptime secara langsung. “Dideploy” tidak bermaksud bebas masalah.</p><button type="button" class="ix-primary" data-ix-action="scan" ${busy?'disabled':''}>${busy?'Sedang scan…':'↻ Scan semua projek'}</button><div class="ix-toolbar"><input id="ixSearch" class="ix-search" type="search" aria-label="Cari projek" placeholder="Cari nama projek atau status…" value="${safeText(query,100)}" ${!inventory?'disabled':''}/></div><div class="ix-filters">${filters}</div><p class="ix-count" id="ixShown"></p><div id="ixProjects"></div></section><section class="ix-panel"><h2>Diagnosis AI</h2><p class="ix-note">AI menganalisis metadata inventori sahaja. Logs, fail source dan database pelanggan belum diperiksa.</p>${selected?`<div class="ix-choice"><b>Projek dipilih:</b> ${safeText(selected.name||selected.id)} (${title[selected.provider]}) <button type="button" data-ix-action="clear" aria-label="Buang pilihan">×</button></div>`:'<p class="ix-muted">Tiada projek dipilih — diagnosis akan merangkumi semua projek.</p>'}<label for="ixModel">Model AI</label><select id="ixModel"><option value="deepseek" ${model==='deepseek'?'selected':''}>DeepSeek</option><option value="openai" ${model==='openai'?'selected':''}>OpenAI</option></select><label for="ixQuestion">Arahan diagnosis</label><textarea id="ixQuestion" maxlength="1200">${safeText(question,1200)}</textarea><button type="button" class="ix-primary" data-ix-action="diagnose" ${busy||!inventory?'disabled':''}>${busy?'Menganalisis…':'Diagnose & cadangkan repair'}</button>${report?`<article class="ix-report" role="region" aria-label="Hasil diagnosis">${safeText(report.text||JSON.stringify(report),20000)}</article>`:''}<p class="ix-note">Repair dan deployment production belum tersedia. Kelulusan diperlukan sebelum sebarang perubahan.</p></section>${error?`<p class="ix-error" role="alert">${safeText(error,360)}</p>`:''}</section>`;
    updateRows();document.body.classList.remove('picking');
  }
  const prevRender=render;
  render=function(...args){const r=prevRender(...args);if(active)paint();return r};
  async function act(which){
    if(which==='back'){active=false;inventory=null;report=null;error='';target='';state.business=null;state.page='workspaces';render();return}
    if(which==='clear'){target='';paint();return}
    if(which==='more'){limit+=24;updateRows();return}
    if(busy)return;
    if(which==='diagnose'&&!inventory){error='Scan semua projek dahulu.';paint();return}
    busy=true;error='';const oldY=window.scrollY;paint();window.scrollTo?.(0,oldY);
    try{
      const token=await access();const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),65000);
      let response;try{response=await fetch('/api/supabase/functions/v1/infrastructure-control',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',apikey:KEY,Authorization:'Bearer '+token},body:JSON.stringify({action:which==='scan'?'inventory':'diagnose',model,target,question}),signal:ctrl.signal})}finally{clearTimeout(timer)}
      const json=await response.json().catch(()=>({}));if(!response.ok)throw Error(json.error||`HTTP ${response.status}`);
      if(which==='scan'){inventory=json;report=null;limit=24;}else report=json;
    }catch(e){error=String(e.message||e).slice(0,360)}finally{busy=false;if(active){const y=window.scrollY;paint();window.scrollTo?.(0,y)}}
  }
  window.addEventListener('click',e=>{
    const b=e.target.closest?.('[data-infra-open]');
    if(b){e.preventDefault();e.stopImmediatePropagation();if(!state?.session){document.getElementById('loginDialog')?.showModal();return}active=true;error='';render();window.scrollTo?.(0,0);return}
    if(!active)return;
    const f=e.target.closest?.('[data-ix-filter]');if(f){e.preventDefault();e.stopImmediatePropagation();filter=f.dataset.ixFilter;limit=24;const y=window.scrollY;paint();window.scrollTo?.(0,y);return}
    const proj=e.target.closest?.('[data-ix-target]');if(proj){e.preventDefault();e.stopImmediatePropagation();target=proj.dataset.ixTarget;const y=window.scrollY;paint();window.scrollTo?.(0,y);return}
    const btn=e.target.closest?.('[data-ix-action]');if(btn){e.preventDefault();e.stopImmediatePropagation();act(btn.dataset.ixAction);return}
    if(e.target.closest?.('[data-biz],[data-page],[data-go],[data-picker],#logout'))active=false;
  },true);
  window.addEventListener('input',e=>{
    if(!active)return;
    if(e.target.id==='ixSearch'){query=e.target.value;limit=24;updateRows()}
    if(e.target.id==='ixQuestion')question=e.target.value;
  },true);
  window.addEventListener('change',e=>{if(active&&e.target.id==='ixModel')model=e.target.value},true);
})();
