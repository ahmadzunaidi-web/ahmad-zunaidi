import { createApi, todayKL } from "./data.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rm = (n, d = 2) => "RM " + Number(n || 0).toFixed(d);
const rmUp = (n) => "RM " + (Math.ceil(Number(n || 0) * 100 - 1e-9) / 100).toFixed(2);   // paparan caj: bundar ke atas sen
const D = (s) => new Date(s + "T00:00:00Z");
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(D(s).getTime() + n * 86400000));
const fmtLong = (s) => new Intl.DateTimeFormat("ms-MY", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(D(s));
const fmtShort = (s) => new Intl.DateTimeFormat("ms-MY", { timeZone: "UTC", day: "numeric", month: "short" }).format(D(s));
const MON = (y, m) => new Intl.DateTimeFormat("ms-MY", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m, 1)));
const INIT = ["A", "I", "S", "R", "K", "J", "S"]; // Ahad..Sabtu: I S R K J S A dalam grid; di sini indeks getUTCDay()
const MOODS = [["1", "Berat"], ["2", "Penat"], ["3", "Biasa"], ["4", "Baik"], ["5", "Ceria"]];
const AI_VERSION = "v1.3";

const S = {
  api: null, user: null, profile: null, status: null, tab: "diari",
  dates: new Map(), recent: [], q: "", searchOpen: false,
  cal: { y: 0, m: 0, sel: null, list: [] }, memories: [],
  ai: { module: null, history: [], busy: false, attach: [], est: null, estErr: "", risk: null, riskMsg: "", weekly: [], listenOnly: false, last: null, lastCharge: null },
  ed: null, today: todayKL(),
};
const root = () => $("#view");

// ------------------------------------------------------------------ util UI
let toastT;
function toast(msg, win = false) {
  const t = $("#toast"); t.textContent = msg; t.classList.toggle("win", win); t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), win ? 3800 : 2800);
}
const errMsg = (e) => {
  const c = e && (e.code || e.status);
  if (String(c) === "42501" || /row-level security/i.test(e?.message || "")) return "Langganan tamat atau pengesahan umur belum lengkap. Data anda kekal boleh dibaca dan dieksport.";
  if (!navigator.onLine) return "Tiada sambungan internet.";
  return "Sesuatu tidak kena. Cuba lagi sebentar.";
};
function confirmDialog({ title, body, ok = "Teruskan", danger = false, input = null }) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.innerHTML = `<form method="dialog" class="stack"><h2>${esc(title)}</h2><div>${body}</div>${input ? `<input type="text" id="dlgin" autocomplete="off" placeholder="${esc(input)}" aria-label="${esc(input)}">` : ""}
      <div class="row wrap" style="justify-content:flex-end"><button class="btn ghost" value="no">Batal</button><button class="btn ${danger ? "danger" : ""}" value="yes" id="dlgok">${esc(ok)}</button></div></form>`;
    document.body.appendChild(d);
    if (input) { const ok_ = $("#dlgok", d), inp = $("#dlgin", d); ok_.disabled = true; inp.addEventListener("input", () => { ok_.disabled = inp.value.trim() !== "PADAM"; }); }
    d.addEventListener("close", () => { const v = d.returnValue === "yes"; d.remove(); resolve(v); });
    d.showModal();
  });
}

// ------------------------------------------------------------------ data helpers
function streakInfo() {
  const has = (d) => S.dates.has(d);
  let d = has(S.today) ? S.today : addDays(S.today, -1), n = 0;
  while (has(d)) { n++; d = addDays(d, -1); }
  return { n, doneToday: has(S.today) };
}
async function loadDates() {
  const rows = await S.api.entryDates(addDays(S.today, -400));
  const m = new Map();
  for (const r of rows) { const o = m.get(r.entry_date) || { n: 0, moods: [] }; o.n++; if (r.mood) o.moods.push(r.mood); m.set(r.entry_date, o); }
  S.dates = m;
}
async function loadRecent() { S.recent = await S.api.entries({ q: S.q || undefined, limit: S.q ? 50 : 30 }); }
async function refreshStatus() { const s = await S.api.api({ action: "status" }); if (s.ok) S.status = s; return s; }

// ------------------------------------------------------------------ bootstrap
async function boot() {
  try { S.api = await createApi(); } catch { root().innerHTML = `<div class="hero"><h1>LEMBAR</h1><p>Tidak dapat memuatkan aplikasi. Semak sambungan anda.</p></div>`; return; }
  const sess = await S.api.session();
  if (!sess) return showLogin();
  S.user = sess.user;
  await start();
  S.api.onAuth((s) => { if (!s) location.replace("/app/"); });
}

function authError(e) {
  const code = e?.code || "", text = String(e?.message || "");
  if (code === "invalid_credentials" || /invalid login credentials/i.test(text)) return "Email atau kata laluan tak betul. Cuba lagi atau tetapkan semula kata laluan.";
  if (code === "email_not_confirmed") return "Sahkan email melalui pautan yang dihantar sebelum log masuk.";
  if (code === "user_already_exists" || /already registered/i.test(text)) return "Email ini sudah berdaftar. Pilih Log masuk.";
  if (code === "weak_password") return "Pilih kata laluan yang lebih kuat, sekurang-kurangnya 8 aksara.";
  if (e?.status === 429 || /rate limit|too many/i.test(text)) return "Terlalu banyak cubaan. Tunggu sebentar sebelum cuba lagi.";
  if (/fetch|network/i.test(text)) return "Sambungan terputus. Semak internet dan cuba lagi.";
  return "Tak dapat meneruskan. Cuba lagi sebentar lagi.";
}

function showLogin(msg = "", mode = new URLSearchParams(location.search).get("intent") === "signup" ? "signup" : "login", email = "") {
  document.body.classList.add("loggedout");
  $("#shell").hidden = true; $("#login").hidden = false;
  const signup = mode === "signup", reset = mode === "reset";
  $("#login").innerHTML = `<div class="hero">
    <div class="eyebrow">RUANG PERIBADI AWAK</div>
    <h1>${signup ? "Mulakan diari awak." : reset ? "Tetapkan semula kata laluan." : "Selamat kembali ke LEMBAR."}</h1>
    <p class="lead">${reset ? "Kami akan hantar pautan ke email awak." : "Tulis atau rakam. AI hanya bila awak minta."}</p>
    <form id="email-auth" class="card stack" aria-label="${signup ? "Daftar akaun" : reset ? "Pulihkan akaun" : "Log masuk"}">
      <label class="stack" for="auth-email">Email<input id="auth-email" type="email" autocomplete="email" inputmode="email" required maxlength="254" value="${esc(email)}" placeholder="nama@email.com"></label>
      ${reset ? "" : `<label class="stack" for="auth-password">Kata laluan<input id="auth-password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" ${signup ? 'minlength="8"' : ""} required maxlength="256" placeholder="${signup ? "Sekurang-kurangnya 8 aksara" : "Kata laluan awak"}"></label>`}
      ${signup ? `<label class="stack" for="auth-confirm">Ulang kata laluan<input id="auth-confirm" type="password" autocomplete="new-password" required minlength="8" maxlength="256"></label>` : ""}
      <button class="btn block" type="submit">${signup ? "Daftar dengan email" : reset ? "Hantar pautan pemulihan" : "Log masuk"}</button>
      <p class="xs muted" role="status" aria-live="polite" id="loginmsg">${esc(msg)}</p>
      <div class="row wrap">${signup || reset ? '<button type="button" class="btn ghost sm" data-auth-mode="login">Kembali ke log masuk</button>' : '<button type="button" class="btn ghost sm" data-auth-mode="signup">Belum ada akaun? Daftar</button><button type="button" class="btn ghost sm" data-auth-mode="reset">Lupa kata laluan?</button>'}</div>
      <p class="xs muted">Dengan meneruskan, awak bersetuju dengan <a href="/terma/">Terma</a> dan <a href="/privasi/">Polisi Privasi</a>. Untuk pengguna 18 tahun ke atas.</p>
    </form>
    <p class="xs muted">LEMBAR ialah sokongan kesejahteraan &amp; refleksi, bukan rawatan, bukan perkhidmatan krisis 24/7.</p>
  </div>`;
  const form = $("#email-auth");
  form.querySelectorAll("[data-auth-mode]").forEach(b => b.addEventListener("click", () => showLogin("", b.dataset.authMode, $("#auth-email").value)));
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    const email = $("#auth-email").value.trim(), password = $("#auth-password")?.value;
    if (signup && password !== $("#auth-confirm").value) { $("#loginmsg").textContent = "Kedua-dua kata laluan mesti sama."; return; }
    const buttons = [...form.querySelectorAll("button")];
    if (buttons[0].disabled) return;
    buttons.forEach(b => b.disabled = true);
    $("#loginmsg").textContent = "Sebentar…";
    try {
      if (reset) {
        await S.api.resetPassword(email);
        $("#loginmsg").textContent = "Jika email ini berdaftar, pautan pemulihan akan dihantar. Semak inbox dan spam. Buka pautan dalam browser yang sama.";
      } else {
        const result = signup ? await S.api.signUpEmail(email, password) : await S.api.signInEmail(email, password);
        if (result?.session) { form.reset(); location.replace("/app/"); }
        else { form.reset(); $("#loginmsg").textContent = "Semak email untuk pautan pengesahan, kemudian log masuk."; }
      }
    } catch (e) { $("#loginmsg").textContent = authError(e); }
    finally { buttons.forEach(b => b.disabled = false); }
  });
}

