'use strict';
/* ======= SplitSchatzi =======
   Gemeinsame Einkaufsliste + Ausgaben-Split für zwei Personen.
   Alle Daten liegen in Firebase RTDB unter rooms/<CODE> und werden live zwischen beiden Geräten synchronisiert.
   Datenmodell (kompatibel mit v1):
     person1, person2            Namen
     expenses/<id>               {description, amount, category, date, splitType, paidBy:'person1'|'person2', p1Share, type?:'settlement', createdBy, createdAt}
     items/<id>                  {name, quantity, unit, category, checked, note?, addedBy, createdAt, checkedBy?, checkedAt?}
     history/<key>               {name, category, unit, count, last}   -> Vorschläge "Oft gekauft"
     settings                    {p1Pct}                               -> Standard-Aufteilung */

const APP_VERSION='2.0.0';

/* ======= Constants ======= */
const SHOP_CATS=[ // Reihenfolge = typischer Weg durch den Supermarkt
  {id:'fruits',name:'Obst & Gemüse',emoji:'🍎'},
  {id:'bakery',name:'Backwaren',emoji:'🍞'},
  {id:'dairy',name:'Milchprodukte & Eier',emoji:'🥛'},
  {id:'meat',name:'Fleisch, Fisch & Tofu',emoji:'🥩'},
  {id:'frozen',name:'Tiefkühl',emoji:'🧊'},
  {id:'pantry',name:'Vorrat',emoji:'🥫'},
  {id:'drinks',name:'Getränke',emoji:'🥤'},
  {id:'snacks',name:'Snacks & Süßes',emoji:'🍫'},
  {id:'household',name:'Haushalt & Drogerie',emoji:'🧻'},
  {id:'other',name:'Sonstiges',emoji:'📦'}
];
// Reihenfolge = Prüfreihenfolge (spezifischere Kategorien zuerst, z.B. "Apfelsaft" -> Getränke statt Obst)
const SHOP_KW={
  pantry:['nudel','pasta','spaghetti','penne','reis','mehl','zucker','salz','pfeffer','öl','essig','gewürz','sauce','soße','ketchup','senf','mayo','honig','marmelade','nutella','müsli','haferflocken','cornflakes','linsen','bohnen','kichererbsen','dose','konserve','brühe','tomatenmark','passata','kaffee','tee','backpulver','hefe','kakao','erdnussbutter','oliven'],
  frozen:['tk','tiefkühl','pizza','eis','pommes','eiswürfel','fischstäbchen'],
  drinks:['wasser','saft','bier','wein','cola','limo','sprudel','eistee','sekt','prosecco','smoothie','fanta','sprite','mate','energy','radler','schorle'],
  dairy:['milch','käse','kaese','joghurt','jogurt','butter','sahne','quark','ei','eier','mozzarella','feta','parmesan','schmand','skyr','margarine','creme fraiche','gouda','halloumi'],
  meat:['fleisch','hack','hähnchen','haehnchen','huhn','hühn','pute','wurst','schinken','salami','speck','lachs','fisch','thunfisch','garnele','steak','schnitzel','bacon','würstchen','chicken','tofu','filet'],
  bakery:['brot','brötchen','toast','baguette','croissant','brezel','breze','kuchen','semmel','laugen','wrap','tortilla','ciabatta'],
  snacks:['chips','schoko','keks','gummibär','haribo','nüsse','nuss','popcorn','süßigkeit','riegel','cracker','salzstangen','bonbon','praline','kaugummi'],
  household:['klopapier','toilettenpapier','küchenrolle','spülmittel','waschmittel','müllbeutel','mülltüte','shampoo','duschgel','zahnpasta','zahnbürste','seife','deo','schwamm','reiniger','putzmittel','taschentücher','windel','batterie','folie','backpapier','tabs','weichspüler','rasier','tampon','binden','wattepad','zewa','kerze','glühbirne'],
  fruits:['apfel','äpfel','banane','birne','orange','zitrone','limette','traube','beere','tomate','gurke','salat','paprika','zwiebel','knoblauch','kartoffel','karotte','möhre','brokkoli','zucchini','aubergine','pilz','champignon','spinat','avocado','mango','kiwi','ingwer','petersilie','basilikum','kräuter','lauch','kohl','obst','gemüse','melone','ananas','rucola','radieschen','sellerie','kürbis','koriander','minze','mais','erbsen','pfirsich','nektarine','pflaume','kirsche','rote bete','fenchel','spargel']
};
const EXP_CATS=[
  {id:'groceries',name:'Einkauf',emoji:'🛒'},
  {id:'food',name:'Essen & Trinken',emoji:'🍕'},
  {id:'home',name:'Wohnung',emoji:'🏠'},
  {id:'transport',name:'Mobilität',emoji:'🚗'},
  {id:'entertainment',name:'Freizeit',emoji:'🎬'},
  {id:'travel',name:'Urlaub',emoji:'✈️'},
  {id:'health',name:'Gesundheit',emoji:'💊'},
  {id:'other',name:'Sonstiges',emoji:'💰'}
];
const EXP_KW={
  groceries:['rewe','edeka','aldi','lidl','penny','netto','kaufland','einkauf','supermarkt','dm','rossmann','alnatura','denns','tegut','globus','spar','billa','hofer','migros','coop','drogerie'],
  food:['restaurant','essen','pizza','sushi','döner','burger','café','cafe','kaffee','bäcker','lieferando','wolt','mittag','abendessen','frühstück','brunch','bar','imbiss','mcdonald','eis','dinner','lunch','kneipe','bier','cocktail'],
  home:['miete','strom','gas','internet','wlan','handy','ikea','möbel','versicherung','rundfunk','gez','nebenkosten','heizung','baumarkt','obi','hornbach','haushalt','deko'],
  travel:['urlaub','hotel','airbnb','flug','booking','ferienwohnung','reise'],
  transport:['tank','benzin','diesel','bahn','db','zug','bus','taxi','uber','bolt','parken','parkhaus','maut','öpnv','mvg','bvg','hvv','sixt','auto','werkstatt','fahrrad','deutschlandticket','ticket'],
  entertainment:['kino','netflix','spotify','disney','konzert','theater','museum','spiel','ausflug','party','geschenk','bowling','zoo','festival','buch'],
  health:['apotheke','arzt','medikament','zahnarzt','fitness','gym','physio','brille','kontaktlinsen']
};
const UNITS=[{v:'x',l:'Stück'},{v:'kg',l:'kg'},{v:'g',l:'g'},{v:'l',l:'Liter'},{v:'ml',l:'ml'},{v:'Pkg',l:'Packung'},{v:'Fl.',l:'Flasche'},{v:'Dose',l:'Dose'},{v:'Bund',l:'Bund'},{v:'Glas',l:'Glas'}];
const UNIT_ALIASES={x:'x',stk:'x','stk.':'x',st:'x','st.':'x','stück':'x',kg:'kg',g:'g',gr:'g',l:'l',liter:'l',ml:'ml',pkg:'Pkg',pck:'Pkg',packung:'Pkg',packungen:'Pkg',pack:'Pkg',fl:'Fl.','fl.':'Fl.',flasche:'Fl.',flaschen:'Fl.',dose:'Dose',dosen:'Dose',bund:'Bund',glas:'Glas','gläser':'Glas'};

/* ======= Firebase ======= */
const db=firebase.database();
let roomRef=null,roomCb=null;

/* ======= Device-local state ======= */
const L=loadLocal();
function loadLocal(){
  let l={};
  try{l=JSON.parse(localStorage.getItem('ss_local'))||{}}catch(e){}
  const theme=l.theme||(l.dark===false?'light':l.dark===true?'dark':'auto'); // v1 speicherte nur "dark"
  return{room:l.room||'',role:l.role||'',theme,tab:l.tab||'expenses',hideInstall:!!l.hideInstall};
}
function saveL(){try{localStorage.setItem('ss_local',JSON.stringify(L))}catch(e){}}
function saveCache(d){try{localStorage.setItem('ss_cache_'+L.room,JSON.stringify(d))}catch(e){}}
function loadCache(){try{return JSON.parse(localStorage.getItem('ss_cache_'+L.room))}catch(e){return null}}
function dropCache(room){try{localStorage.removeItem('ss_cache_'+room)}catch(e){}}

