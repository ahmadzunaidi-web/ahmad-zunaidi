/* Kerja Sendiri | SEO Intelligence – SEO Command Center (Abang Recond + Kakak Recond)
 * Owner-only. Uses the existing admin session (no second login). Central auto-publish is locked OFF in the database;
 * an article goes live only after the owner approves it and clicks publish.
 * Habit design: obvious next step banner · attractive status chips · one big button per step · progress bar + "Siap ✓" feedback.
 */
(function(){
'use strict';
const FN='ks-seo-intelligence';
const sites=[{key:'abangrecond',name:'Abang Recond',url:'https://abangrecond.com'},{key:'kakakrecond',name:'Kakak Recond',url:'https://kakakrecond.com'}];
const TABS=[['opportunities','Peluang SEO'],['autopilot','Automasi'],['technical','Teknikal'],['ringkasan','Ringkasan'],['keyword','Keyword'],['pesaing','Pesaing'],['planner','Artikel'],['gsc','Search Console'],['links','Pautan balik'],['laporan','Laporan']];
const STAGES=[['idea','Idea'],['draft','Draf'],['review','Semakan'],['approved','Lulus'],['scheduled','Dijadual'],['published','Terbit']];
const ERR={
 GSC_OAUTH_CLIENT_NOT_CONFIGURED:'OAuth client GSC belum dipasang di backend.',GSC_OAUTH_PUBLISHING_STATUS_UNVERIFIED:'Status consent Google mesti disahkan Production atau Internal dahulu.',GSC_OAUTH_CONNECT_REQUIRED:'Tekan Connect Google Search Console untuk memberi akses.',GSC_OAUTH_RECONNECT_REQUIRED:'Akses Google tamat atau ditarik balik. Sambungkan semula.',GSC_OAUTH_ACCESS_DENIED:'Akses Google tidak diluluskan.',GSC_OAUTH_STATE_INVALID:'Pautan sambungan tamat atau tidak sah. Cuba sambungkan semula.',
 LOGIN_REQUIRED:'Sila log masuk semula.',SESSION_EXPIRED:'Sesi tamat. Log masuk semula.',OWNER_ONLY:'Hanya pemilik boleh menggunakan modul ini.',RATE_LIMITED:'Terlalu laju. Tunggu sebentar dan cuba lagi.',
 SEO_MIGRATION_REQUIRED:'Jadual SEO belum dipasang pada pangkalan data. Menunggu kelulusan migrasi.',KEYWORD_ALREADY_TRACKED:'Keyword ini sudah ada untuk website ini.',KEYWORD_ALREADY_CLAIMED:'Keyword ini sudah dituntut oleh website lain.',
 KEYWORD_NOT_APPROVED:'Luluskan keyword dahulu.',KEYWORD_REQUIRED:'Pilih keyword yang telah diluluskan.',DUPLICATE_CONTENT:'Artikel/tajuk/keyword ini bertindih dengan kandungan sedia ada.',AI_NOT_CONFIGURED:'Kunci DeepSeek belum ditetapkan.',
 AI_UNREACHABLE:'DeepSeek tidak dapat dihubungi.',AI_UPSTREAM_ERROR:'DeepSeek memulangkan ralat.',DRAFT_REJECTED_BY_QUALITY_GATE:'Draf ditolak oleh semakan kualiti (fakta/panjang/dakwaan). Cuba jana semula.',DRAFT_IN_PROGRESS:'Draf sedang dijana.',
 DRAFT_DAILY_LIMIT:'Had draf AI harian dicapai.',RESEARCH_DAILY_LIMIT:'Had research harian dicapai.',COMPETITOR_DAILY_LIMIT:'Had analisis pesaing harian dicapai.',FACT_CHECK_REQUIRED:'Jalankan semakan fakta dahulu.',
 FACTS_CONFIRMATION_REQUIRED:'Tandakan pengesahan fakta.',FACT_ISSUES_NEED_ACKNOWLEDGEMENT:'Ada dakwaan tanpa sokongan. Tandakan bahawa anda telah menyemaknya.',COVER_REQUIRED:'Pilih gambar artikel yang sah.',COVER_UNREACHABLE:'Gambar tidak dapat dicapai.',
 INTERNAL_LINK_BROKEN:'Ada pautan dalaman yang rosak.',CONTENT_CHANGED:'Rekod telah berubah. Muat semula.',INVALID_TRANSITION:'Langkah ini tidak dibenarkan pada status semasa.',PUBLISHING_DISABLED:'Penerbitan manual belum diaktifkan untuk website ini.',
 PUBLISHER_NOT_CONFIGURED:'Penyesuai penerbit belum dipasang untuk website ini.',APPROVED_CONTENT_CHANGED:'Kandungan berubah selepas kelulusan. Luluskan semula.',CENTRAL_DAILY_LIMIT:'Had penerbitan pusat harian dicapai.',
 SITE_DAILY_POST_CAP:'Had artikel harian website dicapai (termasuk cron).',SLUG_TAKEN:'Slug sudah digunakan.',KEYWORD_NOT_CLAIMED:'Keyword tidak lagi dituntut oleh website ini.',SCHEDULE_OUT_OF_RANGE:'Masa jadual mesti sekurang-kurangnya 5 minit dari sekarang dan dalam 30 hari.',
 SCHEDULE_DAY_FULL:'Hari itu sudah penuh dijadualkan.',NOT_DUE:'Belum sampai masa.',HOST_NOT_ALLOWED:'Domain tidak dibenarkan (hanya domain awam).',GSC_NOT_CONFIGURED:'Akaun perkhidmatan Google belum ditetapkan.',GSC_PROPERTY_NOT_ACCESSIBLE:'Akaun Google belum mempunyai akses pada property ini.',
 GSC_PROPERTY_UNVERIFIED:'Property belum disahkan di Search Console.',GSC_SYNC_RUNNING:'Penyegerakan sedang berjalan.',LINK_NOT_FOUND:'Pautan ke website anda tidak ditemui pada halaman itu.',QUALIFY_BEFORE_OUTREACH:'Layakkan peluang dahulu.',VERIFY_LINK_FIRST:'Sahkan pautan sebenar dahulu.',
 NOT_FOUND:'Rekod tidak ditemui.',SITEMAP_NOT_FOUND:'Sitemap tidak ditemui.',REASON_REQUIRED:'Sebab diperlukan.',TITLE_REQUIRED:'Tajuk terlalu pendek.',VOLUME_REQUIRES_SOURCE:'Volum memerlukan sumber.'
};
const model={key:'abangrecond',tab:'ringkasan',data:{},busy:{},error:'',toast:'',openId:null,detail:null,loading:false,caps:null,form:{}};
const x=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v==null?'—':Number(v).toLocaleString('en-MY');
const fmt=v=>v?new Date(v).toLocaleString('ms-MY',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kuala_Lumpur'}):'—';
const day=v=>v?new Date(v).toLocaleDateString('ms-MY',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Kuala_Lumpur'}):'—';
const cur=()=>sites.find(s=>s.key===model.key)||sites[0];
const D=()=>(model.data[model.key]=model.data[model.key]||{});
const errText=e=>{const c=e&&e.message;return ERR[c]||(c&&/^[A-Z0-9_]{4,}$/.test(c)?'Ralat: '+c:(c||'Ralat tidak diketahui'));};

function css(){
 if(document.getElementById('ks-seo-css'))return;
 const st=document.createElement('style');st.id='ks-seo-css';
 st.textContent=[
 '.ksseo{max-width:1240px;margin:auto;color:#172337;min-width:0;overflow-wrap:anywhere;padding-bottom:90px}.ksseo *{box-sizing:border-box}',
 '.ksseo-head{background:#111e32;border-radius:20px;color:#fff;padding:20px;margin-bottom:12px}.ksseo-head h1{color:#fff;font-size:clamp(22px,5vw,30px);margin:4px 0}.ksseo-head p{color:#cad5e5;font-size:13px;margin:4px 0}',
 '.ksseo-switch,.ksseo-tabs{display:flex;gap:8px;margin:10px 0}.ksseo-tabs{overflow-x:auto;padding-bottom:4px;scrollbar-width:thin}',
 '.ksseo-switch button{flex:1;border:1px solid #c8d0dc;background:#fff;color:#1b2c48;border-radius:12px;min-height:48px;font-weight:600}.ksseo-switch .active{background:#111e32;color:#fff;border-color:#111e32}',
 '.ksseo-tabs button{flex:0 0 auto;border:1px solid #d5dce6;background:#f4f7fb;color:#27415f;border-radius:999px;min-height:44px;padding:0 16px;font-size:13px}.ksseo-tabs .active{background:#1c58d9;color:#fff;border-color:#1c58d9}',
 '.ksseo-next{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:#eaf6ee;border:1px solid #b7dfc3;border-radius:16px;padding:14px;margin:10px 0}.ksseo-next b{display:block;font-size:12px;color:#1d6b3a;letter-spacing:.04em}.ksseo-next span{font-size:15px;color:#12351f}',
 '.ksseo-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:10px 0}.ksseo-metric,.ksseo-box{border:1px solid #e4e8ef;border-radius:16px;background:#fff;padding:14px;min-width:0}',
 '.ksseo-metric small{display:block;color:#5f6e83;font-size:12px}.ksseo-metric strong{font-size:clamp(20px,4vw,28px);display:block;margin:4px 0}',
 '.ksseo-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0}.ksseo-box h2{font-size:16px;margin:0 0 10px}.ksseo-box h3{font-size:14px;margin:14px 0 6px}.ksseo-box p{font-size:13px;line-height:1.55;margin:6px 0}',
 '.ksseo-muted{color:#65758a;font-size:12px}.ksseo-note{background:#eef4fa;border-radius:11px;padding:11px;color:#38526e;font-size:12px;margin:8px 0}.ksseo-alert{background:#fff2eb;border:1px solid #f3bf9d;padding:12px;border-radius:12px;color:#833709;font-size:13px;margin:10px 0}',
 '.ksseo-toast{position:sticky;top:8px;z-index:5;background:#12351f;color:#fff;border-radius:12px;padding:12px 14px;font-size:14px;margin:8px 0;box-shadow:0 6px 18px rgba(0,0,0,.18)}',
 '.ksseo-chip{display:inline-block;border-radius:12px;background:#eef2f7;padding:5px 10px;margin:2px;font-size:12px}.ksseo-chip.ok{background:#dff3e5;color:#14532d}.ksseo-chip.warn{background:#fff0d6;color:#7a4b00}.ksseo-chip.bad{background:#fde3e1;color:#8b1c13}.ksseo-chip.info{background:#e1ecfd;color:#173e86}',
 '.ksseo-row{display:flex;gap:8px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;border-top:1px solid #edf0f5;padding:10px 0}.ksseo-row:first-of-type{border-top:0}.ksseo-row>div{min-width:0;flex:1 1 220px}.ksseo-row b{font-size:14px}',
 '.ksseo-form{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.ksseo-form input,.ksseo-form select,.ksseo-form textarea{min-width:160px;flex:1;min-height:46px;font-size:16px;padding:8px 10px;border:1px solid #c8d0dc;border-radius:10px;background:#fff}.ksseo-form textarea{min-height:84px}',
 '.ksseo button.p,.ksseo-form button,.ksseo button.s,.ksseo button.d{min-height:46px;border-radius:12px;padding:0 16px;font-size:14px;font-weight:600;border:1px solid #1c58d9;background:#1c58d9;color:#fff}.ksseo button.s{background:#fff;color:#1c58d9}.ksseo button.d{background:#fff;color:#a32117;border-color:#e1a7a1}.ksseo button:disabled{opacity:.55}',
 '.ksseo-steps{display:flex;gap:4px;margin:8px 0}.ksseo-steps i{flex:1;height:8px;border-radius:6px;background:#e4e8ef}.ksseo-steps i.on{background:#2f9e5b}.ksseo-steps i.now{background:#1c58d9}',
 '.ksseo-covers{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.ksseo-covers button{padding:0;border:2px solid transparent;border-radius:10px;overflow:hidden;background:#000;min-height:0}.ksseo-covers button.sel{border-color:#2f9e5b}.ksseo-covers img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}',
 '.ksseo-table{width:100%;border-collapse:collapse;font-size:12px}.ksseo-table td,.ksseo-table th{padding:6px 4px;border-top:1px solid #edf0f5;text-align:left}.ksseo-table td:nth-child(n+2),.ksseo-table th:nth-child(n+2){text-align:right}',
 '.ksseo-link{display:block;border:1px solid #eaf0f5;border-radius:10px;padding:10px;color:#24486d;text-decoration:none;font-size:13px;margin:6px 0}.ksseo-link small{display:block;color:#677d93}',
 '.ksseo-nav{width:100%;display:flex!important;gap:9px;align-items:center;justify-content:flex-start!important;padding:12px!important;background:#e9f1f9!important;color:#1c3958!important;border:1px solid #cbdde9!important;border-radius:12px!important;margin:6px 0 12px!important;font-weight:bold!important}.ksseo-nav.active{background:#13243f!important;color:#fff!important}',
 '.ksseo-picker{display:block;width:100%;min-height:62px;background:#e7f1fd;border:1px solid #c5daf2;border-radius:14px;padding:15px;text-align:left;margin:12px 0;font-size:14px}',
 '@media(max-width:720px){.ksseo-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ksseo-two{grid-template-columns:1fr}.ksseo-form input,.ksseo-form select{min-width:100%}.ksseo-form button{width:100%}}'
 ].join('');
 document.head.appendChild(st);
}
function injectNav(){
 if(!state.session)return;css();
 ['sideNav','moreBody'].forEach(id=>{const el=document.getElementById(id);if(!el||el.querySelector('[data-seo-open]'))return;
  const b=document.createElement('button');b.type='button';b.className='ksseo-nav'+(state.page==='seo-intelligence'?' active':'');b.setAttribute('data-seo-open','1');b.textContent='⌕  SEO Command Center';el.prepend(b);});
 if(!state.business&&state.page==='workspaces'){const picker=document.querySelector('#view .picker');
  if(picker&&!picker.querySelector('[data-seo-open]')){const b=document.createElement('button');b.type='button';b.className='ksseo-picker';b.setAttribute('data-seo-open','1');b.textContent='SEO Command Center · Abang Recond + Kakak Recond';picker.prepend(b);}}
}

// ---------------------------------------------------------------- API
async function get(action,params){return api(FN,action,Object.assign({site_key:model.key},params||{}));}
async function post(action,body,heavy){
 const key=model.key,token=await access(),path='/functions/v1/'+FN+'?action='+encodeURIComponent(action)+'&site_key='+encodeURIComponent(key);
 if(!heavy)return raw(path,{method:'POST',body:JSON.stringify(body||{})},token);
 // AI drafting / research / sync can take > 25 s: use a longer timeout than the shared helper.
 const r=await fetch(BASE+path,{method:'POST',body:JSON.stringify(body||{}),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(150000),headers:{apikey:KEY,'Content-Type':'application/json',Authorization:'Bearer '+token}});
 const d=await r.json().catch(()=>({}));if(!r.ok){const e=Error(d.error||'Permintaan gagal ('+r.status+').');e.status=r.status;e.detail=d.detail;throw e;}return d;
}
const HEAVY=new Set(['v2_run','research_keywords','analyze_competitor','gsc_sync','generate_draft','fact_check','verify_link','publish_content','run_due','set_gsc_property']);
async function act(name,action,body,after,okText){
 if(model.busy[name])return;model.busy[name]=true;model.error='';paint();const key=model.key,origin=cur().name,tag=()=>model.key!==key?origin+': ':'';
 try{const out=await post(action,body,HEAVY.has(action));if(okText){model.toast='Siap ✓ '+tag()+okText;setTimeout(()=>{if(model.toast){model.toast='';paint();}},6000);}if(after)await after(out);return out;}
 catch(e){model.error=tag()+errText(e)+(e.detail&&e.detail.issues?' ('+e.detail.issues.slice(0,4).join(', ')+')':'');}
 finally{delete model.busy[name];paint();}
}
async function loadTab(force){
 const key=model.key,gen=state.generation,d=D(),t=model.tab;
 const want={opportunities:['v2_overview'],autopilot:['v2_overview','competitors'],technical:['v2_overview'],ringkasan:['overview'],keyword:['keywords'],pesaing:['competitors','competitor_report'],planner:['content','keywords','capabilities'],gsc:['gsc_status','gsc_report'],links:['links'],laporan:['performance']}[t]||[];
 model.loading=true;model.error='';paint();
 const res=await Promise.allSettled(want.filter(a=>force||d[a]===undefined).map(a=>(a==='gsc_status'||a==='capabilities'?api(FN,a,{}):get(a)).then(v=>[a,v])));
 if(key!==model.key||gen!==state.generation)return;
 for(const r of res){if(r.status==='fulfilled')d[r.value[0]]=r.value[1];else model.error=errText(r.reason);}
 if(t==='planner'&&d.capabilities)model.caps=d.capabilities;
 model.loading=false;if(model.tab===t)paint();
}
async function openContent(id){model.openId=id;model.detail=null;paint();
 try{model.detail=await get('content_detail',{content_id:id});}catch(e){model.error=errText(e);}paint();}
async function refreshContent(){const d=D();d.content=undefined;d.overview=undefined;d.performance=undefined;await loadTab(true);if(model.openId)await openContent(model.openId);}

// ---------------------------------------------------------------- views
const chip=(t,k)=>'<span class="ksseo-chip '+(k||'')+'">'+x(t)+'</span>';
const KW={candidate:['Calon',''],approved:['Diluluskan','ok'],targeted:['Disasarkan','info'],excluded:['Dikecualikan','bad']};
const CT={idea:['Idea',''],researching:['Menjana…','warn'],draft:['Draf','warn'],review:['Semakan','info'],approved:['Diluluskan','ok'],scheduled:['Dijadualkan','info'],publishing:['Menerbit…','warn'],published:['Terbit','ok'],failed:['Gagal','bad'],cancelled:['Dibatalkan','bad']};
const btn=(label,attrs,cls)=>'<button type="button" class="'+(cls||'p')+'" '+attrs+(model.busy[attrs.match(/data-n="([^"]+)"/)?.[1]]?' disabled':'')+'>'+label+'</button>';
function metric(l,v,s){return '<div class="ksseo-metric"><small>'+x(l)+'</small><strong>'+x(v)+'</strong><small>'+x(s||'')+'</small></div>';}

function nextStep(){
 const d=D(),kws=d.keywords&&d.keywords.rows,ct=d.content&&d.content.rows,o=d.overview;
 const go=(t,l)=>({text:l,tab:t});
 if(kws&&!kws.length)return go('keyword','Mulakan: tambah atau cari keyword pertama untuk '+cur().name+'.');
 if(kws&&kws.length&&!kws.some(k=>['approved','targeted'].includes(k.status)))return go('keyword','Luluskan satu keyword untuk dijadikan sasaran artikel.');
 if(ct){
  const by=s=>ct.filter(c=>c.status===s).length;
  if(by('review'))return go('planner','Ada '+by('review')+' artikel menunggu kelulusan anda.');
  if(by('approved'))return go('planner',by('approved')+' artikel sudah lulus: jadualkan atau terbitkan.');
  if(by('draft'))return go('planner',by('draft')+' draf perlu semakan fakta dan gambar.');
  if(by('idea'))return go('planner','Jana draf untuk idea artikel anda.');
  if(!ct.length&&kws&&kws.length)return go('planner','Buat idea artikel daripada keyword yang diluluskan.');
 }
 if(o&&!o.gsc.connected)return go('gsc','Sambungkan Search Console untuk melihat klik dan kedudukan sebenar.');
 return go('laporan','Semua kemas. Semak laporan prestasi.');
}
function vRingkasan(){
 const d=D(),o=d.overview;if(!o)return model.loading?'<p class="ksseo-muted">Membaca data live…</p>':'';
 const p=o.posts,g=o.gsc,pub=o.publishing,pl=o.pipeline||{};
 const pipe=STAGES.map(([k,l])=>'<div class="ksseo-metric"><small>'+l+'</small><strong>'+num(pl[k]||0)+'</strong></div>').join('');
 const posts=p.recent_published.length?p.recent_published.slice(0,8).map(r=>{const link=cur().url+'/blog/'+encodeURIComponent(r.slug||'');return '<a class="ksseo-link" href="'+x(link)+'" target="_blank" rel="noopener noreferrer"><b>'+x(r.title)+'</b><small>'+day(r.published_at)+'</small></a>';}).join(''):'<p class="ksseo-muted">Belum ada artikel.</p>';
 const topics=o.topics.length?o.topics.slice(0,10).map(t=>chip((t.keyword||t.title)+' · '+t.status)).join(''):'<p class="ksseo-muted">Tiada topik cron.</p>';
 return '<div class="ksseo-grid">'+[metric('Published',num(p.published),'Jadual blog live'),metric('Draft',num(p.draft),'Jadual blog live'),metric('Artikel 7 hari',num(p.published_last_7_days),p.last_seven_day_count_complete?'Tarikh terbit':'Sekurang-kurangnya'),
  metric('Klik GSC',g.connected?num(g.clicks):'—',g.connected?'28 hari':'Belum disambung'),metric('Impresi GSC',g.connected?num(g.impressions):'—',g.connected&&g.position?'Posisi '+g.position:''),metric('Terbit pusat hari ini',num(pub.central_published_today),'Had '+pub.central_daily_limit+'/hari')].join('')+'</div>'+
  '<section class="ksseo-box"><h2>Saluran artikel pusat</h2><div class="ksseo-grid">'+pipe+'</div></section>'+
  '<div class="ksseo-two"><section class="ksseo-box"><h2>Artikel terbaru</h2>'+posts+'</section><section class="ksseo-box"><h2>Status penerbitan</h2>'+
  '<p>'+chip('Auto-publish pusat: OFF (dikunci)','ok')+chip(pub.manual_publish_ready?'Terbit manual: SEDIA':'Terbit manual: BELUM AKTIF',pub.manual_publish_ready?'info':'warn')+chip('Cron lama: aktif','ok')+'</p>'+
  '<p class="ksseo-muted">'+x(pub.legacy_cron.note)+'</p><h3>Topik dalam giliran cron</h3>'+topics+'</section></div>';
}
function vKeyword(){
 const d=D(),rows=d.keywords&&d.keywords.rows||[];
 const list=rows.length?rows.map(k=>{const s=KW[k.status]||[k.status,''];const vol=k.verified_volume!=null?num(k.verified_volume)+' · '+x(k.volume_source||'')+' · '+day(k.verified_at):'Volum tidak diketahui';
  const ev=(k.evidence&&k.evidence.sources||[]).join(', ');
  return '<div class="ksseo-row"><div><b>'+x(k.keyword)+'</b><br>'+chip(s[0],s[1])+chip(k.intent||'—')+chip(k.source||'owner')+'<br><span class="ksseo-muted">'+vol+(ev?' · sumber: '+x(ev):'')+'</span>'+
   '<details><summary class="ksseo-muted">Masukkan volum bersumber</summary><form class="ksseo-form" data-form="set_keyword_volume" data-id="'+x(k.id)+'"><input name="volume" type="number" min="0" required placeholder="Volum bulanan" aria-label="Volum"><input name="source" required minlength="3" placeholder="Sumber (cth. Semrush, 26 Okt)" aria-label="Sumber"><button type="submit">Simpan</button></form></details></div><div>'+
   (k.status==='candidate'?btn('Luluskan','data-a="kwstatus" data-id="'+x(k.id)+'" data-v="approved" data-n="kw'+x(k.id)+'"'):'')+
   (k.status!=='excluded'&&k.status!=='targeted'?btn('Kecualikan','data-a="kwstatus" data-id="'+x(k.id)+'" data-v="excluded" data-n="kx'+x(k.id)+'"','s'):'')+
   (['approved','targeted'].includes(k.status)?btn('Buat artikel','data-a="idea-from" data-id="'+x(k.id)+'"','s'):'')+'</div></div>';}).join(''):'<p class="ksseo-muted">Belum ada keyword. Tambah sendiri atau tekan Cari keyword.</p>';
 return '<section class="ksseo-box"><h2>Cari keyword (GSC + Google Suggest + AI)</h2><p class="ksseo-muted">Setiap keyword dilabel sumbernya. Volum carian tidak direka; hanya dimasukkan dengan sumber dan tarikh.</p>'+
  btn(model.busy.research?'Sedang mencari… (boleh ambil 1 minit)':'🔎 Cari keyword baharu','data-a="research" data-n="research"')+'</section>'+
  '<section class="ksseo-box"><h2>Tambah keyword</h2><form class="ksseo-form" data-form="add_keyword"><input name="keyword" required minlength="2" maxlength="250" placeholder="Keyword pembeli kereta" aria-label="Keyword"><select name="intent" aria-label="Intent"><option value="informational">Informational</option><option value="commercial">Commercial</option><option value="transactional">Transactional</option><option value="local">Local</option></select><button type="submit">Tambah</button></form></section>'+
  '<section class="ksseo-box"><h2>Keyword '+x(cur().name)+' ('+rows.length+')</h2>'+list+'<p class="ksseo-note">Satu keyword yang diluluskan hanya boleh dimiliki satu website, supaya Abang dan Kakak tidak bersaing sesama sendiri.</p></section>';
}
function vPesaing(){
 const d=D(),rows=d.competitors&&d.competitors.rows||[],gap=d.competitor_report;
 const list=rows.length?rows.map(c=>{const s=c.latest_snapshot;
  return '<div class="ksseo-row"><div><b>'+x(c.hostname)+'</b><br>'+(s?chip(s.status==='failed'?'Gagal: '+(s.error_code||''):num(s.url_count)+' URL','' +(s.status==='failed'?'bad':'ok'))+chip(num(s.recent_30d_count)+' baharu 30 hari')+'<br><span class="ksseo-muted">Disemak '+fmt(s.fetched_at)+'</span>':'<span class="ksseo-muted">Belum dianalisis</span>')+'</div><div>'+btn(model.busy['an'+c.id]?'Menganalisis…':'Analisis sitemap','data-a="analyze" data-id="'+x(c.id)+'" data-n="an'+x(c.id)+'"','s')+'</div></div>';}).join(''):'<p class="ksseo-muted">Belum ada pesaing.</p>';
 const gaps=gap&&gap.gaps&&gap.gaps.length?gap.gaps.slice(0,15).map(g=>'<div class="ksseo-row"><div><b>'+x(g.phrase)+'</b><br><span class="ksseo-muted">'+x(g.competitors.join(', '))+' · '+g.competitor_hits+' sebutan</span></div><div>'+btn('Jadikan idea','data-a="gap-idea" data-p="'+x(g.phrase)+'"','s')+'</div></div>').join(''):'<p class="ksseo-muted">Belum ada jurang. Analisis sekurang-kurangnya satu pesaing.</p>';
 return '<section class="ksseo-box"><h2>Tambah pesaing</h2><form class="ksseo-form" data-form="add_competitor"><input name="hostname" required placeholder="cth. carlist.my" aria-label="Domain pesaing"><button type="submit">Tambah</button></form>'+
  '<p class="ksseo-note">Analisis hanya membaca halaman awam (robots.txt, sitemap, tajuk). Skor authority, backlink dan trafik tidak tersedia tanpa penyedia data berlesen, jadi tidak dianggar.</p></section>'+
  '<section class="ksseo-box"><h2>Pesaing ('+rows.length+')</h2>'+list+'</section>'+
  '<section class="ksseo-box"><h2>Jurang kandungan</h2><p class="ksseo-muted">'+x(gap&&gap.basis||'Frasa pesaing yang belum ada pada website anda.')+'</p>'+gaps+'</section>';
}
function stepper(status){const idx=STAGES.findIndex(s=>s[0]===status);return '<div class="ksseo-steps" aria-label="Kemajuan">'+STAGES.map((s,i)=>'<i class="'+(i<idx?'on':i===idx?'now':'')+'" title="'+s[1]+'"></i>').join('')+'</div>';}
function vPlanner(){
 const d=D(),rows=d.content&&d.content.rows||[],kws=(d.keywords&&d.keywords.rows||[]).filter(k=>['approved','targeted'].includes(k.status));
 const used=new Set(rows.filter(c=>!['cancelled','failed'].includes(c.status)).map(c=>c.keyword_id));
 const avail=kws.filter(k=>!used.has(k.id));
 const f=model.form;
 const add='<section class="ksseo-box"><h2>Idea artikel baharu</h2>'+(avail.length?'<form class="ksseo-form" data-form="add_idea"><select name="keyword_id" required aria-label="Keyword">'+avail.map(k=>'<option value="'+x(k.id)+'"'+(f.keyword_id===k.id?' selected':'')+'>'+x(k.keyword)+'</option>').join('')+'</select>'+
  '<input name="title" required minlength="10" maxlength="240" placeholder="Tajuk artikel (soalan pembeli)" value="'+x(f.title||'')+'" aria-label="Tajuk"><input name="angle" maxlength="300" placeholder="Sudut khusus (pilihan)" aria-label="Sudut">'+
  '<textarea name="facts" maxlength="3000" placeholder="Fakta disahkan, satu setiap baris (pilihan). AI hanya dibenarkan menggunakan fakta ini." aria-label="Fakta"></textarea><button type="submit">Simpan idea</button></form>':'<p class="ksseo-muted">Tiada keyword diluluskan yang masih bebas. Luluskan keyword di tab Keyword.</p>')+'</section>';
 const caps=model.caps?'<p class="ksseo-muted">AI: '+(model.caps.ai_configured?'sedia':'kunci DeepSeek belum ditetapkan')+' · Terbit manual runtime: '+(model.caps.publish_runtime_switch?'ON':'OFF')+' · Auto-publish: OFF</p>':'';
 const list=rows.length?rows.map(c=>{const s=CT[c.status]||[c.status,''];
  return '<div class="ksseo-row"><div><b>'+x(c.title)+'</b><br>'+chip(s[0],s[1])+(c.scheduled_at?chip('Jadual '+fmt(c.scheduled_at)):'')+(c.last_error?chip(c.last_error,'bad'):'')+stepper(c.status)+'</div><div>'+btn(model.openId===c.id?'Tutup':'Buka','data-a="open" data-id="'+x(c.id)+'"','s')+'</div></div>'+(model.openId===c.id?'<div class="ksseo-box" style="margin:6px 0 12px">'+vDetail(c)+'</div>':'');}).join(''):'<p class="ksseo-muted">Belum ada artikel dalam saluran.</p>';
 return add+'<section class="ksseo-box"><h2>Saluran artikel '+x(cur().name)+' ('+rows.length+')</h2>'+caps+list+'</section>';
}
function vDetail(c){
 const dt=model.detail;if(!dt||dt.row.id!==c.id)return '<p class="ksseo-muted">Membaca…</p>';
 const r=dt.row,p=r.editorial_payload||{},dr=p.draft,fc=p.fact_check,id=x(r.id),st=r.status;
 let h='';
 if(r.rejected_reason)h+='<div class="ksseo-alert">Dipulangkan: '+x(r.rejected_reason)+'</div>';
 if(dt.conflicts&&dt.conflicts.length)h+='<div class="ksseo-alert"><b>Bertindih/serupa:</b> '+dt.conflicts.slice(0,4).map(c2=>x(c2.code)+' → '+x(c2.with.title)).join('; ')+'</div>';
 if(dr){
  h+='<h3>Draf</h3><p><b>'+x(dr.title)+'</b></p><p class="ksseo-muted">SEO title: '+x(dr.seo_title)+'<br>Meta: '+x(dr.meta_description)+'<br>Excerpt: '+x(dr.excerpt)+'</p><p class="ksseo-muted">'+num(p.brief&&p.brief.words)+' patah perkataan · '+dr.sections.length+' bahagian · slug: '+x(r.slug)+'</p>'+
   '<details><summary class="ksseo-muted">Baca draf penuh</summary><p>'+x(dr.intro)+'</p>'+dr.sections.map(s=>'<h3>'+x(s.heading)+'</h3>'+s.paragraphs.map(t=>'<p>'+x(t)+'</p>').join('')+(s.bullets&&s.bullets.length?'<ul>'+s.bullets.map(b=>'<li>'+x(b)+'</li>').join('')+'</ul>':'')).join('')+'<p>'+x(dr.closing)+'</p></details>';
  if(st==='draft')h+='<details><summary class="ksseo-muted">Edit tajuk/ringkasan/meta</summary><form class="ksseo-form" data-form="save_draft" data-id="'+id+'"><input name="title" value="'+x(dr.title)+'" aria-label="Tajuk"><input name="seo_title" value="'+x(dr.seo_title)+'" aria-label="SEO title"><textarea name="excerpt" aria-label="Excerpt">'+x(dr.excerpt)+'</textarea><textarea name="meta_description" aria-label="Meta description">'+x(dr.meta_description)+'</textarea><button type="submit">Simpan suntingan</button></form></details>';
 }
 const links=(p.internal_links||[]);
 h+='<h3>Pautan dalaman (website ini sahaja)</h3>'+(links.length?links.map(l=>'<p class="ksseo-muted">'+x(l.title)+' → '+x(l.url)+(dt.internal_links&&dt.internal_links.broken.some(b=>b.slug===l.slug)?' '+chip('rosak','bad'):'')+'</p>').join(''):'<p class="ksseo-muted">Tiada padanan topik.</p>');
 if(fc)h+='<h3>Semakan fakta</h3><p>'+chip(fc.status==='clean'?'Bersih':fc.status==='rules_only'?'Peraturan sahaja (AI tidak tersedia)':'Ada isu',fc.status==='clean'?'ok':'warn')+'</p>'+(fc.issues||[]).slice(0,10).map(i=>'<p class="ksseo-muted">• '+x(i.kind==='rule'?i.code:(i.claim+' — '+i.reason))+'</p>').join('');
 if(p.cover&&p.cover.url)h+='<h3>Gambar</h3><div class="ksseo-covers"><button type="button" class="sel" aria-label="Gambar dipilih"><img src="'+x(p.cover.url)+'" alt="Gambar artikel" loading="lazy"></button></div>';
 // actions per state
 h+='<h3>Langkah seterusnya</h3>';
 if(st==='idea')h+=btn(model.busy['gen'+r.id]?'Sedang menjana… (1–2 minit)':'✍️ Jana draf (AI)','data-a="gen" data-id="'+id+'" data-n="gen'+id+'"');
 if(st==='draft'){
  if(!p.cover)h+=btn('🖼️ Pilih gambar','data-a="covers" data-id="'+id+'"','s');
  h+=(dt.covers?'<div class="ksseo-covers">'+dt.covers.map(cv=>'<button type="button" data-a="setcover" data-id="'+id+'" data-url="'+x(cv.url)+'" data-s="'+x(cv.stock_no)+'"><img src="'+x(cv.url)+'" alt="'+x(cv.stock_no)+'" loading="lazy"></button>').join('')+'</div><p class="ksseo-muted">Foto stok sebenar sahaja. Sudah digunakan: '+dt.covers.map(cv=>cv.used_by_posts).join(',')+'</p>':'');
  h+='<div class="ksseo-actions">'+btn(model.busy['fc'+r.id]?'Menyemak…':'🔍 Semak fakta','data-a="fc" data-id="'+id+'" data-n="fc'+id+'"',fc?'s':'p')+' '+btn('Hantar untuk semakan','data-a="submit" data-id="'+id+'" data-n="sub'+id+'"',(fc&&p.cover)?'p':'s')+' '+btn('Jana semula','data-a="gen" data-id="'+id+'" data-n="gen'+id+'"','s')+'</div>'+
   '<p class="ksseo-muted">Perlu: semakan fakta terkini + gambar sebelum dihantar.</p>';
 }
 if(st==='review'){
  h+='<label class="ksseo-muted" style="display:block;margin:8px 0"><input type="checkbox" data-chk="facts"> Saya sahkan fakta dalam artikel ini benar dan boleh diterbitkan.</label>';
  if(fc&&fc.status==='issues')h+='<label class="ksseo-muted" style="display:block;margin:8px 0"><input type="checkbox" data-chk="ack"> Saya telah menyemak dakwaan tanpa sokongan di atas.</label>';
  h+=btn('✅ Luluskan','data-a="approve" data-id="'+id+'" data-n="ap'+id+'"')+' '+'<form class="ksseo-form" data-form="reject_content" data-id="'+id+'"><input name="reason" required minlength="3" placeholder="Sebab pulangkan ke draf" aria-label="Sebab"><button type="submit" class="s">Pulangkan</button></form>';
 }
 if(st==='approved'){
  h+='<form class="ksseo-form" data-form="schedule_content" data-id="'+id+'"><input type="datetime-local" name="when" required aria-label="Masa terbit (waktu Malaysia)"><button type="submit">📅 Jadualkan</button></form>'+
   '<div class="ksseo-actions">'+btn('Pratonton terbit (dry-run)','data-a="dry" data-id="'+id+'" data-n="dry'+id+'"','s')+' '+(model.confirmPublish===r.id?btn('⚠️ Sahkan: terbit sekarang','data-a="publish" data-id="'+id+'" data-n="pub'+id+'"'):btn('🚀 Terbit sekarang','data-a="askpub" data-id="'+id+'"','s'))+' '+btn('Pulangkan ke draf','data-a="reopen" data-id="'+id+'"','s')+'</div>';
 }
 if(st==='scheduled')h+='<p>'+chip('Dijadual '+fmt(r.scheduled_at),'info')+'</p>'+btn('Batalkan jadual','data-a="unsched" data-id="'+id+'"','s')+' '+btn(model.busy.due?'Memeriksa…':'Jalankan yang sudah sampai masa','data-a="due" data-n="due"','s');
 if(st==='published'&&r.published_url)h+='<a class="ksseo-link" href="'+x(r.published_url)+'" target="_blank" rel="noopener noreferrer"><b>Lihat artikel live</b><small>'+x(r.published_url)+'</small></a>';
 if(dt.preview)h+='<div class="ksseo-note"><b>Pratonton (tiada apa ditulis):</b> '+x(dt.preview.would_publish.table)+' → '+x(dt.preview.would_publish.url)+'<br>Semakan: '+x(Object.entries(dt.preview.checks).map(([k,v])=>k+'='+(typeof v==='object'?JSON.stringify(v):v)).join(', '))+'</div>';
 if(dt.publish_runs&&dt.publish_runs.length)h+='<p class="ksseo-muted">Cubaan terbit: '+dt.publish_runs.map(u=>x(u.status)+' (cubaan '+u.attempt+')').join(', ')+'</p>';
 if(!['published','publishing','cancelled'].includes(st))h+='<p>'+btn('Batalkan artikel','data-a="cancel" data-id="'+id+'"','d')+'</p>';
 return h;
}
function sparkline(series){
 const w=300,h=60,vals=series.map(s=>s.clicks==null?null:s.clicks),max=Math.max(1,...vals.filter(v=>v!=null));
 const bars=series.map((s,i)=>{const bw=w/series.length;const v=vals[i];const bh=v==null?3:Math.max(2,(v/max)*(h-6));
  return '<rect x="'+(i*bw+1).toFixed(1)+'" y="'+(h-bh).toFixed(1)+'" width="'+(bw-2).toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="2" fill="'+(s.state==='missing'?'#c9d1dc':s.state==='zero'?'#9fb8e8':'#1c58d9')+'"><title>'+x(s.date+': '+(v==null?'tiada data':v+' klik'))+'</title></rect>';}).join('');
 return '<svg viewBox="0 0 '+w+' '+h+'" width="100%" height="64" role="img" aria-label="Klik harian 28 hari">'+bars+'</svg><p class="ksseo-muted">Biru = ada data · biru muda = 0 selepas penyegerakan · kelabu = tiada data</p>';
}
function vGsc(){
 const d=D(),st=d.gsc_status,rep=d.gsc_report;
 let h='';
 if(!st)return model.loading?'<p class="ksseo-muted">Membaca status…</p>':'';
 const oauth=st.oauth||{},isOauth=st.authentication_method==='oauth2';
 if(isOauth){
  h+='<section class="ksseo-box"><h2>Connect Google Search Console</h2><p class="ksseo-muted">Beri akses baca sahaja kepada akaun Google yang mempunyai akses property Abang Recond. Token disimpan di backend.</p>';
  if(!oauth.client_configured)h+='<p class="ksseo-alert">OAuth client GSC berasingan belum dikonfigurasi. Persediaan Google Cloud masih diperlukan.</p>';
  else if(!oauth.production_ready)h+='<p class="ksseo-alert">Status consent belum disahkan Production atau Internal. Sambungan production belum boleh diteruskan.</p>';
  else if(model.key==='abangrecond')h+=btn(model.busy.connect?'Membuka Google…':oauth.connected?'Sambung semula Google':'Connect Google Search Console','data-a="oauth-connect" data-n="connect"');
  else h+='<p class="ksseo-muted">Sambungan owner dimulakan melalui tab Abang Recond.</p>';
  h+='<p class="ksseo-muted">'+chip(oauth.connected?'OAuth disambungkan':'Belum disambungkan',oauth.connected?'ok':'warn')+chip('Consent: '+(oauth.publishing_status||'belum disahkan'))+'</p></section>';
 }
 if(!st.configured){if(!isOauth)h+='<section class="ksseo-box"><h2>Search Console belum disambungkan</h2><p class="ksseo-muted">Persediaan OAuth backend diperlukan.</p></section>';}
 else{
  const s=(st.sites||[]).find(z=>z.site_key===model.key)||{};
  h+='<section class="ksseo-box"><h2>Sambungan '+x(cur().name)+'</h2><p>'+chip(st.auth_ok?'Akaun Google sah':'Auth gagal: '+(st.code||''),st.auth_ok?'ok':'bad')+chip(s.property?'Property: '+s.property:'Property belum dipilih',s.property?'ok':'warn')+'</p><p class="ksseo-muted">Kaedah: '+x(isOauth?'Google OAuth 2.0':st.service_account_email)+'</p>'+
   ((s.options||[]).length?'<form class="ksseo-form" data-form="set_gsc_property"><select name="property" aria-label="Property">'+s.options.map(o=>'<option value="'+x(o.property)+'"'+(o.property===s.property?' selected':'')+'>'+x(o.property)+' ('+x(o.permission)+')</option>').join('')+'</select><button type="submit">Sambung property</button></form>':'<p class="ksseo-alert">Akaun Google belum mempunyai akses pada property '+x(cur().name)+' di Search Console.</p>')+
   (s.property?btn(model.busy.sync?'Menyegerak… (boleh ambil 1 minit)':'↻ Segerak 28 hari','data-a="sync" data-n="sync"'):'')+(s.last_sync?'<p class="ksseo-muted">Penyegerakan terakhir: '+x(s.last_sync.status)+' · '+fmt(s.last_sync.finished_at||s.last_sync.started_at)+(s.last_sync.truncated?' · DIPOTONG (had baris)':'')+'</p>':'')+'</section>';
 }
 if(rep&&rep.connected&&rep.totals){const t=rep.totals;
  h+='<div class="ksseo-grid">'+[metric('Klik',num(t.clicks),rep.window.days+' hari'),metric('Impresi',num(t.impressions)),metric('CTR',t.ctr==null?'—':(t.ctr*100).toFixed(2)+'%'),metric('Posisi purata',t.position==null?'—':t.position),metric('Hari ada data',num(t.days_with_data),t.days_zero+' sifar · '+t.days_missing+' tiada'),metric('Dikemas kini',day(rep.last_sync&&rep.last_sync.finished_at),'Lewat ~2 hari')].join('')+'</div>'+
   '<section class="ksseo-box"><h2>Klik harian</h2>'+sparkline(rep.series)+'</section>'+
   '<div class="ksseo-two"><section class="ksseo-box"><h2>Query teratas</h2>'+table(rep.top_queries,'query')+'</section><section class="ksseo-box"><h2>Halaman teratas</h2>'+table(rep.top_pages,'page')+'</section></div>';
 }else if(rep)h+='<p class="ksseo-note">Belum ada data Search Console untuk '+x(cur().name)+'. Pilih property dan segerak.</p>';
 return h;
}
function table(rows,key){return rows&&rows.length?'<table class="ksseo-table"><tr><th>'+(key==='query'?'Query':'Halaman')+'</th><th>Klik</th><th>Imp.</th><th>Pos.</th></tr>'+rows.slice(0,12).map(r=>'<tr><td>'+x(String(r[key]).replace(/^https?:\/\/[^/]+/,'')||'/')+'</td><td>'+num(r.clicks)+'</td><td>'+num(r.impressions)+'</td><td>'+(r.position==null?'—':r.position)+'</td></tr>').join('')+'</table>':'<p class="ksseo-muted">Tiada data.</p>';}
function vLinks(){
 const rows=D().links&&D().links.rows||[];
 const list=rows.length?rows.map(l=>'<div class="ksseo-row"><div><b>'+x(l.referring_site)+'</b><br>'+chip(l.review_status,l.review_status==='qualified'?'ok':l.review_status==='rejected'?'bad':'warn')+chip('Outreach: '+l.outreach_status)+(l.verified_at?chip('Pautan disahkan '+day(l.verified_at),'ok'):'')+
  (l.page_url?'<br><span class="ksseo-muted">'+x(l.page_url)+'</span>':'')+(l.rationale?'<br><span class="ksseo-muted">'+x(l.rationale)+'</span>':'')+'</div><div>'+
  (l.review_status!=='qualified'?btn('Layakkan','data-a="linkstat" data-id="'+x(l.id)+'" data-f="review_status" data-v="qualified"','s'):'')+(l.review_status!=='rejected'?btn('Tolak','data-a="linkstat" data-id="'+x(l.id)+'" data-f="review_status" data-v="rejected"','s'):'')+
  (l.review_status==='qualified'&&l.outreach_status==='none'?btn('Rancang outreach','data-a="linkstat" data-id="'+x(l.id)+'" data-f="outreach_status" data-v="planned"','s'):'')+
  (l.page_url?btn(model.busy['vl'+l.id]?'Memeriksa…':'Sahkan pautan sebenar','data-a="verifylink" data-id="'+x(l.id)+'" data-n="vl'+x(l.id)+'"','s'):'')+
  (l.verified_at&&l.outreach_status!=='linked'?btn('Tandakan berpaut','data-a="linkstat" data-id="'+x(l.id)+'" data-f="outreach_status" data-v="linked"'):'')+'</div></div>').join(''):'<p class="ksseo-muted">Belum ada peluang pautan balik.</p>';
 return '<section class="ksseo-box"><h2>Tambah peluang</h2><form class="ksseo-form" data-form="add_link_opportunity"><input name="referring_site" required placeholder="Domain, cth. blog.contoh.my" aria-label="Domain"><input name="page_url" placeholder="URL halaman (pilihan, https)" aria-label="URL halaman"><input name="rationale" maxlength="400" placeholder="Kenapa relevan?" aria-label="Sebab"><button type="submit">Tambah</button></form>'+
  '<p class="ksseo-note">Tiada e-mel dihantar secara automatik. Pautan antara Abang Recond dan Kakak Recond ditolak untuk mengelakkan link farm. Status "berpaut" hanya selepas sistem menemui pautan sebenar pada halaman itu.</p></section><section class="ksseo-box"><h2>Peluang ('+rows.length+')</h2>'+list+'</section>';
}
function vLaporan(){
 const r=D().performance;if(!r)return model.loading?'<p class="ksseo-muted">Menyediakan laporan…</p>':'';
 const arts=r.central_articles.length?r.central_articles.map(a=>'<div class="ksseo-row"><div><b>'+x(a.title)+'</b><br><span class="ksseo-muted">'+day(a.published_at)+(a.keyword?' · '+x(a.keyword):'')+'</span></div><div>'+
  (a.state==='data'?chip(num(a.clicks)+' klik','ok')+chip(num(a.impressions)+' impresi')+chip('pos '+a.position):chip(a.state==='gsc_not_connected'?'GSC belum disambung':a.state==='no_data'?'Tiada data':'Belum muncul dalam halaman teratas','warn'))+'</div></div>').join(''):'<p class="ksseo-muted">Belum ada artikel terbit melalui saluran pusat.</p>';
 const pipe=STAGES.map(([k,l])=>chip(l+': '+(r.pipeline[k]||0),(r.pipeline[k]||0)?'info':'')).join('');
 return '<div class="ksseo-grid">'+[metric('Klik',r.gsc.totals?num(r.gsc.totals.clicks):'—',r.gsc.connected?r.window.days+' hari':'GSC belum disambung'),metric('Impresi',r.gsc.totals?num(r.gsc.totals.impressions):'—'),metric('Posisi',r.gsc.totals&&r.gsc.totals.position!=null?r.gsc.totals.position:'—')].join('')+'</div>'+
  '<section class="ksseo-box"><h2>Saluran artikel</h2><p>'+pipe+'</p></section><section class="ksseo-box"><h2>Prestasi artikel terbit pusat</h2>'+arts+'<p class="ksseo-note">'+x(r.note)+'</p></section>'+
  '<div class="ksseo-two"><section class="ksseo-box"><h2>Query teratas</h2>'+table(r.top_queries,'query')+'</section><section class="ksseo-box"><h2>Halaman teratas</h2>'+table(r.top_pages,'page')+'</section></div>';
}

function v2Button(label,kind,id=''){return '<button class="p" data-a="v2-run" data-kind="'+kind+'" data-id="'+x(id)+'">'+label+'</button>';}
function vOpportunities(){const d=D().v2_overview;if(!d)return '<p>Membaca peluang SEO…</p>';return '<section class="ksseo-box"><h2>Peluang berasaskan bukti</h2><p class="ksseo-note">Skor ialah keutamaan dalaman. Volum, trafik dan difficulty tidak dianggarkan.</p>'+v2Button('Research Now · Skor','scoring')+(d.opportunities||[]).map(o=>'<article class="ksseo-row"><div><h3>'+x(o.keyword)+'</h3>'+chip('Skor '+o.score,'info')+chip(o.action)+chip(o.model_cluster)+'<p>'+x(o.intent)+' · Keyakinan '+Math.round(o.confidence*100)+'%</p>'+(o.evidence.gsc?'<p>GSC: '+num(o.evidence.gsc.impressions)+' impresi · '+num(o.evidence.gsc.clicks)+' klik · posisi '+o.evidence.gsc.position+'</p>':'<p>Sumber: stok / Google Suggest / halaman pesaing</p>')+(o.target_url?'<a href="'+x(o.target_url)+'" target="_blank" rel="noopener">Halaman yang perlu ditambah baik ↗</a>':'')+'<details><summary>Bukti & pecahan skor</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+x(JSON.stringify(o.evidence,null,2))+'</pre></details></div></article>').join('')+'</section>';}
function vAutopilot(){const d=D().v2_overview;if(!d)return '<p>Membaca automasi…</p>';const c=d.control||{};return '<div class="ksseo-grid">'+metric('Automasi research',c.enabled&&!c.paused?'ON':'PAUSE')+metric('Publisher','blog-auto','Satu laluan · maksimum 2 artikel sehari')+metric('Langganan tambahan','RM0','Kos AI penggunaan akaun DeepSeek sedia ada')+'</div><section class="ksseo-box"><h2>Kawalan</h2><button class="p" data-a="v2-control" data-patch="'+x(JSON.stringify({enabled:true,paused:false}))+'">Resume / ON</button> <button class="s" data-a="v2-control" data-patch="'+x(JSON.stringify({paused:true}))+'">Pause</button> <button class="s" data-a="v2-control" data-patch="'+x(JSON.stringify({enabled:false,paused:true}))+'">OFF</button><p class="ksseo-note">07:15 GSC · 07:45 keyword · 08:15 pesaing (berperingkat) · 08:45 skor · 10:00 & 22:00 artikel. Waktu Malaysia.</p>'+v2Button('Research keyword sekarang','keywords')+' '+v2Button('Skor / refresh queue','scoring')+' '+v2Button('Audit teknikal','technical')+'<h3>Pesaing · Research Now / Retry</h3>'+((D().competitors||{}).rows||[]).map(p=>'<p>'+x(p.hostname)+' '+v2Button('Research / Retry','competitor',p.id)+'</p>').join('')+'</section><section class="ksseo-box"><h2>Artikel sebenar</h2>'+d.posts.map(p=>'<article class="ksseo-row"><div><h3>'+x(p.title)+'</h3>'+chip(p.status)+'<p>'+fmt(p.published_at)+'</p>'+(p.status==='published'?'<a href="https://abangrecond.com/blog/'+encodeURIComponent(p.slug)+'" target="_blank" rel="noopener">Buka artikel ↗</a>':'')+'</div></article>').join('')+'</section><section class="ksseo-box"><h2>Editorial queue</h2><p>Slot seterusnya 10 pagi / 10 malam. Pemilihan disahkan semula ketika cron berjalan; senarai ini bukan janji penerbitan.</p>'+d.calendar.map(t=>'<article class="ksseo-row"><div><b>'+x(t.title_hint)+'</b> '+chip(t.status)+' '+chip(t.seo_opportunity_score==null?'Belum diskor':'Skor '+t.seo_opportunity_score)+'<p>'+x(t.last_error||'')+'</p></div></article>').join('')+'</section><section class="ksseo-box"><h2>Last run, success & error</h2>'+d.jobs.map(j=>'<article class="ksseo-row"><div><b>'+x(j.kind)+'</b> '+chip(j.status,j.status==='failed'?'bad':'info')+'<p>'+fmt(j.started_at)+' → '+fmt(j.finished_at)+'</p><p>'+x(j.error||'')+'</p><details><summary>Hasil sebenar / AI usage</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+x(JSON.stringify(j.summary,null,2))+'</pre></details></div></article>').join('')+'<h3>Cron live</h3>'+((d.cron||[]).map(c=>'<p><b>'+x(c.jobname)+'</b> · '+x(c.active?'Aktif':'OFF')+' · UTC '+x(c.schedule_utc)+' · '+fmt(c.last_sql_run)+' · '+x(c.sql_status||'Belum berjalan')+'</p>').join(''))+'<p>Status SQL cron tidak membuktikan artikel diterbitkan; semak URL artikel dan hasil blog_publish di atas.</p>'+'<p>Organic lead attribution: belum disahkan. Tiada angka conversion direka.</p></section>';}
function vTechnical(){const d=D().v2_overview;if(!d)return '<p>Membaca audit…</p>';return '<section class="ksseo-box"><h2>Technical SEO</h2>'+v2Button('Audit Now / Retry','technical')+'<p class="ksseo-note">Audit sampel URL sebenar. CWV mobile memerlukan data field / Lighthouse; masa respons bukan skor CWV.</p>'+d.technical.map(t=>'<article class="ksseo-row"><div><a href="'+x(t.url)+'" target="_blank" rel="noopener">'+x(t.url)+'</a><p>'+fmt(t.checked_at)+'</p>'+(t.findings.issues||[]).map(i=>chip(i,'bad')).join('')+(!(t.findings.issues||[]).length?chip('Semakan asas lulus','ok'):'')+'<pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+x(JSON.stringify(t.findings,null,2))+'</pre></div></article>').join('')+'</section>';}

function view(){
 const ns=model.key==='abangrecond'?{text:'Semak peluang dan hasil blog-auto. Had dua artikel sehari; publisher pusat kekal OFF.',tab:'autopilot'}:nextStep();
 const head='<header class="ksseo-head"><div style="font-size:11px">KERJA SENDIRI · OWNER</div><h1>SEO Command Center</h1><p>Data GSC → peluang SEO → blog-auto → pemantauan hasil sebenar.</p></header>';
 const sw='<nav class="ksseo-switch" aria-label="Pilih website"><a class="ksseo-btn" href="/takaful-keluarga/seo/">Takaful LINDUNG ↗</a>'+sites.map(z=>'<button type="button" data-seo-site="'+z.key+'" aria-pressed="'+(z.key===model.key)+'" class="'+(z.key===model.key?'active':'')+'">'+x(z.name)+'</button>').join('')+'</nav>';
 const tabs='<nav class="ksseo-tabs" role="tablist">'+TABS.filter(([k])=>model.key==='abangrecond'||!['opportunities','autopilot','technical'].includes(k)).map(([k,l])=>'<button type="button" role="tab" data-seo-tab="'+k+'" aria-selected="'+(k===model.tab)+'" class="'+(k===model.tab?'active':'')+'">'+l+'</button>').join('')+'</nav>';
 const next='<div class="ksseo-next"><div><b>LANGKAH SETERUSNYA</b><span>'+x(ns.text)+'</span></div>'+(ns.tab!==model.tab?'<button type="button" class="p" data-seo-tab="'+ns.tab+'">Pergi →</button>':'')+'</div>';
 const body={opportunities:vOpportunities,autopilot:vAutopilot,technical:vTechnical,ringkasan:vRingkasan,keyword:vKeyword,pesaing:vPesaing,planner:vPlanner,gsc:vGsc,links:vLinks,laporan:vLaporan}[model.tab]();
 return '<div class="ksseo">'+head+sw+tabs+(model.toast?'<div class="ksseo-toast" role="status">'+x(model.toast)+'</div>':'')+next+(model.error?'<div class="ksseo-alert" role="alert">'+x(model.error)+'</div>':'')+
  '<div class="ksseo-actions" style="margin:6px 0"><span class="ksseo-muted">'+x(cur().url)+'</span> <button type="button" class="s" data-seo-refresh '+(model.loading?'disabled':'')+'>'+(model.loading?'Membaca…':'↻ Muat semula')+'</button></div>'+body+
  '<p class="ksseo-muted">Akses pemilik sahaja · Auto-publish pusat OFF (dikunci dalam pangkalan data) · CRM, WhatsApp dan Repair Engine tidak disentuh</p></div>';
}
function paint(){if(state.session&&state.page==='seo-intelligence'&&state.business){css();const e=document.getElementById('view');if(e){const y=window.scrollY;e.innerHTML=view();window.scrollTo(0,y);}injectNav();}}
async function open(){
 if(!state.session){document.getElementById('loginDialog')?.showModal();return;}
 if(document.getElementById('moreDialog')?.open)document.getElementById('moreDialog').close();
 if(state.business!=='recond'&&typeof switchWorkspace==='function')await switchWorkspace('recond','dashboard');
 state.page='seo-intelligence';render();
 const d=D();d.keywords=undefined;d.content=undefined;d.overview=undefined;
 // the next-step banner needs keywords + content + overview, whichever tab is open
 await Promise.allSettled([get('keywords').then(v=>d.keywords=v),get('content').then(v=>d.content=v),get('overview').then(v=>d.overview=v)]);
 await loadTab(true);
}
let oauthReturn=new URLSearchParams(window.location.search).get('gsc');
const prev=render;
render=function(){const result=prev.apply(this,arguments);if(state.session){if(state.page==='seo-intelligence')paint();injectNav();if(oauthReturn){const outcome=oauthReturn;oauthReturn=null;const clean=new URL(window.location.href);clean.searchParams.delete('gsc');window.history.replaceState(null,'',clean.href);model.key='abangrecond';model.tab='gsc';model.toast=outcome==='connected'?'Google disambungkan dan data GSC diimport.':(ERR[outcome]||'Semak status GSC: '+outcome);Promise.resolve().then(()=>open()).catch(e=>{model.error=errText(e);paint();});}}return result;};

// ---------------------------------------------------------------- events
function reset(){model.openId=null;model.detail=null;model.error='';model.toast='';model.confirmPublish=null;}
document.addEventListener('click',function(e){
 const t=e.target;
 const opener=t.closest('[data-seo-open]');if(opener){e.preventDefault();e.stopImmediatePropagation();open().catch(z=>{model.error=errText(z);paint();});return;}
 if(!t.closest('.ksseo'))return;
 const sw=t.closest('[data-seo-site]');
 if(sw){e.preventDefault();e.stopImmediatePropagation();model.key=sw.dataset.seoSite;if(model.key!=='abangrecond'&&['opportunities','autopilot','technical'].includes(model.tab))model.tab='ringkasan';reset();paint();Promise.allSettled([get('keywords').then(v=>D().keywords=v),get('content').then(v=>D().content=v)]).then(()=>loadTab(true));return;}
 const tab=t.closest('[data-seo-tab]');
 if(tab){e.preventDefault();e.stopImmediatePropagation();model.tab=tab.dataset.seoTab;model.error='';paint();loadTab(false);return;}
 if(t.closest('[data-seo-refresh]')){e.preventDefault();e.stopImmediatePropagation();const d=D();d.overview=d.keywords=d.content=undefined;Promise.allSettled([get('keywords').then(v=>d.keywords=v),get('content').then(v=>d.content=v)]).then(()=>refreshContent());return;}
 const b=t.closest('[data-a]');if(!b)return;
 e.preventDefault();e.stopImmediatePropagation();
 const a=b.dataset.a,id=b.dataset.id,d=D(),n=b.dataset.n||a;
 if(a==='v2-control')return act(n,'v2_control',JSON.parse(b.dataset.patch),async()=>{await loadTab(true);},'Kawalan automasi dikemas kini');
 if(a==='v2-run')return act(n,'v2_run',{kind:b.dataset.kind,competitor_id:id||undefined,retry:true},async(out)=>{d.v2_overview=undefined;await loadTab(true);model.toast=out.skipped?'Tidak dijalankan: '+out.skipped:'Research selesai. Semak hasil dan bukti.';},'');
 const done=(txt)=>[async()=>{await refreshContent();},txt];
 const run=(action,body,txt)=>act(n,action,body,async()=>{await refreshContent();},txt);
 const chk=k=>!!document.querySelector('[data-chk="'+k+'"]:checked');
 switch(a){
  case 'oauth-connect': return act('connect','gsc_oauth_connect',{},async out=>{const u=new URL(out.connect_url);if(u.origin!=='https://ldrvvpmxnhapsupdgjee.supabase.co'||u.pathname!=='/functions/v1/ks-seo-intelligence'||u.searchParams.get('action')!=='gsc_oauth_launch')throw Error('Pautan Google tidak sah');window.location.assign(u.href);},'');
  case 'research': return act(n,'research_keywords',{},async o=>{d.keywords=undefined;d.overview=undefined;await loadTab(true);model.toast='Siap ✓ '+o.inserted.length+' keyword baharu ditambah ('+o.skipped.length+' dilangkau kerana pendua)';},'');
  case 'kwstatus': return act(n,'set_keyword_status',{keyword_id:id,status:b.dataset.v},async()=>{d.keywords=undefined;await loadTab(true);},b.dataset.v==='approved'?'Keyword diluluskan':'Keyword dikemas kini');
  case 'idea-from': model.tab='planner';model.form={keyword_id:id};paint();loadTab(true);return;
  case 'gap-idea': model.tab='planner';model.form={title:'Panduan '+b.dataset.p+' untuk pembeli kereta recond'};paint();loadTab(true);return;
  case 'analyze': return act(n,'analyze_competitor',{competitor_id:id},async()=>{d.competitors=undefined;d.competitor_report=undefined;await loadTab(true);},'Pesaing dianalisis');
  case 'open': if(model.openId===id){model.openId=null;model.detail=null;paint();}else openContent(id);return;
  case 'gen': return run('generate_draft',{content_id:id},'Draf siap dijana');
  case 'fc': return run('fact_check',{content_id:id},'Semakan fakta selesai');
  case 'covers': return get('cover_candidates').then(r=>{if(model.detail)model.detail.covers=r.candidates;paint();}).catch(z=>{model.error=errText(z);paint();});
  case 'setcover': return act(n,'set_cover',{content_id:id,url:b.dataset.url,stock_no:b.dataset.s},async()=>{await refreshContent();},'Gambar dipilih');
  case 'submit': return run('submit_review',{content_id:id},'Dihantar untuk semakan');
  case 'approve': return run('approve_content',{content_id:id,facts_confirmed:chk('facts'),acknowledge_issues:chk('ack')},'Artikel diluluskan');
  case 'reopen': return act(n,'reject_content',{content_id:id,reason:'Dipulangkan oleh pemilik'},async()=>{await refreshContent();},'Dipulangkan ke draf');
  case 'unsched': return run('unschedule_content',{content_id:id},'Jadual dibatalkan');
  case 'cancel': return run('cancel_content',{content_id:id},'Artikel dibatalkan');
  case 'dry': return act(n,'publish_content',{content_id:id,dry_run:true},async o=>{if(model.detail)model.detail.preview=o;},'Pratonton sedia');
  case 'askpub': model.confirmPublish=id;paint();return;
  case 'publish': model.confirmPublish=null;return act(n,'publish_content',{content_id:id},async()=>{await refreshContent();},'Artikel diterbitkan');
  case 'due': return act(n,'run_due',{},async o=>{await refreshContent();model.toast=o.published?'Siap ✓ Artikel dijadual diterbitkan':'Tiada artikel sampai masa lagi';},'');
  case 'sync': return act(n,'gsc_sync',{days:28},async()=>{const dd=D();dd.gsc_report=undefined;dd.gsc_status=undefined;dd.overview=undefined;await loadTab(true);},'Data Search Console disegerakkan');
  case 'linkstat': return act(n,'set_link_status',{id,[b.dataset.f]:b.dataset.v},async()=>{D().links=undefined;await loadTab(true);},'Status dikemas kini');
  case 'verifylink': return act(n,'verify_link',{id},async o=>{D().links=undefined;await loadTab(true);},'Pautan sebenar disahkan');
 }
},true);
document.addEventListener('submit',async function(e){
 const f=e.target,action=f&&f.dataset&&f.dataset.form;if(!action||!f.closest('.ksseo'))return;
 e.preventDefault();e.stopImmediatePropagation();
 const fd=Object.fromEntries(new FormData(f).entries()),d=D(),id=f.dataset.id;let body=fd,after=async()=>{await refreshContent();},txt='Disimpan';
 if(action==='add_keyword'){after=async()=>{d.keywords=undefined;await loadTab(true);};txt='Keyword ditambah';}
 if(action==='add_competitor'){after=async()=>{d.competitors=undefined;await loadTab(true);};txt='Pesaing ditambah';}
 if(action==='add_idea'){body={keyword_id:fd.keyword_id,title:fd.title,angle:fd.angle,facts:String(fd.facts||'').split('\n').map(s=>s.trim()).filter(Boolean)};model.form={keyword_id:fd.keyword_id,title:fd.title};after=async()=>{model.form={};await refreshContent();};txt='Idea disimpan';}
 if(action==='set_keyword_volume'){body={keyword_id:id,volume:Number(fd.volume),source:fd.source};after=async()=>{d.keywords=undefined;await loadTab(true);};txt='Volum disimpan dengan sumber';}
 if(action==='save_draft'){body={content_id:id,draft:{title:fd.title,seo_title:fd.seo_title,excerpt:fd.excerpt,meta_description:fd.meta_description}};txt='Suntingan disimpan. Semak fakta semula.';}
 if(action==='reject_content'){body={content_id:id,reason:fd.reason};txt='Dipulangkan ke draf';}
 if(action==='schedule_content'){const t=new Date(fd.when+':00+08:00');if(isNaN(t)){model.error='Masa tidak sah';paint();return;}body={content_id:id,scheduled_at:t.toISOString()};txt='Artikel dijadualkan';}
 if(action==='set_gsc_property'){body={property:fd.property};after=async()=>{const dd=D();dd.gsc_status=undefined;dd.gsc_report=undefined;await loadTab(true);};txt='Property disambung';}
 if(action==='add_link_opportunity'){after=async()=>{d.links=undefined;await loadTab(true);};txt='Peluang ditambah';}
 await act('form-'+action,action,body,after,txt);
},true);
if(state.session)injectNav();
})();
