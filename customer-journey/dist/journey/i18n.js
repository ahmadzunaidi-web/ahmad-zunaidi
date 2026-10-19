/* UI-only localisation. Never translate applicant values, bank names, review text or PDF output. */
(()=>{'use strict';
const KEY='AR_CJ_LANGUAGE',dict=window.CJ_TRANSLATIONS||{},sources=new WeakMap(),attrs=new WeakMap();let lang='ms';try{const saved=localStorage.getItem(KEY);if(saved==='en'||saved==='ms')lang=saved;}catch{}
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
const protectedSelector='script,style,textarea,[data-user-content],[data-i18n-skip],.item-name,.car,.review-comment,#cjCustName,#cjCustIC,#cjCustAddress,#mfaSecret';
function t(source){const key=clean(source),pair=dict[key];if(pair)return pair[lang==='en'?1:0];if(lang==='ms')return String(source??'');
let m;if((m=key.match(/^(\d+) \/ (\d+) dimuat naik$/)))return `${m[1]} / ${m[2]} uploaded`;if((m=key.match(/^(\d+) \/ (\d+) lulus pemeriksaan$/)))return `${m[1]} / ${m[2]} passed inspection`;
if((m=key.match(/^(SA \/ ADMIN|CUSTOMER|PELANGGAN) · Sesi selamat · Dokumen private$/)))return `${m[1]==='SA / ADMIN'?'SA / ADMIN':'CUSTOMER'} · Secure session · Private documents`;
if((m=key.match(/^(Dokumen Permohonan|Dokumen) · (Kerajaan|Swasta|Perniagaan \/ SSM)$/)))return t(m[1])+' · '+t(m[2]);
if((m=key.match(/^Dokumen Income Kedua · (.+)$/)))return 'Second Income Documents · '+t(m[1]);
if((m=key.match(/^Masih ada (\d+) dokumen wajib belum dimuat naik\. Sila lengkapkan di langkah 3\.$/)))return `${m[1]} required document(s) are still missing. Please complete them in step 3.`;
if((m=key.match(/^(\d+) \/ (\d+) lengkap$/)))return `${m[1]} / ${m[2]} complete`;

if((m=key.match(/^(\d+) daripada (\d+) dokumen wajib$/)))return `${m[1]} of ${m[2]} required documents`;
if((m=key.match(/^Payslip bulan (\d+)$/)))return `Payslip month ${m[1]}`;
if((m=key.match(/^Bank statement bulan (\d+)$/)))return `Bank statement month ${m[1]}`;
if((m=key.match(/^Bank statement perniagaan bulan (\d+)$/)))return `Business bank statement month ${m[1]}`;
if((m=key.match(/^([1-4])\. (.+)$/)))return `${m[1]}. ${t(m[2])}`;
if((m=key.match(/^(.*?)([ \t]*)([→↗✓○✔★＋←🔒❤️💼👤📋📎📅📞📲🔔]+)$/u))&&dict[clean(m[1])])return t(m[1])+m[2]+m[3];
if((m=key.match(/^([→↗✓○✔★＋←🔒❤️💼👤📋📎📅📞📲🔔]+)\s*(.+)$/u))&&dict[clean(m[2])])return m[1]+' '+t(m[2]);
if((m=key.match(/^(\d+) \/ (\d+) medan diisi$/)))return `${m[1]} / ${m[2]} fields completed`;
if((m=key.match(/^Jemputan dicipta untuk (.+)\.$/)))return `Access link created for ${m[1]==='pelanggan anda'?'your customer':m[1]}.`;
if((m=key.match(/^(.+?) · (Selesai|Dalam proses \/ Belum bermula)$/)))return t(m[1])+' · '+t(m[2]);
if((m=key.match(/^(\d+) bintang$/)))return `${m[1]} stars`;
if((m=key.match(/^No\. telefon pelanggan belum ada\.$/)))return 'The customer phone number has not been entered.';
return String(source??'');}
function localize(root=document.body){if(!root)return;document.documentElement.lang=lang;
for(const field of root.querySelectorAll?.('.field')||[]){const label=field.querySelector('label'),control=field.querySelector('input,select,textarea');if(label&&control?.id&&!label.htmlFor)label.htmlFor=control.id;}
for(const option of root.querySelectorAll?.('option')||[])if(!option.hasAttribute('value'))option.setAttribute('value',option.value);
const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
while((node=walker.nextNode())){if(!node.parentElement||node.parentElement.closest(protectedSelector))continue;const old=sources.get(node);const current=node.nodeValue;const source=old&&old.last===current?old.source:current;const trim=source.trim();if(!trim)continue;const result=source.slice(0,source.indexOf(trim))+t(trim)+source.slice(source.indexOf(trim)+trim.length);sources.set(node,{source,last:result});if(current!==result)node.nodeValue=result;}
for(const element of root.querySelectorAll?.('[placeholder],[aria-label],[title],input[type=submit]')||[]){if(element.closest(protectedSelector))continue;let map=attrs.get(element)||{};for(const attr of ['placeholder','aria-label','title']){const current=element.getAttribute(attr);if(current===null)continue;const old=map[attr];const source=old&&old.last===current?old.source:current;const result=t(source);map[attr]={source,last:result};if(result!==current)element.setAttribute(attr,result);}attrs.set(element,map);}
for(const button of root.querySelectorAll?.('.steps .stepbtn.active')||[]){const box=button.closest('.steps');const left=button.offsetLeft-box.offsetLeft;if(left<box.scrollLeft||left+button.offsetWidth>box.scrollLeft+box.clientWidth)box.scrollLeft=Math.max(0,left-12);}
const bar=document.getElementById('language-toolbar');if(bar){const label=lang==='ms'?'Bahasa':'Language';if(bar.querySelector('span').textContent!==label)bar.querySelector('span').textContent=label;for(const button of bar.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.language===lang));}}
function syncWorkerLanguage(){if('serviceWorker'in navigator)navigator.serviceWorker.ready.then(reg=>reg.active?.postMessage({type:'CJ_LANGUAGE',language:lang})).catch(()=>{});}
function setLanguage(value){if(!['ms','en'].includes(value))return;lang=value;try{localStorage.setItem(KEY,lang);}catch{}localize();syncWorkerLanguage();window.dispatchEvent(new CustomEvent('cj-language-change',{detail:{language:lang}}));}
window.CJ_I18N={t,setLanguage,getLanguage:()=>lang,locale:()=>lang==='en'?'en-MY':'ms-MY',localize};
// App-generated dialogs are static authored UI or server errors, not customer review content.
for(const method of ['alert','confirm','prompt']){const native=window[method].bind(window);window[method]=(message,...args)=>native(t(message),...args);}
function init(){const bar=document.createElement('nav');bar.id='language-toolbar';bar.className='language-toolbar';bar.setAttribute('data-i18n-skip','');bar.setAttribute('aria-label','Bahasa / Language');bar.innerHTML='<span>Bahasa</span><div class="language-choices"><button type="button" data-language="ms" aria-label="Bahasa Melayu" lang="ms">BM</button><button type="button" data-language="en" aria-label="English" lang="en">EN</button></div>';document.body.prepend(bar);bar.addEventListener('click',e=>{const button=e.target.closest('[data-language]');if(button)setLanguage(button.dataset.language);});localize();syncWorkerLanguage();let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;localize();});}).observe(document.body,{childList:true,subtree:true,characterData:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