/* ======= Shared state (mirror of the room) ======= */
const S={screen:'welcome',tab:L.tab,names:{person1:'',person2:''},expenses:[],items:[],history:{},settings:{},offline:false,modal:false,joinCode:''};

/* ======= Helpers ======= */
const $=s=>document.querySelector(s);
const me=()=>L.role;
const other=()=>L.role==='person1'?'person2':'person1';
function nm(p){return S.names[p]||(p===me()?'Du':'Schatzi')}
function gid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function cap(s){s=String(s||'').trim();return s.charAt(0).toUpperCase()+s.slice(1)}
const r2=n=>Math.round(n*100)/100;
const EUR=new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'});
const NUM=new Intl.NumberFormat('de-DE',{maximumFractionDigits:2});
const fC=n=>EUR.format(Math.abs(n)<0.005?0:n);
function parseAmt(s){
  if(typeof s==='number')return s;
  s=String(s||'').trim().replace(/[\s€]/g,'');
  if(s.includes(','))s=s.replace(/\./g,'').replace(',','.'); // "1.234,56" -> "1234.56"
  const n=parseFloat(s);return isFinite(n)?n:NaN;
}
function fmtInput(n){return n==null||isNaN(n)?'':String(r2(n)).replace('.',',')}
function isoDay(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function parseDay(s){const p=String(s||'').split('-').map(Number);return p[0]?new Date(p[0],(p[1]||1)-1,p[2]||1):new Date()}
const WEEKDAY=new Intl.DateTimeFormat('de-DE',{weekday:'long'});
const DAYFMT=new Intl.DateTimeFormat('de-DE',{day:'numeric',month:'short'});
const DAYFMT_Y=new Intl.DateTimeFormat('de-DE',{day:'numeric',month:'short',year:'numeric'});
const MONTHFMT=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'});
function fD(s){
  const t=parseDay(isoDay()),d=parseDay(s),diff=Math.round((t-d)/864e5);
  if(diff===0)return'Heute';if(diff===1)return'Gestern';if(diff>1&&diff<7)return WEEKDAY.format(d);
  return d.getFullYear()===t.getFullYear()?DAYFMT.format(d):DAYFMT_Y.format(d);
}
function genCode(){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let r='';for(let i=0;i<6;i++)r+=c[Math.floor(Math.random()*c.length)];return r}
function hkey(name){return String(name||'').toLowerCase().trim().replace(/[.#$\[\]\/]/g,'_').replace(/\s+/g,' ').slice(0,60)}
function kwMatch(name,kws){
  const s=String(name||'').toLowerCase(),words=s.split(/[\s\-,/]+/);
  return kws.some(k=>k.includes(' ')?s.includes(k):k.length<=3?words.some(w=>w===k||w.endsWith(k)):words.some(w=>w.includes(k)));
}
function guessShopCat(name){for(const id in SHOP_KW)if(kwMatch(name,SHOP_KW[id]))return id;return'other'}
function guessExpCat(desc){for(const id in EXP_KW)if(kwMatch(desc,EXP_KW[id]))return id;return null}
const shopCat=id=>SHOP_CATS.find(c=>c.id===id)||SHOP_CATS[SHOP_CATS.length-1];
const expCat=id=>EXP_CATS.find(c=>c.id===id)||EXP_CATS[EXP_CATS.length-1];
function fQty(i){
  const q=Number(i.quantity)||1;
  if(!i.unit||i.unit==='x')return q===1?'':NUM.format(q)+'×';
  return NUM.format(q)+' '+i.unit;
}
function isStandalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}
function isIOS(){return/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)}
function copyText(t){
  if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(t);
  const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
  try{document.execCommand('copy')}finally{ta.remove()}
  return Promise.resolve();
}

/* ======= Money math ======= */
// Anteil von Person p an Ausgabe e
function share(e,p){const p1=e.p1Share!=null?e.p1Share:e.amount/2;return p==='person1'?p1:e.amount-p1}
// Was die andere Person mir durch e schuldet (negativ = ich schulde)
function delta(e){return e.paidBy===me()?e.amount-share(e,me()):-share(e,me())}
function balance(){return S.expenses.reduce((c,e)=>c+Math.round(delta(e)*100),0)/100}
const isSpend=e=>e.type!=='settlement';
function monthKey(){return isoDay().slice(0,7)}
function myDefaultPct(){const p1=S.settings.p1Pct!=null?S.settings.p1Pct:50;return me()==='person1'?p1:100-p1}

/* ======= Icons ======= */
const I={
  heart:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  receipt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8m4-12v2m0 8v2"/></svg>',
  cart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
  more:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14m-7-7h14"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  arrow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>',
  swap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m16 3 4 4-4 4M20 7H4m4 14-4-4 4-4m-4 4h16"/></svg>',
  share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4m0-11-6.8 4"/></svg>',
  copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3"/></svg>',
  logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
};

/* ======= Sync ======= */
let known=null; // ids aus dem letzten Snapshot -> erkennt, was das Schatzi neu eingetragen hat
function applyRoom(d){
  S.names={person1:d.person1||'',person2:d.person2||''};
  S.expenses=Object.entries(d.expenses||{}).filter(([,e])=>e&&typeof e.amount==='number').map(([k,e])=>Object.assign({},e,{id:k}));
  S.expenses.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||0)-(a.createdAt||0)||(b.id>a.id?1:-1));
  S.items=Object.entries(d.items||{}).filter(([,i])=>i&&i.name).map(([k,i])=>Object.assign({},i,{id:k}));
  S.history=d.history||{};
  S.settings=d.settings||{};
}
function announce(d){
  const items=d.items||{},exps=d.expenses||{};
  if(known){
    const o=other();
    const ni=Object.keys(items).filter(k=>!known.items.has(k)&&items[k]&&items[k].addedBy===o).map(k=>items[k].name);
    const ne=Object.keys(exps).filter(k=>!known.exp.has(k)&&exps[k]&&exps[k].createdBy===o).map(k=>exps[k]);
    if(ni.length)toast(esc(nm(o))+': + '+esc(ni.slice(0,3).join(', '))+(ni.length>3?' …':''));
    else if(ne.length){const e=ne[0];toast(e.type==='settlement'?esc(nm(o))+' hat einen Ausgleich über '+fC(e.amount)+' eingetragen':esc(nm(o))+' hat „'+esc(e.description)+'“ ('+fC(e.amount)+') eingetragen')}
  }
  known={items:new Set(Object.keys(items)),exp:new Set(Object.keys(exps))};
}
function joinRoom(code){
  detach();
  const ref=roomRef=db.ref('rooms/'+code);
  roomCb=roomRef.on('value',snap=>{
    if(roomRef!==ref)return; // veralteter Callback nach Abmelden/Raumwechsel
    const d=snap.val();
    if(!d){toast('Der Raum wurde gelöscht.');leaveRoom(true);return}
    announce(d);applyRoom(d);saveCache(d);
    if(S.screen!=='main'){S.screen='main';R()}else update();
  },err=>toast('Sync-Fehler: '+esc(err.message)));
}
function detach(){if(roomRef&&roomCb)roomRef.off('value',roomCb);roomRef=null;roomCb=null}
function upd(obj){if(!roomRef)return Promise.resolve();return roomRef.update(obj).catch(err=>{toast('Speichern fehlgeschlagen: '+esc(err.message));throw err})}
function leaveRoom(dropLocal){
  const old=L.room;detach();known=null;
  if(dropLocal)dropCache(old);
  L.room='';L.role='';saveL();
  Object.assign(S,{screen:'welcome',names:{person1:'',person2:''},expenses:[],items:[],history:{},settings:{}});
  hideModal();R();
}
let connTimer=null;
function setConn(v){
  clearTimeout(connTimer);
  if(v){S.offline=false;paintStatus()}
  else connTimer=setTimeout(()=>{S.offline=true;paintStatus()},2500); // kurze Aussetzer nicht anzeigen
}
function paintStatus(){const el=$('#live');if(el)el.outerHTML=rLive()}
function rLive(){return'<span id="live" class="live '+(S.offline?'off':'on')+'"><i></i>'+(S.offline?'Offline':'Live')+'</span>'}

