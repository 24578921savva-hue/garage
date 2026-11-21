const DB_KEY = 'garage_db_v4'; // Обновил версию БД, чтобы сбросить возможные старые глюки
let DB = load();

function defaultDB(){
  return {
    garages: [
      {id: 'g1', num: 1, name: 'Гараж 1', note: ''},
      {id: 'g2', num: 2, name: 'Гараж 2', note: ''}
    ],
    zones: [
      {id:0, name:'0 — Прочее'},{id:1, name:'1 — Левая стена, ближе к входу'},
      {id:2, name:'2 — Левая стена, дальше от входа'},{id:3, name:'3 — Левая часть задней стены'},
      {id:4, name:'4 — Правая часть задней стены'},{id:5, name:'5 — Правая стена, дальше от входа'},
      {id:6, name:'6 — Правая стена, ближе к входу'}
    ],
    boxes: [], items: [], history: [], settings: {theme:'system', bg:null}
  };
}
function load(){
  try{ const raw = localStorage.getItem(DB_KEY); if(raw) return JSON.parse(raw); }catch(e){}
  return defaultDB();
}
function save(){ localStorage.setItem(DB_KEY, JSON.stringify(DB)); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function now(){ return Date.now(); }
function logHistory(action, text){
  DB.history.unshift({ts: now(), action, text});
  const monthAgo = now() - 30*24*60*60*1000;
  DB.history = DB.history.filter(h=>h.ts >= monthAgo).slice(0,2000);
  save();
}
function applyTheme(){
  let t = DB.settings.theme;
  if(t==='system') t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light';
  document.documentElement.setAttribute('data-theme', t);
  if(DB.settings.bg){ document.body.classList.add('has-bg'); document.body.style.backgroundImage = `url(${DB.settings.bg})`; }
  else{ document.body.classList.remove('has-bg'); document.body.style.backgroundImage = ''; }
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

function toast(msg){ const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove('show'), 1800); }
function fmtDate(ts){ const d = new Date(ts); return d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}); }
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function garageLabel(g){ return g ? (g.num+' гараж') : ''; }

function levenshtein(a,b){
  a=a.toLowerCase(); b=b.toLowerCase(); const m=a.length, n=b.length;
  if(!m) return n; if(!n) return m;
  const dp = Array.from({length:m+1}, (_,i)=>[i,...Array(n).fill(0)]);
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++) dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  return dp[m][n];
}
function fuzzyMatch(haystack, needle){
  haystack = (haystack||'').toLowerCase(); needle = (needle||'').toLowerCase().trim();
  if(!needle) return true; if(haystack.includes(needle)) return true;
  const words = needle.split(/\s+/);
  return words.every(w=>{ if(haystack.includes(w)) return true; const parts = haystack.split(/\s+/); return parts.some(p=> p.length>2 && levenshtein(p,w) <= Math.max(1, Math.floor(w.length/3))); });
}

function navigate(hash){ location.hash = hash; }
window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', ()=>{ applyTheme(); render(); registerSW(); });
const app = document.getElementById('app');
let uiState = { search:'', sort:'num', filterGarage:'', filterZone:'', listMode:'items', listGroup:'flat' };

