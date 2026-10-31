'use strict';
/* Presentation-only enhancements. No credentials, endpoints or AI models changed. */
const v5Knowledge={section:'instructions'};
const v5Sections=[['instructions','System Instructions'],['reply_style','Cara AI menjawab'],['business','Business Knowledge'],['product','Product Knowledge'],['objection','Objection Handling'],['handover','Handover Rules'],['test','Test AI Conversation']];
const v5Module={business:'company_policy',product:'product',objection:'sales',handover:'company_policy'};
const v5OriginalKnowledge=knowledgePage;
knowledgePage=function(){
 const selected=v5Knowledge.section;
 const tabs=`<nav class="kc-tabs" aria-label="Bahagian Knowledge Center">${v5Sections.map(([id,label])=>`<button type="button" data-v5-section="${id}" class="${selected===id?'primary':''}" aria-current="${selected===id?'page':'false'}">${label}</button>`).join('')}</nav>`;
 if(['instructions','reply_style'].includes(selected)){
  const html=v5OriginalKnowledge();const start=html.indexOf('<div class="kc-tabs"');const end=html.indexOf('</div>',start)+6;
  return html.slice(0,start)+`<div class="kc-layout">${tabs}<div>`+html.slice(end)+'</div></div>';
 }
 return head('AI Knowledge Center '+biz().short,'Arahan dan rujukan khusus untuk workspace ini.')+`<div class="kc-layout">${tabs}<div>`+(selected==='test'?testPanel():`<div class="notice">${esc(v5Sections.find(x=>x[0]===selected)[1])}: gunakan entri berasingan dengan key unik. Status Draft belum digunakan AI; Approved menerbitkan entri melalui backend sedia ada. Senarai di bawah merangkumi semua knowledge workspace.</div>`+kcDocs())+'</div></div>';
};
const v5OriginalAfter=kcAfterRender;
kcAfterRender=function(){
 if(v5Knowledge.section==='test'){kcLoad();return;}
 v5OriginalAfter();
 const form=$('knowledgeForm');if(form&&v5Module[v5Knowledge.section]){
  form.elements.module.value=v5Module[v5Knowledge.section];
  form.elements.knowledge_key.placeholder=(state.business==='proton'?'proton_':'')+v5Knowledge.section+'_rules';
 }
};
// Keep existing shortcuts and tab navigation in sync with the new category menu.
document.addEventListener('click',e=>{
 const section=e.target.closest('[data-v5-section]');
 if(section){e.stopImmediatePropagation();v5Knowledge.section=section.dataset.v5Section;if(v5Module[v5Knowledge.section])(platform.knowledgeAuto=platform.knowledgeAuto||{})[state.business]=false;kc.tab=v5Module[v5Knowledge.section]?'docs':v5Knowledge.section==='test'?'instructions':v5Knowledge.section;kc.force=true;render();kc.force=false;return}
 const shortcut=e.target.closest('[data-kc-open],[data-kc-tab]');
 if(shortcut)v5Knowledge.section=shortcut.dataset.kcOpen||shortcut.dataset.kcTab;
 if(e.target.closest('#mobileMenu,#moreOpen')){$('moreDialog').showModal();return}
 if(e.target.closest('#sidebarToggle')){
  const tablet=matchMedia('(max-width:1023px)').matches;
  document.body.classList.toggle(tablet?'sidebar-expanded':'sidebar-collapsed');
  $('sidebarToggle').setAttribute('aria-expanded',String(tablet?document.body.classList.contains('sidebar-expanded'):!document.body.classList.contains('sidebar-collapsed')));
 }
},true);
const v5Decorate=decorate;
decorate=function(){v5Decorate();document.body.dataset.page=state.page;if($('sidebarToggle'))$('sidebarToggle').setAttribute('aria-expanded',String(matchMedia('(min-width:1024px)').matches?!document.body.classList.contains('sidebar-collapsed'):document.body.classList.contains('sidebar-expanded')))};
const v5Clear=clearSession;
clearSession=function(){v5Knowledge.section='instructions';document.body.classList.remove('sidebar-expanded','sidebar-collapsed');v5Clear()};
function v5Viewport(){document.documentElement.style.setProperty('--v5-viewport-top',(window.visualViewport?.offsetTop||0)+'px')}
window.visualViewport?.addEventListener('resize',v5Viewport);window.visualViewport?.addEventListener('scroll',v5Viewport);v5Viewport();
render();