/* ======= Join ======= */
function withTimeout(p,ms,msg){return Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error(msg)),ms))])}
async function join(name,code,create){
  const ref=db.ref('rooms/'+code);
  const snap=await withTimeout(ref.once('value'),12000,'Keine Verbindung – bist du online?');
  const d=snap.val();
  if(!d){
    if(!create)throw new Error('Raum „'+code+'“ gibt es nicht. Prüfe den Code oder tippe auf „Neu“.');
    await ref.set({person1:name,person2:''});return'person1';
  }
  const n=name.toLowerCase();
  if((d.person1||'').toLowerCase()===n)return'person1';
  if((d.person2||'').toLowerCase()===n)return'person2';
  if(!d.person2){
    const r=await ref.child('person2').transaction(cur=>cur?undefined:name);
    if(r.committed)return'person2';
  }
  const p2=(await ref.child('person2').once('value')).val();
  throw new Error('Der Raum ist schon voll ('+d.person1+' & '+p2+'). Gib denselben Namen wie beim ersten Mal ein, um dich wieder anzumelden.');
}

/* ======= Render ======= */
function applyTheme(){
  const dark=L.theme==='dark'||(L.theme==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme=dark?'dark':'light';
  const m=document.querySelector('meta[name=theme-color]');if(m)m.content=dark?'#050a18':'#f5f7fb';
}
function R(){
  applyTheme();
  const a=$('#app');
  if(S.screen==='welcome'){a.dataset.view='welcome';a.innerHTML=rWelcome();bWelcome();return}
  if(S.screen==='loading'){a.dataset.view='loading';a.innerHTML=rLoading();return}
  if(a.dataset.view!=='main'){
    a.dataset.view='main';
    a.innerHTML='<div class="app"><header class="hdr" id="hdr"></header><div id="quick"></div><main class="content" id="content"></main>'+
      '<button class="fab" id="fab" data-a="fab" aria-label="Neue Ausgabe">'+I.plus+'</button><nav class="tabbar" id="tabbar"></nav></div>';
    renderQuick();
  }
  update();
}
// Aktualisiert nur Header, Liste und Tabbar – offene Formulare und das Schnell-Eingabefeld bleiben unangetastet.
function update(){
  if(S.screen!=='main'||!$('#content'))return;
  $('#hdr').innerHTML=rHeader();
  $('#content').innerHTML=S.tab==='expenses'?rExpenses():S.tab==='shopping'?rShopping():rSettings();
  $('#tabbar').innerHTML=rTabbar();
  $('#fab').hidden=S.tab!=='expenses';
  renderSugg();
}
function setTab(t){
  if(t===S.tab){$('#content').scrollTo({top:0,behavior:'smooth'});return}
  S.tab=t;L.tab=t;saveL();
  renderQuick();update();
  // Einblend-Animation nur beim Tab-Wechsel, nicht bei jedem Live-Update
  const c=$('#content');c.scrollTop=0;c.classList.add('anim');
  clearTimeout(setTab.t);setTab.t=setTimeout(()=>c.classList.remove('anim'),400);
}

function rLoading(){
  return'<div class="welcome"><div class="w-inner"><div class="logo"><div class="logo-icon">'+I.heart+'</div><h1>SplitSchatzi</h1><p class="pulse">Verbinde …</p></div></div></div>';
}

/* --- Welcome --- */
function rWelcome(){
  const code=S.joinCode||'';
  return'<div class="welcome"><div class="w-inner">'+
  '<div class="logo"><div class="logo-icon">'+I.heart+'</div><h1>SplitSchatzi</h1><p>Einkaufsliste & Ausgaben – für euch zwei.</p></div>'+
  (code?'<div class="invite-note">💌 Du wurdest in den Raum <b>'+esc(code)+'</b> eingeladen.</div>':'')+
  '<div class="fg"><label class="fl" for="w-n">Dein Name</label><input class="fi" id="w-n" placeholder="z.B. Max" maxlength="30" autocomplete="given-name"></div>'+
  '<div class="fg"><label class="fl" for="w-c">Raum-Code</label>'+
  '<div class="code-row"><input class="fi code" id="w-c" placeholder="ABC123" maxlength="12" value="'+esc(code)+'" autocapitalize="characters" autocomplete="off">'+
  '<button class="btn-g" id="w-gen" type="button">Neu</button></div>'+
  '<p class="hint">Eine Person tippt auf <b>Neu</b> und erstellt den Raum. Die andere gibt denselben Code ein (oder öffnet den Einladungslink).</p></div>'+
  '<button class="btn-p big" id="w-go" disabled>Los geht\'s ❤️</button>'+
  '<div id="w-err" class="err"></div>'+
  '</div></div>';
}
function bWelcome(){
  const n=$('#w-n'),c=$('#w-c'),b=$('#w-go'),err=$('#w-err');
  let generated='';
  const val=()=>{b.disabled=!n.value.trim()||c.value.trim().length<4};
  n.addEventListener('input',val);
  c.addEventListener('input',()=>{c.value=c.value.toUpperCase().replace(/[^A-Z0-9]/g,'');val()});
  $('#w-gen').addEventListener('click',()=>{generated=genCode();c.value=generated;val();n.value||n.focus()});
  const go=async()=>{
    const name=n.value.trim().slice(0,30),code=c.value.trim();
    if(!name||code.length<4)return;
    b.disabled=true;b.textContent='Verbinde …';err.textContent='';
    try{
      const role=await join(name,code,code===generated);
      L.room=code;L.role=role;L.tab='expenses';saveL();
      S.tab='expenses';S.joinCode='';S.screen='loading';known=null;R();
      joinRoom(code);
    }catch(e){
      err.textContent=e.message||'Verbindungsfehler';
      b.disabled=false;b.textContent="Los geht's ❤️";
    }
  };
  b.addEventListener('click',go);
  [n,c].forEach(x=>x.addEventListener('keydown',e=>{if(e.key==='Enter')go()}));
  val();
  n.focus();
}

/* --- Main parts --- */
function rHeader(){
  const top='<div class="hdr-row"><h1>'+I.heart+' SplitSchatzi</h1>'+rLive()+'</div>';
  if(S.tab==='expenses'){
    const bal=balance(),o=esc(nm(other()));
    const txt=bal===0?'Ihr seid quitt ❤️':bal>0?o+' schuldet dir':'Du schuldest '+o;
    const mk=monthKey(),mon=S.expenses.filter(e=>isSpend(e)&&(e.date||'').startsWith(mk));
    const myP=mon.filter(e=>e.paidBy===me()).reduce((s,e)=>s+e.amount,0),otP=mon.filter(e=>e.paidBy!==me()).reduce((s,e)=>s+e.amount,0);
    const tot=myP+otP,pct=tot>0?Math.round(myP/tot*100):50;
    return top+'<div class="bal"><div class="bal-top"><div><p class="label">'+txt+'</p><p class="amount '+(bal>0?'pos':bal<0?'neg':'')+'">'+fC(Math.abs(bal))+'</p></div>'+
      (bal!==0?'<button class="settle-btn" data-a="settle">🤝 Ausgleichen</button>':'')+'</div>'+
      '<div class="bal-month"><span>'+esc(MONTHFMT.format(new Date()))+'</span><b>'+fC(tot)+'</b></div>'+
      '<div class="progress"><div style="width:'+pct+'%"></div></div>'+
      '<div class="progress-labels"><span>Du '+fC(myP)+'</span><span>'+o+' '+fC(otP)+'</span></div></div>';
  }
  if(S.tab==='shopping'){
    const open=S.items.filter(i=>!i.checked).length,done=S.items.length-open;
    return top+'<p class="sub">'+(open?open+' Artikel offen':'Alles erledigt ✨')+(done?' · '+done+' im Wagen':'')+'</p>';
  }
  return top+'<p class="sub">Raum '+esc(L.room)+' · '+esc(nm(me()))+' & '+esc(S.names[other()]||'…')+'</p>';
}
function rTabbar(){
  const open=S.items.filter(i=>!i.checked).length;
  const t=(id,icon,label,badge)=>'<button class="tab'+(S.tab===id?' active':'')+'" data-a="tab" data-tab="'+id+'">'+icon+'<span>'+label+'</span>'+(badge?'<b class="badge">'+badge+'</b>':'')+'</button>';
  return t('expenses',I.receipt,'Ausgaben')+t('shopping',I.cart,'Einkaufen',open?(open>99?'99+':open):'')+t('settings',I.more,'Mehr');
}
function rWaiting(){
  if(S.names[other()])return'';
  return'<div class="banner"><div>💌 <b>Dein Schatzi fehlt noch.</b><br>Schick den Einladungslink – Code <b>'+esc(L.room)+'</b>.</div><button class="btn-s" data-a="invite">Einladen</button></div>';
}
function rInstallBanner(){
  if(isStandalone()||L.hideInstall)return'';
  return'<div class="banner soft"><div>📲 <b>Als App installieren</b><br>'+(isIOS()?'Safari: Teilen <span class="kbd">⎋</span> → „Zum Home-Bildschirm“':installEvt?'Ein Tippen und SplitSchatzi liegt auf dem Startbildschirm.':'Browser-Menü ⋮ → „App installieren“ / „Zum Startbildschirm“')+'</div>'+
    (installEvt?'<button class="btn-s" data-a="install">Installieren</button>':'')+'<button class="icon-btn" data-a="hide-install" aria-label="Ausblenden">'+I.x+'</button></div>';
}

function rExpenses(){
  let h=rWaiting()+rInstallBanner();
  if(!S.expenses.length)return h+'<div class="empty"><div class="empty-icon">'+I.receipt+'</div><h3>Noch keine Ausgaben</h3><p>Tippe auf + und trag ein, wer was bezahlt hat.</p></div>';
  let lastMonth='';
  S.expenses.forEach(e=>{
    const mk=(e.date||'').slice(0,7);
    if(mk!==lastMonth){
      lastMonth=mk;
      const tot=S.expenses.filter(x=>isSpend(x)&&(x.date||'').startsWith(mk)).reduce((s,x)=>s+x.amount,0);
      h+='<div class="month-h"><span>'+esc(MONTHFMT.format(parseDay(mk+'-01')))+'</span><span>'+fC(tot)+'</span></div>';
    }
    h+=rExpCard(e);
  });
  return h;
}
function rExpCard(e){
  if(e.type==='settlement'){
    const txt=e.paidBy===me()?'Du hast '+esc(nm(other()))+' bezahlt':esc(nm(other()))+' hat dir bezahlt';
    return'<button class="exp-card settle" data-a="edit-exp" data-id="'+e.id+'"><div class="exp-icon">🤝</div>'+
      '<div class="exp-details"><div class="exp-title">'+txt+'</div><div class="exp-sub">Ausgleich · '+fD(e.date)+'</div></div>'+
      '<div class="exp-amounts"><div class="exp-amt">'+fC(e.amount)+'</div></div></button>';
  }
  const cat=expCat(e.category),d=delta(e),mine=share(e,me());
  const pct=e.amount?Math.round(mine/e.amount*100):50;
  const split=e.splitType==='full'?'Alles für '+esc(e.paidBy===me()?nm(other()):'dich'):pct===50?'50/50':pct+'/'+(100-pct);
  const dTxt=Math.abs(d)<0.005?'<div class="exp-split zero">nicht geteilt</div>':'<div class="exp-split '+(d>0?'pos':'neg')+'">'+(d>0?'+':'−')+fC(Math.abs(d))+'</div>';
  return'<button class="exp-card" data-a="edit-exp" data-id="'+e.id+'"><div class="exp-icon">'+cat.emoji+'</div>'+
    '<div class="exp-details"><div class="exp-title">'+esc(e.description)+'</div>'+
    '<div class="exp-sub">'+(e.paidBy===me()?'Du':esc(nm(e.paidBy)))+' · '+fD(e.date)+' <span class="badge-s">'+split+'</span></div></div>'+
    '<div class="exp-amounts"><div class="exp-amt">'+fC(e.amount)+'</div>'+dTxt+'</div></button>';
}

/* --- Shopping --- */
function renderQuick(){
  const q=$('#quick');if(!q)return;
  if(S.tab!=='shopping'){q.innerHTML='';return}
  q.innerHTML='<div class="quick"><form class="qa" id="qa-form" autocomplete="off"><input class="fi" id="qa" placeholder="Was brauchen wir? z.B. 2 Milch" enterkeyhint="send" autocapitalize="sentences" maxlength="80">'+
    '<button type="submit" class="qa-btn" aria-label="Hinzufügen">'+I.plus+'</button></form><div class="sugg" id="sugg"></div></div>';
  const inp=$('#qa');
  $('#qa-form').addEventListener('submit',e=>{e.preventDefault();const v=inp.value.trim();if(!v)return;addItem(v);inp.value='';renderSugg();inp.focus()});
  inp.addEventListener('input',renderSugg);
  renderSugg();
}
function renderSugg(){
  const el=$('#sugg');if(!el)return;
  const q=(($('#qa')||{}).value||'').trim().toLowerCase();
  const onList=new Set(S.items.map(i=>hkey(i.name)));
  let list=Object.entries(S.history).filter(([k,h])=>h&&h.name&&!onList.has(k));
  if(q)list=list.filter(([,h])=>{const n=h.name.toLowerCase();return n.includes(q)&&n!==q});
  list.sort((a,b)=>(b[1].count||0)-(a[1].count||0)||(b[1].last||0)-(a[1].last||0));
  list=list.slice(0,q?6:14);
  el.innerHTML=list.length?(q?'':'<span class="sugg-l">Oft gekauft</span>')+list.map(([,h])=>'<button type="button" class="chip" data-a="sugg" data-name="'+esc(h.name)+'">'+shopCat(h.category).emoji+' '+esc(h.name)+'</button>').join(''):'';
  el.hidden=!list.length;
}
function rShopping(){
  let h=rWaiting();
  if(!S.items.length)return h+'<div class="empty"><div class="empty-icon">'+I.cart+'</div><h3>Die Liste ist leer</h3><p>Tipp oben ein, was ihr braucht – z.B. „2 Milch“ oder „500g Hack“. Die Kategorie wird automatisch erkannt.</p></div>';
  const open=S.items.filter(i=>!i.checked),done=S.items.filter(i=>i.checked);
  const grp={};
  open.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)).forEach(i=>{(grp[shopCat(i.category).id]=grp[shopCat(i.category).id]||[]).push(i)});
  SHOP_CATS.forEach(cat=>{
    const items=grp[cat.id];if(!items)return;
    h+='<div class="shop-h"><span>'+cat.emoji+'</span>'+cat.name+'<em>'+items.length+'</em></div>';
    items.forEach(i=>h+=rItem(i));
  });
  if(done.length){
    done.sort((a,b)=>(b.checkedAt||0)-(a.checkedAt||0));
    h+='<div class="done-h"><span>Im Wagen ('+done.length+')</span><div><button class="link" data-a="clear-done">Entfernen</button>'+
      '<button class="btn-s" data-a="finish-shop">💶 Einkauf eintragen</button></div></div><div class="done-list">'+done.map(rItem).join('')+'</div>';
  }
  return h;
}
function rItem(i){
  const q=fQty(i),meta=[];
  if(i.note)meta.push(esc(i.note));
  if(i.addedBy&&i.addedBy!==me())meta.push('von '+esc(nm(i.addedBy)));
  return'<div class="shop-item'+(i.checked?' done':'')+'"><button class="chk'+(i.checked?' on':'')+'" data-a="tog" data-id="'+i.id+'" aria-label="Abhaken">'+I.check+'</button>'+
    '<button class="shop-main" data-a="edit-item" data-id="'+i.id+'"><span class="shop-name">'+esc(i.name)+'</span>'+(meta.length?'<span class="shop-meta">'+meta.join(' · ')+'</span>':'')+'</button>'+
    (q?'<span class="shop-qty">'+esc(q)+'</span>':'')+'</div>';
}
function parseItem(s){
  s=String(s||'').trim().replace(/\s+/g,' ');
  let m=s.match(/^(\d+(?:[.,]\d+)?)\s*([a-zäöüß.]+)?\s+(.+)$/i); // "2 Milch", "500g Hack", "3x Äpfel", "1,5 kg Kartoffeln"
  if(m){
    const u=m[2]&&UNIT_ALIASES[m[2].toLowerCase()];
    return{qty:parseAmt(m[1]),unit:u||null,name:cap(u?m[3]:(m[2]?m[2]+' '+m[3]:m[3]))};
  }
  m=s.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*([a-zäöüß.]+)?$/i); // "Milch 2", "Hack 500g"
  if(m){const u=m[3]&&UNIT_ALIASES[m[3].toLowerCase()];if(!m[3]||u)return{qty:parseAmt(m[2]),unit:u||null,name:cap(m[1])}}
  return{qty:null,unit:null,name:cap(s)};
}
function addItem(text,raw){
  const p=raw?{qty:null,unit:null,name:cap(text)}:parseItem(text);
  if(!p.name)return;
  const key=hkey(p.name),h=S.history[key];
  const ex=S.items.find(i=>hkey(i.name)===key);
  if(ex&&!ex.checked){toast(esc(ex.name)+' steht schon auf der Liste');return}
  if(ex&&ex.checked){upd({['items/'+ex.id+'/checked']:false,['items/'+ex.id+'/checkedBy']:null,['items/'+ex.id+'/checkedAt']:null});toast(esc(ex.name)+' wieder auf die Liste gesetzt');return}
  const item={name:p.name.slice(0,80),quantity:p.qty>0?p.qty:1,unit:p.unit||(p.qty==null&&h&&h.unit)||'x',category:(h&&h.category)||guessShopCat(p.name),checked:false,addedBy:me(),createdAt:Date.now()};
  const id=gid();
  upd({['items/'+id]:item,['history/'+key]:{name:item.name,category:item.category,unit:item.unit,count:((h&&h.count)||0)+1,last:Date.now()}});
}
function toggleItem(id){
  const it=S.items.find(i=>i.id===id);if(!it)return;
  const v=!it.checked;
  upd({['items/'+id+'/checked']:v,['items/'+id+'/checkedBy']:v?me():null,['items/'+id+'/checkedAt']:v?Date.now():null});
}
function clearDone(silent){
  const done=S.items.filter(i=>i.checked);if(!done.length)return;
  const u={};done.forEach(i=>u['items/'+i.id]=null);upd(u);
  if(!silent)toast(done.length+' erledigte Artikel entfernt',{action:'Rückgängig',fn:()=>{const r={};done.forEach(i=>{const c=Object.assign({},i);delete c.id;r['items/'+i.id]=c});upd(r)}});
}
function finishShopping(){
  const n=S.items.filter(i=>i.checked).length;
  openExpense(null,{desc:'Einkauf',cat:'groceries',hint:'Danach werden die '+n+' Artikel aus dem Wagen von der Liste genommen.',onSave:()=>clearDone(true)});
}

