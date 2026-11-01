/* Kerja Sendiri Infrastructure Chat V2 read-only • standalone overlay, DeepSeek via owner-gated Supabase. */
(()=>{
'use strict';
if(window.__ksInfraChatV12)return;window.__ksInfraChatV12=true;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const IS_STAGING=false;
const API='/api/supabase/functions/v1/infrastructure-chat';
const REPAIR_API='/api/supabase/functions/v1/infrastructure-chat-staging';
const stateChat={usage:null,usageLoading:false,usageError:false,usageExpanded:false,open:false,busy:false,threads:[],threadId:'',messages:[],input:'',target:'',error:'',drawer:false,inventoryAvailable:null,model:'auto',budget:null,projects:[],projectQuery:'',phase:'',requestId:'',warning:''};
const statusError={AI_ATTEMPT_LIMIT:'Had dua panggilan AI untuk permintaan ini dicapai. Sambung dalam mesej baharu.',AI_DAILY_LIMIT_REACHED:'Had 15 panggilan AI hari ini telah digunakan. Cuba selepas 12 malam waktu Malaysia.',AI_BUDGET_CONFIG_REQUIRED:'Bajet AI tidak dapat disahkan. Hubungi admin.',CHAT_STORAGE_ERROR:'Sejarah chat tidak dapat disimpan. Muat semula sejarah sebelum cuba lagi.',AUDIT_UNAVAILABLE:'Jawapan tersimpan; rekod audit mengalami gangguan.',DEEPSEEK_AUTH_ERROR:'Credential DeepSeek ditolak. Admin perlu semak konfigurasi backend.',OPENAI_AUTH_ERROR:'Credential OpenAI ditolak. Admin perlu semak konfigurasi backend.',DEEPSEEK_RATE_LIMIT:'DeepSeek mencapai had provider. Cuba Auto atau OpenAI.',OPENAI_RATE_LIMIT:'OpenAI mencapai had provider. Cuba kemudian.',OPENAI_UNAVAILABLE:'OpenAI tidak dapat dihubungi. Cuba kemudian.',OPENAI_NOT_CONFIGURED:'OpenAI belum dikonfigurasi.',LOGIN_REQUIRED:'Sila log masuk semula.',UPSTREAM_UNAVAILABLE:'Sambungan backend terganggu. Semak sejarah sebelum cuba lagi.',OWNER_ONLY:'Akses untuk pemilik sahaja.',ADMIN_REQUIRED:'Akaun ini bukan admin.',SESSION_EXPIRED:'Sesi tamat. Log masuk semula.',DAILY_AI_LIMIT:'Had AI harian 15 panggilan telah digunakan.',DEEPSEEK_NOT_CONFIGURED:'DeepSeek API key belum dikonfigurasi.',DEEPSEEK_UNAVAILABLE:'DeepSeek tidak dapat dihubungi sekarang.',THREAD_NOT_FOUND:'Perbualan tidak ditemui.',STORAGE_UNAVAILABLE:'Sejarah chat tidak dapat disimpan.',INVENTORY_UNAVAILABLE:'Scan projek tidak tersedia buat masa ini.',AI_BURST_LIMIT:'Terlalu banyak panggilan AI dalam masa singkat. Tunggu seminit sebelum cuba lagi.',AI_CONCURRENCY_LIMIT:'Dua permintaan AI sedang berjalan. Tunggu salah satu selesai.',AI_COST_HARD_STOP:'Had kos harian yang anda tetapkan telah dicapai. Semak penggunaan sebelum menambah had.',AI_USAGE_LOG_UNAVAILABLE:'Rekod penggunaan AI tidak dapat dibaca atau ditulis, jadi permintaan dihentikan demi keselamatan kos.'};
const root=()=>document.getElementById('ksInfraChat');
function selectedTarget(){const x=document.querySelector('.ix-project[aria-pressed="true"]');return x?.getAttribute('data-ix-target')||''}
function css(){if(document.getElementById('ksInfraChatStyle'))return;const el=document.createElement('style');el.id='ksInfraChatStyle';el.textContent=`
#ksInfraChat{position:fixed;inset:0;z-index:100000;background:#f5f7fa;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;display:flex;flex-direction:column;height:100dvh;max-height:100dvh;overflow:hidden;font-size:15px}
#ksInfraChat *{box-sizing:border-box;min-width:0}#ksInfraChat button,#ksInfraChat textarea,#ksInfraChat select,#ksInfraChat input{font:inherit}#ksInfraChat button{cursor:pointer}#ksInfraChat button:disabled{opacity:.5;cursor:default}
.kc-head{flex:none;display:flex;align-items:center;gap:10px;padding:12px 14px;background:#111b2c;color:white;border-bottom:1px solid #334155}#ksInfraChat .kc-head h2{margin:0;font-size:16px;color:#fff!important}#ksInfraChat .kc-head small{color:#b9c7db!important;font-size:11px}.kc-btn{border:1px solid #d8e0e9;border-radius:10px;background:#fff;color:#111827;padding:9px 12px;min-height:39px}.kc-head .kc-btn{color:#fff;border-color:#526172;background:#23334b}.kc-head-title{flex:1}
.kc-body{flex:1;display:flex;position:relative;overflow:hidden}.kc-sidebar{width:255px;flex:0 0 255px;border-right:1px solid #dae1ea;background:white;overflow:auto;padding:13px}.kc-sidebar h3{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.07em;margin:15px 0 9px}.kc-sidebar .kc-thread{border:1px solid transparent;border-radius:10px;background:white;padding:10px;width:100%;text-align:left;display:flex;justify-content:space-between;gap:6px;margin-bottom:5px;font-size:13px;color:#334155}.kc-sidebar .kc-thread.selected{background:#e6f6fb;border-color:#b4e4ee}.kc-sidebar .kc-thread span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kc-del{border:0;background:transparent;color:#64748b;padding:0 6px;flex:0 0 auto}
.kc-main{display:flex;min-width:0;flex:1;flex-direction:column}.kc-chat{flex:1;overflow:auto;padding:16px max(14px, calc((100% - 800px)/2));display:flex;flex-direction:column;gap:14px;overscroll-behavior:contain}.kc-row{display:flex;gap:10px}.kc-row.user{justify-content:flex-end}.kc-avatar{flex:0 0 31px;width:31px;height:31px;display:flex;align-items:center;justify-content:center;background:#d7edf5;color:#134e62;border-radius:50%;font-size:11px;font-weight:800}.kc-msg{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;padding:12px 15px;border-radius:15px;font-size:14px;max-width:min(92%,780px);background:#fff;border:1px solid #e0e7ef;box-shadow:0 1px 2px rgba(0,0,0,.02)}.kc-row.user .kc-msg{background:#11223b;color:#fff;border-color:#11223b;border-bottom-right-radius:4px}.kc-row.assistant .kc-msg{border-bottom-left-radius:4px}.kc-busy{color:#64748b;font-size:13px;padding:9px 12px}.kc-empty{max-width:600px;margin:auto;text-align:center}.kc-empty h3{font-size:25px;letter-spacing:-.5px}.kc-empty p{color:#64748b}.kc-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}.kc-chip{background:#fff;border:1px solid #dce5ed;border-radius:20px;padding:9px 12px;font-size:13px!important}
.kc-composer{flex:none;display:flex;flex-direction:column;gap:9px;background:linear-gradient(to top,#f5f7fa 94%,transparent);padding:12px max(14px, calc((100% - 800px)/2));border-top:1px solid #e5eaf0;padding-bottom:max(14px,env(safe-area-inset-bottom))}.kc-target{color:#475569;font-size:11px}.kc-target b{color:#075985}.kc-input-row{background:#fff;border:1px solid #cbd5e1;border-radius:16px;display:flex;align-items:flex-end;gap:8px;padding:9px;box-shadow:0 2px 8px rgba(0,0,0,.05)}.kc-input-row textarea{resize:none;flex:1;max-height:170px;min-height:40px;line-height:1.5;padding:9px 7px;border:0;outline:none;color:#111827;background:transparent;overflow:auto}.kc-send{background:#0b1729;color:#fff;border:0;border-radius:11px;padding:10px 14px;flex:0 0 auto;min-height:40px}.kc-error{background:#ffe7ea;color:#9f1239;font-size:12px;padding:10px;border-radius:9px}.kc-footer-note{font-size:10px;color:#64748b;text-align:center}.kc-mobile-menu{display:none}.kc-proof{font-size:10px;color:#64748b;border-top:1px solid #e2e8f0;margin-top:9px;padding-top:6px}.kc-controls{display:flex;gap:7px;flex-wrap:wrap;align-items:flex-end}.kc-controls>.kc-btn{height:38px;min-height:38px;align-self:flex-end}.kc-controls label{font-size:11px;flex:1 1 130px}.kc-controls select,.kc-controls input{display:block;width:100%;min-height:38px;border:1px solid #cbd5e1;border-radius:9px;background:white;color:#0f172a;font-size:12px;padding:6px}.kc-controls input{flex:1 1 100%;max-height:38px}.kc-budget{color:#64748b;font-size:10px}.kc-head .kc-btn{flex-shrink:0}.kc-error button{margin:5px}.kc-busy progress{width:65px}
#ksInfraChat .kc-usage-panel{flex:none;background:#fff;color:#111827;border-bottom:1px solid #e2e8f0;padding:9px max(12px,calc((100% - 800px)/2))}
#ksInfraChat .kc-usage-top{display:flex;justify-content:space-between;align-items:center;gap:5px}
#ksInfraChat .kc-usage-title{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;font-weight:750}
#ksInfraChat .kc-usage-cap{color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:99px;padding:3px 7px;font-size:10px}
#ksInfraChat .kc-usage-actions{display:flex;gap:5px}
#ksInfraChat .kc-usage-actions button{min-height:38px;min-width:38px;background:#f8fafc;color:#334155;border:1px solid #e2e8f0;border-radius:9px;padding:6px 9px;font-size:11px}
#ksInfraChat .kc-usage-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:7px}
#ksInfraChat .kc-usage-tile{min-width:0;border:1px solid #e2e8f0;border-radius:11px;padding:8px 9px;display:flex;flex-direction:column;gap:3px}
#ksInfraChat .kc-usage-tile span{font-size:10px;color:#64748b}
#ksInfraChat .kc-usage-tile strong{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;letter-spacing:-.3px}
#ksInfraChat .kc-usage-tile small{font-size:10px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#ksInfraChat .kc-usage-foot{font-size:10px;color:#64748b;line-height:1.45;margin-top:6px}
#ksInfraChat .kc-usage-details{font-size:11px;margin-top:7px;padding-top:8px;border-top:1px solid #e2e8f0}
#ksInfraChat .kc-usage-scroll{overflow-x:auto}
#ksInfraChat .kc-usage-details table{min-width:330px;width:100%;border-collapse:collapse;text-align:right;font-variant-numeric:tabular-nums}
#ksInfraChat .kc-usage-details th:first-child{text-align:left}
#ksInfraChat .kc-usage-details th,#ksInfraChat .kc-usage-details td{padding:5px;border-bottom:1px solid #e2e8f0}
#ksInfraChat .kc-usage-details small{display:block;color:#64748b;margin-top:6px}
@media(max-width:700px){#ksInfraChat .kc-usage-panel{padding:7px 9px}#ksInfraChat .kc-usage-title{font-size:11px}#ksInfraChat .kc-usage-grid{margin-top:5px;gap:5px}#ksInfraChat .kc-usage-tile{padding:6px;border-radius:10px}#ksInfraChat .kc-usage-tile strong{font-size:clamp(12px,3.6vw,17px)}#ksInfraChat .kc-usage-tile span,#ksInfraChat .kc-usage-tile small{font-size:9px}}
@media(max-width:700px){.kc-sidebar{display:none;position:absolute;inset:0 auto 0 0;z-index:2;width:min(80vw,300px);box-shadow:3px 0 18px rgba(0,0,0,.15)}.kc-sidebar.open{display:block}.kc-mobile-menu{display:inline-flex}.kc-chat{padding:16px 12px}.kc-composer{padding:10px 12px max(12px,env(safe-area-inset-bottom))}.kc-msg{max-width:95%;font-size:14px}.kc-empty h3{font-size:22px}}
`;document.head.appendChild(el)}
function ksMoney(x){if(x==null||!Number.isFinite(Number(x)))return '—';const n=Number(x);return '$'+n.toFixed(n>0&&n<.01?6:4)}
function ksUsageView(){
 const u=stateChat.usage,d=u?.day,m=u?.month,T=(a,b)=>tr(a,b),n=x=>x==null?'—':Number(x).toLocaleString('en-US'),token=s=>s?n((Number(s.prompt_tokens)||0)+(Number(s.completion_tokens)||0)):'—';
 const message=stateChat.usageLoading?T('Memuat rekod penggunaan…','Loading usage records…'):stateChat.usageError?T('Rekod tidak tersedia. Cuba refresh.','Records unavailable. Try refresh.'):!u?T('Rekod belum dimuatkan.','Usage not loaded yet.'):u?.pricing_context?T('Anggaran token sebenar × kadar semasa peak tanpa cache; rekod lama dihargakan semula. Bukan bil rasmi.','Recorded tokens × current peak uncached rates; history is repriced. Not an official bill.'):m?.pricing==='configured'?T('Kos anggaran daripada kadar token dikonfigurasi.','Estimated cost using configured token rates.'):T('Harga token lalai belum disahkan — bukan bil rasmi.','Default token prices unverified — not an official bill.');
 const rows=stateChat.usageExpanded&&u?['deepseek','openai'].map(k=>{const x=m?.by_model?.[k]||{};return `<tr><th>${k==='deepseek'?'DeepSeek':'OpenAI'}</th><td>${n(x.calls||0)}</td><td>${n(x.prompt_tokens||0)}</td><td>${n(x.completion_tokens||0)}</td><td>${ksMoney(x.cost_usd||0)}</td></tr>`}).join(''):'';
 return `<section class="kc-usage-panel" aria-label="${T('Penggunaan kos AI','AI cost usage')}">
 <div class="kc-usage-top"><div class="kc-usage-title">${T('Kos Penggunaan AI','AI Usage Cost')} <span class="kc-usage-cap">${u?.unlimited===true?T('Tanpa had harian','No daily cap'):T('Status had belum tersedia','Limit status unavailable')}</span></div><div class="kc-usage-actions"><button type="button" data-kc-action="usage-refresh" aria-label="${T('Refresh penggunaan','Refresh usage')}" ${stateChat.usageLoading?'disabled':''}>↻</button><button type="button" data-kc-action="usage-toggle" aria-expanded="${stateChat.usageExpanded}" ${!u?'disabled':''}>${stateChat.usageExpanded?T('Tutup','Hide'):T('Butiran','Details')}</button></div></div>
 <div class="kc-usage-grid"><div class="kc-usage-tile"><span>${T('Hari ini','Today')}</span><strong>${ksMoney(d?.cost_usd)}</strong><small>${n(d?.calls)} ${T('panggilan','calls')}</small></div><div class="kc-usage-tile"><span>${T('Bulan ini','This month')}</span><strong>${ksMoney(m?.cost_usd)}${u?.month_truncated?'*':''}</strong><small>${n(m?.calls)} ${T('panggilan','calls')}</small></div><div class="kc-usage-tile"><span>${T('Token hari ini','Tokens today')}</span><strong>${token(d)}</strong><small>${T('Input','Input')} ${n(d?.prompt_tokens)} · ${T('Output','Output')} ${n(d?.completion_tokens)}</small></div></div>
 <div class="kc-usage-foot" role="status">${u?.warnings?.level==='alert'?'⚠ ':''}${message}${m?.legacy_calls_without_start?' '+T('Rekod lama tanpa start: ','Legacy records without start: ')+m.legacy_calls_without_start+'.':''}${u?.month_truncated?' '+T(' *Rekod bulanan separa (20,000 baris).',' *Partial month (20,000 rows).'):''}</div>
 ${stateChat.usageExpanded&&u?`<div class="kc-usage-details"><b>${T('Pecahan mengikut provider (bulan ini)','Provider breakdown (this month)')}</b><div class="kc-usage-scroll"><table><thead><tr><th>Model</th><th>${T('Panggilan','Calls')}</th><th>Input</th><th>Output</th><th>${T('Kos','Cost')}</th></tr></thead><tbody>${rows}</tbody></table></div><small>${u.pricing_context?esc('Kadar USD/1M: DeepSeek Flash '+u.pricing_context.rates.deepseek.input+' / '+u.pricing_context.rates.deepseek.output+'; GPT-4.1 mini '+u.pricing_context.rates.openai.input+' / '+u.pricing_context.rates.openai.output+'. Disahkan '+u.pricing_context.verified_at+'. '):''}${m?.failed?T('Token panggilan gagal tidak tersedia. ','Failed-call tokens unavailable. '):''}${T('Fallback dikira sebagai panggilan provider tambahan; kos dikira daripada token berjaya yang direkod.','Fallback counts as another provider call; costs use recorded successful tokens.')}</small></div>`:''}</section>`;
}
function ksUsagePaint(){
 const p=root()?.querySelector('.kc-usage-panel');if(p)p.outerHTML=ksUsageView();
 const pill=document.querySelector('[data-kc-cost]');if(!pill||stateChat.usageLoading)return;
 const u=stateChat.usage;
 pill.textContent=u?.day?tr('Kos AI · ','AI cost · ')+ksMoney(u.day.cost_usd):tr('Kos AI · —','AI cost · —');
 pill.title=u?.month?tr('Anggaran hari ini. Bulan ini: ','Today estimate. This month: ')+ksMoney(u.month.cost_usd):tr('Rekod belum tersedia','Records unavailable');
}
async function ksUsageFetch(){
 if(!stateChat.open||stateChat.usageLoading)return;
 stateChat.usageLoading=true;stateChat.usageError=false;ksUsagePaint();
 try{const r=await call({action:'usage'});if(!r.usage?.day||!r.usage?.month)throw Error('INVALID_USAGE');stateChat.usage=r.usage}
 catch{stateChat.usage=null;stateChat.usageError=true}
 finally{stateChat.usageLoading=false;if(stateChat.open)ksUsagePaint()}
}
function errorMsg(){return stateChat.error?`<div class="kc-error" role="alert">${esc(stateChat.error)}${stateChat.requestId?`<small> · Rujukan ${esc(stateChat.requestId)}</small>`:''}<button class="kc-btn" data-kc-action="reload">Semak sejarah</button></div>`:''}
function ksMenuText(ms,en){try{return localStorage.getItem('ks-ui-language')==='en'?en:ms}catch{return ms}}
function ksDiagnosisActions(){
 const section=document.querySelector('#ixQuestion')?.closest('.ix-panel');
 if(!section)return;
 const report=section.querySelector('.ix-report');
 const diagnose=section.querySelector('[data-ix-action="diagnose"]');
 const failure=section.closest('.ix')?.querySelector('.ix-error');
 const pending=!!diagnose&&/Menganalisis|Analysing/.test(diagnose.textContent);
 if(diagnose){
  diagnose.style.cssText='background:#101827!important;color:#fff!important;min-height:48px;border:1px solid #101827;font-weight:700;opacity:'+(diagnose.disabled?'.6':'1');
  if(!pending&&diagnose.textContent!==tr('Mulakan diagnosis','Start diagnosis'))diagnose.textContent=tr('Mulakan diagnosis','Start diagnosis');
  let status=section.querySelector('[data-diagnosis-status]');
  if(!status){status=document.createElement('p');status.dataset.diagnosisStatus='';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.cssText='padding:12px;border-radius:10px;background:#f1f5f9;color:#334155;font-size:13px;line-height:1.6';diagnose.after(status)}
  const message=failure?tr('Diagnosis gagal: ','Diagnosis failed: ')+failure.textContent+tr('. Tekan Mulakan diagnosis untuk cuba semula.','. Select Start diagnosis to retry.'):
   pending?tr('Sedang menjana diagnosis… Tunggu sebentar. Hasil atau ralat akan muncul di sini.','Generating diagnosis… Please wait. The result or an error will appear here.'):
   report?tr('Diagnosis selesai. Hasil ada di bawah.','Diagnosis complete. The result is below.'):
   diagnose.disabled?tr('Scan semua projek dahulu untuk mengaktifkan diagnosis.','Scan all projects first to enable diagnosis.'):
   tr('Belum ada hasil diagnosis. Tekan Mulakan diagnosis di atas.','No diagnosis yet. Select Start diagnosis above.');
  if(status.textContent!==message)status.textContent=message;
 }
 if(report&&!report.dataset.copyReady){
  report.dataset.copyReady='true';
  const raw=report.textContent;
  const actions=document.createElement('div');actions.dataset.diagnosisActions='';
  actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin:12px 0';
  const copy=document.createElement('button');copy.type='button';copy.className='ix-primary';
  copy.textContent=tr('⧉ Salin diagnosis','⧉ Copy diagnosis');copy.style.minHeight='44px';
  const copied=document.createElement('span');copied.setAttribute('role','status');copied.setAttribute('aria-live','polite');
  copy.addEventListener('click',async()=>{await ksCopy(raw,copy);copied.textContent=copy.textContent});
  const open=document.createElement('button');open.type='button';open.className='ix-primary';open.style.minHeight='44px';
  open.textContent=tr('Buka Repair Center →','Open Repair Center →');open.addEventListener('click',ksRepairOpen);
  actions.append(copy,open,copied);report.before(actions);
  report.innerHTML=ksSafeMarkdown(raw);report.style.whiteSpace='normal';
  if(!pending&&!failure)report.scrollIntoView({behavior:'smooth',block:'start'});
 }
 if(!section.querySelector('[data-diagnosis-next]')){
  const old=Array.from(section.querySelectorAll('.ix-note')).find(n=>n.textContent.includes('Repair dan deployment production belum tersedia'));
  const guide=document.createElement('div');guide.dataset.diagnosisNext='';
  guide.style.cssText='background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:14px;margin-top:12px;font-size:13px;line-height:1.6';
  const heading=document.createElement('strong');heading.textContent=tr('Nak teruskan repair?','Ready to repair?');
  const intro=document.createElement('p');intro.textContent=tr('Diagnosis ialah cadangan. Ia belum mengubah sistem.','Diagnosis is advice. No system changes have been made.');
  const steps=document.createElement('ol');steps.style.paddingLeft='22px';
  for(const text of [
   tr('Salin diagnosis, kemudian tekan Buka Repair Center.','Copy the diagnosis, then select Open Repair Center.'),
   tr('Untuk bug panel Chat AI Kerja Sendiri, pilih Panel Chat AI · staging, tampal diagnosis dan tekan Jana proposal sebenar.','For Kerja Sendiri AI Chat bugs, choose AI Chat panel · staging, paste the diagnosis and select Create real repair proposal.'),
   tr('Selepas ujian lulus, semak perubahan kod dan tekan Approve Staging.','After tests pass, review the code changes and select Approve Staging.')
  ]){const li=document.createElement('li');li.textContent=text;steps.append(li)}
  const scope=document.createElement('p');scope.textContent=tr('Skop repair tersedia: panel Chat AI Kerja Sendiri dan fixture ujian di staging sahaja. Supabase, RLS, auth, backup dan projek lain memerlukan pembaikan manual.','Repair supports the Kerja Sendiri AI Chat panel and test fixture in staging only. Supabase, RLS, auth, backups and other projects need manual changes.');
  const production=document.createElement('p');production.textContent=tr('Approve Staging menerbitkan perubahan ke staging sahaja. Auto Repair production kekal OFF.','Approve Staging publishes only to staging. Production Auto Repair remains OFF.');
  guide.append(heading,intro,steps,scope,production);
  if(old)old.replaceWith(guide);else section.append(guide);
 }
 section.querySelector('[data-diagnosis-next]').hidden=!report||pending||!!failure;
 if(failure&&!failure.dataset.diagnosisSeen){failure.dataset.diagnosisSeen='true';section.querySelector('[data-diagnosis-status]')?.scrollIntoView({behavior:'smooth',block:'center'})}
}

function injectOpenButton(){
 ksDiagnosisActions();
 if(!window.__ksInfraNav114)return;
 const head=document.querySelector('.ix-head');if(!head||head.querySelector('[data-kc-open]'))return;
 const badge=head.querySelector('.ix-tag');
 if(badge)badge.textContent=ksMenuText('STAGING · Production OFF','STAGING · Production OFF');
 const actions=document.createElement('div');actions.className='ix-center-actions';
 const chat=document.createElement('button');chat.type='button';chat.textContent=ksMenuText('💬 Chat AI · Tanya & semak','💬 AI Chat · Ask & investigate');chat.className='ix-primary ix-center-chat';
 chat.style.cssText='background:#07586b!important;color:#ffffff!important;border:2px solid #67e8f9!important;min-height:48px;max-width:100%;padding:12px 16px;font-size:15px;font-weight:750;line-height:1.35;opacity:1!important;box-shadow:0 2px 8px #0003';
 chat.setAttribute('data-kc-open','');chat.setAttribute('aria-label',ksMenuText('Buka Chat AI untuk bertanya sahaja','Open AI Chat for questions only'));
 const repairButton=document.createElement('button');repairButton.type='button';repairButton.className='ix-primary ix-center-repair';
 repairButton.style.cssText='background:#1d4ed8!important;color:#fff!important;border:2px solid #bfdbfe!important;min-height:48px;max-width:100%;padding:12px 16px;font-size:15px;font-weight:750;line-height:1.35;opacity:1!important';
 repairButton.textContent=ksMenuText('🛠 Repair Engine · Jana proposal','🛠 Repair Engine · Create proposal');
 repairButton.setAttribute('data-repair-open','');repairButton.setAttribute('aria-label',ksMenuText('Buka Repair Engine untuk cipta job pembaikan staging','Open Repair Engine to create a staging repair job'));
 repairButton.addEventListener('click',()=>{if(!state?.session){document.getElementById('loginDialog')?.showModal();return}ksRepairOpen()});
 const cost=document.createElement('button');cost.type='button';cost.className='ix-primary ix-center-cost';
 cost.style.cssText='background:#ffffff!important;color:#111827!important;border:2px solid #cbd5e1!important;min-height:48px;max-width:100%;padding:12px 16px;font-size:15px;font-weight:750;line-height:1.35;opacity:1!important;box-shadow:0 2px 8px #0003';
 cost.textContent=ksMenuText('Kos AI · —','AI cost · —');cost.setAttribute('data-kc-cost','');cost.setAttribute('aria-label',ksMenuText('Lihat anggaran kos AI','View estimated AI cost'));
 actions.append(chat,repairButton,cost);head.appendChild(actions);void ksCostPill();
}

async function ksCostPill(){
 const pill=document.querySelector('[data-kc-cost]');if(!pill||!state?.session)return;
 try{const r=await call({action:'usage'});if(!r.usage?.day||!r.usage?.month)throw Error('USAGE_MISSING');
 stateChat.usage=r.usage;pill.textContent=tr('Kos AI · ','AI cost · ')+ksMoney(r.usage.day.cost_usd);
 pill.title=tr('Anggaran hari ini. Bulan ini: ','Today estimate. This month: ')+ksMoney(r.usage.month.cost_usd);
 }catch{pill.textContent=tr('Kos AI · —','AI cost · —')}
}
let observeTimer=null;const observer=new MutationObserver(()=>{if(observeTimer)return;observeTimer=setTimeout(()=>{observeTimer=null;injectOpenButton()},50)});observer.observe(document.documentElement,{subtree:true,childList:true});injectOpenButton();
async function call(payload){
 const token=await access();const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),135000);
 try{const r=await fetch(API,{method:'POST',headers:{Authorization:'Bearer '+token,apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',signal:controller.signal});const json=await r.json().catch(()=>({}));if(!r.ok||json.ok!==true){stateChat.requestId=json.requestId||'';throw Error(statusError[json.error]||(r.status===401?'Sesi tamat. Log masuk semula.':json.error==='REQUEST_FAILED'?'Permintaan gagal. Semak sejarah sebelum cuba lagi.':`Permintaan gagal (HTTP ${r.status}).`))}if(json.budget)stateChat.budget=json.budget;return json}catch(e){if(e.name==='AbortError')throw Error('Permintaan mengambil masa terlalu lama. Jawapan mungkin masih diproses; buka semula sejarah sebelum menghantar lagi.');throw e}finally{clearTimeout(timeout)}
}
function paint(){
 if(!stateChat.open)return;css();let rootNode=root();if(!rootNode){rootNode=document.createElement('div');rootNode.id='ksInfraChat';rootNode.setAttribute('role','dialog');rootNode.setAttribute('aria-modal','true');rootNode.setAttribute('aria-label','Chat AI Infrastructure');document.body.appendChild(rootNode)}
 rootNode.innerHTML=`<header class="kc-head"><button type="button" class="kc-btn kc-mobile-menu" data-kc-action="drawer" aria-label="Senarai chat">☰</button><div class="kc-head-title"><h2>AI Center · Chat AI</h2><small>DeepSeek / OpenAI · Tanya & semak</small></div><button type="button" class="kc-btn" data-kc-action="new">+ Chat</button><button type="button" class="kc-btn" data-kc-action="close" aria-label="Tutup chat">✕</button></header>
 <nav class="kc-mode-nav" aria-label="${tr('Pilih fungsi AI Center','Choose AI Center function')}"><div class="kc-mode-current"><strong>${tr('💬 Chat AI · Tanya & semak','💬 AI Chat · Ask & investigate')}</strong><span>${tr('Perbualan sahaja. Mesej di sini tidak mencipta proposal, PR atau deploy.','Conversation only. Messages here do not create proposals, PRs or deployments.')}</span></div></nav>
 <div class="kc-body"><aside class="kc-sidebar ${stateChat.drawer?'open':''}" aria-label="Sejarah chat"><button type="button" class="kc-btn" style="width:100%" data-kc-action="new">+ Perbualan baharu</button><h3>Sejarah</h3>${stateChat.threads.map(t=>`<div class="kc-thread ${t.id===stateChat.threadId?'selected':''}"><button type="button" class="kc-thread" data-kc-thread="${esc(t.id)}"><span>${esc(t.title)}</span></button><button type="button" class="kc-del" aria-label="Padam perbualan" data-kc-delete="${esc(t.id)}">×</button></div>`).join('')||'<p style="font-size:12px;color:#94a3b8">Belum ada perbualan.</p>'}</aside>
 <main class="kc-main">${ksUsageView()}<div class="kc-chat" id="kcMessages" aria-live="polite">${stateChat.messages.length?stateChat.messages.map(m=>`<div class="kc-row ${m.role==='user'?'user':'assistant'}">${m.role==='assistant'?(m.model==='openai'?'<span class="kc-avatar">OA</span>':m.model==='deepseek'?'<span class="kc-avatar">DS</span>':'<span class="kc-avatar">AI</span>'):''}<div class="kc-msg">${esc(m.content)}${m.role==='assistant'?`<div class="kc-proof">${esc(m.modelName||m.model||'Rekod lama — model tidak direkod')} · ${esc({primary:'Utama',provider_fallback:'Fallback provider',needs_specialist:'Semakan pakar',owner_escalation:'Pilihan owner',read_tools:'Bacaan bukti'}[m.route]||'Cadangan sahaja')} · ${m.route==='read_tools'?'Metadata/deployment diperiksa':'Metadata sahaja'} · Cadangan sahaja</div>`:''}</div></div>`).join(''):`<div class="kc-empty"><h3>Apa masalah projek hari ini?</h3><p>Berbual dengan DeepSeek untuk cari punca masalah, cadangan pembaikan dan langkah ujian.</p><div class="kc-chips"><button type="button" class="kc-chip" data-kc-suggest="Semak projek yang saya pilih dan kenal pasti risiko konfigurasi.">Audit konfigurasi</button><button type="button" class="kc-chip" data-kc-suggest="Bantu saya diagnose API yang tidak memberi respons. Tanya maklumat tambahan yang relevan.">API tak reply</button><button type="button" class="kc-chip" data-kc-suggest="Tolong susun pelan repair, ujian staging dan rollback bagi bug ini.">Pelan repair</button></div></div>`}${stateChat.busy?`<div class="kc-busy" role="status"><progress aria-label="Menunggu AI"></progress> ${esc(stateChat.phase||'AI sedang menganalisis…')}</div>`:''}</div>
 <div class="kc-composer">${errorMsg()}
 <div class="kc-controls"><label>Model <select id="kcModel" aria-label="Model AI" ${stateChat.busy?'disabled':''}>${[['auto','Auto (DeepSeek → OpenAI)'],['deepseek','DeepSeek'],['openai','OpenAI']].map(([v,t])=>`<option value="${v}" ${stateChat.model===v?'selected':''}>${t}</option>`).join('')}</select></label>
 <label>Projek <select id="kcProject" aria-label="Projek chat" ${stateChat.busy||stateChat.threadId?'disabled':''}><option value="">Semua projek — metadata sahaja</option>${stateChat.target&&!stateChat.projects.some(p=>p.id===stateChat.target)?`<option selected value="${esc(stateChat.target)}">${esc(stateChat.target)}</option>`:''}${stateChat.projects.map(x=>`<option value="${esc(x.id)}" ${x.id===stateChat.target?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>
 <button type="button" class="kc-btn" data-kc-action="projects" ${stateChat.busy?'disabled':''}>Muat projek</button>
 <input id="kcProjectSearch" type="search" aria-label="Cari projek" placeholder="Cari projek…" value="${esc(stateChat.projectQuery)}" ${stateChat.busy?'disabled':''}>
 </div>
 <small class="kc-budget">${stateChat.budget?(stateChat.budget.unlimited?`Owner: tiada had harian · ${stateChat.budget.used==null?'?':stateChat.budget.used} panggilan hari ini · anggaran kos $${stateChat.budget.cost_today_usd==null?'?':Number(stateChat.budget.cost_today_usd).toFixed(4)}`:`${stateChat.budget.remaining}/${stateChat.budget.limit} panggilan AI berbaki · reset 12 malam MYT · fallback boleh guna 2 panggilan`):'Owner: tiada had harian AI. Penggunaan dan anggaran kos direkod.'}</small>
 ${stateChat.warning?`<div class="kc-error">${esc(statusError[stateChat.warning]||'Jawapan tersimpan, sebahagian metadata belum dikemas kini.')}</div>`:''}<div class="kc-target">${stateChat.target?`Konteks: <b>${esc(stateChat.target.split('|')[0])} / ${esc(stateChat.target.split('|').slice(1).join('|'))}</b>`:'Konteks: semua projek (metadata inventori sahaja)'} · <b>Tiada auto-deploy</b></div><div class="kc-input-row"><textarea id="kcInput" rows="1" maxlength="3000" placeholder="Tanya AI tentang masalah atau bukti. Untuk cipta proposal sebenar, buka Repair Engine." aria-label="Mesej kepada DeepSeek" ${stateChat.busy?'disabled':''}>${esc(stateChat.input)}</textarea><button type="button" class="kc-send" data-kc-action="send" ${stateChat.busy?'disabled':''}>Hantar ➤</button></div><div style="display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin:10px 0 8px"><button type="button" class="kc-btn" data-kc-action="openai" style="min-height:42px;font-size:13px;border:1px solid #0e7490;color:#0e7490" ${stateChat.busy?'disabled':''}>↗ OpenAI semak / repair</button><small style="color:#64748b;font-size:11px">DeepSeek → OpenAI automatik jika gagal</small></div><div class="kc-footer-note">AI boleh cadangkan patch, tetapi belum boleh baca log penuh atau mengubah production. Jangan hantar API key.</div></div></main></div>`;
 const scroll=rootNode.querySelector('#kcMessages');if(scroll)scroll.scrollTop=scroll.scrollHeight;
 const t=rootNode.querySelector('#kcInput');if(t){t.style.height='auto';t.style.height=Math.min(t.scrollHeight,170)+'px'}
 ksImproveUI(rootNode);ksV3Decorate(rootNode);
}
async function loadProjects(){
 if(stateChat.busy)return;stateChat.busy=true;stateChat.phase='Baca inventori projek…';paint();
 try{const token=await access();const r=await fetch('/api/supabase/functions/v1/infrastructure-control',{method:'POST',headers:{Authorization:'Bearer '+token,apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({action:'inventory'}),signal:AbortSignal.timeout(65000)});const d=await r.json();if(!r.ok||!d.ok)throw Error('Inventori projek belum tersedia.');stateChat.projects=Object.entries(d.providers||{}).flatMap(([k,v])=>(v.projects||[]).map(p=>({id:k+'|'+p.id,name:k+' / '+p.name})));if(stateChat.target&&!stateChat.projects.some(p=>p.id===stateChat.target))stateChat.projects.push({id:stateChat.target,name:stateChat.target});stateChat.projectsFetched=true;}
 catch(e){stateChat.error='Inventori projek tidak dapat dimuat. Cuba lagi.'}finally{stateChat.busy=false;paint()}
}
window.addEventListener('change',e=>{if(e.target.id==='kcModel')stateChat.model=e.target.value;if(e.target.id==='kcProject'&&!stateChat.threadId)stateChat.target=e.target.value;},true);
window.addEventListener('input',e=>{if(e.target.id==='kcProjectSearch'){stateChat.projectQuery=e.target.value;const q=e.target.value.toLowerCase();for(const o of root().querySelectorAll('#kcProject option'))o.hidden=!!o.value&&!o.textContent.toLowerCase().includes(q);}},true);
async function loadThreads(){try{const r=await call({action:'list'});stateChat.threads=r.threads||[]}catch(e){stateChat.error=String(e.message||e)}}
async function open(){if(!state?.session){document.getElementById('loginDialog')?.showModal();return}stateChat.open=true;stateChat.drawer=false;stateChat.target=selectedTarget()||sessionStorage.getItem('ksInfraSelectedProject')||stateChat.target;stateChat.error='';stateChat.messages=[];stateChat.threadId='';stateChat.input='';paint();await loadThreads();const last=sessionStorage.getItem('ksInfraLastThread');if(last&&stateChat.threads.some(t=>t.id===last))await loadThread(last);paint();void ksUsageFetch()}
function close(){if(stateChat.busy)return;ksRepairClose();stateChat.open=false;root()?.remove();stateChat.drawer=false}
function newChat(){if(stateChat.busy)return;stateChat.requestId='';stateChat.lastAttempts=[];stateChat.threadId='';sessionStorage.removeItem('ksInfraLastThread');stateChat.messages=[];stateChat.input='';stateChat.error='';stateChat.drawer=false;stateChat.target=selectedTarget()||stateChat.target||sessionStorage.getItem('ksInfraSelectedProject')||'';paint()}
async function loadThread(id){if(stateChat.busy)return;stateChat.phase='Baca sejarah chat…';stateChat.busy=true;stateChat.error='';paint();try{const r=await call({action:'load',threadId:id});stateChat.threadId=id;sessionStorage.setItem('ksInfraLastThread',id);stateChat.messages=(r.messages||[]).map(m=>({...m,modelName:m.model_name}));stateChat.target=r.thread?.target||'';stateChat.input='';stateChat.drawer=false}catch(e){stateChat.error=String(e.message||e)}finally{stateChat.busy=false;paint()}}
async function deleteThread(id){if(stateChat.busy)return;if(!window.confirm('Padam perbualan ini?'))return;stateChat.phase='Padam perbualan…';stateChat.busy=true;paint();try{await call({action:'delete',threadId:id});if(id===stateChat.threadId)newChat();await loadThreads()}catch(e){stateChat.error=String(e.message||e)}finally{stateChat.busy=false;paint()}}
async function send(model=stateChat.model,qaFailure=false){if(stateChat.busy)return;const manual=model==='openai';if(!stateChat.input.trim()&&!(manual&&stateChat.messages.length))return;const message=stateChat.input.trim()||(manual?'Sila semak semula diagnosis dan cadangan repair dalam perbualan ini menggunakan OpenAI. Cadangkan patch, ujian staging dan rollback dengan jelas.':'');if(!stateChat.target&&/\b(?:get_recent_deployments|get_project_metadata)\b/i.test(message)){stateChat.error='Pilih satu projek dahulu sebelum menggunakan tool deployment. Ketuk Pilih projek, kemudian pilih nama projek daripada senarai.';stateChat.uxExpanded=true;paint();return;}stateChat.input='';stateChat.error='';stateChat.requestId='';stateChat.warning='';stateChat.messages.push({role:'user',content:message});stateChat.busy=true;stateChat.phase='Semak sesi dan inventori; '+(model==='openai'?'OpenAI':model==='deepseek'?'DeepSeek':'DeepSeek → OpenAI jika perlu')+' menganalisis…';paint();try{const r=await call({action:'chat',threadId:stateChat.threadId||undefined,message,target:stateChat.target,model,...(qaFailure?{qaFailure:'deepseek_invalid_model'}:{})});stateChat.requestId=r.requestId||'';stateChat.threadId=r.threadId;sessionStorage.setItem('ksInfraLastThread',r.threadId);stateChat.messages.push({role:'assistant',content:r.reply,model:r.model,modelName:r.modelName,route:r.route});stateChat.inventoryAvailable=r.inventoryAvailable;stateChat.warning=r.warning||'';stateChat.lastAttempts=r.attempts||[];await loadThreads()}catch(e){stateChat.error=String(e.message||e);stateChat.input=message;stateChat.messages.pop()}finally{stateChat.busy=false;paint();void ksUsageFetch()}}
window.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-kc-open]');if(b){e.preventDefault();e.stopImmediatePropagation();open();return}const cost=e.target.closest?.('[data-kc-cost]');if(cost){e.preventDefault();e.stopImmediatePropagation();stateChat.usageExpanded=true;void open();return}
 if(!stateChat.open)return;
 const suggested=e.target.closest?.('[data-kc-suggest]');if(suggested){e.preventDefault();stateChat.input=suggested.dataset.kcSuggest;paint();root()?.querySelector('#kcInput')?.focus();return}
 const thread=e.target.closest?.('[data-kc-thread]');if(thread){e.preventDefault();loadThread(thread.dataset.kcThread);return}
 const del=e.target.closest?.('[data-kc-delete]');if(del){e.preventDefault();deleteThread(del.dataset.kcDelete);return}
 const action=e.target.closest?.('[data-kc-action]')?.dataset.kcAction;
 if(action){e.preventDefault();if(action==='close'){if(!stateChat.busy)close();}else if(action==='new')newChat();else if(action==='drawer'){stateChat.drawer=!stateChat.drawer;paint()}else if(action==='send')send();else if(action==='openai')send('openai');else if(action==='projects')loadProjects();else if(action==='usage-refresh')void ksUsageFetch();else if(action==='usage-toggle'){stateChat.usageExpanded=!stateChat.usageExpanded;ksUsagePaint()}else if(action==='reload'){if(stateChat.threadId)loadThread(stateChat.threadId);else loadThreads().then(paint);}return}
},true);
window.addEventListener('input',e=>{if(stateChat.open&&e.target.id==='kcInput'){stateChat.input=e.target.value;e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,170)+'px'}},true);
window.visualViewport?.addEventListener('resize',()=>{const r=root();if(r)r.style.height=window.visualViewport.height+'px'});
window.addEventListener('keydown',e=>{if(stateChat.open&&e.target.id==='kcInput'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}if(repair.open&&e.key==='Escape'){e.preventDefault();ksRepairClose();return}if(stateChat.open&&e.key==='Escape'&&!stateChat.busy)close()},true);
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
#ksInfraChat .kc-actions>button,#ksInfraChat .kc-actions>select{min-height:44px;background:#fff;color:#142033;border:1px solid #cbd5e1;border-radius:12px;padding:9px 11px;font-size:13px;max-width:100%}
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
  const check=document.createElement('button');check.type='button';check.className='kc-btn';check.textContent='Semak bukti V3';check.disabled=stateChat.busy||!stateChat.target;
  check.addEventListener('click',ksV3Evidence);
  const locked=document.createElement('button');locked.type='button';locked.className='kc-btn';locked.textContent='Auto Repair OFF';locked.disabled=true;
  actions.append(choose,model);
  const extra=document.createElement('details');extra.className='kc-advanced';
  const summary=document.createElement('summary');summary.textContent=tr('Alat lanjutan · Salin, bukti & QA','Advanced tools · Copy, evidence & QA');
  const content=document.createElement('div');content.className='kc-advanced-content';content.append(copy,check,locked);
  extra.append(summary,content);controls.replaceWith(actions);actions.after(extra);
 }
 const target=node.querySelector('.kc-target');
 if(target){
  const selected=stateChat.projects.find(p=>p.id===stateChat.target);
  target.textContent=stateChat.target?'Projek aktif: '+(selected?.name||stateChat.target.split('|').at(-1).split(':').at(-1))+' · Read-only':'Semua projek: metadata sahaja · Pilih projek untuk baca deployment';
 }
 if(stateChat.v3Evidence?.target===stateChat.target){const panel=document.createElement('details');panel.className='kc-v3-evidence';panel.open=true;const summary=document.createElement('summary');summary.textContent='Bukti V3 · '+stateChat.v3Evidence.at+' · Read-only';panel.appendChild(summary);for(const item of stateChat.v3Evidence.items){const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%;font-size:12px';pre.textContent=JSON.stringify(item,null,2);panel.appendChild(pre)}node.querySelector('.kc-chat')?.appendChild(panel);}
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

// ================= V3 staging additions: STAGING label, owner approval panel, BM/EN, honest progress =================
const ksLang=()=>{try{return localStorage.getItem('ks-ui-language')==='en'?'en':'ms'}catch{return 'ms'}};
const tr=(ms,en)=>ksLang()==='en'?en:ms;
const KS_EN=new Map(Object.entries({
 'Diagnosis projek • sejarah chat • cadangan patch':'Project diagnosis • chat history • patch proposals',
 '+ Perbualan baharu':'+ New conversation','Sejarah':'History','Belum ada perbualan.':'No conversations yet.',
 'Apa masalah projek hari ini?':"What's wrong with the project today?",
 'Berbual dengan DeepSeek untuk cari punca masalah, cadangan pembaikan dan langkah ujian.':'Chat with DeepSeek to find root causes, repair proposals and test steps.',
 'Audit konfigurasi':'Configuration audit','API tak reply':'API not responding','Pelan repair':'Repair plan',
 'AI sedang menganalisis…':'AI is analysing…','Baca inventori projek…':'Reading project inventory…','Baca sejarah chat…':'Reading chat history…','Padam perbualan…':'Deleting conversation…','Membaca deployment, health dan akses logs…':'Reading deployments, health and log access…',
 'Hantar ➤':'Send ➤','↗ OpenAI semak / repair':'↗ OpenAI review / repair','DeepSeek → OpenAI automatik jika gagal':'DeepSeek → OpenAI automatically if it fails','Muat projek':'Load projects',
 'AI boleh cadangkan patch, tetapi belum boleh baca log penuh atau mengubah production. Jangan hantar API key.':'AI can propose patches but cannot read full logs or change production. Never send API keys.',
 'Owner: tiada had harian AI. Penggunaan dan anggaran kos direkod.':'Owner: no daily AI limit. Usage and estimated cost are recorded.',
 'Terlalu banyak panggilan AI dalam masa singkat. Tunggu seminit sebelum cuba lagi.':'Too many AI calls in a short time. Wait a minute before trying again.',
 'Dua permintaan AI sedang berjalan. Tunggu salah satu selesai.':'Two AI requests are already running. Wait for one to finish.',
 'Had kos harian yang anda tetapkan telah dicapai. Semak penggunaan sebelum menambah had.':'The daily cost limit you set was reached. Review usage before raising it.',
 'Rekod penggunaan AI tidak dapat dibaca atau ditulis, jadi permintaan dihentikan demi keselamatan kos.':'The AI usage log could not be read or written, so the request was stopped to keep spend safe.',
 'Semua projek: metadata sahaja · Pilih projek untuk baca deployment':'All projects: metadata only · Choose a project to read deployments',
 'Konteks: semua projek (metadata inventori sahaja)':'Context: all projects (inventory metadata only)',
 '⧉ Salin chat':'⧉ Copy chat','⧉ Salin jawapan':'⧉ Copy answer','Semak bukti V3':'Check V3 evidence','Semak sejarah':'Check history',
 '▦  Pilih projek  ▾':'▦  Choose project  ▾','Pilih projek':'Choose project',
 'Ketuk projek di bawah untuk sambungkan chat. Perbualan lama kekal dalam sejarah.':'Tap a project below to connect the chat. Past conversations stay in history.',
 'Deployment hanya untuk projek yang dipilih':'Deployment applies only to the selected project','↻ Refresh senarai':'↻ Refresh list',
 'Pilih →':'Choose →','✓ Dipilih':'✓ Selected','Tiada projek sepadan.':'No matching project.','Sedang memuat senarai projek…':'Loading project list…','Tiada projek dimuatkan. Tekan Refresh senarai.':'No projects loaded. Tap Refresh list.',
 'Senarai chat':'Chat list','Tutup chat':'Close chat','Sejarah chat':'Chat history','Padam perbualan':'Delete conversation','Cari projek':'Search projects','Menunggu AI':'Waiting for AI','Projek chat':'Chat project',
 'Mesej kepada DeepSeek':'Message to DeepSeek','Pilih projek untuk diagnosis':'Choose a project for diagnosis','Tutup pemilih':'Close picker',
 'Cari projek…':'Search projects…','Tanya DeepSeek tentang bug, error, atau repair…':'Ask DeepSeek about bugs, errors or repairs…','Cari nama projek, contoh: kerjasendiri':'Search project name, e.g. kerjasendiri',
 'Rekod lama — model tidak direkod':'Old record — model not recorded','Utama':'Primary','Fallback provider':'Provider fallback','Semakan pakar':'Specialist review','Pilihan owner':'Owner choice','Bacaan bukti':'Evidence read',
 'Cadangan sahaja':'Proposal only','Metadata/deployment diperiksa':'Metadata/deployment checked','Metadata sahaja':'Metadata only',
 'Had dua panggilan AI untuk permintaan ini dicapai. Sambung dalam mesej baharu.':'The two-call AI limit for this request was reached. Continue in a new message.',
 'Had 15 panggilan AI hari ini telah digunakan. Cuba selepas 12 malam waktu Malaysia.':"Today's 15 AI calls are used up. Try again after midnight Malaysia time.",
 'Bajet AI tidak dapat disahkan. Hubungi admin.':'The AI budget could not be verified. Contact the admin.',
 'Sejarah chat tidak dapat disimpan. Muat semula sejarah sebelum cuba lagi.':'Chat history could not be saved. Reload history before trying again.',
 'Jawapan tersimpan; rekod audit mengalami gangguan.':'Answer saved; the audit record had a problem.',
 'Credential DeepSeek ditolak. Admin perlu semak konfigurasi backend.':'The DeepSeek credential was rejected. The admin must check the backend configuration.',
 'Credential OpenAI ditolak. Admin perlu semak konfigurasi backend.':'The OpenAI credential was rejected. The admin must check the backend configuration.',
 'DeepSeek mencapai had provider. Cuba Auto atau OpenAI.':'DeepSeek hit the provider limit. Try Auto or OpenAI.','OpenAI mencapai had provider. Cuba kemudian.':'OpenAI hit the provider limit. Try later.',
 'OpenAI tidak dapat dihubungi. Cuba kemudian.':'OpenAI could not be reached. Try later.','OpenAI belum dikonfigurasi.':'OpenAI is not configured.','Sila log masuk semula.':'Please sign in again.',
 'Sambungan backend terganggu. Semak sejarah sebelum cuba lagi.':'The backend connection was interrupted. Check history before trying again.','Akses untuk pemilik sahaja.':'Owner access only.','Akaun ini bukan admin.':'This account is not an admin.',
 'Sesi tamat. Log masuk semula.':'Session expired. Sign in again.','Had AI harian 15 panggilan telah digunakan.':"Today's 15 AI calls are used up.",'DeepSeek API key belum dikonfigurasi.':'The DeepSeek API key is not configured.',
 'DeepSeek tidak dapat dihubungi sekarang.':'DeepSeek could not be reached right now.','Perbualan tidak ditemui.':'Conversation not found.','Sejarah chat tidak dapat disimpan.':'Chat history could not be saved.','Scan projek tidak tersedia buat masa ini.':'Project scan is unavailable right now.',
 'Pilih satu projek dahulu sebelum menggunakan tool deployment. Ketuk Pilih projek, kemudian pilih nama projek daripada senarai.':'Choose a project first before using the deployment tool. Tap Choose project, then pick a project from the list.',
 'Inventori projek tidak dapat dimuat. Cuba lagi.':'The project inventory could not be loaded. Try again.','Inventori projek belum tersedia.':'The project inventory is not available yet.',
 'Permintaan gagal. Semak sejarah sebelum cuba lagi.':'The request failed. Check history before trying again.',
 'Permintaan mengambil masa terlalu lama. Jawapan mungkin masih diproses; buka semula sejarah sebelum menghantar lagi.':'The request took too long. The answer may still be processing; reopen history before sending again.'
}));
const KS_EN_PATTERNS=[
 [/^(\d+)\/(\d+) panggilan AI berbaki · reset 12 malam MYT · fallback boleh guna 2 panggilan$/,'$1/$2 AI calls left · resets at midnight MYT · fallback may use 2 calls'],
 [/^Projek aktif: (.+) · Read-only$/,'Active project: $1 · Read-only'],
 [/^Owner: tiada had harian · (\S+) panggilan hari ini · anggaran kos \$(\S+)$/,'Owner: no daily limit · $1 calls today · estimated cost $$$2'],
 [/^Penggunaan AI (tinggi|amat tinggi) hari ini: (\d+) panggilan · anggaran \$(\S+)$/,(m,l,c,u)=>'AI usage is '+(l==='tinggi'?'high':'very high')+' today: '+c+' calls · estimated $'+u],
 [/^Konteks: (.+)$/,'Context: $1'],[/^· Rujukan (.+)$/,'· Reference $1'],[/^Permintaan gagal \(HTTP (\d+)\)\.$/,'Request failed (HTTP $1).'],
 [/^Semak sesi dan inventori; (.+) menganalisis…$/,(m,who)=>'Checking session and inventory; '+who.replace('jika perlu','if needed')+' analysing…']
];
function ksTranslate(node){
 if(ksLang()!=='en')return;
 const isContent=el=>!el.closest('.kc-copy-msg,.kc-proof')&&!!el.closest('.kc-msg,.kc-rendered,pre,code,.kc-v3-evidence,textarea');
 const conv=s=>{const t=s.trim();if(!t)return s;const hit=KS_EN.get(t);if(hit!==undefined)return s.replace(t,hit);for(const [re,out] of KS_EN_PATTERNS)if(re.test(t))return s.replace(t,t.replace(re,out));return s};
 const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),texts=[];
 while(walker.nextNode())texts.push(walker.currentNode);
 for(const n of texts)if(n.parentElement&&!isContent(n.parentElement)&&!n.parentElement.closest('.kc-v3-evidence'))n.nodeValue=conv(n.nodeValue);
 for(const e of node.querySelectorAll('[aria-label],[placeholder],[title]'))for(const a of ['aria-label','placeholder','title']){const v=e.getAttribute(a);if(v){const o=conv(v);if(o!==v)e.setAttribute(a,o)}}
 for(const p of node.querySelectorAll('.kc-proof'))p.textContent=p.textContent.split(' · ').map(s=>KS_EN.get(s)??s).join(' · ');
}
// Indeterminate progress only: the backend answers once, so we show real elapsed time, never invented steps.
let ksTicker=null;
function ksProgress(node){
 const busy=node.querySelector('.kc-busy');
 if(!stateChat.busy||!busy){stateChat.busySince=0;if(ksTicker){clearInterval(ksTicker);ksTicker=null}return}
 if(!stateChat.busySince)stateChat.busySince=Date.now();
 const span=document.createElement('span');span.className='kc-elapsed';span.setAttribute('data-kc-elapsed','');busy.appendChild(span);
 const tick=()=>{const s=Math.max(0,Math.round((Date.now()-stateChat.busySince)/1000));for(const e of document.querySelectorAll('[data-kc-elapsed]'))e.textContent=' · '+s+'s'};
 tick();if(!ksTicker)ksTicker=setInterval(()=>{if(!root()||!stateChat.busy){clearInterval(ksTicker);ksTicker=null;return}tick()},1000);
}
function ksV3Style(){
 if(document.getElementById('ksV3Style'))return;const st=document.createElement('style');st.id='ksV3Style';
 st.textContent='#ksInfraChat .kc-env,#ksRepairPanel .kc-env{display:inline-block;margin-left:6px;padding:2px 7px;border-radius:999px;background:#f59e0b;color:#111827;font-size:10px;font-weight:800;letter-spacing:.06em;vertical-align:middle}'+
 '#ksInfraChat .kc-elapsed{color:#475569;font-variant-numeric:tabular-nums}'+
 '#ksInfraChat .kc-actions{grid-template-columns:minmax(0,1fr) 138px 110px}#ksInfraChat .kc-actions>button{overflow-wrap:anywhere}'+
 '#ksRepairPanel{position:fixed;inset:0;z-index:100001;background:rgba(9,17,30,.63);display:flex;align-items:center;justify-content:center;padding:12px;color:#0f172a;font-size:14px;font-family:inherit}'+
 '#ksRepairPanel *{box-sizing:border-box;min-width:0}#ksRepairPanel button{font:inherit;cursor:pointer}#ksRepairPanel button:disabled{opacity:.5;cursor:default}'+
 '#ksRepairPanel .kr-modal{width:min(740px,100%);max-height:min(780px,94dvh);display:flex;flex-direction:column;background:#fff;border-radius:18px;box-shadow:0 15px 40px #0004;overflow:hidden}'+
 '#ksRepairPanel .kr-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:14px 16px 8px}#ksRepairPanel .kr-head h3{margin:0 0 3px;font-size:18px}#ksRepairPanel .kr-head p{margin:0;font-size:12px;color:#64748b;line-height:1.4}'+
 '#ksRepairPanel .kr-x{border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;min-width:44px;min-height:44px;font-size:19px}'+
 '#ksRepairPanel .kr-scroll{flex:1;overflow-y:auto;overflow-x:hidden;padding:4px 14px 14px}'+
 '#ksRepairPanel .kr-banner{margin:8px 0;padding:9px 11px;border-radius:10px;font-size:12px;line-height:1.45;overflow-wrap:anywhere}'+
 '#ksRepairPanel .kr-hold{background:#fff7ed;border:1px solid #fdba74;color:#7c2d12}#ksRepairPanel .kr-blocked{background:#fef2f2;border:1px solid #fca5a5;color:#7f1d1d}#ksRepairPanel .kr-ok{background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46}#ksRepairPanel .kr-info{background:#f1f5f9;border:1px solid #cbd5e1;color:#334155}'+
 '#ksRepairPanel .kr-job{display:block;width:100%;text-align:left;border:1px solid #e2e8f0;background:#fff;border-radius:12px;padding:12px;margin:7px 0;min-height:58px}#ksRepairPanel .kr-job b{display:block;overflow-wrap:anywhere}#ksRepairPanel .kr-job small{color:#64748b}'+
 '#ksRepairPanel .kr-steps{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin:10px 0;padding:0;list-style:none}'+
 '#ksRepairPanel .kr-step{border:1px solid #e2e8f0;border-radius:10px;padding:7px 5px;text-align:center;font-size:11px;line-height:1.25;background:#f8fafc;overflow-wrap:anywhere}#ksRepairPanel .kr-step i{display:block;font-style:normal;font-size:15px;margin-bottom:2px}'+
 '#ksRepairPanel .kr-step[data-s=done]{background:#ecfdf5;border-color:#6ee7b7}#ksRepairPanel .kr-step[data-s=current]{background:#eff6ff;border-color:#60a5fa;font-weight:700}#ksRepairPanel .kr-step[data-s=failed]{background:#fef2f2;border-color:#fca5a5}'+
 '#ksRepairPanel dl{display:grid;grid-template-columns:minmax(0,120px) minmax(0,1fr);gap:6px 10px;margin:10px 0;font-size:13px}#ksRepairPanel dt{color:#64748b}#ksRepairPanel dd{margin:0;overflow-wrap:anywhere}'+
 '#ksRepairPanel code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;background:#f1f5f9;padding:1px 4px;border-radius:4px;overflow-wrap:anywhere}'+
 '#ksRepairPanel .kr-risk{display:inline-block;padding:1px 8px;border-radius:999px;font-weight:700;font-size:12px}#ksRepairPanel .kr-risk[data-l=low]{background:#dcfce7;color:#166534}#ksRepairPanel .kr-risk[data-l=medium]{background:#fef3c7;color:#92400e}#ksRepairPanel .kr-risk[data-l=high]{background:#fee2e2;color:#991b1b}'+
 '#ksRepairPanel .kr-diff{margin:8px 0;max-height:42dvh;overflow:auto;white-space:pre;background:#17202d;color:#fff;padding:10px;border-radius:10px;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;max-width:100%}'+
 '#ksRepairPanel .kr-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}'+
 '#ksRepairPanel .kr-btn{min-height:46px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:12px;padding:8px 10px;font-weight:650;overflow-wrap:anywhere}#ksRepairPanel .kr-primary{background:#0e7490;border-color:#0e7490;color:#fff}#ksRepairPanel .kr-danger{border-color:#dc2626;color:#b91c1c}'+
 '#ksRepairPanel .kr-confirm{border:2px solid #0e7490;border-radius:12px;padding:12px;margin:12px 0;background:#f0f9ff}#ksRepairPanel .kr-confirm p{margin:0 0 8px;font-size:13px}'+
 '#ksRepairPanel .kr-busy{display:flex;align-items:center;gap:8px;margin:10px 0;font-size:13px}#ksRepairPanel progress{width:90px;flex:none}'+
 '@media(max-width:700px){#ksRepairPanel{align-items:flex-end;padding:0}#ksRepairPanel .kr-modal{width:100%;max-height:94dvh;border-radius:20px 20px 0 0;padding-bottom:env(safe-area-inset-bottom)}#ksRepairPanel .kr-steps{grid-template-columns:repeat(2,minmax(0,1fr))}#ksRepairPanel .kr-actions{grid-template-columns:1fr}#ksRepairPanel dl{grid-template-columns:minmax(0,92px) minmax(0,1fr)}}';

 // Contrast and touch-target hardening, scoped to the staging AI UI.
 st.textContent+=`

.ix-head .ix-center-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;align-items:stretch;width:min(420px,100%);margin-left:auto}
.ix-head .ix-center-actions button{width:100%;min-width:0;white-space:normal;overflow-wrap:anywhere;cursor:pointer}
.ix-head .ix-center-actions .ix-center-cost{grid-column:1/-1}
#ksInfraChat .kc-mode-nav{flex:0 0 auto;display:flex;align-items:center;gap:10px;justify-content:space-between;padding:10px 14px;background:#edf5ff;border-bottom:1px solid #b7d2ee}
#ksInfraChat .kc-mode-current{display:flex;flex-direction:column;gap:3px;line-height:1.4;color:#102b53}
#ksInfraChat .kc-mode-current strong{font-size:14px;color:#0f172a}
#ksInfraChat .kc-mode-current span{font-size:12px;color:#334155}
#ksInfraChat .kc-mode-switch{flex:none;background:#1d4ed8!important;color:#fff!important;border:2px solid #1e40af!important;min-height:48px;font-weight:750}
#ksInfraChat .kc-advanced{border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;padding:0 11px;color:#334155}
#ksInfraChat .kc-advanced>summary{cursor:pointer;padding:10px 2px;font-size:12px;font-weight:700}
#ksInfraChat .kc-advanced-content{display:flex;flex-wrap:wrap;gap:8px;padding:4px 0 12px}
#ksInfraChat .kc-advanced-content button{background:#fff;color:#0f172a;border:1px solid #64748b;border-radius:10px;min-height:44px;padding:9px 12px;font-size:12px}
#ksRepairPanel,#ksInfraChat{font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif}\n#ksRepairPanel .kr-guide{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:2px 0 14px}
#ksRepairPanel .kr-guide-step{display:flex;align-items:flex-start;gap:8px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:13px;padding:10px;line-height:1.4;color:#172033;font-size:12px}
#ksRepairPanel .kr-guide-step b{display:flex;flex:none;align-items:center;justify-content:center;width:25px;height:25px;border-radius:50%;background:#164e63;color:#fff;font-size:12px}
#ksRepairPanel .kr-readiness{background:#eef7ff;color:#102b53;border:1px solid #93c5fd;border-radius:12px;padding:12px 13px;margin:10px 0}
#ksRepairPanel .kr-readiness b{font-size:14px}
#ksRepairPanel .kr-readiness p{font-size:12px;line-height:1.5;margin:5px 0 0;color:#1e3a5f}
#ksRepairPanel .kr-technical{border:1px solid #cbd5e1;border-radius:12px;padding:10px 12px;background:#fff;color:#334155;font-size:12px;line-height:1.6;overflow-wrap:anywhere}
#ksRepairPanel .kr-technical summary{font-weight:650;cursor:pointer}
#ksRepairPanel .kr-section-head{margin:15px 0 0;color:#0f172a;font-size:18px}
#ksRepairPanel .kr-field-help{font-size:12px;color:#475569;line-height:1.5;margin:6px 0 12px}
#ksRepairPanel .kr-create{display:block;width:100%;font-size:16px;min-height:54px;margin-top:12px}
#ksRepairPanel .kr-example{background:#eff6ff;color:#1d4ed8;border:1px solid #60a5fa;min-height:46px;width:100%}
@media(max-width:700px){
.ix-head .ix-center-actions{grid-template-columns:1fr;margin-left:0;width:100%}
.ix-head .ix-center-actions .ix-center-cost{grid-column:auto}
#ksInfraChat .kc-mode-nav{padding:10px 11px;align-items:stretch;flex-direction:column}
#ksInfraChat .kc-mode-switch{width:100%;min-height:48px}
#ksInfraChat .kc-advanced-content{display:grid;grid-template-columns:1fr}
#ksRepairPanel .kr-guide{grid-template-columns:1fr;gap:6px}
#ksRepairPanel .kr-guide-step{align-items:center;padding:8px 10px}
}
#ksInfraChat button:focus-visible,#ksRepairPanel button:focus-visible,.ix-head [data-kc-open]:focus-visible,.ix-head [data-kc-cost]:focus-visible{outline:3px solid #fbbf24!important;outline-offset:3px}
.ix-head [data-kc-open],.ix-head [data-kc-cost]{visibility:visible!important;text-shadow:none!important;-webkit-text-fill-color:currentColor!important;white-space:normal;overflow-wrap:anywhere;flex:0 1 auto}
@media(max-width:700px){.ix-head [data-kc-open],.ix-head [data-kc-cost]{width:100%;min-width:0;min-height:50px!important;text-align:center}}
#ksInfraChat{color:#0f172a;color-scheme:light}
#ksInfraChat .kc-btn,#ksInfraChat .kc-actions>button,#ksInfraChat .kc-actions>select,#ksInfraChat .kc-chip{background:#fff;color:#142033;border:1px solid #64748b;font-weight:650;min-height:44px}
#ksInfraChat .kc-actions>[data-kr-open]{background:#164e63;color:#fff;border-color:#164e63}
#ksInfraChat .kc-head .kc-btn{background:#24364e;color:#fff;border-color:#94a3b8}
#ksInfraChat .kc-send{min-height:44px;background:#0f172a;color:#fff}
#ksInfraChat .kc-controls select,#ksInfraChat .kc-controls input,#ksInfraChat .kc-input-row textarea{background:#fff;color:#0f172a;border-color:#64748b}
#ksInfraChat button:focus-visible,#ksInfraChat select:focus-visible,#ksInfraChat textarea:focus-visible,#ksInfraChat input:focus-visible{outline:3px solid #f59e0b;outline-offset:2px}
#ksRepairPanel{color:#0f172a;color-scheme:light}
#ksRepairPanel .kr-modal{background:#fff;color:#0f172a;max-height:calc(100dvh - 24px)}
#ksRepairPanel .kr-head{background:#f8fafc;border-bottom:1px solid #cbd5e1;flex:none;padding:14px 16px}
#ksRepairPanel .kr-head h3,#ksRepairPanel .kr-head p{color:#0f172a}
#ksRepairPanel .kr-head p{color:#334155}
#ksRepairPanel .kr-x{background:#fff;color:#0f172a;border:1px solid #64748b;flex:0 0 44px}
#ksRepairPanel .kr-scroll{padding:12px 16px 20px;overscroll-behavior:contain}
#ksRepairPanel .kr-field-label{display:block;font-size:14px;font-weight:750;color:#0f172a;margin:12px 0 6px}
#ksRepairPanel .kr-input{display:block;width:100%;max-width:100%;margin:0 0 10px;padding:12px 14px;font:inherit;font-size:16px;line-height:1.5;background:#fff!important;color:#0f172a!important;border:1.5px solid #64748b!important;border-radius:12px;outline-offset:2px}
#ksRepairPanel select.kr-input{min-height:48px;appearance:auto}
#ksRepairPanel textarea.kr-input{min-height:116px;resize:vertical;overflow:auto}
#ksRepairPanel .kr-input::placeholder{color:#475569;opacity:1}
#ksRepairPanel .kr-btn,#ksRepairPanel .kr-job{display:block;min-height:48px;background:#fff;color:#0f172a;border:1.5px solid #64748b;font-size:14px;line-height:1.4}
#ksRepairPanel .kr-primary,#ksRepairPanel .kr-btn.kr-primary{background:#155e75;color:#fff;border-color:#155e75;font-weight:750}
#ksRepairPanel .kr-danger,#ksRepairPanel .kr-btn.kr-danger{background:#fff;color:#991b1b;border-color:#b91c1c}
#ksRepairPanel .kr-btn:disabled{opacity:1;cursor:not-allowed;background:#e2e8f0;color:#334155;border-color:#94a3b8;border-style:dashed}
#ksRepairPanel .kr-btn.kr-primary:disabled{background:#e2e8f0;color:#334155;border-color:#94a3b8}
#ksRepairPanel .kr-btn:focus-visible,#ksRepairPanel .kr-job:focus-visible,#ksRepairPanel .kr-x:focus-visible,#ksRepairPanel .kr-input:focus-visible{outline:3px solid #2563eb;outline-offset:2px}
#ksRepairPanel .kr-actions{align-items:stretch}
#ksRepairPanel .kr-actions>.kr-btn{width:100%;height:100%;white-space:normal;overflow-wrap:anywhere}
#ksRepairPanel .kr-step{color:#1e293b}
#ksRepairPanel .kr-step[data-s=done]{color:#14532d}
#ksRepairPanel .kr-step[data-s=failed]{color:#991b1b}
#ksRepairPanel .kr-banner{font-size:13px;line-height:1.55}
@media(max-width:700px){
#ksInfraChat .kc-head{gap:6px}
#ksInfraChat .kc-actions{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
#ksInfraChat .kc-actions .kc-pick-trigger{grid-column:1/-1}
#ksInfraChat .kc-actions>button,#ksInfraChat .kc-actions>select{min-height:48px;font-size:14px;white-space:normal}
#ksInfraChat .kc-composer{padding-bottom:max(14px,env(safe-area-inset-bottom))}
#ksRepairPanel{padding:0;align-items:stretch}
#ksRepairPanel .kr-modal{width:100%;height:100dvh;max-height:100dvh;border-radius:0;padding-bottom:env(safe-area-inset-bottom)}
#ksRepairPanel .kr-head{padding:12px max(14px,env(safe-area-inset-left)) 10px}
#ksRepairPanel .kr-head h3{font-size:17px}
#ksRepairPanel .kr-head p{font-size:12px}
#ksRepairPanel .kr-scroll{padding:12px max(14px,env(safe-area-inset-right)) 24px}
#ksRepairPanel .kr-actions{grid-template-columns:1fr;gap:10px}
#ksRepairPanel .kr-btn{min-height:50px;font-size:15px}
#ksRepairPanel .kr-banner{font-size:13px}
}
@media(prefers-reduced-motion:reduce){#ksInfraChat *,#ksRepairPanel *{scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;
 document.head.appendChild(st);
}
// ---- Owner approval panel (Diagnosis -> Patch Proposed -> Tests PASS -> Owner Approval -> Staging Deploy -> Staging Verification) ----
const repair={open:false,busy:false,phase:'',since:0,jobs:null,readiness:null,blocked:false,error:'',selectedId:'',detail:null,diffOpen:false,confirm:'',result:null,scroll:0};
const STAGE_LABEL={reading_source:['Membaca kod','Reading source'],ai_diagnosis:['Diagnosis AI','AI diagnosis'],generating_patch:['Menjana patch','Generating patch'],validating:['Mengesahkan patch','Validating'],creating_pr:['Mencipta PR','Creating PR'],running_tests:['Menjalankan ujian','Running tests'],awaiting_approval:['Menunggu kelulusan','Awaiting approval'],deploying_staging:['Deploy staging','Deploying staging'],verifying:['Mengesahkan staging','Verifying'],diagnosis:['Diagnosis','Diagnosis'],patch_proposed:['Patch dicadangkan','Patch proposed'],tests_pass:['Ujian PASS','Tests PASS'],owner_approval:['Kelulusan owner','Owner approval'],staging_deploy:['Deploy staging','Staging deploy'],staging_verification:['Pengesahan staging','Staging verification']};
const STAGE_ICON={done:'✓',current:'●',failed:'✕',pending:'○'};
const STAGE_NAME={done:['Selesai','Done'],current:['Sedang berjalan','In progress'],failed:['Gagal','Failed'],pending:['Menunggu','Pending']};
const STATE_LABEL={proposed:['Dicadangkan','Proposed'],validated:['Disahkan skop','Scope validated'],tests_passed:['Ujian PASS — menunggu owner','Tests PASS — awaiting owner'],tests_failed:['Ujian gagal','Tests failed'],validation_failed:['Patch ditolak','Patch rejected'],owner_approved_staging:['Diluluskan untuk staging','Approved for staging'],staging_deployed:['Telah deploy ke staging','Deployed to staging'],staging_verified:['Staging disahkan','Staging verified'],staging_failed:['Deploy staging gagal','Staging deploy failed'],verification_failed:['Pengesahan gagal','Verification failed'],cancelled:['Ditolak / dibatalkan','Rejected / cancelled'],rollback_required:['Perlu rollback','Rollback required'],rolled_back:['Telah rollback','Rolled back']};
const RISK_LABEL={low:['Rendah','Low'],medium:['Sederhana','Medium'],high:['Tinggi','High']};
const RISK_WHY={STAGING_FIXTURE:['Ujian fixture staging sahaja','Staging fixture test only'],DOCS_ONLY:['Dokumentasi sahaja','Documentation only'],TOUCHES_NON_UI_FILES:['Menyentuh fail bukan UI','Touches non-UI files'],CHANGES_OWNER_UI:['Mengubah UI owner','Changes the owner UI'],MANY_FILES:['Banyak fail','Many files'],NO_FILES_LISTED:['Tiada senarai fail','No file list']};
const REPAIR_MSG={
 GITHUB_REPOSITORY_INACCESSIBLE:['Credential runtime tidak boleh mengakses repository. Semak repository yang dibenarkan pada token; kod fail belum dibaca.','The runtime credential cannot access the repository. Check its allowed repository; source has not been read.'],
 GITHUB_PERMISSION_DENIED:['GitHub menolak permission credential runtime.','GitHub denied the runtime credential permission.'],
 SOURCE_ACCESS_UNPROVEN:['Akses source belum dapat dibuktikan. Butiran probe membezakan repo, commit dan fail.','Source access remains unproven. Probe details distinguish repository, commit and file.'],
 SOURCE_NOT_FOUND:['Fail tiada dalam tree commit yang disahkan.','The file is absent from the verified commit tree.'],
 SOURCE_REF_MISMATCH:['Commit source tidak sepadan dengan ref yang dipinkan.','The source commit does not match the pinned ref.'],
 MODEL_RESPONSE_INVALID:['Respons model tidak mengikut format proposal.','The model response does not match the proposal format.'],
 PATCH_VALIDATION_FAILED:['Patch gagal semakan skop atau kandungan.','The patch failed scope or content validation.'],
 PROVIDER_UNAVAILABLE:['Provider tidak dapat memberikan respons yang sah.','The provider could not return a valid response.'],
 STAGING_CREDENTIAL_SCOPE_UNPROVEN:['Skop credential staging belum terbukti terhad. Deployment disekat.','The staging credential scope is not proven restricted. Deployment is blocked.'],
 ARTIFACT_VERIFICATION_FAILED:['Artifact gagal semakan hash atau ikatan source. Deployment disekat.','Artifact hash or source binding verification failed. Deployment is blocked.'],

 DURABLE_STORE_NOT_CONFIGURED:['Jadual pembaikan belum dipasang pada pangkalan data. Migration memerlukan kelulusan owner yang berasingan, jadi tiada tindakan boleh dibuat di sini.','The repair tables are not installed in the database. The migration needs separate owner approval, so no action can be taken here.'],
 DURABLE_APPROVAL_RUNNER_NOT_CONFIGURED:['Deploy staging: BLOCKED — runner dan penyimpanan kelulusan tahan lasak belum dikonfigurasi. Kelulusan tidak boleh digunakan lagi.','Staging deploy: BLOCKED — the durable runner and approval storage are not configured. The approval cannot be used yet.'],
 JOB_NOT_FOUND:['Cadangan tidak ditemui.','Proposal not found.'],STATE_NOT_APPROVABLE:['Cadangan ini tidak berada pada peringkat boleh diluluskan.','This proposal is not at an approvable stage.'],
 TESTS_NOT_PASSED:['Ujian sebenar belum PASS. Kelulusan disekat.','The real tests have not passed. Approval is blocked.'],ARTIFACT_MISMATCH:['Diff tidak sepadan dengan hash artifact. Kelulusan disekat.','The diff does not match the artifact hash. Approval is blocked.'],
 STALE_VIEW:['Cadangan berubah selepas anda melihatnya. Semak semula diff dan keputusan ujian.','The proposal changed after you viewed it. Review the diff and test result again.'],ROLLBACK_REF_REQUIRED:['Tiada rujukan rollback. Kelulusan disekat.','No rollback reference. Approval is blocked.'],
 PRODUCTION_HOLD:['Production: HOLD. Hanya staging dibenarkan.','Production: HOLD. Only staging is allowed.'],TARGET_DENIED:['Sasaran bukan projek staging yang dibenarkan.','The target is not the allowed staging project.'],
 STATE_CHANGED:['Keadaan berubah semasa permintaan. Tiada kelulusan direkod.','The state changed during the request. No approval was recorded.'],STATE_NOT_REJECTABLE:['Cadangan ini tidak boleh ditolak pada peringkat ini.','This proposal cannot be rejected at this stage.'],
 SEEN_HASHES_REQUIRED:['Hash yang dipaparkan diperlukan untuk kelulusan.','The displayed hashes are required for approval.'],REPAIR_STORE_ERROR:['Storan pembaikan bermasalah. Cuba lagi.','The repair store had a problem. Try again.'],
 LOGIN_REQUIRED:['Sila log masuk semula.','Please sign in again.'],SESSION_EXPIRED:['Sesi tamat. Log masuk semula.','Session expired. Sign in again.'],OWNER_ONLY:['Akses untuk pemilik sahaja.','Owner access only.'],ADMIN_REQUIRED:['Akaun ini bukan admin.','This account is not an admin.'],
 TIMEOUT:['Permintaan terlalu lama. Cuba lagi.','The request took too long. Try again.'],NETWORK:['Tiada sambungan. Cuba lagi.','No connection. Try again.']
};
const repairMsg=code=>{const m=REPAIR_MSG[code];return m?tr(m[0],m[1]):tr('Permintaan gagal ('+String(code||'UNKNOWN').slice(0,40)+').','Request failed ('+String(code||'UNKNOWN').slice(0,40)+').')};
async function repairCall(payload){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
 try{
  const token=await access();
  const r=await fetch(REPAIR_API,{method:'POST',headers:{Authorization:'Bearer '+token,apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',signal:controller.signal});
  const body=await r.json().catch(()=>({}));
  return {status:r.status,body:r.status===401&&!body.code?{ok:false,code:'SESSION_EXPIRED'}:body};
 }catch(e){return {status:0,body:{ok:false,code:e?.name==='AbortError'?'TIMEOUT':'NETWORK'}}}
 finally{clearTimeout(timer)}
}
function repairBusy(phaseMs,phaseEn){repair.busy=true;repair.phase=tr(phaseMs,phaseEn);repair.since=Date.now();repair.error='';paintRepair()}
async function repairLoadJobs(){
 repairBusy('Memuat senarai cadangan…','Loading proposals…');
 const [jobsReply,readyReply]=await Promise.all([repairCall({action:'repair_jobs'}),repairCall({action:'repair_readiness'})]);const {body}=jobsReply;repair.readiness=readyReply.body.readiness||null;repair.busy=false;
 if(body.ok===true){repair.jobs=body.jobs||[];repair.blocked=false}
 else if(body.code==='DURABLE_STORE_NOT_CONFIGURED'){repair.blocked=true;repair.jobs=[]}
 else repair.error=repairMsg(body.code);
 paintRepair();
}
async function repairSelect(id){
 repair.selectedId=id;repair.production=null;repair.diffOpen=false;repair.confirm='';repair.result=null;repairBusy('Memuat diff, ujian dan hash…','Loading diff, tests and hashes…');
 const {body}=await repairCall({action:'repair_view',jobId:id});repair.busy=false;
 if(body.ok===true)repair.detail={job:body.job,diff:body.diff};else{repair.detail=null;repair.error=repairMsg(body.code)}
 paintRepair();
}
async function repairApprove(){
 const j=repair.detail?.job;if(!j||repair.busy)return;
 // The hashes sent are exactly the ones on screen; the server refuses if the stored job no longer matches them.
 const seen={patch_hash:j.hashes.patch_hash,artifact_hash:j.hashes.artifact_hash,test_summary_hash:j.hashes.test_summary_hash};
 repair.confirm='';repairBusy('Mengesahkan kelulusan di backend…','Verifying approval on the backend…');
 const {body}=await repairCall({action:'repair_approve_staging',jobId:j.job_id,seen});repair.busy=false;
 if(body.ok===true){repair.result={kind:'approved',approvalId:body.approval?.id,expires_at:body.approval?.expires_at||'',deploy:body.deploy||null}}
 else{repair.result={kind:'error',code:body.code};repair.error=repairMsg(body.code)}
 await repairSelectKeep(j.job_id);
}
async function repairReject(){
 const j=repair.detail?.job;if(!j||repair.busy)return;
 repair.confirm='';repairBusy('Merekod penolakan…','Recording rejection…');
 const {body}=await repairCall({action:'repair_reject',jobId:j.job_id,reason:'owner_rejected_in_dashboard'});repair.busy=false;
 if(body.ok===true)repair.result={kind:'rejected'};else{repair.result={kind:'error',code:body.code};repair.error=repairMsg(body.code)}
 await repairSelectKeep(j.job_id);
}
async function repairSelectKeep(id){
 const {body}=await repairCall({action:'repair_view',jobId:id});
 if(body.ok===true)repair.detail={job:body.job,diff:body.diff};
 repair.busy=false;paintRepair();
}
function ksRepairClose(){repair.open=false;document.getElementById('ksRepairPanel')?.remove();root()?.removeAttribute('aria-hidden')}
function ksRepairOpen(){repair.open=true;repair.selectedId='';repair.detail=null;repair.result=null;repair.confirm='';repair.error='';repair.scroll=0;paintRepair();repairLoadJobs()}
const h=(tag,attrs,...kids)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs||{})){if(v===false||v==null)continue;if(k==='text')e.textContent=v;else e.setAttribute(k,v===true?'':v)}for(const k of kids.flat())if(k!=null&&k!==false)e.append(k.nodeType?k:document.createTextNode(String(k)));return e};
function repairEventResolved(job,event){
 return event?.detail?.code==='WORKFLOW_AWAITING_RUN'&&['tests_passed','owner_approved_staging','staging_deployed','staging_verified','rolled_back','staging_failed','verification_failed','rollback_required'].includes(job.state);
}
function repairShowDiff(){
 repair.diffOpen=!repair.diffOpen;paintRepair();
 if(repair.diffOpen){const code=document.querySelector('#ksRepairPanel [data-kr-diff]');code?.scrollIntoView({block:'center',behavior:'instant'});code?.focus({preventScroll:true});}
}
const short=x=>x?String(x).slice(0,12)+'…':'—';
function paintRepair(){
 if(!repair.open)return;ksV3Style();
 let panel=document.getElementById('ksRepairPanel');
 const old=panel?.querySelector('.kr-scroll');if(old)repair.scroll=old.scrollTop;
 if(!panel){panel=h('div',{id:'ksRepairPanel',role:'presentation'});document.body.appendChild(panel)}
 const j=repair.detail?.job,diff=repair.detail?.diff;
 const closeBtn=h('button',{type:'button',class:'kr-x','data-kr':'close','aria-label':tr('Tutup panel pembaikan','Close repair panel'),text:'×'});
 closeBtn.addEventListener('click',ksRepairClose);
 const head=h('div',{class:'kr-head'},h('div',{},h('h3',{},tr('🛠 Repair Engine','🛠 Repair Engine'),h('span',{class:'kc-env',text:'STAGING'})),h('p',{text:tr('Cipta job pembaikan sebenar. Tidak sama dengan perbualan Chat AI.','Create a real repair job. Different from an AI Chat conversation.')})),closeBtn);
 const body=h('div',{class:'kr-scroll'});
 const guide=h('section',{class:'kr-guide','aria-label':tr('Langkah pembaikan','Repair steps')});
 guide.append(
   h('div',{class:'kr-guide-step'},h('b',{text:'1'}),h('span',{text:tr('Terangkan bug & jana proposal','Describe bug & create proposal')})),
   h('div',{class:'kr-guide-step'},h('b',{text:'2'}),h('span',{text:tr('Semak perubahan & keputusan ujian','Review patch & tests')})),
   h('div',{class:'kr-guide-step'},h('b',{text:'3'}),h('span',{text:tr('Luluskan STAGING sahaja','Approve STAGING only')}))
 );
 body.append(guide,h('div',{class:'kr-banner kr-hold',role:'note',text:tr('Production OFF · Tiada auto-deploy. Deployment perlu semakan dan kelulusan owner.','Production OFF · No auto-deploy. Deployment requires review and owner approval.')}));
 if(repair.busy){const s=h('span',{'data-kr-elapsed':''});body.append(h('div',{class:'kr-busy',role:'status'},h('progress',{'aria-label':tr('Menunggu','Waiting')}),h('span',{text:repair.phase}),s));const tick=()=>{s.textContent=' · '+Math.max(0,Math.round((Date.now()-repair.since)/1000))+'s'};tick();clearInterval(repair.timer);repair.timer=setInterval(()=>{if(!document.contains(s)||!repair.busy){clearInterval(repair.timer);return}tick()},1000)}
 if(repair.readiness){const r=repair.readiness;const ready=!!r.proposal_ready;
 const note=h('div',{class:'kr-readiness',role:'status'},h('b',{text:ready?tr('✓ AI boleh cuba menjana proposal','✓ AI can attempt to create a proposal'):tr('! Penjanaan proposal belum tersedia','! Proposal generation is not ready')}),h('p',{text:ready?tr('Mencipta proposal tidak deploy apa-apa.','Creating a proposal does not deploy anything.'):tr('Semak sambungan GitHub/AI dalam status teknikal.','Check GitHub/AI connections in technical status.')}));
 const more=h('details',{class:'kr-technical'},h('summary',{text:tr('Status teknikal integrasi','Integration technical status')}),h('p',{text:Object.entries(r.config||{}).map(([k,v])=>k+': '+(v?'✓':'BELUM')).join(' · ')}));
 body.append(note,more);}
 if(!repair.detail){
  const request=h('textarea',{rows:'3','aria-label':tr('Masalah untuk dibaiki','Problem to repair'),placeholder:tr('Terangkan bug pada panel Chat AI staging…','Describe a bug in the staging AI Chat panel…')});request.className='kr-input';request.maxLength=2000;
  const recipe=h('select',{class:'kr-input','aria-label':tr('Skop pembaikan','Repair scope')});recipe.append(h('option',{value:'fixture-v31',text:tr('Ujian selamat · Fixture staging','Safe test · Staging fixture')}),h('option',{value:'portal-v31',text:tr('Panel Chat AI · staging','AI Chat panel · staging')}));
  const propose=h('button',{type:'button',class:'kr-btn kr-primary kr-create','data-kr':'propose',text:tr('Jana proposal sebenar →','Create real repair proposal →'),disabled:repair.busy||!repair.readiness?.proposal_ready});
 const example=h('button',{type:'button',class:'kr-btn kr-example','data-kr':'example',text:tr('Guna contoh bug ujian','Use test bug example')});
 example.addEventListener('click',()=>{recipe.value='fixture-v31';request.value=tr('Fail public/repair-fixture.mjs menganggap HTTP 201 sihat, tetapi status sihat sebenar ialah HTTP 200. Cadangkan perubahan minimum: status === 201 kepada status === 200. Hanya fixture staging.','In public/repair-fixture.mjs, HTTP 201 is incorrectly treated as healthy. HTTP 200 is correct. Propose the smallest change: status === 201 to status === 200. Staging fixture only.');request.focus()});
  propose.addEventListener('click',async()=>{const text=request.value.trim();if(!text)return;const key=crypto.randomUUID();repairBusy('AI membaca bukti dan menyediakan patch…','AI is reading evidence and preparing a patch…');const {body:r}=await repairCall({action:'repair_propose',request:text,recipeId:recipe.value,idempotencyKey:key});repair.busy=false;if(r.job_id){repair.error=r.ok?'':repairMsg(r.code);await repairSelect(r.job_id)}else{repair.error=repairMsg(r.code);paintRepair()}});
  body.append(h('h4',{class:'kr-section-head',text:tr('Mula pembaikan baharu','Start a new repair')}),h('p',{class:'kr-field-help',text:tr('Pilih ujian selamat dahulu. Guna contoh jika mahu menguji enjin.','Start with the safe test. Use the example to try the engine.')}),h('label',{class:'kr-field-label',text:tr('1. Pilih skop','1. Choose scope')}),recipe,h('label',{class:'kr-field-label',text:tr('2. Terangkan masalah','2. Describe the issue')}),request,example,propose,h('p',{class:'kr-field-help',text:repair.readiness?.proposal_ready?tr('Butang ini mencipta job sebenar, bukan mesej Chat AI. Tiada deploy dibuat.','This creates a real job, not an AI Chat message. No deployment occurs.'):tr('Butang tidak aktif sehingga sambungan AI/GitHub sedia.','The button stays disabled until AI/GitHub connections are ready.')}));
 }
 if(repair.readiness?.permissions){const probes=h('details',{class:'kr-technical'},h('summary',{text:tr('Bukti permission runtime','Runtime permission evidence')}),h('pre',{class:'kr-diff',text:JSON.stringify(repair.readiness.permissions,null,2)}));body.append(probes);}
 if(repair.error)body.append(h('div',{class:'kr-banner kr-blocked',role:'alert',text:repair.error}));
 if(repair.blocked){body.append(h('div',{class:'kr-banner kr-blocked',role:'status'},h('b',{text:'BLOCKED · '}),repairMsg('DURABLE_STORE_NOT_CONFIGURED')))}
 else if(!j){
  if(Array.isArray(repair.jobs)&&!repair.busy){
   if(!repair.jobs.length)body.append(h('div',{class:'kr-banner kr-info',text:tr('Belum ada cadangan pembaikan. Semak kesiapsiagaan integrasi di atas sebelum menjana cadangan.','There are no repair proposals yet. Ask the AI to diagnose a project to begin.')}));
   for(const x of repair.jobs){const b=h('button',{type:'button',class:'kr-job','data-kr-job':x.job_id},h('b',{text:'#'+String(x.job_id).slice(0,8)+' · '+String(x.project_id||'').split(':').pop()}),h('small',{text:tr(...(STATE_LABEL[x.state]||[x.state,x.state]))+' · STAGING'}));b.addEventListener('click',()=>repairSelect(x.job_id));body.append(b)}
  }
 }else{
  const back=h('button',{type:'button',class:'kr-btn','data-kr':'back',text:'← '+tr('Senarai','List')});back.addEventListener('click',()=>{repair.detail=null;repair.selectedId='';repair.result=null;repair.confirm='';repair.error='';repairLoadJobs()});
  body.append(back);
  body.append(h('dl',{},
   h('dt',{text:tr('Projek','Project')}),h('dd',{text:String(j.provider)+' / '+String(j.project_id).split(':').pop()}),
   h('dt',{text:tr('Persekitaran','Environment')}),h('dd',{},h('span',{class:'kc-env',text:'STAGING'}),' ',tr(...(STATE_LABEL[j.state]||[j.state,j.state]))),
   h('dt',{text:tr('Model pencadang','Proposed by')}),h('dd',{text:[j.proposer?.provider,j.proposer?.model].filter(Boolean).join(' · ')||tr('Tidak direkod','Not recorded')})));
  body.append(h('ol',{class:'kr-steps','aria-label':tr('Aliran kelulusan','Approval flow')},...(j.engine?.pipeline||j.stages).map(s=>h('li',{class:'kr-step','data-s':s.status,'aria-label':tr(...STAGE_LABEL[s.id])+': '+tr(...STAGE_NAME[s.status])},h('i',{'aria-hidden':'true',text:STAGE_ICON[s.status]}),tr(...STAGE_LABEL[s.id])))));
  body.append(h('dl',{},
   h('dt',{text:tr('Fail diubah','Files changed')}),h('dd',{},...(j.files.length?j.files.map(f=>h('div',{},h('code',{text:f.path}))):[tr('Tiada','None')])),
   h('dt',{text:tr('Risiko','Risk')}),h('dd',{},h('span',{class:'kr-risk','data-l':j.risk.level,text:tr(...RISK_LABEL[j.risk.level])}),' ',j.risk.reasons.map(r=>tr(...(RISK_WHY[r]||[r,r]))).join(' · ')),
   h('dt',{text:tr('Keputusan ujian','Test result')}),h('dd',{text:j.tests?j.tests.result+' · '+j.tests.recipe_id+' · exit '+j.tests.exit_code:tr('Tiada keputusan ujian','No test result')}),
   h('dt',{text:'Rollback'}),h('dd',{},j.rollback.ref?[h('code',{text:j.rollback.ref}),h('div',{text:tr('Pulihkan versi staging sebelumnya','Restore the previous staging version')})]:tr('Tiada rujukan rollback','No rollback reference')),
   h('dt',{text:'Hash'}),h('dd',{},h('div',{},'patch ',h('code',{text:short(j.hashes.patch_hash)})),h('div',{},'artifact ',h('code',{text:short(j.hashes.artifact_hash)})),h('div',{},'tests ',h('code',{text:short(j.hashes.test_summary_hash)})))));
  if(repair.diffOpen)body.append(h('pre',{class:'kr-diff','data-kr-diff':'',id:'ksRepairDiff',tabindex:'0','aria-label':tr('Perbezaan kod (diff)','Code diff'),text:diff?diff.body:tr('Diff tidak tersedia.','Diff not available.')}));
  if(!j.approvable&&j.state==='tests_passed')body.append(h('div',{class:'kr-banner kr-blocked',role:'status',text:repairMsg(j.blocked_reason)}));
  else if(!j.approvable&&!repair.result&&j.blocked_reason!=='STATE_NOT_APPROVABLE')body.append(h('div',{class:'kr-banner kr-info',role:'status',text:repairMsg(j.blocked_reason)}));
  if(repair.result?.kind==='approved')body.append(h('div',{class:'kr-banner kr-ok',role:'status',text:tr('Diluluskan untuk STAGING. Sekali guna, tamat '+(repair.result.expires_at?new Date(repair.result.expires_at).toLocaleTimeString():'dalam 10 minit')+'. ','Approved for STAGING. Single use, expires '+(repair.result.expires_at?new Date(repair.result.expires_at).toLocaleTimeString():'in 10 minutes')+'. ')+tr('Semak kesiapsiagaan executor sebelum deploy.','Check executor readiness before deployment.')}));
  if(repair.result?.kind==='rejected')body.append(h('div',{class:'kr-banner kr-info',role:'status',text:tr('Cadangan ditolak. Tiada perubahan dibuat.','Proposal rejected. No change was made.')}));
  if(repair.confirm==='approve'){
   const yes=h('button',{type:'button',class:'kr-btn kr-primary','data-kr':'confirm-approve',text:tr('Ya, luluskan (STAGING)','Yes, approve (STAGING)')});yes.addEventListener('click',repairApprove);
   const no=h('button',{type:'button',class:'kr-btn','data-kr':'cancel-confirm',text:tr('Batal','Cancel')});no.addEventListener('click',()=>{repair.confirm='';paintRepair()});
   body.append(h('div',{class:'kr-confirm',role:'alertdialog','aria-label':tr('Sahkan kelulusan','Confirm approval')},h('p',{},h('b',{text:tr('Luluskan untuk STAGING sahaja?','Approve for STAGING only?')})),h('p',{text:tr('Anda meluluskan diff yang dipaparkan ('+j.files.length+' fail) dengan hash artifact '+short(j.hashes.artifact_hash)+'. Kelulusan terikat kepada anda, projek ini dan persekitaran ini; sekali guna dan tamat dalam 10 minit.','You are approving the displayed diff ('+j.files.length+' file(s)) with artifact hash '+short(j.hashes.artifact_hash)+'. The approval is bound to you, this project and this environment; single use, expires in 10 minutes.')}),h('div',{class:'kr-actions'},yes,no)));
  }
  if(repair.confirm==='reject'){
   const yes=h('button',{type:'button',class:'kr-btn kr-danger','data-kr':'confirm-reject',text:tr('Ya, tolak','Yes, reject')});yes.addEventListener('click',repairReject);
   const no=h('button',{type:'button',class:'kr-btn','data-kr':'cancel-confirm',text:tr('Batal','Cancel')});no.addEventListener('click',()=>{repair.confirm='';paintRepair()});
   body.append(h('div',{class:'kr-confirm',role:'alertdialog','aria-label':tr('Sahkan penolakan','Confirm rejection')},h('p',{},h('b',{text:tr('Tolak cadangan ini?','Reject this proposal?')})),h('div',{class:'kr-actions'},yes,no)));
  }
  if(['validated','tests_passed','owner_approved_staging','staging_deployed','staging_failed','rollback_required','staging_verified'].includes(j.state)){
   for(const [action,ms,en] of [['repair_submit','Cipta branch dan PR staging','Create staging branch and PR'],['repair_dispatch','Jalankan workflow ujian','Run test workflow'],['repair_sync','Semak status GitHub','Check GitHub status'],['repair_verify','Sahkan staging','Verify staging'],['repair_reconcile_submit','Pulihkan status PR','Reconcile PR'],['repair_reconcile_dispatch','Cari workflow yang diterima','Find accepted workflow'],['repair_reconcile_deployment','Sahkan deploy tergantung','Reconcile pending deployment']]){
    const button=h('button',{type:'button',class:'kr-btn',disabled:repair.busy||((action==='repair_submit'||action==='repair_dispatch')&&(!repair.readiness?.submit_ready||j.state!=='validated'))||(action==='repair_verify'&&j.state!=='staging_deployed')||(action==='repair_reconcile_deployment'&&!['staging_failed','owner_approved_staging'].includes(j.state)),text:tr(ms,en)});
    button.addEventListener('click',async()=>{repairBusy(ms+'…',en+'…');const {body:r}=await repairCall({action,jobId:j.job_id});repair.busy=false;if(!r.ok)repair.error=repairMsg(r.code);else repair.error='';repair.workflow=r;await repairSelectKeep(j.job_id)});body.append(button);
   }
  }
  if(['staging_verified','staging_deployed','rollback_required'].includes(j.state)){
   const pending=j.state==='rollback_required',label=pending?tr('Pulihkan status rollback','Reconcile rollback'):tr('Uji rollback staging','Test staging rollback');
   const rb=h('button',{type:'button',class:'kr-btn kr-danger',disabled:repair.busy||!repair.readiness?.config.staging_writes||!repair.readiness?.permissions?.gates?.safe_to_enable_staging_writes,text:label});
   rb.addEventListener('click',()=>{repair.confirm=pending?'reconcile-rollback':'rollback';paintRepair()});body.append(rb);
   if(['rollback','reconcile-rollback'].includes(repair.confirm)){
    const yes=h('button',{type:'button',class:'kr-btn kr-danger',text:tr('Sahkan rollback STAGING sahaja','Confirm STAGING rollback only')});
    yes.addEventListener('click',async()=>{repairBusy('Mengesahkan rollback…','Verifying rollback…');const {body:r}=await repairCall({action:pending?'repair_reconcile_rollback':'repair_rollback_staging',jobId:j.job_id,confirmation:'ROLLBACK_EXACT_STAGING_JOB'});repair.busy=false;repair.confirm='';if(!r.ok)repair.error=repairMsg(r.code);repair.workflow={...r,job_id:j.job_id};await repairSelectKeep(j.job_id)});body.append(yes);
   }
  }
  if(j.state==='staging_verified'){
   const preview=h('button',{type:'button',class:'kr-btn',disabled:repair.busy,text:tr('Sediakan preview production','Prepare production preview')});
   preview.addEventListener('click',async()=>{repairBusy('Mengesahkan candidate dan checkpoint…','Verifying candidate and checkpoint…');const {body:r}=await repairCall({action:'repair_production_preview',jobId:j.job_id});repair.busy=false;if(r.ok)repair.production=r;else repair.error=repairMsg(r.code);paintRepair()});body.append(preview);
  }
  if(repair.production?.job_id===j.job_id){
   const p=repair.production;body.append(h('pre',{class:'kr-diff',text:JSON.stringify(p.preview,null,2)}));
   const approve=h('button',{type:'button',class:'kr-btn kr-danger',text:tr('Semak kelulusan production','Review production approval')});
   approve.addEventListener('click',()=>{repair.confirm='production';paintRepair()});body.append(approve);
   if(repair.confirm==='production'){
    const exact=h('button',{type:'button',class:'kr-btn kr-danger',text:tr('Saya luluskan exact deployment production ini','I approve this exact production deployment')});
    exact.addEventListener('click',async()=>{repairBusy('Merekod kelulusan khusus…','Recording explicit approval…');const {body:r}=await repairCall({action:'repair_approve_production',jobId:j.job_id,seen:p.binding,confirmation:'APPROVE_EXACT_PRODUCTION_DEPLOYMENT'});repair.busy=false;repair.confirm='';repair.workflow={...r,job_id:j.job_id};if(!r.ok)repair.error=repairMsg(r.code);paintRepair()});
    body.append(h('p',{text:tr('Kelulusan sekali guna, 10 minit, terikat pada job, commit, artifact, keputusan CI dan checkpoint yang dipaparkan. Tiada kelulusan diwarisi daripada chat.','Single-use approval, 10 minutes, bound to the displayed job, commit, artifact, CI result and checkpoint. Chat messages do not grant approval.')}),exact);
   }
  }
  if(j.engine){
   const e=j.engine;body.append(h('p',{text:e.diagnosis||''}));
   const failure=[...(e.events||[])].find(ev=>(ev.to_state?.includes('failed')||ev.detail?.code)&&!repairEventResolved(j,ev));
   const recovered=(e.events||[]).some(ev=>repairEventResolved(j,ev));
   const status=tr(...(STATE_LABEL[j.state]||[j.state,j.state]));
   body.append(h('p',{class:'kr-banner',role:'status',text:status+' · #'+j.job_id}));
   if(recovered)body.append(h('p',{class:'kr-banner kr-info',role:'note',text:tr('Ralat workflow terdahulu telah dipulihkan. Artifact dan ujian telah disahkan; sejarah disimpan dalam butiran teknikal.','The earlier workflow error was recovered. Artifact and tests were verified; history remains in technical details.')}));
   if(failure){const d=failure.detail||{};body.append(h('div',{class:'kr-banner kr-blocked',role:'alert'},h('b',{text:d.code||d.cause||'PROVIDER_UNAVAILABLE'}),h('p',{text:tr('Punca: ','Root cause: ')+(d.cause||d.reason||d.code||'UNKNOWN')}),h('p',{text:(d.provider||j.proposer?.provider||'github')+' · '+failure.created_at})));}
   const technical=h('details',{class:'kr-technical'},h('summary',{text:tr('Butiran teknikal job','Job technical details')}),h('pre',{class:'kr-diff',text:JSON.stringify({job_id:j.job_id,state:j.state,events:e.events,attempts:e.attempts},null,2)}));body.append(technical);
   const copyReport=h('button',{type:'button',class:'kr-btn',text:tr('Salin laporan diagnostik','Copy diagnostic report')});copyReport.addEventListener('click',()=>ksCopy(JSON.stringify({job_id:j.job_id,state:j.state,provider:j.proposer,events:e.events,attempts:e.attempts,github:e.github},null,2),copyReport));body.append(copyReport);

   const cost=(e.attempts||[]).reduce((sum,a)=>sum+(Number(a.cost_estimate_usd)||0),0),tokens=(e.attempts||[]).reduce((sum,a)=>sum+(Number(a.usage?.prompt_tokens)||0)+(Number(a.usage?.completion_tokens)||0),0);
   body.append(h('p',{text:tr('Penggunaan repair: ','Repair usage: ')+tokens+' tokens · USD '+cost.toFixed(6)+' '+tr('(anggaran)','(estimate)')}));
   if(e.github?.pr_url){const a=h('a',{href:e.github.pr_url,target:'_blank',rel:'noopener noreferrer',text:'GitHub PR #'+e.github.pr_number});body.append(a)}
   for(const ev of (e.events||[]).slice(0,8))body.append(h('small',{text:ev.created_at+' · '+ev.to_state+' · '+(ev.detail?.run_id?'run '+ev.detail.run_id:'')}));
  }
  if(repair.result?.approvalId&&j.state==='owner_approved_staging'){
   const deploy=h('button',{type:'button',class:'kr-btn kr-primary',disabled:repair.busy||(!repair.readiness?.config.staging_executor||!repair.readiness?.config.staging_writes||!repair.readiness?.safety?.lock_ready||!repair.readiness?.permissions?.gates?.safe_to_enable_staging_writes),text:tr('Deploy patch yang diluluskan ke staging','Deploy approved patch to staging')});
   deploy.addEventListener('click',async()=>{repairBusy('Deploy staging dan health check…','Deploying staging and checking health…');const {body:r}=await repairCall({action:'repair_deploy_staging',approvalId:repair.result.approvalId});repair.busy=false;if(!r.ok)repair.error=repairMsg(r.code);repair.workflow={...r,job_id:j.job_id};await repairSelectKeep(j.job_id)});body.append(deploy);
  }
  if(repair.workflow?.job_id===j.job_id){const r=repair.workflow;body.append(h('pre',{class:'kr-diff',text:JSON.stringify(r,null,2)}));}
  const view=h('button',{type:'button',class:'kr-btn','data-kr':'view-diff','aria-expanded':String(repair.diffOpen),'aria-controls':'ksRepairDiff',text:repair.diffOpen?tr('Tutup Diff','Hide Diff'):tr('Lihat Diff','View Diff')});view.addEventListener('click',repairShowDiff);
  const approve=h('button',{type:'button',class:'kr-btn kr-primary','data-kr':'approve',disabled:!j.approvable||repair.busy||!!repair.confirm||!!repair.result,text:'Approve Staging'});approve.addEventListener('click',()=>{if(!repair.diffOpen){repair.diffOpen=true}repair.confirm='approve';paintRepair()});
  const reject=h('button',{type:'button',class:'kr-btn kr-danger','data-kr':'reject',disabled:repair.busy||!!repair.confirm||['cancelled','staging_deployed','staging_verified'].includes(j.state),text:'Reject'});reject.addEventListener('click',()=>{repair.confirm='reject';paintRepair()});
  body.append(h('div',{class:'kr-actions'},view,approve,reject));
 }
 const modal=h('div',{class:'kr-modal',role:'dialog','aria-modal':'true','aria-label':tr('Pembaikan AI','AI repairs')},head,body);
 panel.replaceChildren(modal);
 panel.onclick=e=>{if(e.target===panel)ksRepairClose()};
 body.scrollTop=repair.scroll||0;
 ksTranslate(panel);
}
function ksUsageWarning(node){
 const b=stateChat.budget;if(!b||!b.unlimited||(b.warning!=='warn'&&b.warning!=='alert'))return;
 const target=node.querySelector('.kc-budget');if(!target||node.querySelector('.kc-usage-warn'))return;
 const d=document.createElement('div');d.className='kc-error kc-usage-warn';d.setAttribute('role','status');d.style.cssText='background:'+(b.warning==='alert'?'#ffe7ea':'#fff7ed')+';color:'+(b.warning==='alert'?'#9f1239':'#7c2d12');
 d.textContent='Penggunaan AI '+(b.warning==='alert'?'amat tinggi':'tinggi')+' hari ini: '+b.used+' panggilan · anggaran $'+Number(b.cost_today_usd||0).toFixed(4);
 target.after(d);
}
function ksV3Decorate(node){
 ksV3Style();
 const title=node.querySelector('.kc-head-title h2');
 if(title&&!title.querySelector('.kc-env')){const b=document.createElement('span');b.className='kc-env';b.setAttribute('role','status');b.textContent=IS_STAGING?'STAGING':'PRODUCTION';title.append(b)}
 const actions=node.querySelector('.kc-actions');
 const nav=node.querySelector('.kc-mode-nav');
 if(nav&&!nav.querySelector('[data-kr-open]')){const b=document.createElement('button');b.type='button';b.className='kc-btn kc-mode-switch';b.setAttribute('data-kr-open','');b.textContent=tr('🛠 Buka Repair Engine →','🛠 Open Repair Engine →');b.addEventListener('click',ksRepairOpen);nav.append(b)}
 if(IS_STAGING){const qa=node.querySelector('.kc-advanced-content');if(qa&&!qa.querySelector('[data-qa-fallback]')){const b=document.createElement('button');b.type='button';b.className='kc-btn';b.dataset.qaFallback='';b.textContent=tr('Uji fallback (QA)','Test fallback (QA)');b.disabled=stateChat.busy;b.addEventListener('click',()=>{stateChat.input='Ujian live fallback staging. Jawab ringkas: OpenAI mengambil alih selepas permintaan DeepSeek gagal.';send('auto',true)});qa.append(b)}}
 if(stateChat.requestId){const p=document.createElement('small');p.className='kc-request-proof';p.textContent='Request '+stateChat.requestId+' · '+(stateChat.lastAttempts||[]).map(a=>a.provider+': '+a.status).join(' → ');node.querySelector('.kc-composer')?.append(p)}
 ksUsageWarning(node);ksProgress(node);ksTranslate(node);
}

async function ksV3Evidence(){
 if(stateChat.busy||!stateChat.target)return;const selected=stateChat.target;stateChat.busy=true;stateChat.phase='Membaca deployment, health dan akses logs…';stateChat.error='';paint();
 const [provider,project_id]=selected.split('|');const items=[];
 const endpoint=project_id.endsWith(':kerjasendiri-staging')?'ks-staging-health':project_id.endsWith(':kerjasendiri')?'ks-production-health':null;
 const reads=[{tool:'get_recent_deployments'}];if(provider==='cloudflare'&&endpoint)reads.push({tool:'run_health_check',args:{endpoint_id:endpoint}});reads.push({tool:'read_logs',args:{provider,project_id,window_minutes:15,limit:20}});
 try{for(const read of reads){const r=await call({action:'evidence',target:selected,...read});items.push({tool:read.tool,result:r.evidence});}stateChat.v3Evidence={target:selected,at:new Date().toISOString(),items};}catch(e){stateChat.error=String(e.message||e);}finally{stateChat.busy=false;stateChat.phase='';paint();}
}
})();