async function start() {
  $("#login").hidden = true; $("#shell").hidden = false; document.body.classList.remove("loggedout");
  S.profile = await S.api.profile().catch(() => null);
  if (!S.profile || !S.profile.adult_confirmed_at) await ageGate();
  const [st] = await Promise.all([refreshStatus(), loadDates().catch(() => {}), loadRecent().catch(() => {})]);
  const now = D(S.today); S.cal = { y: now.getUTCFullYear(), m: now.getUTCMonth(), sel: S.today, list: [] };
  const qs = new URLSearchParams(location.search);
  if (qs.get("paid") === "1" && qs.get("pid")) { history.replaceState(null, "", "/app/"); checkPayment(qs.get("pid")); }
  render();
}

async function ageGate() {
  const d = document.createElement("dialog"); d.setAttribute("aria-labelledby", "agt");
  d.innerHTML = `<form method="dialog" class="stack"><h2 id="agt">Sebelum bermula</h2>
    <p class="muted">LEMBAR untuk pengguna berumur 18 tahun ke atas pada fasa awal ini. Catatan awak peribadi dan hanya awak boleh membacanya.</p>
    <label class="check"><input type="checkbox" id="ag1"><span>Saya berumur 18 tahun ke atas.</span></label>
    <label class="check"><input type="checkbox" id="ag2"><span>Saya telah membaca <a href="/privasi/" target="_blank" rel="noopener">Polisi Privasi</a> dan <a href="/terma/" target="_blank" rel="noopener">Terma</a>.</span></label>
    <p class="xs muted" id="agerr" role="alert"></p>
    <button class="btn block" id="agok" value="ok" disabled>Mula menulis</button>
    <button class="btn ghost block" type="button" id="agout">Log keluar</button></form>`;
  d.addEventListener("cancel", (e) => e.preventDefault());
  document.body.appendChild(d); d.showModal();
  const chk = () => { $("#agok", d).disabled = !($("#ag1", d).checked && $("#ag2", d).checked); };
  $("#ag1", d).onchange = chk; $("#ag2", d).onchange = chk;
  $("#agout", d).onclick = async () => { await S.api.signOut(); location.replace("/app/"); };
  await new Promise((res) => {
    $("#agok", d).onclick = async (e) => {
      e.preventDefault(); $("#agok", d).disabled = true;
      try {
        const name = S.user?.user_metadata?.full_name || S.user?.user_metadata?.name || (S.user?.email || "").split("@")[0];
        S.profile = await S.api.saveProfile({ adult_confirmed_at: new Date().toISOString(), display_name: String(name || "").slice(0, 80) || null }, S.user.id);
        d.close(); res();
      } catch (er) { $("#agerr", d).textContent = "Tidak dapat menyimpan. Cuba lagi."; chk(); }
    };
  });
  d.remove();
}