/* --- Settings / Mehr --- */
function rSettings(){
  const o=other(),hasO=!!S.names[o];
  const p1=S.settings.p1Pct!=null?S.settings.p1Pct:50,myPct=me()==='person1'?p1:100-p1;
  const mk=monthKey(),prevD=new Date();prevD.setDate(1);prevD.setMonth(prevD.getMonth()-1);const pk=isoDay(prevD).slice(0,7);
  const mon=S.expenses.filter(e=>isSpend(e)&&(e.date||'').startsWith(mk));
  const monTot=mon.reduce((s,e)=>s+e.amount,0),prevTot=S.expenses.filter(e=>isSpend(e)&&(e.date||'').startsWith(pk)).reduce((s,e)=>s+e.amount,0);
  const byCat={};mon.forEach(e=>{const c=expCat(e.category).id;byCat[c]=(byCat[c]||0)+e.amount});
  const cats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]),max=cats.length?cats[0][1]:1;
  const allMine=S.expenses.filter(e=>isSpend(e)&&e.paidBy===me()).reduce((s,e)=>s+e.amount,0),allOther=S.expenses.filter(e=>isSpend(e)&&e.paidBy===o).reduce((s,e)=>s+e.amount,0);
  const ini=s=>esc((s||'?').trim().charAt(0).toUpperCase());

  return'<div class="s-wrap">'+
  '<section class="s-card"><h3>👫 Ihr zwei</h3><div class="avatars">'+
    '<button class="av" data-a="rename"><div class="av-c a">'+ini(nm(me()))+'</div><div class="nm">'+esc(nm(me()))+' '+I.edit+'</div><div class="rl">Du</div></button>'+
    '<div class="av-heart">'+I.heart+'</div>'+
    '<div class="av"><div class="av-c b">'+(hasO?ini(S.names[o]):'?')+'</div><div class="nm">'+(hasO?esc(S.names[o]):'<em>wartet …</em>')+'</div><div class="rl">Schatzi</div></div></div>'+
    '<div class="code-box"><p class="rc-l">Raum-Code</p><p class="rc-v">'+esc(L.room)+'</p>'+
    '<div class="btn-row"><button class="btn-g" data-a="invite">'+I.share+' Einladen</button><button class="btn-g" data-a="copy-code">'+I.copy+' Kopieren</button></div></div></section>'+

  '<section class="s-card"><h3>⚖️ Standard-Aufteilung</h3><p class="hint">Wie teilt ihr normalerweise? Gilt als Vorauswahl für neue Ausgaben.</p>'+
    '<div class="ratio"><span>Du <b id="r-me">'+myPct+'%</b></span><span><b id="r-ot">'+(100-myPct)+'%</b> '+esc(nm(o))+'</span></div>'+
    '<input type="range" class="range" id="ratio" min="0" max="100" step="5" value="'+myPct+'"></section>'+

  '<section class="s-card"><h3>📊 '+esc(MONTHFMT.format(new Date()))+'</h3>'+
    '<div class="stats-g"><div class="stat-b"><div class="v">'+fC(monTot)+'</div><div class="l">Ausgaben diesen Monat</div></div>'+
    '<div class="stat-b"><div class="v muted">'+fC(prevTot)+'</div><div class="l">Letzter Monat</div></div></div>'+
    (cats.length?'<div class="bars">'+cats.map(([id,v])=>{const c=expCat(id);return'<div class="bar-row"><span class="bar-l">'+c.emoji+' '+c.name+'</span><span class="bar-v">'+fC(v)+'</span><div class="bar"><div style="width:'+Math.max(3,Math.round(v/max*100))+'%"></div></div></div>'}).join('')+'</div>':'<p class="hint" style="margin-top:.75rem">Diesen Monat noch nichts eingetragen.</p>')+
    '<div class="stats-g" style="margin-top:.75rem"><div class="stat-b"><div class="v acc">'+fC(allMine)+'</div><div class="l">Du hast insgesamt bezahlt</div></div>'+
    '<div class="stat-b"><div class="v cyan">'+fC(allOther)+'</div><div class="l">'+esc(nm(o))+' insgesamt</div></div></div></section>'+

  rInstallCard()+

  '<section class="s-card"><h3>🎨 Darstellung</h3><div class="segc">'+
    [['auto','Auto'],['light','Hell'],['dark','Dunkel']].map(([v,l])=>'<button class="'+(L.theme===v?'active':'')+'" data-a="theme" data-v="'+v+'">'+l+'</button>').join('')+'</div></section>'+

  '<section class="s-card"><h3>🗂️ Daten</h3>'+
    '<button class="btn-g" data-a="export">'+I.download+' Ausgaben als CSV exportieren</button>'+
    (Object.keys(S.history).length?'<button class="btn-g" data-a="reset-sugg" style="margin-top:.5rem">Einkaufs-Vorschläge zurücksetzen</button>':'')+
  '</section>'+
  '<button class="btn-g" data-a="logout" style="margin-bottom:.6rem">'+I.logout+' Auf diesem Gerät abmelden</button>'+
  '<button class="btn-d" data-a="wipe">Raum & alle Daten löschen</button>'+
  '<p class="foot">SplitSchatzi '+APP_VERSION+' · mit ❤️ synchronisiert</p></div>';
}
function rInstallCard(){
  if(isStandalone())return'';
  const body=installEvt?'<button class="btn-p" data-a="install">📲 App installieren</button>':
    isIOS()?'<ol class="steps"><li>Diese Seite in <b>Safari</b> öffnen</li><li>Unten auf <b>Teilen</b> <span class="kbd">⎋</span> tippen</li><li><b>„Zum Home-Bildschirm“</b> wählen</li></ol>':
    '<ol class="steps"><li>In <b>Chrome</b> oben rechts auf <b>⋮</b> tippen</li><li><b>„App installieren“</b> bzw. „Zum Startbildschirm hinzufügen“ wählen</li></ol>';
  return'<section class="s-card"><h3>📲 Als App installieren</h3><p class="hint">Dann startet SplitSchatzi wie eine normale App vom Startbildschirm – im Vollbild und auch offline.</p>'+body+'</section>';
}

