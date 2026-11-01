'use strict';
/* Staging-only third workspace card for RC4 picker */
(function(){
 if(typeof workspacesPage!=='function'||typeof render!=='function'){console.warn('AI Infrastructure picker hooks missing');return}
 const originalPage=workspacesPage;
 workspacesPage=function(...args){
  let html=originalPage(...args);
  if(!html.includes('data-takaful-home')){const pos=html.lastIndexOf('</div></div>');if(pos>=0)html=html.slice(0,pos)+"<a class=\"picker-card takaful\" data-takaful-home href=\"/takaful-keluarga\" style=\"display:block;text-decoration:none;color:inherit;border-top:9px solid #2582b9\"><span class=\"pc-tag\" style=\"color:#2563b6\">TAKAFUL KELUARGA</span><b>Dashboard Takaful</b><small>CRM, WhatsApp, AI LINDUNG, Knowledge, Marketing dan Settings.</small><em style=\"color:#1855a1\">Buka Takaful Keluarga →</em></a>"+html.slice(pos);}
  if(html.includes('data-infra-open'))return html;
  const at=html.lastIndexOf('</div></div>');if(at<0)return html;
  const card='<button type="button" class="picker-card infra" data-infra-open aria-label="Buka AI Infrastructure"><span class="pc-tag">AI INFRASTRUCTURE</span><b>Buka AI Infrastructure</b><small>Pantau dan diagnose semua projek Cloudflare, Netlify dan Supabase.</small><em>Buka Dashboard AI Infrastructure →</em></button>';
  return html.slice(0,at)+card+html.slice(at);
 };
 /* Takaful sublinks use ordinary navigation. */
 const oldRender=render;
 render=function(...args){const v=oldRender(...args);const p=document.querySelector('.infra-page');if(p&&!p.querySelector('[data-picker]'))p.insertAdjacentHTML('afterbegin','<button type="button" class="smallbtn" data-picker>← Pilih workspace</button>');return v};
 const style=document.createElement('style');
 style.textContent='.picker-card.infra{border-top:8px solid #0891b2}.picker-card.infra .pc-tag,.picker-card.infra em{color:#0e7490}.picker-card.infra:hover{border-color:#0891b2}.infra-page > [data-picker]{margin:0 0 14px;min-height:40px}';
 document.head.appendChild(style);
 if(typeof state!=='undefined'&&state.session&&!document.querySelector('[data-infra-open]')&&!document.querySelector('.infra-page'))render();
})();