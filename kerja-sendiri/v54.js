/* V5.4 presentation helpers: re-run the page-enter animation only when workspace/page changes,
   and tint the browser chrome with the active workspace colour. No data or API behaviour is touched. */
(function(){
 var COLORS={recond:'#c2410c',proton:'#1d4ed8',none:'#0d5c45'},last='',meta=document.querySelector('meta[name="theme-color"]');
 var prev=window.render;
 if(typeof prev!=='function')return;
 window.render=render=function(){
  var out=prev.apply(this,arguments);
  try{
   var ws=document.body.dataset.ws||'none',sig=ws+'|'+(window.state&&state.page);
   if(sig!==last){
    last=sig;var v=document.getElementById('view');
    if(v){v.classList.remove('v54-enter');void v.offsetWidth;v.classList.add('v54-enter');clearTimeout(window.__v54t);window.__v54t=setTimeout(function(){v.classList.remove('v54-enter')},500)}
    if(meta)meta.setAttribute('content',COLORS[ws]||COLORS.none);
   }
  }catch(e){}
  return out;
 };
})();