function render(){
  const h = location.hash.replace(/^#/, '') || '/'; const parts = h.split('/').filter(Boolean);
  if(parts[0]==='garage' && parts[1]) return renderGarage(parts[1]);
  if(parts[0]==='box' && parts[1]) return renderBox(parts[1]);
  if(parts[0]==='list') return renderList();
  if(parts[0]==='gallery') return renderGallery();
  if(parts[0]==='favorites') return renderFavorites();
  if(parts[0]==='settings') return renderSettings();
  if(parts[0]==='history') return renderHistory();
  if(parts[0]==='qr') return renderQR();
  return renderHome();
}
function header(title, backHash, extra=''){
  return `<header>${backHash ? `<button class="icon-btn" onclick="navigate('${backHash}')">‹</button>` : `<button class="icon-btn" onclick="openDrawer()">☰</button>`}<h1>${escapeHtml(title)}</h1>${extra}<button class="icon-btn" onclick="navigate('/settings')">⚙</button></header>`;
}
function drawerHtml(){
  return `<div class="drawer" id="drawer"><h2>Гараж</h2>
    <button class="drawer-item" onclick="navigate('/list');closeDrawer()"><span class="ico">📋</span> Общий список</button>
    <button class="drawer-item" onclick="navigate('/gallery');closeDrawer()"><span class="ico">🖼</span> Галерея фото</button>
    <button class="drawer-item" onclick="navigate('/qr');closeDrawer()"><span class="ico">▦</span> QR-коды</button>
    <button class="drawer-item" onclick="navigate('/history');closeDrawer()"><span class="ico">🕓</span> История</button>
    <div class="drawer-divider"></div>
    <button class="drawer-item" onclick="navigate('/favorites');closeDrawer()"><span class="ico">★</span> Избранное</button>
    <button class="drawer-item" onclick="navigate('/settings');closeDrawer()"><span class="ico">⚙</span> Настройки</button></div>`;
}
function openDrawer(){ if(!document.getElementById('drawer')){ const d = document.createElement('div'); d.innerHTML = drawerHtml(); document.body.appendChild(d.firstElementChild); } document.getElementById('drawer').classList.add('show'); document.getElementById('drawerOverlay').classList.add('show'); }
function closeDrawer(){ const d = document.getElementById('drawer'); if(d) d.classList.remove('show'); document.getElementById('drawerOverlay').classList.remove('show'); }

function renderHome(){
  let html = header('Гараж');
  html += `<main><input class="search" placeholder="Поиск вещей и коробок…" value="${escapeHtml(uiState.search)}" oninput="uiState.search=this.value; if(this.value.length>0) navigate('/list'); else render()">
    <div class="row"><button class="btn ghost" onclick="navigate('/favorites')">★ Избранное</button><button class="btn ghost" onclick="openScanner()">▣ Сканер QR</button></div>
    <div class="section-title">Гаражи</div>`;
  DB.garages.sort((a,b)=>a.num-b.num).forEach(g=>{
    const cnt = DB.boxes.filter(b=>b.garageId===g.id).length;
    html += `<div class="card" onclick="navigate('/garage/${g.id}')"><div class="main"><div class="title">${garageLabel(g)}${g.note?' — '+escapeHtml(g.note):''}</div><div class="sub">${cnt} коробок</div></div><div class="arrow">›</div></div>`;
  });
  html += `<button class="btn ghost" style="width:100%;margin-top:8px" onclick="openGarageModal(null)">+ Новый гараж</button></main><button class="fab" onclick="openBoxModal(null)">+</button>`;
  app.innerHTML = html;
}

function renderGarage(garageId){
  const g = DB.garages.find(x=>x.id==garageId); if(!g){ navigate('/'); return; }
  let html = header(garageLabel(g), '/', `<button class="icon-btn" onclick="openGarageModal('${g.id}')">✎</button>`);
  const boxes = DB.boxes.filter(b=>b.garageId==g.id);
  html += `<main><div class="toolbar"><div class="chip ${uiState.sort==='num'?'active':''}" onclick="uiState.sort='num';render()">По номерам</div><div class="chip ${uiState.sort==='zone'?'active':''}" onclick="uiState.sort='zone';render()">По зонам</div></div>`;
  if(!boxes.length) html += `<div class="empty">Пока нет коробок в этом гараже</div>`;
  if(uiState.sort==='zone'){
    DB.zones.forEach(z=>{ const zb = boxes.filter(b=>b.zoneId===z.id).sort((a,b)=>a.num-b.num); if(!zb.length) return; html += `<div class="section-title">${escapeHtml(z.name)}</div>`; zb.forEach(b=> html += boxCard(b)); });
  }else{ boxes.sort((a,b)=>a.num-b.num).forEach(b=> html += boxCard(b)); }
  html += `</main><button class="fab" onclick="openBoxModal(null, '${g.id}')">+</button>`;
  app.innerHTML = html;
}

function boxCard(b){
  const g = DB.garages.find(x=>x.id===b.garageId); const itemCnt = DB.items.filter(i=>i.boxId===b.id).length;
  return `<div class="card" onclick="navigate('/box/${b.id}')"><div class="main"><div class="title">${b.num}${b.name?'. '+escapeHtml(b.name):''} ${b.favorite?'<span class="fav-star">★</span>':''}</div><div class="sub">${garageLabel(g)}/${b.zoneId}/${b.num} • ${itemCnt} вещей</div></div><div class="arrow">›</div></div>`;
}

function renderBox(boxId){
  const b = DB.boxes.find(x=>x.id===boxId); if(!b){ navigate('/'); return; }
  const g = DB.garages.find(x=>x.id===b.garageId); const items = DB.items.filter(i=>i.boxId===b.id);
  let html = header(`${b.num}${b.name?'. '+b.name:''}`, b.garageId? `/garage/${b.garageId}` : '/', `<button class="icon-btn" onclick="toggleFav('${b.id}')">${b.favorite?'★':'☆'}</button>`);
  html += `<main><div class="card" style="cursor:default"><div class="main"><div class="title" style="font-size:15px">Путь</div><div class="sub" style="font-size:14px">${garageLabel(g)}/${b.zoneId}/${b.num}</div></div></div><div class="section-title">Фото содержимого</div>`;
  if(b.photos && b.photos.length){ html += `<div class="photo-grid">`; b.photos.forEach((p,i)=> html += `<img src="${p}" onclick="openViewer('${b.id}',${i})">`); html += `</div>`; }
  else{ html += `<div class="empty" style="padding:16px">Нет фото</div>`; }
  html += `<div class="photo-actions"><button class="btn ghost" onclick="addPhoto('${b.id}')">📷 Добавить фото (${b.photos?b.photos.length:0}/3)</button></div>
  <div class="section-title">Информация</div><div class="card" style="cursor:default; display:block">
    <div class="info-row"><span class="k">Заметка</span><span>${b.note?escapeHtml(b.note):'—'}</span></div>
    <div class="info-row"><span class="k">Изменена</span><span>${fmtDate(b.updatedAt||now())}</span></div></div>
  <div class="section-title">Вещи (${items.length})</div>`;
  if(!items.length) html += `<div class="empty">Список пуст</div>`;
  items.forEach(it=>{ html += `<div class="list-item"><div class="main">${escapeHtml(it.text)}</div><button class="del" onclick="delItem('${it.id}')">✕</button></div>`; });
  html += `<button class="btn ghost" style="width:100%;margin-top:8px" onclick="addItem('${b.id}')">+ Добавить вещь</button>
  <div class="row" style="margin-top:18px"><button class="btn" onclick="openBoxModal('${b.id}')">✎ Редактировать</button><button class="btn ghost" onclick="generateBoxStickerPDF('${b.id}')">▦ PDF-наклейка</button><button class="btn danger" onclick="delBox('${b.id}')">Удалить</button></div></main>`;
  app.innerHTML = html;
}
function toggleFav(id){ const b = DB.boxes.find(x=>x.id===id); if(!b) return; b.favorite = !b.favorite; b.updatedAt = now(); save(); render(); }

function renderList(){
  let html = header('Общий список', '/');
  html += `<main><input class="search" id="q" placeholder="Поиск…" value="${escapeHtml(uiState.search)}" oninput="uiState.search=this.value; renderListResults()">
    <div class="toolbar">
      <select onchange="uiState.filterGarage=this.value;renderListResults()"><option value="">Все гаражи</option>${DB.garages.map(g=>`<option value="${g.id}" ${uiState.filterGarage==g.id?'selected':''}>${garageLabel(g)}</option>`).join('')}</select>
      <select onchange="uiState.filterZone=this.value;renderListResults()"><option value="">Все зоны</option>${DB.zones.map(z=>`<option value="${z.id}" ${uiState.filterZone==z.id?'selected':''}>Зона ${z.id}</option>`).join('')}</select>
    </div>
    <div class="row" style="margin-bottom:8px">
      <div class="chip ${uiState.listMode==='items'?'active':''}" onclick="uiState.listMode='items';renderList()">📦 Предметы</div>
      <div class="chip ${uiState.listMode==='boxes'?'active':''}" onclick="uiState.listMode='boxes';renderList()">🗃 Коробки</div>
    </div>
    <div class="row">
      <div class="chip ${uiState.listGroup==='flat'?'active':''}" onclick="uiState.listGroup='flat';renderList()">Списком</div>
      <div class="chip ${uiState.listGroup==='garage'?'active':''}" onclick="uiState.listGroup='garage';renderList()">По гаражам</div>
    </div>
    <div id="results"></div></main>`;
  app.innerHTML = html; renderListResults();
}
function renderListResults(){
  const res = document.getElementById('results'); if(!res) return;
  const q = uiState.search, fG = uiState.filterGarage, fZ = uiState.filterZone, mode = uiState.listMode;
  let boxes = DB.boxes.filter(b=> (!fG || String(b.garageId)===String(fG)) && (!fZ || String(b.zoneId)===String(fZ)) );
  let items = DB.items.filter(it=>{ const b = DB.boxes.find(x=>x.id===it.boxId); if(!b) return false; if(fG && String(b.garageId)!==String(fG)) return false; if(fZ && String(b.zoneId)!==String(fZ)) return false; return true; });
  if(q){ boxes = boxes.filter(b=> fuzzyMatch(b.num+' '+b.name, q)); items = items.filter(it=> fuzzyMatch(it.text, q)); }
  let html = '';
  if(mode==='items'){
    if(!items.length) html = `<div class="empty">Ничего не найдено</div>`;
    else if(uiState.listGroup==='garage'){ DB.garages.sort((a,b)=>a.num-b.num).forEach(g=>{ const gi = items.filter(it=>{ const b=DB.boxes.find(x=>x.id===it.boxId); return b && b.garageId===g.id; }); if(!gi.length) return; html += `<div class="section-title">${garageLabel(g)}</div>`; gi.forEach(it=>{ const b=DB.boxes.find(x=>x.id===it.boxId); if(b) html += resultItem(it,b); }); }); }
    else{ items.forEach(it=>{ const b=DB.boxes.find(x=>x.id===it.boxId); if(b) html += resultItem(it,b); }); }
  }else{
    if(!boxes.length) html = `<div class="empty">Ничего не найдено</div>`;
    else if(uiState.listGroup==='garage'){ DB.garages.sort((a,b)=>a.num-b.num).forEach(g=>{ const gb = boxes.filter(b=>b.garageId===g.id); if(!gb.length) return; html += `<div class="section-title">${garageLabel(g)}</div>`; gb.forEach(b=> html += resultBox(b)); }); }
    else{ boxes.sort((a,b)=>a.num-b.num).forEach(b=> html += resultBox(b)); }
  }
  res.innerHTML = html;
}
function resultItem(it, b){ const g = DB.garages.find(x=>x.id===b.garageId); return `<div class="card" onclick="navigate('/box/${b.id}')"><div class="main"><div class="title">${escapeHtml(it.text)}</div><div class="sub">${garageLabel(g)}/${b.zoneId}/${b.num}${b.name?'/'+escapeHtml(b.name):''}</div></div><div class="arrow">›</div></div>`; }
function resultBox(b){ const g = DB.garages.find(x=>x.id===b.garageId); const cnt = DB.items.filter(i=>i.boxId===b.id).length; return `<div class="card" onclick="navigate('/box/${b.id}')"><div class="main"><div class="title">${b.num}${b.name?'. '+escapeHtml(b.name):''} ${b.favorite?'★':''}</div><div class="sub">${garageLabel(g)}/${b.zoneId}/${b.num} • ${cnt} вещей</div></div><div class="arrow">›</div></div>`; }

function renderFavorites(){ let html = header('Избранное', '/'); const fav = DB.boxes.filter(b=>b.favorite).sort((a,b)=>a.num-b.num); html += `<main>`; if(!fav.length) html += `<div class="empty">Нет избранных коробок</div>`; fav.forEach(b=> html += boxCard(b)); html += `</main>`; app.innerHTML = html; }
function renderHistory(){ let html = header('История (30 дней)', '/'); html += `<main>`; if(!DB.history.length) html += `<div class="empty">История пуста</div>`; DB.history.forEach(h=>{ html += `<div class="card" style="cursor:default; display:block"><div class="title" style="font-size:14px">${escapeHtml(h.text)}</div><div class="sub">${escapeHtml(h.action)} • ${fmtDate(h.ts)}</div></div>`; }); html += `</main>`; app.innerHTML = html; }
function renderSettings(){
  let html = header('Настройки', '/');
  html += `<main>
    <div class="section-title">Тема</div><div class="card" style="cursor:default; display:block">
      <div class="row"><div class="chip ${DB.settings.theme==='system'?'active':''}" onclick="setTheme('system')">Система</div><div class="chip ${DB.settings.theme==='light'?'active':''}" onclick="setTheme('light')">Светлая</div><div class="chip ${DB.settings.theme==='dark'?'active':''}" onclick="setTheme('dark')">Тёмная</div></div>
      <div class="row"><div class="chip ${DB.settings.theme==='neon-red'?'active':''}" onclick="setTheme('neon-red')">Неон-красная</div><div class="chip ${DB.settings.theme==='acid-pink'?'active':''}" onclick="setTheme('acid-pink')">Кислотная</div></div>
    </div>
    <div class="section-title">Фон</div><div class="card" style="cursor:default; display:block"><button class="btn ghost" onclick="pickBg()">🖼 Загрузить фон</button>${DB.settings.bg?'<button class="btn danger" style="margin-left:8px" onclick="clearBg()">Убрать</button>':''}</div>
    <div class="section-title">Резервная копия</div><div class="card" style="cursor:default; display:block"><button class="btn" onclick="exportBackup()">⬇ Экспорт (.json)</button><button class="btn ghost" style="margin-left:8px" onclick="document.getElementById('importFile').click()">⬆ Восстановить</button><input type="file" id="importFile" accept="application/json" class="hidden" onchange="importBackup(event)"></div>
    <div class="section-title">Данные</div><div class="card" style="cursor:default; display:block">
      <div class="info-row"><span class="k">Гаражей</span><span>${DB.garages.length} / 20</span></div>
      <div class="info-row"><span class="k">Коробок</span><span>${DB.boxes.length}</span></div>
      <div class="info-row"><span class="k">Вещей</span><span>${DB.items.length}</span></div>
      <div class="info-row"><span class="k">Фото</span><span>${DB.boxes.reduce((s,b)=>s+(b.photos?b.photos.length:0),0)}</span></div>
    </div></main>`;
  app.innerHTML = html;
}
function setTheme(t){ DB.settings.theme=t; save(); applyTheme(); render(); }
function pickBg(){ const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.onchange = e=>{ const f = e.target.files[0]; if(!f) return; const r = new FileReader(); r.onload = ()=>{ DB.settings.bg = r.result; save(); applyTheme(); render(); toast('Фон установлен'); }; r.readAsDataURL(f); }; inp.click(); }
function clearBg(){ DB.settings.bg=null; save(); applyTheme(); render(); }

function renderGallery(){
  const photos = []; DB.boxes.forEach(b=>{ (b.photos||[]).forEach((p,i)=> photos.push({boxId:b.id, idx:i, src:p, num:b.num, name:b.name})); });
  let html = header('Галерея', '/'); html += `<main>`;
  if(!photos.length){ html += `<div class="empty">Пока нет фото</div>`; } else { html += `<div class="gallery-grid">`; photos.forEach((p,i)=>{ html += `<div class="item" onclick="openGalleryViewer(${i})"><img src="${p.src}"><div class="lab">${p.num}</div></div>`; }); html += `</div>`; }
  html += `</main>`; app.innerHTML = html; window._galleryPhotos = photos;
}
function openGalleryViewer(startIdx){
  const photos = window._galleryPhotos || []; let cur = startIdx; let scale = 1, lastDist = 0;
  function show(){
    const v = document.getElementById('galleryViewer'); const p = photos[cur];
    v.innerHTML = `<div class="viewer"><button class="close" onclick="document.getElementById('galleryViewer').remove()">×</button>${photos.length>1?'<button class="nav prev" onclick="galleryNav(-1)">‹</button>':''}<img id="gvImg" src="${p.src}" style="transform:scale(${scale})">${photos.length>1?'<button class="nav next" onclick="galleryNav(1)">›</button>':''}<div class="bottom"><button class="btn" onclick="navigate('/box/${p.boxId}');document.getElementById('galleryViewer').remove()">→ К коробке ${p.num}</button><button class="btn ghost" onclick="replacePhoto('${p.boxId}',${p.idx})">↻ Заменить</button></div></div>`;
    const img = document.getElementById('gvImg');
    img.addEventListener('touchstart', e=>{ if(e.touches.length===2){ lastDist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY); } }, {passive:true});
    img.addEventListener('touchmove', e=>{ if(e.touches.length===2){ const dist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY); if(lastDist){ scale = Math.min(5, Math.max(1, scale * dist/lastDist)); img.style.transform=`scale(${scale})`; } lastDist = dist; } }, {passive:true});
  }
  window.galleryNav = d=>{ cur = (cur+d+photos.length)%photos.length; scale=1; show(); };
  const div = document.createElement('div'); div.id = 'galleryViewer'; document.body.appendChild(div); show();
}
function replacePhoto(boxId, idx){
  const b = DB.boxes.find(x=>x.id===boxId); if(!b) return;
  const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*'; // Убрали capture
  inp.onchange = e=>{ const f = e.target.files[0]; if(!f) return; compressImage(f, 1280, 0.72, dataUrl=>{ b.photos[idx] = dataUrl; b.updatedAt = now(); save(); logHistory('Фото', `Коробка ${b.num}: заменено фото`); toast('Фото заменено'); document.getElementById('galleryViewer')?.remove(); render(); }); };
  inp.click();
}