/* ======= Modals ======= */
function openModal(html,bind){
  const root=$('#modal-root');
  root.innerHTML='<div class="m-overlay" id="m-ov"><div class="m-sheet" role="dialog" aria-modal="true"><div class="m-handle"></div>'+html+'</div></div>';
  const ov=$('#m-ov');
  ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('[data-close]'))closeModal()});
  if(!S.modal)history.pushState({modal:1},''); // Zurück-Taste (Android) schließt das Formular statt die App
  S.modal=true;
  requestAnimationFrame(()=>ov.classList.add('open'));
  bind&&bind(ov);
}
function closeModal(){if(!S.modal)return;if(history.state&&history.state.modal)history.back();else hideModal()}
function hideModal(){
  S.modal=false;const ov=$('#m-ov');if(!ov)return;
  ov.classList.remove('open');setTimeout(()=>{if(!S.modal)$('#modal-root').innerHTML=''},300);
}
window.addEventListener('popstate',()=>{if(S.modal)hideModal()});
function shake(el){el.classList.remove('shake');void el.offsetWidth;el.classList.add('shake');el.focus()}

/* --- Expense --- */
function openExpense(id,pre){
  const e=id?S.expenses.find(x=>x.id===id):null;
  if(id&&!e)return;
  if(e&&e.type==='settlement')return openSettle(e);
  pre=pre||{};
  const def=myDefaultPct();
  const f={
    payer:e?e.paidBy:me(),
    split:e?(e.splitType||'equal'):(def===50?'equal':'percent'),
    pct:e&&e.amount?Math.round(share(e,me())/e.amount*100):def,
    exact:e?share(e,me()):null,
    cat:e?expCat(e.category).id:(pre.cat||null),
    catTouched:!!(e||pre.cat)
  };
  if(f.split==='percent'&&e&&f.pct===50)f.split='equal';
  const html='<div class="m-head"><h2>'+(e?'Ausgabe bearbeiten':'Neue Ausgabe')+'</h2><button class="m-close" data-close aria-label="Schließen">'+I.x+'</button></div>'+
    '<div class="amt-big"><input id="f-amt" inputmode="decimal" placeholder="0,00" autocomplete="off" value="'+(e?fmtInput(e.amount):pre.amount?fmtInput(pre.amount):'')+'"><span>€</span></div>'+
    '<div class="fg"><input class="fi" id="f-desc" placeholder="Wofür? z.B. Rewe, Pizza, Miete" maxlength="80" autocapitalize="sentences" value="'+esc(e?e.description:pre.desc||'')+'"></div>'+
    '<div class="fg"><label class="fl">Bezahlt von</label><div class="seg2" id="f-pay">'+[me(),other()].map(p=>'<button type="button" data-p="'+p+'" class="'+(f.payer===p?'active':'')+'">'+(p===me()?'Mir':esc(nm(p)))+'</button>').join('')+'</div></div>'+
    '<div class="fg"><label class="fl">Aufteilung</label><div class="split-sel" id="f-split"></div><div id="f-sd"></div></div>'+
    '<div class="preview" id="f-prev"></div>'+
    '<div class="fg"><label class="fl">Kategorie</label><div class="cat-g" id="f-cat">'+EXP_CATS.map(c=>'<button type="button" class="pill'+(f.cat===c.id?' active':'')+'" data-c="'+c.id+'">'+c.emoji+' '+c.name+'</button>').join('')+'</div></div>'+
    '<div class="fg"><label class="fl" for="f-date">Datum</label><input class="fi" type="date" id="f-date" value="'+esc(e?e.date:isoDay())+'"></div>'+
    (pre.hint?'<p class="hint" style="margin-bottom:.5rem">'+esc(pre.hint)+'</p>':'')+
    '<button class="btn-p" id="f-save">'+(e?'Speichern':'Hinzufügen')+'</button>'+
    (e?'<button class="btn-d" id="f-del" style="margin-top:.6rem">Löschen</button>':'')+
    (e&&e.createdBy?'<p class="meta">Eingetragen von '+(e.createdBy===me()?'dir':esc(nm(e.createdBy)))+'</p>':'');

  openModal(html,()=>{
    const amtEl=$('#f-amt'),descEl=$('#f-desc');
    const amt=()=>{const a=parseAmt(amtEl.value);return a>0?r2(a):0};
    const myShare=a=>{
      switch(f.split){
        case'percent':return a*f.pct/100;
        case'exact':return Math.min(a,Math.max(0,f.exact!=null?f.exact:a/2));
        case'full':return f.payer===me()?0:a; // der/die Nicht-Zahlende übernimmt alles
        default:return a/2;
      }
    };
    function renderSplit(){
      const np=f.payer===me()?other():me();
      const opts=[['equal','⚖️','50/50'],['percent','📊','Prozent'],['exact','💶','Beträge'],['full','🎁',np===me()?'Alles für mich':'Alles für '+esc(nm(np))]];
      $('#f-split').innerHTML=opts.map(([id,ic,l])=>'<button type="button" data-s="'+id+'" class="'+(f.split===id?'active':'')+'"><span>'+ic+'</span>'+l+'</button>').join('');
      const sd=$('#f-sd'),a=amt();
      if(f.split==='percent'){
        sd.innerHTML='<div class="split-d"><div class="ratio"><span>Du <b id="sd-me"></b></span><span><b id="sd-ot"></b> '+esc(nm(other()))+'</span></div><input type="range" class="range" id="sd-pct" min="0" max="100" step="5" value="'+f.pct+'"></div>';
        const r=$('#sd-pct'),lab=()=>{const x=amt();$('#sd-me').textContent=f.pct+'%'+(x?' · '+fC(x*f.pct/100):'');$('#sd-ot').textContent=(x?fC(x-x*f.pct/100)+' · ':'')+(100-f.pct)+'%'};
        r.addEventListener('input',()=>{f.pct=+r.value;lab();renderPrev()});lab();
      }else if(f.split==='exact'){
        if(f.exact==null||f.exact>a)f.exact=a?r2(a/2):null;
        sd.innerHTML='<div class="split-d"><div class="split-row"><span>Dein Anteil</span><input class="fi" id="sd-ex" inputmode="decimal" value="'+fmtInput(f.exact)+'"><span>€</span></div>'+
          '<div class="split-row"><span>'+esc(nm(other()))+'</span><b id="sd-exo">'+fC(Math.max(0,a-(f.exact||0)))+'</b></div></div>';
        const x=$('#sd-ex');x.addEventListener('input',()=>{const v=parseAmt(x.value);f.exact=isNaN(v)?0:v;const t=amt();$('#sd-exo').textContent=fC(Math.max(0,t-Math.min(t,f.exact)));x.classList.toggle('bad',f.exact>t);renderPrev()});
      }else sd.innerHTML='';
    }
    function renderPrev(){
      const a=amt(),el=$('#f-prev');
      if(!a){el.innerHTML='';return}
      const mine=myShare(a),d=f.payer===me()?a-mine:-mine;
      el.className='preview '+(Math.abs(d)<0.005?'':d>0?'pos':'neg');
      el.innerHTML=Math.abs(d)<0.005?'Keine offene Schuld – nur zur Übersicht':d>0?esc(nm(other()))+' schuldet dir <b>'+fC(d)+'</b>':'Du schuldest '+esc(nm(other()))+' <b>'+fC(-d)+'</b>';
    }
    $('#f-pay').addEventListener('click',ev=>{const b=ev.target.closest('[data-p]');if(!b)return;f.payer=b.dataset.p;$('#f-pay').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));renderSplit();renderPrev()});
    $('#f-split').addEventListener('click',ev=>{const b=ev.target.closest('[data-s]');if(!b)return;f.split=b.dataset.s;renderSplit();renderPrev()});
    $('#f-cat').addEventListener('click',ev=>{const b=ev.target.closest('[data-c]');if(!b)return;f.cat=b.dataset.c;f.catTouched=true;$('#f-cat').querySelectorAll('.pill').forEach(x=>x.classList.toggle('active',x===b))});
    descEl.addEventListener('input',()=>{if(f.catTouched)return;f.cat=guessExpCat(descEl.value);$('#f-cat').querySelectorAll('.pill').forEach(x=>x.classList.toggle('active',x.dataset.c===f.cat))});
    amtEl.addEventListener('input',()=>{if(f.split==='exact'&&f.exact!=null&&f.exact>amt())f.exact=null;renderSplit();renderPrev()});
    renderSplit();renderPrev();
    if(!e)setTimeout(()=>amtEl.focus(),120);

    $('#f-save').addEventListener('click',()=>{
      const a=amt();if(!a)return shake(amtEl);
      if(f.split==='exact'&&(f.exact||0)>a)return shake($('#sd-ex'));
      const mine=r2(myShare(a)),cat=f.cat||guessExpCat(descEl.value)||'other';
      const obj={
        description:(descEl.value.trim()||expCat(cat).name).slice(0,80),amount:a,category:cat,date:$('#f-date').value||isoDay(),
        splitType:f.split,paidBy:f.payer,p1Share:me()==='person1'?mine:r2(a-mine),
        createdBy:e?(e.createdBy||null):me(),createdAt:e?(e.createdAt||null):Date.now(),updatedAt:Date.now()
      };
      const eid=e?e.id:gid();
      upd({['expenses/'+eid]:obj});
      if(pre.onSave)pre.onSave();
      closeModal();
      if(!e)toast(Math.abs(delta(Object.assign({},obj)))<0.005?'Ausgabe eingetragen':'Eingetragen · '+(f.payer===me()?esc(nm(other()))+' schuldet dir '+fC(a-mine):'du schuldest '+fC(mine)));
    });
    e&&$('#f-del').addEventListener('click',()=>{
      upd({['expenses/'+e.id]:null});closeModal();
      const copy=Object.assign({},e);delete copy.id;
      toast('„'+esc(e.description)+'“ gelöscht',{action:'Rückgängig',fn:()=>upd({['expenses/'+e.id]:copy})});
    });
  });
}

