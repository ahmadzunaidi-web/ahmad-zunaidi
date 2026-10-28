// LEMBAR — lapisan data. Semua akses melalui Supabase (RLS menyekat setiap pengguna kepada data sendiri).
// Mod "demo" (config.json mode="demo") hanya untuk ujian UI tanpa rangkaian; JANGAN dihantar ke production.
const SB_CDN = "/assets/supabase-2.117.2.min.js";
export const KL = "Asia/Kuala_Lumpur";
export const todayKL = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: KL, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.supabase) return res();
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Gagal memuatkan Supabase"));
    document.head.appendChild(s);
  });
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));

export async function createApi() {
  const cfg = await fetch("/config.json", { cache: "no-store" }).then((r) => r.json());
  return cfg.mode === "demo" ? demoApi(cfg) : liveApi(cfg);
}

// ====================================================================== LIVE
async function liveApi(cfg) {
  await loadScript(SB_CDN);
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce", storageKey: "lembar-auth" },
  });
  const must = (r) => { if (r.error) throw r.error; return r.data; };
  const fn = async (name, body) => {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch(`${cfg.functionsBase || cfg.supabaseUrl + "/functions/v1"}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": cfg.publishableKey, "Authorization": `Bearer ${session ? session.access_token : cfg.publishableKey}` },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({ ok: false, error: "Respons tidak sah." }));
    j._status = r.status; return j;
  };
  return {
    mode: "live", cfg,
    async session() { const { data } = await sb.auth.getSession(); return data.session; },
    onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => cb(s)); },
    async signInEmail(email, password) {
      return must(await sb.auth.signInWithPassword({ email, password }));
    },
    async signUpEmail(email, password) {
      return must(await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + "/auth/callback/" } }));
    },
    async resetPassword(email) {
      return must(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/auth/callback/?mode=recovery" }));
    },
    async updatePassword(password) { return must(await sb.auth.updateUser({ password })); },
    async signOut() { await sb.auth.signOut(); },
    async profile() { return must(await sb.from("lembar_profiles").select("*").maybeSingle()); },
    async saveProfile(p, userId) {
      const current=must(await sb.from("lembar_profiles").select("user_id").maybeSingle());
      if(!current) {
        const started=await fn("lembar-api",{action:"start_diary",adult_confirmed:!!p.adult_confirmed_at,privacy_accepted:!!p.adult_confirmed_at,display_name:p.display_name||"",ai_consent:!!p.ai_consent_at});
        if(!started.ok) throw new Error(started.error||"Diari tidak dapat dibuka.");
        return started.profile;
      }
      return must(await sb.from("lembar_profiles").upsert({ user_id: userId, ...p }, { onConflict: "user_id" }).select().single()); },
    async entries({ from, to, q, deleted = false, limit = 60, ids } = {}) {
      let r = sb.from("lembar_entries").select("id,entry_date,kind,parent_id,title,body,mood,voice_path,voice_seconds,created_at,updated_at,deleted_at")
        .order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
      r = deleted ? r.not("deleted_at", "is", null) : r.is("deleted_at", null);
      if (from) r = r.gte("entry_date", from); if (to) r = r.lte("entry_date", to);
      if (ids) r = r.in("id", ids);
      if (q) { const s = q.replace(/[%_,()\\]/g, " ").trim(); if (s) r = r.or(`title.ilike.%${s}%,body.ilike.%${s}%`); }
      return must(await r);
    },
    async entryDates(sinceISO) { return must(await sb.from("lembar_entries").select("entry_date,mood").is("deleted_at", null).gte("entry_date", sinceISO).limit(5000)); },
    async saveEntry(e, userId) {
      const row = { title: e.title || null, body: e.body || "", mood: e.mood || null, entry_date: e.entry_date, voice_path: e.voice_path || null, voice_seconds: e.voice_seconds || null, kind: e.kind || "diary", parent_id: e.parent_id || null };
      if (e.id) return must(await sb.from("lembar_entries").update(row).eq("id", e.id).select().single());
      return must(await sb.from("lembar_entries").insert({ ...row, user_id: userId }).select().single());
    },
    async softDelete(id) { must(await sb.from("lembar_entries").update({ deleted_at: new Date().toISOString() }).eq("id", id)); },
    async restore(id) { must(await sb.from("lembar_entries").update({ deleted_at: null }).eq("id", id)); },
    async hardDelete(e) { if (e.voice_path) must(await sb.storage.from("lembar-voice").remove([e.voice_path])); must(await sb.from("lembar_entries").delete().eq("id", e.id)); },
    async uploadVoice(blob, ext, userId) {
      const path = `${userId}/${Date.now()}-${uid().slice(0, 8)}.${ext}`;
      const { error } = await sb.storage.from("lembar-voice").upload(path, blob, { contentType: blob.type || "audio/webm", upsert: false });
      if (error) throw error; return path;
    },
    async voiceUrl(path) { const { data, error } = await sb.storage.from("lembar-voice").createSignedUrl(path, 600); if (error) throw error; return data.signedUrl; },
    async removeVoice(path) { must(await sb.storage.from("lembar-voice").remove([path])); },
    async memories() { return must(await sb.from("lembar_memories").select("*").order("created_at", { ascending: false })); },
    async addMemory(m, userId) { return must(await sb.from("lembar_memories").insert({ ...m, user_id: userId }).select().single()); },
    async delMemory(id) { must(await sb.from("lembar_memories").delete().eq("id", id)); },
    async clearMemories() { must(await sb.from("lembar_memories").delete().not("id", "is", null)); },
    async ledger() { return must(await sb.from("lembar_wallet_ledger").select("id,kind,amount_rm,balance_after,ref,created_at").order("id", { ascending: false }).limit(50)); },
    async payments() { return must(await sb.from("lembar_payments").select("id,kind,amount_rm,status,created_at,paid_at").order("created_at", { ascending: false }).limit(30)); },
    async usage() { return must(await sb.from("lembar_ai_usage").select("id,module,status,charged_rm,created_at").order("created_at", { ascending: false }).limit(30)); },
    api: (b) => fn("lembar-api", b),
    pay: (b) => fn("lembar-checkout", b),
  };
}

// ====================================================================== DEMO (ujian UI sahaja)
function demoApi(cfg) {
  const K = "lembar-demo-v1";
  const load = () => { try { return JSON.parse(localStorage.getItem(K)) || null; } catch { return null; } };
  const st = load() || { logged: !!cfg.demoLoggedIn, profile: null, entries: [], memories: [], wallet: 10, ledger: [], payments: [] };
  const save = () => { try { localStorage.setItem(K, JSON.stringify(st)); } catch { /* abaikan */ } };
  const user = { id: "demo-user", email: "demo@lembar.test" };
  const RISK = /(nak mati|bunuh diri|suicid|kill myself|want to die)/i;
  const filt = (arr, o) => arr.filter((e) => (o.deleted ? !!e.deleted_at : !e.deleted_at) && (!o.from || e.entry_date >= o.from) && (!o.to || e.entry_date <= o.to) && (!o.ids || o.ids.includes(e.id)) && (!o.q || (e.title + " " + e.body).toLowerCase().includes(o.q.toLowerCase())));
  return {
    mode: "demo", cfg, user,
    async session() { return st.logged ? { user, access_token: "demo" } : null; },
    onAuth() {},
    async signInEmail(email) { user.email = email; st.logged = true; save(); return { session: { user } }; },
    async signUpEmail(email) { user.email = email; st.logged = true; save(); return { session: { user } }; },
    async resetPassword() { return {}; }, async updatePassword() { return {}; },
    async signOut() { st.logged = false; save(); },
    async profile() { return st.profile; },
    async saveProfile(p, userId) { st.profile = { ...(st.profile || { user_id: userId, prefs: {}, memory_opt_in: false }), ...p }; save(); return st.profile; },
    async entries(o = {}) { return filt(st.entries, o).sort((a, b) => (b.entry_date + b.created_at).localeCompare(a.entry_date + a.created_at)).slice(0, o.limit || 60); },
    async entryDates(since) { return st.entries.filter((e) => !e.deleted_at && e.entry_date >= since).map((e) => ({ entry_date: e.entry_date, mood: e.mood })); },
    async saveEntry(e, userId) {
      if (e.id) { const i = st.entries.findIndex((x) => x.id === e.id); st.entries[i] = { ...st.entries[i], ...e, updated_at: new Date().toISOString() }; save(); return st.entries[i]; }
      const { id: _drop, ...rest } = e; const row = { kind: "diary", ...rest, id: uid(), user_id: userId, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null }; st.entries.push(row); save(); return row;
    },
    async softDelete(id) { st.entries.find((e) => e.id === id).deleted_at = new Date().toISOString(); save(); },
    async restore(id) { st.entries.find((e) => e.id === id).deleted_at = null; save(); },
    async hardDelete(e) { st.entries = st.entries.filter((x) => x.id !== e.id); save(); },
    async uploadVoice(blob) { return "demo/" + uid() + ".webm"; }, async voiceUrl() { return ""; }, async removeVoice() {},
    async memories() { return st.memories; },
    async addMemory(m, userId) { const r = { id: uid(), user_id: userId, created_at: new Date().toISOString(), ...m }; st.memories.unshift(r); save(); return r; },
    async delMemory(id) { st.memories = st.memories.filter((m) => m.id !== id); save(); },
    async clearMemories() { st.memories = []; save(); },
    async ledger() { return st.ledger; }, async payments() { return st.payments; }, async usage() { return []; },
    async api(b) {
      const wallet = { balance_rm: st.wallet, reserved_rm: 0, available_rm: st.wallet };
      if (b.action === "status") return { ok: true, subscription: { active: false, required: !!cfg.demoRequireSub, current_period_end: null }, wallet, prices: { subscription_rm: 2, topup_rm: [5, 10, 20], multiplier: 3 }, ai_ready: cfg.demoAiReady !== false, pro_available: false, voice: { max_seconds: 180, max_mb: 5 } };
      if (b.action === "ai_estimate") return { ok: true, max_charge_rm: 0.12, multiplier: 3, wallet, enough: st.wallet >= 0.12 };
      if (b.action === "ai_run") {
        if (!b.risk_ack && RISK.test(b.message || "")) return { ok: true, risk: true, text: "Saya dengar ada sesuatu yang sangat berat. Awak tak perlu hadapinya seorang diri.", resources: [{ name: "Kecemasan", contact: "999" }, { name: "Befrienders KL (24 jam)", contact: "03-7627 2929" }, { name: "Talian Kasih", contact: "15999" }], charged_rm: 0, wallet };
        st.wallet = Math.max(0, +(st.wallet - 0.0426).toFixed(4)); save();
        return { ok: true, text: "Saya dengar hari ini agak memenatkan. Mahu saya dengar dahulu, atau bantu susun fikiran?", charged_rm: 0.0426, wallet: { balance_rm: st.wallet, reserved_rm: 0, available_rm: st.wallet } };
      }
      if (b.action === "delete_account") { localStorage.removeItem(K); return { ok: true }; }
      return { ok: false, error: "demo" };
    },
    async pay() { return { ok: false, error: "Pembayaran tidak tersedia dalam mod demo." }; },
  };
}
