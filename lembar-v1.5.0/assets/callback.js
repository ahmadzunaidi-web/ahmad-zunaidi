import { createApi } from "/assets/data.js";
const m = document.getElementById("m");
try {
  const params = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (params.get("error") || fragment.get("error")) throw new Error("auth-error");
  const recovery = params.get("mode") === "recovery" || fragment.get("type") === "recovery";
  const api = await createApi();
  let session = null;
  for (let i = 0; i < 20 && !session; i++) {
    session = await api.session();
    if (!session) await new Promise(r => setTimeout(r, 250));
  }
  if (!session) throw new Error("no-session");
  history.replaceState(null, "", "/auth/callback/");
  if (!recovery) location.replace("/app/");
  else {
    document.querySelector("h1").textContent = "Pilih kata laluan baharu";
    m.textContent = "Gunakan sekurang-kurangnya 8 aksara.";
    const form = document.createElement("form");
    form.className = "card stack";
    form.innerHTML = `<label class="stack" for="new-password">Kata laluan baharu<input type="password" id="new-password" autocomplete="new-password" minlength="8" maxlength="256" required></label><label class="stack" for="confirm-password">Ulang kata laluan<input type="password" id="confirm-password" autocomplete="new-password" minlength="8" maxlength="256" required></label><button class="btn block" type="submit">Simpan kata laluan</button><p role="status" aria-live="polite" id="reset-message"></p>`;
    m.after(form);
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      if (!form.reportValidity()) return;
      const password = form.querySelector("#new-password").value;
      const message = form.querySelector("#reset-message");
      const button = form.querySelector("button");
      if (button.disabled) return;
      if (password !== form.querySelector("#confirm-password").value) { message.textContent = "Kedua-dua kata laluan mesti sama."; return; }
      button.disabled = true;
      try { await api.updatePassword(password); form.reset(); location.replace("/app/"); }
      catch { message.textContent = "Tak dapat menyimpan kata laluan. Cuba lagi atau minta pautan pemulihan baharu."; }
      finally { button.disabled = false; }
    });
  }
} catch {
  history.replaceState(null, "", "/auth/callback/");
  m.textContent = "Pautan tidak sah atau sudah luput. Kembali ke log masuk untuk cuba lagi. Jika pautan dibuka di peranti lain, cuba browser asal.";
  const link = document.createElement("a");
  link.href = "/app/"; link.className = "btn"; link.textContent = "Kembali ke log masuk";
  m.after(link);
}