// ------------------------------------------------------------------ render
const ICON = {
  diari: '<svg viewBox="0 0 24 24"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z"/><path d="M9 8h6M9 12h6"/></svg>',
  kalendar: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
  ai: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
  profil: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
};
function render() {
  $$("#tabs button").forEach((b) => { if (b.dataset.tab === S.tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  const v = root();
  v.innerHTML = ({ diari: viewDiari, kalendar: viewKalendar, ai: viewAI, profil: viewProfil }[S.tab])();
  window.scrollTo({ top: 0 });
  const after = { kalendar: afterKalendar, profil: afterProfil }[S.tab]; if (after) after();
}
function go(tab) { S.tab = tab; render(); }

// ---------------------------------------------------------------- DIARI
function entryCard(e) {
  const d = D(e.entry_date), snip = (e.body || (e.voice_path ? "Rakaman suara" : "")).slice(0, 160);
  const kind = e.kind === "reflection" ? '<span class="chip">Refleksi AI</span>' : e.kind === "letter" ? '<span class="chip">Surat</span>' : "";
  return `<button class="entry" data-act="open" data-id="${esc(e.id)}"><div class="d"><b>${d.getUTCDate()}</b><span>${esc(new Intl.DateTimeFormat("ms-MY", { timeZone: "UTC", month: "short" }).format(d))}</span></div>
    <div class="grow"><div class="t row">${e.mood ? `<span class="mood-dot m${e.mood}" title="Mood ${e.mood}"></span>` : ""}<span>${esc(e.title || "Tanpa tajuk")}</span></div><div class="s">${esc(snip)}</div>
    <div class="row xs muted" style="margin-top:4px">${e.voice_path ? "Suara" : ""}${kind}</div></div></button>`;
}
const MILESTONES = [3, 7, 14, 30, 60];
const PEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4z"/><path d="M14 7l3 3"/></svg>';
const MONS = ["JAN", "FEB", "MAC", "APR", "MEI", "JUN", "JUL", "OGO", "SEP", "OKT", "NOV", "DIS"];
function greeting() {
  const hr = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const g = hr < 12 ? "Selamat pagi" : hr < 15 ? "Selamat tengah hari" : hr < 19 ? "Selamat petang" : "Selamat malam";
  const nm = String(S.profile?.display_name || "").trim().split(/\s+/)[0];
  return nm && !nm.includes("@") ? `${g}, ${nm}` : g;
}
function stampCard(n, doneToday) {
  const SLOTS = 30, ms = new Set([3, 7, 14, 30]);
  const filled = n === 0 ? 0 : ((n - 1) % SLOTS) + 1;
  const next = MILESTONES.find((m) => m > filled) || 30, left = next - filled;
  const monthDays = [...S.dates.keys()].filter((d) => d.startsWith(S.today.slice(0, 7))).length;
  const total = [...S.dates.values()].reduce((a, b) => a + b.n, 0);
  const note = n === 0 ? "Tulis satu baris hari ini untuk dapat cop pertama." : doneToday ? (filled >= 30 ? "Kad penuh. Kad baharu bermula esok." : `Tinggal ${left} hari ke pencapaian ${next} hari.`) : `Tulis hari ini untuk sambung ke cop ke-${filled + 1}.`;
  let slots = "";
  for (let i = 1; i <= SLOTS; i++) slots += `<i class="slot${i <= filled ? " on" : ""}${ms.has(i) ? " ms" : ""}${i === filled ? " cur" : ""}">${ms.has(i) && i > filled ? i : ""}</i>`;
  return `<section class="stampcard" aria-label="Kad cop kemajuan awak">
    <div class="sc-head"><span class="t">Kad cop LEMBAR</span><span class="xs muted num">${filled} / ${SLOTS}</span></div>
    <div class="sc-big"><b class="num">${n}</b><span>hari berturut-turut</span></div>
    <p class="sc-next">${esc(note)}</p>
    <div class="slots" role="img" aria-label="${filled} daripada ${SLOTS} cop pada kad ini">${slots}</div>
    <p class="sc-key"><i></i>Bulatan merah ialah pencapaian: 3, 7, 14 dan 30 hari.</p>
    ${total ? `<div class="sc-foot"><span><b>${total}</b> catatan</span><span><b>${S.dates.size}</b> hari menulis</span><span><b>${monthDays}</b> hari bulan ini</span></div>` : ""}
  </section>`;
}
function viewDiari() {
  const { n, doneToday } = streakInfo();
  const td = D(S.today);
  const sub = !S.status ? "" : S.status.subscription.required && !S.status.subscription.active
    ? `<div class="card" style="border-color:var(--warn)"><b>Langganan tamat.</b> Data awak kekal boleh dibaca dan dieksport. <button class="btn sm soft" data-act="tab" data-tab="profil" style="margin-top:8px">Sambung RM2/bulan</button></div>` : "";
  const page = doneToday
    ? `<section class="sheetpage done" aria-labelledby="th"><span class="stamp">Selesai</span>
        <h2 class="q" id="th">Bagus. Catatan hari ini sudah disimpan.</h2>
        <p class="sub">Awak boleh tambah lagi bila-bila masa.</p>
        <div class="alt"><button class="btn" data-act="new" data-mode="write">+ Tambah lagi</button><button class="btn soft" data-act="new" data-mode="voice">Rakam suara</button></div></section>`
    : `<section class="sheetpage" aria-labelledby="th"><span class="tag hand">langkah seterusnya</span>
        <h2 class="q" id="th">Apa cerita hari ini?</h2>
        <p class="sub">Satu baris pun cukup. Mula kecil sahaja.</p>
        <button class="writeline" data-act="new" data-mode="write" aria-label="Tulis satu baris"><span class="ph">Tulis satu baris</span><span class="pen">${PEN}</span></button>
        <div class="alt"><button class="btn soft sm" data-act="new" data-mode="voice">Atau rakam suara</button></div></section>`;
  const quick = doneToday ? "" : `<section class="quick" aria-label="Mood pantas"><span class="hand">bagaimana rasa awak? (pilihan)</span>
      <div class="stickers" role="group" aria-label="Pilih mood">${MOODS.map(([v, l]) => `<button type="button" data-act="quickmood" data-v="${v}"><span class="dot m${v}"></span>${l}</button>`).join("")}</div></section>`;
  return `<div class="dash"><div class="topbar"><span class="brand">LEMBAR</span><button class="btn sm ghost" data-act="search" aria-expanded="${S.searchOpen}">Cari</button></div>
  <div class="dayhead"><div class="deskcal" aria-hidden="true"><span>${MONS[td.getUTCMonth()]}</span><b class="num">${td.getUTCDate()}</b></div>
    <div><h1 class="hi hand" style="color:var(--ink);font-size:2rem">${esc(greeting())}</h1><div class="dd">${esc(fmtLong(S.today))}</div></div></div>
  ${sub}${page}${quick}${stampCard(n, doneToday)}
  ${S.searchOpen ? `<div class="search"><label class="sr" for="q">Cari dalam diari</label><input id="q" type="search" placeholder="Cari tajuk atau isi…" value="${esc(S.q)}" autocomplete="off"></div>` : ""}
  <div class="sec-h"><h3>${S.q ? "Hasil carian" : "Terkini"}</h3></div>
  <div class="stack" style="gap:0">${S.recent.length ? S.recent.map(entryCard).join("") : `<div class="empty card">${S.q ? "Tiada padanan." : "Belum ada catatan. Ketik garis di atas untuk bermula."}</div>`}</div></div>`;
}

// ---------------------------------------------------------------- KALENDAR
function viewKalendar() {
  const { y, m } = S.cal, first = new Date(Date.UTC(y, m, 1)), lead = first.getUTCDay(), days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  let cells = ["A", "I", "S", "R", "K", "J", "S"].map((x, i) => `<div class="h" aria-hidden="true">${["Ahd", "Isn", "Sel", "Rab", "Kha", "Jum", "Sab"][i]}</div>`).join("");
  for (let i = 0; i < lead; i++) cells += `<button class="blank" tabindex="-1" aria-hidden="true"></button>`;
  for (let d = 1; d <= days; d++) {
    const ds = iso(new Date(Date.UTC(y, m, d))), info = S.dates.get(ds);
    const avg = info && info.moods.length ? Math.round(info.moods.reduce((a, b) => a + b, 0) / info.moods.length) : 0;
    cells += `<button data-act="day" data-d="${ds}" class="${info ? "has" : ""} ${ds === S.today ? "today" : ""} ${ds === S.cal.sel ? "sel" : ""}" aria-label="${esc(fmtLong(ds))}${info ? ", ada catatan" : ""}" aria-pressed="${ds === S.cal.sel}">${d}${avg ? `<span class="mood-dot m${avg}"></span>` : ""}</button>`;
  }
  return `<div class="topbar"><span class="brand">LEMBAR</span><span class="chip">${esc(MON(y, m))}</span></div>
  <div class="row between" style="margin-bottom:10px"><button class="btn sm ghost" data-act="month" data-n="-1" aria-label="Bulan sebelum">‹</button><h2 style="margin:0">${esc(MON(y, m))}</h2><button class="btn sm ghost" data-act="month" data-n="1" aria-label="Bulan seterusnya">›</button></div>
  <div class="cal" role="group" aria-label="Kalendar">${cells}</div>
  <div class="card stack" style="margin-top:16px" id="dayBox"></div>
  <div class="card stack" style="margin-top:16px"><h3 style="margin:0">Corak mood 30 hari</h3><div id="moodBars"></div><p class="xs muted" style="margin:0">Hanya mood yang awak pilih sendiri. Bukan skor klinikal dan bukan diagnosis.</p></div>
  <div class="card stack" style="margin-top:16px" id="memBox"><h3 style="margin:0">Pada hari ini dahulu</h3><div class="muted small">Mencari…</div></div>`;
}
async function afterKalendar() {
  const box = $("#dayBox"); const sel = S.cal.sel;
  try { S.cal.list = await S.api.entries({ from: sel, to: sel, limit: 20 }); } catch { S.cal.list = []; }
  box.innerHTML = `<div class="row between"><h3 style="margin:0">${esc(fmtLong(sel))}</h3><button class="btn sm" data-act="new" data-date="${sel}" data-mode="write">+ Tulis</button></div>` +
    (S.cal.list.length ? `<div class="stack">${S.cal.list.map(entryCard).join("")}</div>` : `<p class="muted small" style="margin:0">Tiada catatan pada hari ini.</p>`);
  // carta mood 30 hari: satu skala (1-5), garis dasar dan grid halus, bacaan bila disentuh
  const pts = [];
  for (let i = 29; i >= 0; i--) {
    const d = addDays(S.today, -i), info = S.dates.get(d), avg = info && info.moods.length ? info.moods.reduce((a, b) => a + b, 0) / info.moods.length : 0;
    pts.push({ d, avg });
  }
  S.cal.pts = pts;
  const logged = pts.filter((p) => p.avg), mean = logged.length ? logged.reduce((a, p) => a + p.avg, 0) / logged.length : 0;
  S.cal.mSummary = logged.length ? `Purata ${mean.toFixed(1)} · ${logged.length} daripada 30 hari ada mood` : "Belum ada mood dipilih dalam 30 hari ini.";
  const bars = pts.map((p, i) => `<button type="button" class="mb ${p.avg ? "on" : ""}" data-act="mbar" data-i="${i}" tabindex="-1" aria-label="${esc(fmtShort(p.d))}${p.avg ? ", mood " + p.avg.toFixed(1) : ", tiada mood"}"><i style="height:${p.avg ? (p.avg / 5 * 100).toFixed(0) + "%" : "2px"};${p.avg ? `background:var(--m${Math.round(p.avg)})` : ""}"></i></button>`).join("");
  const rows = logged.slice().reverse().map((p) => `<li><span>${esc(fmtShort(p.d))}</span><b>${esc(MOODS[Math.round(p.avg) - 1][1])} (${p.avg.toFixed(1)})</b></li>`).join("");
  $("#moodBars").innerHTML = `<div class="mchart" role="img" aria-label="Graf mood 30 hari terakhir. ${esc(S.cal.mSummary)}">
    <div class="yax" aria-hidden="true"><span style="top:0">Ceria</span><span style="bottom:0;transform:none">Berat</span></div>
    <div class="plot"><div class="gl" style="top:0"></div><div class="gl" style="top:50%"></div><div class="gl base" style="bottom:0"></div><div class="mbars">${bars}</div></div>
    <div class="xax" aria-hidden="true"><span>30 hari lalu</span><span>Hari ini</span></div></div>
    <div class="mread" id="mread" role="status" aria-live="polite">${esc(S.cal.mSummary)}</div>
    <div class="mkey" aria-hidden="true">${MOODS.map(([v, l]) => `<span class="row" style="gap:4px"><i class="m${v}"></i>${l}</span>`).join("")}</div>
    ${logged.length ? `<details><summary class="small">Lihat sebagai jadual</summary><ul class="list" style="margin-top:8px">${rows}</ul></details>` : ""}`;
  // kenangan: tarikh sama (bulan-hari) tahun lalu
  const md = S.today.slice(5), prior = [...S.dates.keys()].filter((d) => d.slice(5) === md && d < S.today).sort().reverse().slice(0, 3);
  let mem = [];
  for (const d of prior) { try { mem.push(...(await S.api.entries({ from: d, to: d, limit: 2 }))); } catch { /* abaikan */ } }
  $("#memBox").innerHTML = `<h3 style="margin:0">Pada hari ini dahulu</h3>` + (mem.length ? `<div class="stack">${mem.map(entryCard).join("")}</div>` : `<p class="muted small" style="margin:0">Belum ada catatan pada tarikh ini dalam tahun-tahun lalu. Teruskan menulis; kenangan akan muncul di sini.</p>`);
}

// ---------------------------------------------------------------- PENYUNTING
async function openEditor({ id = null, date = null, mode = "write" } = {}) {
  let e = { id: null, entry_date: date || S.today, title: "", body: "", mood: null, voice_path: null, voice_seconds: null, kind: "diary", parent_id: null };
  if (id) {
    const f = [...S.recent, ...S.cal.list].find((x) => x.id === id) || (await S.api.entries({ ids: [id], limit: 1 }))[0];
    if (!f) return toast("Catatan tidak dijumpai.");
    e = { ...f };
  }
  S.ed = { e, dirty: false, saving: false, timer: null, rec: null, existed: !!id, firstOfDay: !S.dates.has(e.entry_date) };
  const sh = $("#editor"); sh.classList.add("open"); document.body.style.overflow = "hidden";
  drawEditor();
  if (mode === "voice" && !e.voice_path) startRecording();
  else if (!id) $("#bodyin").focus();
}
function drawEditor() {
  const { e } = S.ed, sh = $("#editor"), maxS = S.status?.voice?.max_seconds || 180;
  sh.innerHTML = `<div class="in"><div class="bar"><button class="btn sm ghost" data-act="ed-close">‹ Tutup</button><span class="saved" id="saved" role="status" aria-live="polite"></span>
    <button class="btn sm soft" data-act="ed-save">Simpan</button></div>
    <div class="eyebrow">${esc(fmtLong(e.entry_date))}${e.kind !== "diary" ? " · " + (e.kind === "reflection" ? "Refleksi AI" : "Surat") : ""}</div>
    <label class="sr" for="titlein">Tajuk</label><input id="titlein" class="titlein" type="text" maxlength="160" placeholder="Tajuk (pilihan)" value="${esc(e.title || "")}">
    <label class="sr" for="bodyin">Isi catatan</label><textarea id="bodyin" class="bodyin" maxlength="20000" placeholder="Tulis apa sahaja. Tiada yang salah di sini.">${esc(e.body || "")}</textarea>
    <div class="stack">
      <div><div class="small muted" style="margin-bottom:6px">Bagaimana rasa hari ini? (pilihan)</div>
        <div class="moods" role="group" aria-label="Mood">${MOODS.map(([v, l]) => `<button type="button" data-act="mood" data-v="${v}" aria-pressed="${String(e.mood) === v}"><span class="mood-dot m${v}"></span>${l}</button>`).join("")}</div></div>
      <div id="voiceBox"></div>
      <div class="soon"><span class="chip warn">Akan datang</span><span class="small">Lampiran gambar kenangan. Belum tersedia dalam V1.</span></div>
      <div class="row wrap" style="justify-content:space-between">
        ${e.id ? `<button class="btn sm danger" data-act="ed-del">Padam</button>` : "<span></span>"}
        ${e.id && e.kind === "diary" && S.status?.ai_ready ? `<button class="btn sm ghost" data-act="ed-ai">Refleksi AI (pilihan)</button>` : ""}
      </div></div></div>`;
  drawVoice();
  $("#titlein").addEventListener("input", (ev) => { S.ed.e.title = ev.target.value; markDirty(); });
  $("#bodyin").addEventListener("input", (ev) => { S.ed.e.body = ev.target.value; markDirty(); });
}
function markDirty() {
  S.ed.dirty = true; $("#saved").textContent = "";
  clearTimeout(S.ed.timer); S.ed.timer = setTimeout(() => saveEditor(true), 1200);
}
async function saveEditor(silent = false) {
  const ed = S.ed; if (!ed || ed.saving) return ed ? ed.pending = true : null;
  const e = ed.e;
  if (!e.body.trim() && !e.voice_path) { if (!silent) toast("Tulis sesuatu atau rakam dahulu."); return; }
  ed.saving = true; clearTimeout(ed.timer);
  try {
    const wasNew = !e.id;
    const saved = await S.api.saveEntry({ ...e, body: e.body }, S.user.id);
    e.id = saved.id; ed.dirty = false;
    const sv = $("#saved"); if (sv) sv.textContent = "✓ Disimpan";
    if (wasNew || ed.firstOfDay) { await loadDates(); }
    if (wasNew && ed.firstOfDay && e.entry_date === S.today) {
      ed.firstOfDay = false; const { n } = streakInfo();
      const ms = [3, 7, 14, 30, 60, 100, 365].includes(n);
      toast(ms ? `Pencapaian: ${n} hari berturut-turut` : `Catatan hari ini selesai · hari ke-${n}`, true);
    }
    await loadRecent();
    if (!$("#editor").classList.contains("open")) render();
  } catch (er) {
    const sv = $("#saved"); if (sv) sv.textContent = "";
    toast(errMsg(er));
  } finally { ed.saving = false; if (ed.pending) { ed.pending = false; if (ed.dirty) saveEditor(true); } }
}
async function closeEditor() {
  const ed = S.ed; if (!ed) return;
  if (ed.rec) await stopRecording();
  clearTimeout(ed.timer);
  if (ed.dirty && (ed.e.body.trim() || ed.e.voice_path)) await saveEditor(true);
  $("#editor").classList.remove("open"); document.body.style.overflow = ""; S.ed = null;
  await Promise.all([loadDates().catch(() => {}), loadRecent().catch(() => {})]); render();
}

// ---- suara
function drawVoice() {
  const ed = S.ed, e = ed.e, box = $("#voiceBox"); if (!box) return;
  if (ed.rec) { box.innerHTML = `<div class="rec"><span class="pulse"></span><b id="rtime">0:00</b><span class="muted small grow">Sedang merakam…</span><button class="btn sm" data-act="rec-stop">Henti</button></div>`; return; }
  if (e.voice_path) {
    box.innerHTML = `<div class="stack"><div class="small muted">Rakaman suara · ${Math.floor((e.voice_seconds || 0) / 60)}:${String((e.voice_seconds || 0) % 60).padStart(2, "0")}</div><audio id="aud" controls preload="none"></audio>
      <div class="row"><a class="btn sm ghost" id="audDl" href="#" download>Muat turun</a><button class="btn sm danger" data-act="voice-del">Buang rakaman</button></div></div>`;
    S.api.voiceUrl(e.voice_path).then((u) => { const a = $("#aud"); if (a && u) { a.src = u; const dl = $("#audDl"); if (dl) dl.href = u; } }).catch(() => {});
    return;
  }
  box.innerHTML = `<button class="btn soft block" data-act="rec-start">Rakam voice note (maks ${Math.round((S.status?.voice?.max_seconds || 180) / 60)} minit)</button>`;
}
async function startRecording() {
  const ed = S.ed; if (!ed) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast("Pelayar ini tidak menyokong rakaman suara.");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported?.(m)) || "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [];
    const t0 = Date.now(), max = S.status?.voice?.max_seconds || 180;
    rec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
    ed.rec = { rec, stream, chunks, t0, mime: rec.mimeType || mime || "audio/webm", max };
    rec.start(); drawVoice();
    ed.rec.tick = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000), el = $("#rtime"); if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      if (s >= max) stopRecording();
    }, 250);
  } catch { toast("Akses mikrofon tidak dibenarkan."); }
}
function stopRecording() {
  const ed = S.ed; if (!ed || !ed.rec) return Promise.resolve();
  const r = ed.rec; clearInterval(r.tick);
  return new Promise((resolve) => {
    r.rec.onstop = async () => {
      r.stream.getTracks().forEach((t) => t.stop()); ed.rec = null;
      const secs = Math.max(1, Math.round((Date.now() - r.t0) / 1000)), blob = new Blob(r.chunks, { type: r.mime.split(";")[0] });
      const maxBytes = (S.status?.voice?.max_mb || 5) * 1024 * 1024;
      if (blob.size > maxBytes) { toast("Rakaman terlalu besar. Cuba lebih pendek."); drawVoice(); return resolve(); }
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      try { ed.e.voice_path = await S.api.uploadVoice(blob, ext, S.user.id); ed.e.voice_seconds = secs; ed.dirty = true; drawVoice(); await saveEditor(true); }
      catch (er) { toast(errMsg(er)); drawVoice(); }
      resolve();
    };
    try { r.rec.stop(); } catch { resolve(); }
  });
}