/* --- Settle up --- */
function openSettle(e){
  const bal=balance();
  const st={payer:e?e.paidBy:bal>0?other():me()};
  const recv=()=>st.payer===me()?other():me();
  const html='<div class="m-head"><h2>'+(e?'Ausgleich bearbeiten':'Ausgleichen')+'</h2><button class="m-close" data-close aria-label="Schließen">'+I.x+'</button></div>'+
    '<div class="flow" id="st-flow"></div>'+
    '<button class="btn-g" id="st-swap" style="margin:-.25rem 0 1rem">'+I.swap+' Richtung tauschen</button>'+
    '<div class="amt-big"><input id="st-amt" inputmode="decimal" placeholder="0,00" value="'+fmtInput(e?e.amount:Math.abs(bal))+'"><span>€</span></div>'+
    '<p class="hint" style="text-align:center;margin:-.5rem 0 1rem">'+(bal===0?'Ihr seid aktuell quitt.':'Offener Betrag: <b>'+fC(Math.abs(bal))+'</b> ('+(bal>0?esc(nm(other()))+' → dir':'du → '+esc(nm(other())))+')')+'</p>'+
    '<div class="fg"><label class="fl" for="st-date">Datum</label><input class="fi" type="date" id="st-date" value="'+esc(e?e.date:isoDay())+'"></div>'+
    '<button class="btn-p" id="st-save">'+(e?'Speichern':'Als bezahlt eintragen')+'</button>'+
    (e?'<button class="btn-d" id="st-del" style="margin-top:.6rem">Löschen</button>':'');
  openModal(html,()=>{
    const flow=()=>{
      const p=st.payer,r=recv(),av=(x,cls)=>'<div class="flow-p"><div class="av-c '+cls+'">'+esc(nm(x).charAt(0).toUpperCase())+'</div><span>'+(x===me()?'Du':esc(nm(x)))+'</span></div>';
      $('#st-flow').innerHTML=av(p,p===me()?'a':'b')+'<div class="flow-arrow">'+I.arrow+'<small>zahlt</small></div>'+av(r,r===me()?'a':'b');
    };
    flow();
    $('#st-swap').addEventListener('click',()=>{st.payer=recv();flow()});
    $('#st-save').addEventListener('click',()=>{
      const a=r2(parseAmt($('#st-amt').value));if(!(a>0))return shake($('#st-amt'));
      const r=recv();
      upd({['expenses/'+(e?e.id:gid())]:{type:'settlement',description:'Ausgleich',amount:a,category:'other',date:$('#st-date').value||isoDay(),splitType:'full',paidBy:st.payer,p1Share:r==='person1'?a:0,createdBy:e?(e.createdBy||null):me(),createdAt:e?(e.createdAt||null):Date.now(),updatedAt:Date.now()}});
      closeModal();if(!e)toast('Ausgleich eingetragen 🤝');
    });
    e&&$('#st-del').addEventListener('click',()=>{
      upd({['expenses/'+e.id]:null});closeModal();
      const copy=Object.assign({},e);delete copy.id;
      toast('Ausgleich gelöscht',{action:'Rückgängig',fn:()=>upd({['expenses/'+e.id]:copy})});
    });
  });
}