function openGarageModal(garageId){
  const g = garageId ? DB.garages.find(x=>x.id==garageId) : null; const isNew = !g;
  const html = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal"><h2>${isNew?'Новый гараж':'Редактировать гараж'}</h2><label>Номер гаража (любой, всего до 20 шт)</label><input type="number" id="gNum" value="${g?g.num:''}" placeholder="например: 344"><label>Заметка</label><textarea id="gNote" rows="2" placeholder="например: у дороги">${g?escapeHtml(g.note||''):''}</textarea><div class="row" style="margin-top:10px"><button class="btn" onclick="saveGarage('${garageId||''}')">Сохранить</button>${g?`<button class="btn danger" onclick="delGarage('${g.id}')">Удалить</button>`:''}<button class="btn ghost" onclick="closeModal()">Отмена</button></div></div></div>`;
  const div = document.createElement('div'); div.id='modalRoot'; div.innerHTML = html; document.body.appendChild(div);
}
function saveGarage(garageId){
  const num = +document.getElementById('gNum').value; const note = document.getElementById('gNote').value.trim();
  if(!num){ toast('Введите номер'); return; }
  const dup = DB.garages.find(g=>g.num===num && g.id!=garageId); if(dup){ toast('Гараж с номером '+num+' уже есть'); return; }
  if(!garageId && DB.garages.length>=20){ toast('Максимум 20 гаражей'); return; }
  if(garageId){ const g = DB.garages.find(x=>x.id==garageId); g.num = num; g.note = note; g.name = num+' гараж'; save(); logHistory('Изменён', `Гараж ${num}`); closeModal(); render(); toast('Сохранено'); }
  else{ DB.garages.push({id:uid(), num, name:num+' гараж', note}); save(); logHistory('Создан', `Гараж ${num}`); closeModal(); render(); toast('Гараж создан'); }
}
function delGarage(id){
  const g = DB.garages.find(x=>x.id==id); if(!g) return;
  const cnt = DB.boxes.filter(b=>b.garageId==id).length; if(cnt && !confirm(`В гараже ${g.num} есть ${cnt} коробок. Удалить всё?`)) return;
  DB.items = DB.items.filter(i=>{ const b=DB.boxes.find(x=>x.id===i.boxId); return b && b.garageId!=id; }); DB.boxes = DB.boxes.filter(b=>b.garageId!=id); DB.garages = DB.garages.filter(x=>x.id!=id);
  save(); logHistory('Удалён', `Гараж ${g.num}`); closeModal(); navigate('/'); toast('Удалено');
}
function openBoxModal(boxId, garageId){
  const b = boxId ? DB.boxes.find(x=>x.id===boxId) : null;
  const zonesOptions = DB.zones.map(z=>`<option value="${z.id}" ${b&&b.zoneId===z.id?'selected':''}>${escapeHtml(z.name)}</option>`).join('');
  const garagesOptions = DB.garages.sort((a,b)=>a.num-b.num).map(g=>`<option value="${g.id}" ${((b&&b.garageId===g.id)||(!b&&garageId===g.id))?'selected':''}>${garageLabel(g)}</option>`).join('');
  const html = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal"><h2>${!b?'Новая коробка':'Редактировать'}</h2><label>Гараж</label><select id="mGarage">${garagesOptions}</select><label>Зона</label><select id="mZone">${zonesOptions}</select><label>Номер (уникальный)</label><input type="number" id="mNum" value="${b?b.num:''}" placeholder="например 277"><label>Название (необязательно)</label><input type="text" id="mName" value="${b?escapeHtml(b.name||''):''}" placeholder="например Электрика"><label>Краткая заметка</label><textarea id="mNote" rows="2" placeholder="хрупкое">${b?escapeHtml(b.note||''):''}</textarea><div class="row" style="margin-top:10px"><button class="btn" onclick="saveBox('${boxId||''}')">Сохранить</button><button class="btn ghost" onclick="closeModal()">Отмена</button></div></div></div>`;
  const div = document.createElement('div'); div.id='modalRoot'; div.innerHTML = html; document.body.appendChild(div);
}
function closeModal(){ const m=document.getElementById('modalRoot'); if(m) m.remove(); }
function saveBox(boxId){
  const garageId = document.getElementById('mGarage').value; const zoneId = +document.getElementById('mZone').value; const num = +document.getElementById('mNum').value; const name = document.getElementById('mName').value.trim(); const note = document.getElementById('mNote').value.trim();
  if(!num){ toast('Введите номер'); return; }
  const dup = DB.boxes.find(b=>b.num===num && b.id!==boxId); if(dup){ toast('Номер '+num+' уже существует'); return; }
  if(boxId){ const b = DB.boxes.find(x=>x.id===boxId); b.garageId=garageId; b.zoneId=zoneId; b.num=num; b.name=name; b.note=note; b.updatedAt = now(); save(); logHistory('Изменена', `Коробка ${num}`); closeModal(); render(); toast('Сохранено'); }
  else{ const b = {id:uid(), num, name, garageId, zoneId, note, photos:[], favorite:false, updatedAt:now()}; DB.boxes.push(b); save(); logHistory('Создана', `Коробка ${num}`); closeModal(); toast('Коробка создана'); navigate(`/box/${b.id}`); }
}
function delBox(id){
  const b = DB.boxes.find(x=>x.id===id); if(!b) return; if(!confirm('Удалить коробку '+b.num+'?')) return;
  DB.items = DB.items.filter(i=>i.boxId!==id); DB.boxes = DB.boxes.filter(x=>x.id!==id); save(); logHistory('Удалена', `Коробка ${b.num}`); navigate('/'); toast('Удалено');
}
function addItem(boxId){
  const text = prompt('Описание вещи:'); if(!text || !text.trim()) return;
  DB.items.push({id:uid(), boxId, text:text.trim()}); const b = DB.boxes.find(x=>x.id===boxId); if(b) b.updatedAt = now();
  save(); logHistory('Добавлено', text.trim().slice(0,60)); render(); toast('Добавлено');
}
function delItem(id){
  const it = DB.items.find(x=>x.id===id); if(!it) return; if(!confirm('Удалить вещь?')) return;
  DB.items = DB.items.filter(x=>x.id!==id); const b = DB.boxes.find(x=>x.id===it.boxId); if(b) b.updatedAt = now(); save(); logHistory('Удалено', it.text.slice(0,60)); render();
}
function addPhoto(boxId){
  const b = DB.boxes.find(x=>x.id===boxId); if(!b) return; if((b.photos||[]).length >= 3){ toast('Максимум 3 фото'); return; }
  const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*'; // Убрали capture
  inp.onchange = e=>{ const f = e.target.files[0]; if(!f) return; compressImage(f, 1280, 0.72, dataUrl=>{ b.photos = b.photos||[]; b.photos.push(dataUrl); b.updatedAt = now(); save(); logHistory('Фото', `Коробка ${b.num}: добавлено`); render(); toast('Фото добавлено'); }); };
  inp.click();
}
function compressImage(file, maxSize, quality, cb){
  const reader = new FileReader(); reader.onload = ev=>{ const img = new Image(); img.onload = ()=>{ let {width, height} = img; if(width>height && width>maxSize){ height = height*maxSize/width; width = maxSize; } else if(height>maxSize){ width = width*maxSize/height; height = maxSize; } const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; canvas.getContext('2d').drawImage(img, 0, 0, width, height); cb(canvas.toDataURL('image/jpeg', quality)); }; img.src = ev.target.result; }; reader.readAsDataURL(file);
}
function openViewer(boxId, idx){
  const b = DB.boxes.find(x=>x.id===boxId); if(!b) return; const photos = b.photos || []; let cur = idx;
  function show(){ const v = document.getElementById('viewerRoot'); v.innerHTML = `<div class="viewer"><button class="close" onclick="document.getElementById('viewerRoot').remove()">×</button>${photos.length>1?'<button class="nav prev" onclick="viewerNav(-1)">‹</button>':''}<img src="${photos[cur]}">${photos.length>1?'<button class="nav next" onclick="viewerNav(1)">›</button>':''}</div>`; }
  window.viewerNav = d=>{ cur = (cur+d+photos.length)%photos.length; show(); };
  const div = document.createElement('div'); div.id = 'viewerRoot'; document.body.appendChild(div); show();
}