// ---------------------------------------------------------------- AI
const AIMODS = [
  { id: "listen", n: "Dengar sahaja", d: "Ruang meluah. Tiada nasihat melainkan awak minta.", t: "Pendengar empati", ic: "D" },
  { id: "organize", n: "Susun fikiran", d: "CBT ringan: kaitan situasi, fikiran, perasaan, tindakan. Bukan diagnosis.", t: "Kira-kira 4 minit", ic: "S" },
  { id: "weekly", n: "Refleksi mingguan", d: "Tema yang muncul daripada catatan yang awak pilih, lengkap dengan tarikh sumber.", t: "7 hari terakhir", ic: "M" },
  { id: "values", n: "Nilai & tindakan", d: "ACT: apa yang penting, terima perasaan, satu langkah kecil.", t: "Kira-kira 5 minit", ic: "N" },
  { id: "letter", n: "Surat kepada diri", d: "Draf surat penuh belas ihsan daripada kata-kata awak sendiri.", t: "Boleh disunting", ic: "U" },
];
const INTRO = {
  listen: "Saya di sini. Apa yang ada dalam fikiran awak sekarang? Awak boleh tulis sebanyak atau sesedikit mana yang awak mahu.",
  organize: "Mari kita susun perlahan-lahan. Ceritakan satu situasi yang masih bermain dalam fikiran awak. Saya akan tanya dahulu sebelum bantu lebih jauh.",
  weekly: "Pilih catatan yang awak benarkan saya baca, kemudian tekan hantar. Saya hanya akan merujuk catatan yang dipilih.",
  values: "Cuba ceritakan sesuatu yang awak rasa penting kepada awak, atau sesuatu yang terasa bertentangan dengan apa yang awak pentingkan.",
  letter: "Awak mahu menulis surat kepada diri yang mana: diri masa lalu atau diri masa depan? Ceritakan sedikit, nanti saya susunkan draf.",
};
function viewAI() {
  const a = S.ai, p = S.profile || {};
  if (a.module === "breathe") return viewBreathe();
  if (!p.ai_consent_at) return `<div class="topbar"><span class="brand">LEMBAR</span></div><h1>AI</h1>
    <div class="card stack"><span class="chip">Pilihan sepenuhnya</span><h2>Diari tetap diari. AI hanya bila awak minta.</h2>
    <p class="muted">Tiada analisis automatik. Teks hanya dihantar kepada penyedia AI apabila awak tekan hantar, dan bayaran dipaparkan dahulu. Awak boleh tarik balik bila-bila masa.</p>
    <ul class="small muted" style="padding-left:18px;margin:0"><li>AI tidak mendiagnosis dan bukan pengganti profesional.</li><li>Jika risiko bahaya dikesan, bantuan manusia diutamakan dan <b>tiada kredit ditolak</b>.</li><li>Memori AI hanya fakta yang awak luluskan, boleh disemak dan dipadam.</li></ul>
    <label class="check"><input type="checkbox" id="aic"><span>Saya faham dan setuju teks yang saya pilih dihantar kepada penyedia AI untuk dianalisis, hanya apabila saya menekan hantar. <a href="/privasi/" target="_blank" rel="noopener">Baca privasi</a>.</span></label>
    <button class="btn block" data-act="ai-consent" id="aiok" disabled>Aktifkan refleksi AI</button></div>
    ${breatheCard()}`;
  if (!S.status?.ai_ready) return `<div class="topbar"><span class="brand">LEMBAR</span></div><h1>AI</h1>
    <div class="card tint stack"><span class="chip warn">Akan dibuka</span><h2>Refleksi AI belum dibuka</h2><p class="muted" style="margin:0">Kami sedang menyiapkan ujian keselamatan sebelum membukanya. Diari awak berfungsi seperti biasa.</p></div>${breatheCard()}`;
  if (!a.module) return `<div class="topbar"><span class="brand">LEMBAR</span><span class="chip">${S.status.wallet.unlimited ? "Kredit tanpa had" : "Baki " + esc(rm(S.status.wallet.available_rm))}</span></div><h1>Refleksi AI</h1>
    <p class="muted">Pilih apa yang awak perlukan. Awak boleh berhenti bila-bila masa.</p>
    <div class="mods">${AIMODS.map((m) => `<button class="mod" data-act="ai-mod" data-m="${m.id}"><span class="ic">${m.ic}</span><span class="grow"><b>${esc(m.n)}</b><br><span class="small muted">${esc(m.d)}</span><br><span class="xs muted">${esc(m.t)}</span></span></button>`).join("")}</div>
    ${breatheCard()}<p class="xs muted" style="margin-top:14px">Sokongan kesejahteraan &amp; refleksi, bukan rawatan, bukan perkhidmatan krisis 24/7.</p>`;
  const mod = AIMODS.find((m) => m.id === a.module);
  const msgs = a.history.map((m) => `<div class="bubble ${m.role === "user" ? "me" : "ai"}">${m.role === "user" ? "" : `<span class="who">LEMBAR</span>`}${esc(m.content)}</div>`).join("");
  const risk = a.risk ? `<div class="risk stack" role="alert"><div style="white-space:pre-wrap">${esc(a.riskMsg)}</div><ul class="list">${a.risk.map((r) => `<li><span>${esc(r.name)}</span><a href="tel:${esc(String(r.contact).replace(/[^\d+]/g, ""))}">${esc(r.contact)}</a></li>`).join("")}</ul>
    <div class="row wrap"><button class="btn sm soft" data-act="ai-riskok">Saya selamat, teruskan dengan lembut</button><button class="btn sm ghost" data-act="ai-stop">Tutup</button></div></div>` : "";
  const weekly = a.module === "weekly" ? `<div class="card stack"><h3 style="margin:0">Catatan yang akan dihantar</h3>${a.weekly.length ? a.weekly.map((w) => `<label class="check"><input type="checkbox" data-act="ai-wk" value="${esc(w.id)}" ${a.attach.includes(w.id) ? "checked" : ""}><span><b>${esc(fmtShort(w.entry_date))}</b> · ${esc((w.title || w.body || "").slice(0, 60))}</span></label>`).join("") : `<p class="muted small" style="margin:0">Tiada catatan dalam 7 hari terakhir.</p>`}</div>` : "";
  const attached = a.module !== "weekly" && a.attach.length ? `<div class="chip">Merujuk ${a.attach.length} catatan <button class="btn sm ghost" style="min-height:28px;padding:0 8px" data-act="ai-detach" aria-label="Buang rujukan">×</button></div>` : "";
  return `<div class="topbar"><button class="btn sm ghost" data-act="ai-stop">‹ Kembali</button><span class="chip">${S.status.wallet.unlimited ? "Kredit tanpa had" : "Baki " + esc(rm(S.status.wallet.available_rm))}</span></div>
    <h1 style="font-size:1.4rem">${esc(mod.n)}</h1>
    <div class="stack" id="chat"><div class="bubble ai"><span class="who">LEMBAR</span>${esc(INTRO[a.module])}</div>${msgs}${a.busy ? `<div class="bubble ai muted" aria-live="polite">Sedang mendengar…</div>` : ""}${risk}</div>
    ${a.last ? `<div class="cost" style="margin-top:12px">Caj sebenar: <b>${esc(rmUp(a.lastCharge))}</b>${a.lastCharge === 0 ? " (percuma)" : ""} · ${S.status.wallet.unlimited ? "Kredit tanpa had" : "Baki " + esc(rm(S.status.wallet.balance_rm))}</div>
      <div class="row wrap" style="margin-top:8px">${a.module === "letter" || a.module === "weekly" || a.module === "values" ? `<button class="btn sm soft" data-act="ai-save">Simpan sebagai catatan</button>` : ""}<button class="btn sm ghost" data-act="ai-clear">Padam perbualan</button></div>` : ""}
    ${weekly}
    <div class="stack" style="margin-top:14px">${attached}
      <label class="sr" for="aimsg">Mesej anda</label><textarea id="aimsg" class="short" maxlength="4000" placeholder="${a.module === "weekly" ? "Tambah nota (pilihan)…" : "Tulis di sini…"}"></textarea>
      <label class="check"><input type="checkbox" id="aiListen" ${a.listenOnly ? "checked" : ""}><span class="small">Saya cuma mahu menulis, jangan beri nasihat.</span></label>
      <div class="cost" id="estBox" aria-live="polite">${estimateText()}</div>
      <div class="row"><button class="btn grow" data-act="ai-send" id="aisend" ${a.busy || !a.est ? "disabled" : ""}>${a.est ? `Hantar · maks ${esc(rmUp(a.est.max_charge_rm))}` : "Hantar"}</button><button class="btn ghost" data-act="ai-stop">Berhenti</button></div>
      <p class="xs muted" style="margin:0">Dengan menekan Hantar, awak bersetuju teks ini (dan catatan terpilih) dihantar kepada penyedia AI. Caj sebenar mengikut penggunaan dan tidak melebihi jumlah maksimum.</p></div>`;
}
function estimateText() {
  const a = S.ai; if (a.estErr) return esc(a.estErr);
  if (!a.est) return "Caj maksimum dikira bila awak mula menulis…";
  if (a.est.wallet?.unlimited) return "Akses percuma · kredit AI tanpa had · tiada potongan kredit.";
  return `Caj maksimum <b>${esc(rmUp(a.est.max_charge_rm))}</b> · Baki tersedia <b>${esc(rm(a.est.wallet.available_rm))}</b>${a.est.enough ? "" : ` · <b style="color:var(--danger)">Baki tidak cukup</b>`}`;
}
function breatheCard() {
  return `<div class="card tint row between" style="margin-top:14px"><div><b>Nafas &amp; grounding</b><div class="small muted">2 minit · percuma · tanpa AI</div></div><button class="btn sm" data-act="ai-breathe">Mula</button></div>`;
}
let breatheT;
function viewBreathe() {
  setTimeout(() => {
    const el = $("#bt"); if (!el) return; const ph = ["Tarik nafas…", "Tahan…", "Hembus perlahan…"], dur = [4000, 4000, 6000]; let i = 0, rounds = 0;
    const tick = () => { if (!$("#bt")) return; el.textContent = ph[i]; $("#bn").textContent = `Pusingan ${rounds + 1} daripada 8`; breatheT = setTimeout(() => { i = (i + 1) % 3; if (i === 0) rounds++; if (rounds >= 8) { $("#bt").textContent = "Selesai. Bagus."; $("#bn").textContent = "Awak telah menyediakan ruang untuk diri sendiri."; return; } tick(); }, dur[i]); };
    tick();
  }, 0);
  return `<div class="topbar"><button class="btn sm ghost" data-act="ai-stop">‹ Kembali</button></div><h1>Nafas &amp; grounding</h1><p class="muted">Ikut bulatan. Tiada yang perlu dibuat dengan betul.</p>
    <div class="breath" aria-hidden="true"></div><p id="bt" class="big" style="font-size:1.4rem;text-align:center" role="status" aria-live="polite"></p><p id="bn" class="muted" style="text-align:center"></p>
    <ul class="small muted"><li>Rasa kaki di lantai.</li><li>Namakan 3 benda yang awak nampak.</li><li>Namakan 2 bunyi yang awak dengar.</li></ul>`;
}
async function refreshEstimate() {
  const a = S.ai, ta = $("#aimsg"); if (!ta || !a.module || a.module === "breathe") return;
  const msg = ta.value.trim();
  if (!msg && !a.attach.length) { a.est = null; a.estErr = ""; const b = $("#estBox"); if (b) b.innerHTML = estimateText(); const s = $("#aisend"); if (s) { s.disabled = true; s.textContent = "Hantar"; } return; }
  const r = await S.api.api({ action: "ai_estimate", module: a.module, message: msg, entry_ids: a.attach, history: a.history });
  if (!$("#aimsg")) return;
  if (r.ok) { a.est = r; a.estErr = ""; } else { a.est = null; a.estErr = r.error || "Anggaran caj tidak tersedia."; }
  const b = $("#estBox"); if (b) b.innerHTML = estimateText();
  const s = $("#aisend"); if (s) { s.disabled = !a.est || !a.est.enough || a.busy; s.textContent = a.est ? `Hantar · maks ${rmUp(a.est.max_charge_rm)}` : "Hantar"; }
}
let estT;
function scheduleEstimate() { clearTimeout(estT); estT = setTimeout(refreshEstimate, 600); }
async function aiSend(riskAck = false, resend = null) {
  const a = S.ai, ta = $("#aimsg"); const msgRaw = resend ?? (ta ? ta.value.trim() : "");
  const msg = (a.listenOnly && !resend ? msgRaw + (msgRaw ? "\n\n" : "") + "(Saya cuma mahu menulis dan didengar. Tolong jangan beri nasihat.)" : msgRaw);
  if (!msg && !a.attach.length) return;
  a.busy = true; a.risk = null; a.last = null; a.history.push({ role: "user", content: msgRaw || "(Catatan terpilih dilampirkan)" }); render(); scrollChat();
  const r = await S.api.api({ action: "ai_run", module: a.module, message: msg, entry_ids: a.attach, history: a.history.slice(0, -1), risk_ack: riskAck });
  a.busy = false;
  if (r.wallet) { S.status.wallet = r.wallet; }
  if (!r.ok) { a.history.pop(); a.est = null; toast(r.error || "AI tidak dapat menjawab sekarang. Tiada kredit ditolak."); if (r.code === "subscription_required") refreshStatus(); render(); return; }
  if (r.risk) { a.risk = r.resources || []; a.riskMsg = r.text; a.lastMsg = msgRaw; a.last = null; render(); scrollChat(); return; }
  a.history.push({ role: "assistant", content: r.text }); a.last = true; a.lastCharge = r.charged_rm || 0; a.est = null; a.attach = a.module === "weekly" ? a.attach : [];
  render(); scrollChat();
}
const scrollChat = () => setTimeout(() => { const c = $("#chat"); if (c) c.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, 30);

// ---------------------------------------------------------------- PROFIL
function viewProfil() {
  const p = S.profile || {}, st = S.status, sub = st?.subscription, w = st?.wallet;
  const subTxt = !sub ? "…" : sub.exempt ? "Akses percuma tanpa langganan" : sub.active ? `Aktif sehingga ${fmtLong(iso(new Date(sub.current_period_end)).slice(0, 10))}` : sub.required ? "Tamat. Data kekal boleh dibaca dan dieksport." : "Akses asas aktif (langganan belum diwajibkan)";
  const prefs = p.prefs || {};
  return `<div class="topbar"><span class="brand">LEMBAR</span></div><h1>Profil</h1>
  <div class="card stack"><div class="row between"><div><b>${esc(p.display_name || "Pengguna")}</b><div class="small muted">${esc(S.user?.email || "")}</div></div><button class="btn sm ghost" data-act="logout">Log keluar</button></div></div>

  <h2 style="margin-top:22px">Kredit AI</h2>
  <div class="card stack"><div class="small muted">Baki Kredit AI</div><div class="big">${w?.unlimited ? "Tanpa had" : esc(rm(w?.balance_rm || 0))}</div><span class="chip" style="align-self:flex-start">Tiada expiry</span>
    <h3 style="margin:8px 0 0">Tambah kredit</h3>
    <div class="pkgs" ${w?.unlimited ? "hidden" : ""}>${(st?.prices?.topup_rm || [5, 10, 20]).map((n) => `<button data-act="topup" data-n="${n}">RM${n}</button>`).join("")}</div>
    <div class="card tint"><b class="small">Anggaran caj AI</b><div class="small muted">Dipaparkan sebelum setiap penggunaan. Kredit ditolak mengikut penggunaan, dan caj sebenar tidak melebihi jumlah maksimum yang dipaparkan.</div></div>
    <button class="btn sm ghost" data-act="ledger" style="align-self:flex-start">Rekod transaksi →</button></div>

  <h2 style="margin-top:22px">Langganan</h2>
  <div class="card stack"><div><b>${sub?.exempt ? "Akses percuma" : "RM" + esc(Number(st?.prices?.subscription_rm || 2).toFixed(0)) + " / bulan"}</b><div class="small muted">${esc(subTxt)}</div></div>
    <button class="btn" data-act="subscribe" ${sub?.exempt ? "hidden" : ""}>${sub?.active ? "Lanjutkan 30 hari" : "Bayar RM" + esc(Number(st?.prices?.subscription_rm || 2).toFixed(0))}</button>
    <p class="xs muted" style="margin:0">Pembayaran melalui BayarCash (FPX). Yuran platform tidak bercampur dengan kredit AI. Tiada pembaharuan automatik pada fasa ini.</p></div>

  <h2 style="margin-top:22px">AI &amp; privasi</h2>
  <div class="card stack">
    <label class="check"><input type="checkbox" id="pAi" ${p.ai_consent_at ? "checked" : ""}><span>Benarkan refleksi AI (hanya apabila saya menekan hantar)</span></label>
    <label class="check"><input type="checkbox" id="pMem" ${p.memory_opt_in ? "checked" : ""}><span>Benarkan AI mengingat fakta yang saya luluskan</span></label>
    <div id="memList"></div>
    <details><summary>Penyesuaian AI</summary><div class="stack" style="margin-top:10px">
      <div><label class="f" for="pTone">Nada</label><select id="pTone"><option value="">Lalai</option>${["lembut dan hangat", "tenang dan ringkas", "berterus terang tetapi baik"].map((t) => `<option ${prefs.tone === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div><label class="f" for="pLen">Panjang jawapan</label><select id="pLen"><option value="">Lalai</option>${["pendek", "sederhana", "lebih panjang"].map((t) => `<option ${prefs.length === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div><label class="f" for="pAvoid">Topik yang saya mahu dielakkan</label><input id="pAvoid" type="text" maxlength="160" value="${esc(prefs.avoid || "")}" placeholder="cth: keluarga, kerja"></div>
      <button class="btn sm soft" data-act="save-prefs">Simpan penyesuaian</button></div></details>
  </div>

  <h2 style="margin-top:22px">Data saya</h2>
  <div class="card stack"><div class="row wrap"><button class="btn sm soft" data-act="export" data-f="json">Eksport JSON</button><button class="btn sm soft" data-act="export" data-f="md">Eksport Markdown</button></div>
    <p class="xs muted" style="margin:0">Rakaman suara dimuat turun daripada setiap catatan.</p>
    <button class="btn sm ghost" data-act="trash" style="align-self:flex-start">Dipadam baru-baru ini</button>
    <div class="soon"><span class="chip warn">Akan datang</span><span class="small">Gambar kenangan</span></div>
    <hr style="border:0;border-top:1px solid var(--line);width:100%"><button class="btn sm danger" data-act="del-account" style="align-self:flex-start">Padam semua data LEMBAR</button></div>
  <p class="xs muted" style="margin-top:18px"><a href="/privasi/">Privasi</a> · <a href="/terma/">Terma</a> · Sokongan kesejahteraan &amp; refleksi, bukan rawatan, bukan perkhidmatan krisis 24/7.</p>`;
}
async function afterProfil() { try { S.memories = await S.api.memories(); } catch { S.memories = []; } drawMemories(); }
function drawMemories() {
  const box = $("#memList"); if (!box) return;
  if (!S.profile?.memory_opt_in) { box.innerHTML = `<p class="xs muted" style="margin:0">Memori mati. AI tidak mengingat apa-apa antara sesi.</p>`; return; }
  box.innerHTML = `<div class="stack"><div class="small"><b>Memori AI</b> <span class="muted">(boleh disemak dan dipadam)</span></div>
    ${S.memories.length ? `<ul class="list">${S.memories.map((m) => `<li><span><b>${esc(m.label)}</b>: ${esc(m.fact)}</span><button class="btn sm ghost" data-act="mem-del" data-id="${esc(m.id)}" aria-label="Padam memori">Padam</button></li>`).join("")}</ul>` : `<p class="xs muted" style="margin:0">Belum ada memori.</p>`}
    <div class="row wrap"><input id="memL" type="text" maxlength="60" placeholder="Label (cth: Nilai diri)" style="flex:1;min-width:120px"><input id="memF" type="text" maxlength="300" placeholder="Fakta (cth: Masa keluarga)" style="flex:2;min-width:160px"></div>
    <button class="btn sm soft" data-act="mem-add" style="align-self:flex-start">Tambah memori</button></div>`;
}

// ------------------------------------------------------------------ pembayaran
async function startPay(body) {
  toast("Menyediakan pembayaran…");
  const r = await S.api.pay({ action: "create_payment", ...body });
  if (r.ok && r.payment_url) { const u=new URL(r.payment_url);if(u.protocol!=="https:"||u.username||u.password||!/^(?:[a-z0-9-]+\.)*(?:bayar\.cash|bayarcash-sandbox\.com)$/.test(u.hostname))throw new Error("Pautan pembayaran tidak sah.");location.href=u.href; return; }
  toast(r.error || "Pembayaran tidak dapat dimulakan.");
}
async function checkPayment(pid) {
  toast("Mengesahkan bayaran…");
  for (let i = 0; i < 10; i++) {
    const r = await S.api.pay({ action: "payment_status", payment_id: pid });
    if (r.ok && r.status === "completed" && r.applied) {
      await refreshStatus(); render();
      return toast(r.kind === "topup" ? `Kredit ${rm(r.amount_rm)} telah ditambah` : "Langganan diaktifkan. Terima kasih!", true);
    }
    if (r.ok && (r.status === "failed" || r.status === "cancelled")) return toast("Bayaran tidak berjaya. Tiada caj dikenakan.");
    await new Promise((res) => setTimeout(res, 3000));
  }
  toast("Bayaran masih diproses. Baki akan dikemas kini sebentar lagi.");
}

// ------------------------------------------------------------------ eksport
async function doExport(f) {
  toast("Menyediakan eksport…");
  try {
    const all = await S.api.entries({ limit: 5000 }), mem = await S.api.memories().catch(() => []);
    let blob, name;
    if (f === "json") { blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), app: "LEMBAR", profile: { display_name: S.profile?.display_name, prefs: S.profile?.prefs }, entries: all, memories: mem }, null, 2)], { type: "application/json" }); name = `lembar-${S.today}.json`; }
    else {
      const md = all.slice().reverse().map((e) => `## ${e.entry_date}${e.title ? " · " + e.title : ""}\n${e.mood ? `Mood: ${e.mood}/5\n` : ""}${e.voice_path ? "(rakaman suara)\n" : ""}\n${e.body}\n`).join("\n---\n\n");
      blob = new Blob([`# Diari LEMBAR\nDieksport ${S.today}\n\n${md}`], { type: "text/markdown" }); name = `lembar-${S.today}.md`;
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast("Eksport siap", true);
  } catch (er) { toast(errMsg(er)); }
}

