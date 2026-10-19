const B='http://localhost:3055';
const j=async(m,u,b)=>{const r=await fetch(B+u,{method:m,headers:b?{'content-type':'application/json'}:{},body:b?JSON.stringify(b):undefined});const t=await r.text();if(!r.ok)throw new Error(m+' '+u+' '+r.status+' '+t);return t?JSON.parse(t):null};
const k=await j('POST','/api/knowledge',{name:'Senarai harga',text:`Harga Pakej\n\nPakej Asas berharga RM100 sebulan termasuk 1 pengguna dan sokongan emel.\n\nPakej Premium berharga RM300 sebulan termasuk 5 pengguna dan sokongan WhatsApp 24 jam.\n\nWaktu operasi\n\nKami dibuka Isnin hingga Jumaat, 9 pagi hingga 5 petang.`});
const sk=(o)=>Object.fromEntries(['assign','close','set_field','set_lifecycle','tags','comment'].map(x=>[x,{enabled:!!o[x],prompt:o[x]||''}]));
const a=await j('POST','/api/agents',{name:'Sales Agent',emoji:'💼',description:'Jawab soalan harga dan layakkan lead.',draft:{instructions:'# CONTEXT\nAnda membantu pelanggan di WhatsApp.\n# FLOW\nJawab soalan harga daripada knowledge. Jika pelanggan mahu orang sebenar, assign ke Sales Team.',wait_seconds:1,knowledge_ids:[k.id],skills:sk({assign:'Jika pelanggan minta bercakap dengan orang, assign ke Sales Team.',comment:'Sebelum assign tulis komen ringkas.'})}});
await j('POST',`/api/agents/${a.id}/publish`);
await j('PUT','/api/settings/default-agent',{agent_id:a.id});
console.log('seeded agent',a.id,'source',k.id);