/* --- Item --- */
function openItem(id){
  const it=S.items.find(i=>i.id===id);if(!it)return;
  let cat=shopCat(it.category).id;
  const by=it.addedBy?(it.addedBy===me()?'dir':esc(nm(it.addedBy))):'';
  const html='<div class="m-head"><h2>Artikel</h2><button class="m-close" data-close aria-label="Schließen">'+I.x+'</button></div>'+
    '<div class="fg"><label class="fl" for="i-n">Name</label><input class="fi" id="i-n" maxlength="80" value="'+esc(it.name)+'"></div>'+
    '<div class="fg row"><div class="sm"><label class="fl" for="i-q">Menge</label><input class="fi" id="i-q" inputmode="decimal" value="'+fmtInput(Number(it.quantity)||1)+'"></div>'+
    '<div><label class="fl" for="i-u">Einheit</label><select class="fi" id="i-u">'+UNITS.map(u=>'<option value="'+u.v+'"'+(u.v===(it.unit||'x')?' selected':'')+'>'+u.l+'</option>').join('')+'</select></div></div>'+
    '<div class="fg"><label class="fl" for="i-note">Notiz</label><input class="fi" id="i-note" maxlength="80" placeholder="z.B. Bio, die rote Marke …" value="'+esc(it.note||'')+'"></div>'+
    '<div class="fg"><label class="fl">Kategorie</label><div class="cat-g2" id="i-cat">'+SHOP_CATS.map(c=>'<button type="button" class="pill'+(c.id===cat?' active':'')+'" data-c="'+c.id+'">'+c.emoji+' '+c.name+'</button>').join('')+'</div></div>'+
    '<button class="btn-p" id="i-save">Speichern</button><button class="btn-d" id="i-del" style="margin-top:.6rem">Löschen</button>'+
    (by?'<p class="meta">Hinzugefügt von '+by+(it.createdAt?' · '+fD(isoDay(new Date(it.createdAt))):'')+'</p>':'');
  openModal(html,()=>{
    $('#i-cat').addEventListener('click',ev=>{const b=ev.target.closest('[data-c]');if(!b)return;cat=b.dataset.c;$('#i-cat').querySelectorAll('.pill').forEach(x=>x.classList.toggle('active',x===b))});
    $('#i-save').addEventListener('click',()=>{
      const name=cap($('#i-n').value);if(!name)return shake($('#i-n'));
      if(!S.items.some(i=>i.id===id)){toast('Der Artikel wurde inzwischen gelöscht');closeModal();return}
      const q=parseAmt($('#i-q').value),unit=$('#i-u').value,key=hkey(name),h=S.history[key]||{name,count:1};
      upd({['items/'+id+'/name']:name,['items/'+id+'/quantity']:q>0?q:1,['items/'+id+'/unit']:unit,['items/'+id+'/category']:cat,['items/'+id+'/note']:$('#i-note').value.trim()||null,
        ['history/'+key]:{name,category:cat,unit,count:h.count||1,last:Date.now()}});
      closeModal();
    });
    $('#i-del').addEventListener('click',()=>{
      upd({['items/'+id]:null});closeModal();
      const copy=Object.assign({},it);delete copy.id;
      toast(esc(it.name)+' gelöscht',{action:'Rückgängig',fn:()=>upd({['items/'+id]:copy})});
    });
  });
}