// ------------------------------------------------------------------ acara
const H = {

  tab: (b) => go(b.dataset.tab),
  search: () => { S.searchOpen = !S.searchOpen; if (!S.searchOpen && S.q) { S.q = ""; loadRecent().then(render); return; } render(); if (S.searchOpen) $("#q")?.focus(); },
  new: (b) => openEditor({ mode: b.dataset.mode, date: b.dataset.date || null }),
  open: (b) => openEditor({ id: b.dataset.id }),
  quickmood: async (b) => { await openEditor({ mode: "write" }); if (!S.ed) return; S.ed.e.mood = Number(b.dataset.v); $$("#editor .moods button").forEach((x) => x.setAttribute("aria-pressed", String(S.ed.e.mood) === x.dataset.v)); },
  mbar: (b) => { const p = S.cal.pts?.[Number(b.dataset.i)], r = $("#mread"); if (!p || !r) return; $$(".mchart .mb.act").forEach((x) => x.classList.remove("act")); b.classList.add("act"); r.textContent = p.avg ? `${fmtShort(p.d)} · mood ${p.avg.toFixed(1)} (${MOODS[Math.round(p.avg) - 1][1]})` : `${fmtShort(p.d)} · tiada mood dipilih`; },
  month: (b) => { let { y, m } = S.cal; m += Number(b.dataset.n); if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } S.cal.y = y; S.cal.m = m; render(); },
  day: (b) => { S.cal.sel = b.dataset.d; render(); },
  "ed-close": () => closeEditor(),
  "ed-save": async () => { await saveEditor(false); if (S.ed && !S.ed.dirty) toast("Disimpan", true); },
  mood: (b) => { const v = b.dataset.v; S.ed.e.mood = String(S.ed.e.mood) === v ? null : Number(v); $$("#editor .moods button").forEach((x) => x.setAttribute("aria-pressed", String(S.ed.e.mood) === x.dataset.v)); markDirty(); },
  "rec-start": () => startRecording(), "rec-stop": () => stopRecording(),
  "voice-del": async () => { const p = S.ed.e.voice_path; S.ed.e.voice_path = null; S.ed.e.voice_seconds = null; if (!S.ed.e.body.trim()) { toast("Catatan perlu ada teks jika rakaman dibuang."); S.ed.e.voice_path = p; return; } drawVoice(); S.ed.dirty = true; await saveEditor(true); S.api.removeVoice(p).catch(() => {}); },
  "ed-del": async () => { if (!(await confirmDialog({ title: "Padam catatan?", body: "<p>Catatan dialihkan ke <b>Dipadam baru-baru ini</b> dan dibuang kekal selepas 30 hari. Awak boleh memulihkannya sebelum itu.</p>", ok: "Padam", danger: true }))) return; await S.api.softDelete(S.ed.e.id); S.ed.dirty = false; await closeEditor(); toast("Dialihkan ke Dipadam baru-baru ini"); },
  "ed-ai": async () => { const id = S.ed.e.id; await closeEditor(); S.ai = { ...S.ai, module: "listen", attach: [id], history: [], est: null, last: null, risk: null }; go("ai"); },
  "ai-consent": async () => { try { S.profile = await S.api.saveProfile({ ai_consent_at: new Date().toISOString(), ai_consent_version: AI_VERSION }, S.user.id); render(); } catch (er) { toast(errMsg(er)); } },
  "ai-mod": async (b) => { const m = b.dataset.m; S.ai = { ...S.ai, module: m, history: [], est: null, estErr: "", last: null, risk: null, attach: [], weekly: [] };
    if (m === "weekly") { try { S.ai.weekly = (await S.api.entries({ from: addDays(S.today, -6), to: S.today, limit: 14 })).filter((e) => e.kind === "diary"); S.ai.attach = S.ai.weekly.map((w) => w.id); } catch { /* abaikan */ } }
    render(); if (m === "weekly") refreshEstimate(); },
  "ai-stop": () => { clearTimeout(breatheT); S.ai.module = null; S.ai.history = []; S.ai.risk = null; S.ai.last = null; S.ai.est = null; render(); },
  "ai-clear": () => { S.ai.history = []; S.ai.last = null; S.ai.est = null; S.ai.risk = null; render(); toast("Perbualan dipadam daripada peranti ini."); },
  "ai-detach": () => { S.ai.attach = []; S.ai.est = null; render(); },
  "ai-breathe": () => { S.ai.module = "breathe"; render(); },
  "ai-send": () => aiSend(false),
  "ai-riskok": () => { const m = S.ai.lastMsg || ""; S.ai.history.pop(); S.ai.risk = null; aiSend(true, m || "Saya okay, mahu teruskan."); },
  "ai-save": async () => { const a = S.ai, last = [...a.history].reverse().find((m) => m.role === "assistant"); if (!last) return; try { await S.api.saveEntry({ entry_date: S.today, kind: a.module === "letter" ? "letter" : "reflection", parent_id: a.attach[0] || null, title: a.module === "letter" ? "Surat kepada diri" : "Refleksi AI", body: last.content }, S.user.id); await Promise.all([loadDates(), loadRecent()]); toast("Disimpan ke diari", true); } catch (er) { toast(errMsg(er)); } },
  logout: async () => { await S.api.signOut(); location.replace("/app/"); },
  topup: (b) => startPay({ kind: "topup", package_rm: Number(b.dataset.n) }),
  subscribe: () => startPay({ kind: "subscription" }),
  ledger: async () => { try { const [l, p] = await Promise.all([S.api.ledger(), S.api.payments()]); const d = document.createElement("dialog");
    d.innerHTML = `<form method="dialog" class="stack"><h2>Rekod transaksi</h2><h3>Kredit</h3><ul class="list">${l.length ? l.map((x) => `<li><span>${esc(new Date(x.created_at).toLocaleDateString("ms-MY"))} · ${x.kind === "topup" ? "Top-up" : x.kind === "settle" ? "Guna AI" : x.kind === "reserve" ? "Ditahan" : "Dilepas"}</span><b>${x.kind === "settle" ? "-" + rm(Math.abs(x.amount_rm), 4) : x.kind === "topup" ? "+" + rm(x.amount_rm) : rm(x.amount_rm, 4)}</b></li>`).join("") : "<li>Tiada rekod.</li>"}</ul>
    <h3>Bayaran</h3><ul class="list">${p.length ? p.map((x) => `<li><span>${esc(new Date(x.created_at).toLocaleDateString("ms-MY"))} · ${x.kind === "topup" ? "Top-up" : "Langganan"} · ${esc(x.status)}</span><b>${rm(x.amount_rm)}</b></li>`).join("") : "<li>Tiada bayaran.</li>"}</ul><button class="btn block" value="x">Tutup</button></form>`;
    document.body.appendChild(d); d.addEventListener("close", () => d.remove()); d.showModal(); } catch (er) { toast(errMsg(er)); } },
  "save-prefs": async () => { try { S.profile = await S.api.saveProfile({ prefs: { tone: $("#pTone").value, length: $("#pLen").value, avoid: $("#pAvoid").value.trim() } }, S.user.id); toast("Penyesuaian disimpan", true); } catch (er) { toast(errMsg(er)); } },
  "mem-add": async () => { const l = $("#memL").value.trim(), f = $("#memF").value.trim(); if (!l || !f) return toast("Isi label dan fakta."); try { await S.api.addMemory({ label: l, fact: f }, S.user.id); S.memories = await S.api.memories(); drawMemories(); toast("Memori ditambah"); } catch (er) { toast(errMsg(er)); } },
  "mem-del": async (b) => { try { await S.api.delMemory(b.dataset.id); S.memories = S.memories.filter((m) => m.id !== b.dataset.id); drawMemories(); } catch (er) { toast(errMsg(er)); } },
  export: (b) => doExport(b.dataset.f),
  trash: async () => { const list = await S.api.entries({ deleted: true, limit: 100 }); const d = document.createElement("dialog");
    d.innerHTML = `<form method="dialog" class="stack"><h2>Dipadam baru-baru ini</h2>${list.length ? `<ul class="list">${list.map((e) => `<li><span>${esc(fmtShort(e.entry_date))} · ${esc((e.title || e.body || "").slice(0, 40))}</span><span class="row"><button type="button" class="btn sm soft" data-r="${esc(e.id)}">Pulihkan</button><button type="button" class="btn sm danger" data-x="${esc(e.id)}">Buang</button></span></li>`).join("")}</ul>` : `<p class="muted">Tiada apa-apa di sini.</p>`}<button class="btn block" value="x">Tutup</button></form>`;
    document.body.appendChild(d); d.addEventListener("close", async () => { d.remove(); await Promise.all([loadDates(), loadRecent()]); render(); });
    d.addEventListener("click", async (ev) => { const r = ev.target.closest("[data-r]"), x = ev.target.closest("[data-x]");
      if (r) { await S.api.restore(r.dataset.r); r.closest("li").remove(); toast("Dipulihkan", true); }
      if (x) { const e = list.find((q) => q.id === x.dataset.x); if (await confirmDialog({ title: "Buang kekal?", body: "<p>Ini tidak boleh dikembalikan.</p>", ok: "Buang kekal", danger: true })) { await S.api.hardDelete(e); x.closest("li").remove(); } } });
    d.showModal(); },
  "del-account": async () => { const bal = S.status?.wallet?.balance_rm || 0;
    if (!(await confirmDialog({ title: "Padam semua data LEMBAR?", body: `<p>Catatan, rakaman suara, memori dan dompet LEMBAR akan dipadam kekal. Rujukan, jumlah dan status transaksi minimum dikekalkan untuk rekonsiliasi atau refund. Bayaran yang masih diproses perlu diselesaikan dahulu. Akaun log masuk dan data aplikasi lain dalam MY GARAGE tidak terjejas.</p>${bal > 0 ? `<p><b>Baki kredit ${esc(rm(bal))} akan hilang bersama akaun</b> dan tidak dibayar balik secara automatik. Hubungi kami dahulu jika awak mahu menyelesaikan baki.</p>` : ""}<p>Taip <b>PADAM</b> untuk mengesahkan.</p>`, ok: "Padam kekal", danger: true, input: "PADAM" }))) return;
    const r = await S.api.api({ action: "delete_account", confirm: "PADAM", ack_balance: true });
    if (r.ok) { await S.api.signOut().catch(() => {}); location.replace("/"); } else toast(r.error || "Gagal memadam akaun."); },
};