function renderQR(){
  let html = header('QR-коды', '/');
  html += `<main>
    <div class="section-title">Считывание</div><div class="card" style="cursor:default; display:block"><button class="btn" onclick="openScanner()">▣ Сканировать QR</button><button class="btn ghost" style="margin-left:8px" onclick="manualScan()"># Ввести номер</button></div>
    <div class="section-title">Генерация наклейки</div><div class="card" style="cursor:default; display:block"><p style="color:var(--muted);font-size:14px;margin-top:0">PDF-наклейка для конкретной коробки.</p><button class="btn" onclick="askBoxAndGenerate()">▦ Сгенерировать</button></div>
    <div class="section-title">Все наклейки</div><div class="card" style="cursor:default; display:block"><p style="color:var(--muted);font-size:14px;margin-top:0">PDF-сетка всех коробок.</p><button class="btn ghost" onclick="generateAllStickersPDF()">📄 PDF всех коробок</button></div></main>`;
  app.innerHTML = html;
}
function askBoxAndGenerate(){ const num = prompt('Номер коробки для наклейки:'); if(!num) return; const b = DB.boxes.find(x=>String(x.num)===String(num).trim()); if(!b){ toast('Не найдена'); return; } generateBoxStickerPDF(b.id); }
function importQR(){ if(window.QRCode) return Promise.resolve(); return new Promise((res, rej)=>{ const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js'; s.onload = res; s.onerror = ()=>rej(new Error('QR lib')); document.head.appendChild(s); }); }
function importJSPDF(){ if(window.jspdf && window.jspdf.jsPDF) return Promise.resolve(); return new Promise((res, rej)=>{ const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'; s.onload = res; s.onerror = ()=>rej(new Error('pdf lib')); document.head.appendChild(s); }); }
function qrUrlForBox(id){ return location.origin + location.pathname + '#/box/' + id; }

async function generateBoxStickerPDF(boxId){
  const b = DB.boxes.find(x=>x.id===boxId); if(!b) return; toast('Готовим PDF…');
  try{ await importQR(); await importJSPDF(); }catch(e){ toast('Нужен интернет при первой генерации'); return; }
  try{ const { jsPDF } = window.jspdf; const pdf = new jsPDF({unit:'mm', format:'a5'}); const qrCanvas = document.createElement('canvas'); await new Promise((res,rej)=>{ window.QRCode.toCanvas(qrCanvas, qrUrlForBox(b.id), {width: 512, margin: 1}, (err)=>{ if(err) rej(err); else res(); }); }); const imgData = qrCanvas.toDataURL('image/png'); pdf.addImage(imgData, 'PNG', 15, 15, 120, 120); pdf.setFontSize(48); pdf.setTextColor(0,0,0); pdf.text(String(b.num), 75, 155, {align:'center'}); if(b.name){ pdf.setFontSize(14); pdf.text(b.name, 75, 168, {align:'center'}); } pdf.setFontSize(10); pdf.setTextColor(100,100,100); const g = DB.garages.find(x=>x.id===b.garageId); pdf.text(`${garageLabel(g)} / зона ${b.zoneId}`, 75, 178, {align:'center'}); pdf.save(`box_${b.num}.pdf`); toast('PDF сохранён'); }catch(e){ toast('Ошибка: '+e.message); }
}
async function generateAllStickersPDF(){
  toast('Готовим PDF…'); try{ await importQR(); await importJSPDF(); }catch(e){ toast('Нужен интернет'); return; }
  try{ const { jsPDF } = window.jspdf; const pdf = new jsPDF({unit:'mm', format:'a4'}); const boxes = DB.boxes.slice().sort((a,b)=>a.num-b.num); if(!boxes.length){ toast('Нет коробок'); return; } const cols = 4, rows = 6, marginX = 10, marginY = 12; const cellW = (210 - marginX*2) / cols; const cellH = (297 - marginY*2) / rows; let idx = 0;
    for(const b of boxes){ if(idx>0 && idx % (cols*rows) === 0) pdf.addPage(); const pos = idx % (cols*rows); const cx = marginX + (pos % cols)*cellW; const cy = marginY + Math.floor(pos/cols)*cellH; const qrCanvas = document.createElement('canvas'); await new Promise((res,rej)=>{ window.QRCode.toCanvas(qrCanvas, qrUrlForBox(b.id), {width: 300, margin: 1}, (err)=>{ if(err) rej(err); else res(); }); }); const imgData = qrCanvas.toDataURL('image/png'); const qrSize = Math.min(cellW, cellH) * 0.62; pdf.addImage(imgData, 'PNG', cx + (cellW-qrSize)/2, cy + 4, qrSize, qrSize); pdf.setFontSize(20); pdf.setTextColor(0,0,0); pdf.text(String(b.num), cx + cellW/2, cy + qrSize + 14, {align:'center'}); idx++; }
    pdf.save('garage_qr_all.pdf'); toast('PDF сохранён'); }catch(e){ toast('Ошибка: '+e.message); }
}
function exportBackup(){ const data = JSON.stringify(DB, null, 2); const blob = new Blob([data], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'garage_backup_'+new Date().toISOString().slice(0,10)+'.json'; a.click(); toast('Бэкап сохранён'); }
function importBackup(e){ const f = e.target.files[0]; if(!f) return; const r = new FileReader(); r.onload = ev=>{ try{ const data = JSON.parse(ev.target.result); if(!data.boxes || !data.garages) throw new Error('bad format'); if(!confirm('Заменить данные бэкапом?')) return; DB = data; if(!DB.settings) DB.settings = {theme:'system', bg:null}; save(); applyTheme(); navigate('/'); toast('Восстановлено'); }catch(err){ toast('Файл повреждён'); } }; r.readAsText(f); }
function manualScan(){ const num = prompt('Введите номер коробки:'); if(!num) return; const b = DB.boxes.find(x=>String(x.num)===String(num).trim()); if(b) navigate('/box/'+b.id); else toast('Не найдена'); }
function openScanner(){ if('BarcodeDetector' in window){ startCameraScanner(); } else { manualScan(); } }
async function startCameraScanner(){
  try{ const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}); const div = document.createElement('div'); div.id='scannerRoot'; div.innerHTML = `<div class="viewer" style="background:#000"><video autoplay playsinline style="width:100%;max-height:100%"></video><button class="close" onclick="stopScanner()">×</button><div style="position:absolute;bottom:40px;color:#fff;text-align:center;width:100%">Наведите на QR-код</div></div>`; document.body.appendChild(div); const video = div.querySelector('video'); video.srcObject = stream; const detector = new window.BarcodeDetector({formats:['qr_code']});
    const tick = async ()=>{ if(!document.getElementById('scannerRoot')) return; try{ const codes = await detector.detect(video); if(codes.length){ const url = codes[0].rawValue; const m = url.match(/#\/box\/([^\/]+)/); stopScanner(); if(m) navigate('/box/'+m[1]); else toast('QR не распознан'); return; } }catch(e){} requestAnimationFrame(tick); };
    requestAnimationFrame(tick); window._scannerStream = stream;
  }catch(e){ toast('Нет доступа к камере'); }
}
function stopScanner(){ if(window._scannerStream) window._scannerStream.getTracks().forEach(t=>t.stop()); const s = document.getElementById('scannerRoot'); if(s) s.remove(); }
function registerSW(){ if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); } }

Object.assign(window, {
  navigate, render, uiState, boxCard, openBoxModal, saveBox, closeModal, delBox, addItem, delItem, addPhoto, openViewer, generateBoxStickerPDF, generateAllStickersPDF, setTheme, pickBg, clearBg, exportBackup, importBackup, toggleFav, openDrawer, closeDrawer, openGarageModal, saveGarage, delGarage, openScanner, stopScanner, manualScan, askBoxAndGenerate, renderListResults, openGalleryViewer, replacePhoto
});