/* --- Rename --- */
function rename(){
  const html='<div class="m-head"><h2>Dein Name</h2><button class="m-close" data-close aria-label="Schließen">'+I.x+'</button></div>'+
    '<div class="fg"><input class="fi" id="rn" maxlength="30" value="'+esc(S.names[me()])+'"></div><button class="btn-p" id="rn-s">Speichern</button>';
  openModal(html,()=>{
    const i=$('#rn');setTimeout(()=>i.focus(),120);
    const save=()=>{const v=i.value.trim().slice(0,30);if(!v)return shake(i);upd({[me()]:v});closeModal()};
    $('#rn-s').addEventListener('click',save);i.addEventListener('keydown',e=>{if(e.key==='Enter')save()});
  });
}

/* ======= Toast ======= */
let toastTimer=null,toastFn=null;
function toast(html,opt){
  opt=opt||{};
  const root=$('#toast-root');
  toastFn=opt.fn||null;
  root.innerHTML='<div class="toast"><span>'+html+'</span>'+(opt.action?'<button data-a="toast-action">'+esc(opt.action)+'</button>':'')+'</div>';
  const t=root.firstChild;requestAnimationFrame(()=>t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{t.classList.remove('show');setTimeout(()=>{if(root.firstChild===t)root.innerHTML=''},300)},opt.action?5000:2800);
}

/* ======= Misc actions ======= */
let installEvt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;update()});
window.addEventListener('appinstalled',()=>{installEvt=null;toast('App installiert 🎉');update()});

function invite(){
  const url=location.origin+'/?join='+encodeURIComponent(L.room);
  const text='Komm in unsere SplitSchatzi-App 💜 Raum-Code: '+L.room;
  if(navigator.share)navigator.share({title:'SplitSchatzi',text,url}).catch(()=>{});
  else copyText(text+'\n'+url).then(()=>toast('Einladungslink kopiert'));
}
function exportCsv(){
  const q=s=>'"'+String(s==null?'':s).replace(/"/g,'""')+'"',n=x=>String(r2(x)).replace('.',',');
  const rows=[['Datum','Beschreibung','Kategorie','Betrag','Bezahlt von','Anteil '+nm('person1'),'Anteil '+nm('person2'),'Typ'].map(q).join(';')];
  S.expenses.forEach(e=>rows.push([e.date,e.description,expCat(e.category).name,n(e.amount),nm(e.paidBy),n(share(e,'person1')),n(share(e,'person2')),e.type==='settlement'?'Ausgleich':'Ausgabe'].map((v,i)=>i===3||i===5||i===6?v:q(v)).join(';')));
  const blob=new Blob(['﻿'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='splitschatzi-'+isoDay()+'.csv';document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
}

document.addEventListener('click',e=>{
  const t=e.target.closest('[data-a]');if(!t)return;
  const id=t.dataset.id;
  switch(t.dataset.a){
    case'tab':setTab(t.dataset.tab);break;
    case'fab':openExpense();break;
    case'tog':toggleItem(id);break;
    case'edit-item':openItem(id);break;
    case'edit-exp':openExpense(id);break;
    case'settle':openSettle();break;
    case'sugg':{addItem(t.dataset.name,true);const q=$('#qa');if(q&&q.value){q.value='';renderSugg()}break}
    case'clear-done':clearDone();break;
    case'finish-shop':finishShopping();break;
    case'invite':invite();break;
    case'copy-code':copyText(L.room).then(()=>toast('Code '+esc(L.room)+' kopiert'));break;
    case'install':if(installEvt){installEvt.prompt();installEvt.userChoice.finally(()=>{installEvt=null;update()})}break;
    case'hide-install':L.hideInstall=true;saveL();update();break;
    case'theme':L.theme=t.dataset.v;saveL();applyTheme();update();break;
    case'rename':rename();break;
    case'export':exportCsv();break;
    case'reset-sugg':if(confirm('Alle Einkaufs-Vorschläge löschen?'))upd({history:null});break;
    case'logout':if(confirm('Auf diesem Gerät abmelden? Eure Daten bleiben im Raum erhalten – du kannst dich mit Code '+L.room+' und deinem Namen wieder anmelden.'))leaveRoom(true);break;
    case'wipe':if(confirm('Wirklich den ganzen Raum löschen? Alle Ausgaben und die Einkaufsliste sind dann für euch BEIDE weg.')){const r=roomRef;detach();r&&r.remove();leaveRoom(true)}break;
    case'toast-action':{const fn=toastFn;toastFn=null;$('#toast-root').innerHTML='';fn&&fn();break}
  }
});
// Chips nicht fokussieren -> Tastatur bleibt offen, man kann mehrere Vorschläge nacheinander antippen
document.addEventListener('mousedown',e=>{if(e.target.closest('.chip,.qa-btn'))e.preventDefault()});
document.addEventListener('input',e=>{
  if(e.target.id!=='ratio')return;
  const v=+e.target.value;$('#r-me').textContent=v+'%';$('#r-ot').textContent=(100-v)+'%';
});
document.addEventListener('change',e=>{
  if(e.target.id!=='ratio')return;
  const v=+e.target.value;upd({'settings/p1Pct':me()==='person1'?v:100-v});
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(L.theme==='auto')applyTheme()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){db.goOnline&&db.goOnline();if(S.screen==='main')update()}});

/* ======= Init ======= */
(function init(){
  const qp=new URLSearchParams(location.search);
  const joinCode=(qp.get('join')||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const tab=qp.get('tab');
  if(['expenses','shopping','settings'].includes(tab)){S.tab=tab;L.tab=tab}
  if(location.search)history.replaceState(null,'',location.pathname);
  if(L.room&&L.role&&(!joinCode||joinCode===L.room)){
    const c=loadCache();
    if(c){applyRoom(c);announce(c);S.screen='main'}else S.screen='loading';
    joinRoom(L.room);
  }else{S.joinCode=joinCode;S.screen='welcome'}
  R();
  if(qp.get('new')&&S.screen==='main')openExpense();
  db.ref('.info/connected').on('value',s=>setConn(!!s.val()));
  if('serviceWorker'in navigator&&window.isSecureContext)navigator.serviceWorker.register('/sw.js').catch(()=>{});
})();