document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-act]"); if (!b) return;
  if (b.tagName === "INPUT") return;
  const h = H[b.dataset.act]; if (h) { ev.preventDefault?.(); Promise.resolve(h(b)).catch((er) => { console.error(er?.message || "ralat"); toast(errMsg(er)); }); }
});
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.id === "aic") $("#aiok").disabled = !t.checked;
  if (t.id === "aiListen") S.ai.listenOnly = t.checked;
  if (t.id === "pAi") S.api.saveProfile({ ai_consent_at: t.checked ? new Date().toISOString() : null, ai_consent_version: t.checked ? AI_VERSION : null }, S.user.id).then((p) => { S.profile = p; toast(t.checked ? "Refleksi AI dibenarkan" : "Refleksi AI dimatikan"); }).catch((er) => { t.checked = !t.checked; toast(errMsg(er)); });
  if (t.id === "pMem") S.api.saveProfile({ memory_opt_in: t.checked }, S.user.id).then(async (p) => { S.profile = p; if (!t.checked) { await S.api.clearMemories().catch(() => {}); S.memories = []; toast("Memori dimatikan dan dipadam"); } drawMemories(); }).catch((er) => { t.checked = !t.checked; toast(errMsg(er)); });
  if (t.dataset?.act === "ai-wk") { const ids = $$('[data-act="ai-wk"]:checked').map((x) => x.value); S.ai.attach = ids; scheduleEstimate(); }
});
let qT;
document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.id === "q") { clearTimeout(qT); S.q = t.value; qT = setTimeout(async () => { await loadRecent().catch(() => {}); const pos = t.selectionStart; render(); const q = $("#q"); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 350); }
  if (t.id === "aimsg") scheduleEstimate();
});
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && S.ed && !document.querySelector("dialog[open]")) closeEditor(); });
window.addEventListener("beforeunload", () => { if (S.ed?.dirty) saveEditor(true); });
window.addEventListener("pagehide", () => { if (S.ed?.dirty) saveEditor(true); });

$("#tabs").innerHTML = `<nav aria-label="Navigasi utama">${[["diari", "Diari"], ["kalendar", "Kalendar"], ["ai", "AI"], ["profil", "Profil"]].map(([k, l]) => `<button data-act="tab" data-tab="${k}">${ICON[k]}<span>${l}</span></button>`).join("")}</nav>`;
boot();
