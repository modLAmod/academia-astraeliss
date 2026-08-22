
// ============================================================
// CONFIGURA ESTO ↓↓↓
// Sácalo de tu proyecto de Supabase: Settings → API
// La "anon public key" SÍ puede ir aquí, está pensada para el navegador.
// El "service_role key" y el "Client Secret" de Discord NUNCA van en este archivo.
// ============================================================
const SUPABASE_URL = "https://modlamod.github.io/academia-astraeliss/";
const SUPABASE_ANON_KEY = "Ky9tIacauqspXFGg9PX3LSPM5J5bvvkG";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Elementos ----------
const elLoading = document.getElementById("view-loading");
const elLogin = document.getElementById("view-login");
const elApp = document.getElementById("view-app");
const elLoginError = document.getElementById("login-error");

const elNavStaff = document.getElementById("nav-staff");
const elUserAvatar = document.getElementById("user-avatar");
const elUserName = document.getElementById("user-name");
const elUserRole = document.getElementById("user-role");

const elFichaLede = document.getElementById("ficha-lede");
const elFichaMsg = document.getElementById("ficha-msg");
const elFichaStamp = document.getElementById("ficha-stamp");
const elFichaMotivo = document.getElementById("ficha-motivo");
const elFichaBody = document.getElementById("ficha-body");

const elStaffMsg = document.getElementById("staff-msg");
const elStaffList = document.getElementById("staff-list");

let currentUser = null;   // sesión de Supabase Auth
let currentProfile = null; // fila de public.profiles
let staffFilter = "";

const STATUS_LABEL = { pendiente: "Pendiente", aprobada: "Aprobada", denegada: "Denegada" };

// ---------- Arranque ----------
init();

async function init() {
  const { data: { session } } = await sb.auth.getSession();
  await handleSession(session);

  sb.auth.onAuthStateChange(async (_event, session) => {
    await handleSession(session);
  });

  document.getElementById("btn-discord").addEventListener("click", loginWithDiscord);
  document.getElementById("btn-logout").addEventListener("click", logout);

  document.querySelectorAll("[data-view-btn]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.viewBtn));
  });

  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      staffFilter = btn.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("is-active", b === btn));
      loadStaffList();
    });
  });

  elStaffList.addEventListener("click", onStaffListClick);
  elStaffList.addEventListener("submit", onStaffListSubmit);
}

async function handleSession(session) {
  show(elLoading, false);
  currentUser = session ? session.user : null;

  if (!currentUser) {
    currentProfile = null;
    show(elLogin, true);
    show(elApp, false);
    return;
  }

  show(elLogin, false);
  show(elApp, true);

  await loadProfile();
  renderUserCard();
  await loadMyFicha();
}

function loginWithDiscord() {
  elLoginError.hidden = true;
  sb.auth.signInWithOAuth({
    provider: "discord",
    options: { redirectTo: window.location.href.split("#")[0] },
  });
}

async function logout() {
  await sb.auth.signOut();
}

// ---------- Perfil / navegación ----------
async function loadProfile() {
  const { data, error } = await sb
    .from("profiles")
    .select("id, username, avatar_url, is_staff")
    .eq("id", currentUser.id)
    .single();

  if (error) {
    console.error(error);
    return;
  }
  currentProfile = data;
  elNavStaff.hidden = !currentProfile.is_staff;
}

function renderUserCard() {
  const meta = currentUser.user_metadata || {};
  elUserAvatar.src = (currentProfile && currentProfile.avatar_url) || meta.avatar_url || "";
  elUserName.textContent = (currentProfile && currentProfile.username) || meta.full_name || "Usuario";
  elUserRole.textContent = currentProfile && currentProfile.is_staff ? "Staff" : "Miembro";
}

function switchView(name) {
  document.querySelectorAll("[data-view-btn]").forEach((b) => b.classList.toggle("is-active", b.dataset.viewBtn === name));
  document.querySelectorAll("[data-view]").forEach((s) => (s.hidden = s.dataset.view !== name));
  if (name === "staff") loadStaffList();
}

// ---------- Mi ficha ----------
async function loadMyFicha() {
  const { data: ficha, error } = await sb
    .from("fichas")
    .select("*")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return;
  }
  renderFicha(ficha);
}

function renderFicha(ficha) {
  const editable = !ficha || ficha.status === "denegada";

  elFichaLede.textContent = !ficha
    ? "Todavía no has presentado ninguna ficha."
    : ficha.status === "pendiente"
    ? "Tu ficha está en revisión. No puedes editarla mientras el staff la evalúa."
    : ficha.status === "aprobada"
    ? "Tu ficha fue aprobada. Ya no se puede editar desde aquí."
    : "Tu ficha fue denegada. Corrígela y vuelve a enviarla cuando quieras.";

  elFichaStamp.innerHTML = ficha
    ? `<div class="stamp stamp--${ficha.status}">${STATUS_LABEL[ficha.status]}</div>`
    : "";

  elFichaMotivo.innerHTML =
    ficha && ficha.status === "denegada" && ficha.motivo_denegacion
      ? `<div class="callout callout--denegada"><strong>Motivo de la denegación:</strong> ${escapeHtml(ficha.motivo_denegacion)}</div>`
      : "";

  elFichaBody.innerHTML = "";
  if (editable) {
    elFichaBody.appendChild(buildFichaForm(ficha));
  } else {
    elFichaBody.appendChild(buildFichaReadOnly(ficha));
  }
}

function buildFichaForm(ficha) {
  const tpl = document.getElementById("tpl-ficha-form");
  const node = tpl.content.cloneNode(true);
  const form = node.querySelector("#ficha-form");

  if (ficha) {
    for (const field of ["nombre_personaje", "edad", "raza", "imagen_url", "apariencia", "historia", "habilidades"]) {
      const input = form.elements[field];
      if (input) input.value = ficha[field] || "";
    }
    form.querySelector("#ficha-submit-btn").textContent = "Reenviar ficha";
  }

  form.addEventListener("submit", onSubmitFicha);
  return node;
}

async function onSubmitFicha(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector("#ficha-submit-btn");
  const fd = new FormData(form);

  const payload = {
    user_id: currentUser.id,
    nombre_personaje: (fd.get("nombre_personaje") || "").trim(),
    edad: (fd.get("edad") || "").trim() || null,
    raza: (fd.get("raza") || "").trim() || null,
    imagen_url: (fd.get("imagen_url") || "").trim() || null,
    apariencia: (fd.get("apariencia") || "").trim() || null,
    historia: (fd.get("historia") || "").trim() || null,
    habilidades: (fd.get("habilidades") || "").trim() || null,
    status: "pendiente",
    motivo_denegacion: null,
    reviewed_by: null,
  };

  if (!payload.nombre_personaje) {
    showMsg(elFichaMsg, "El nombre del personaje es obligatorio", "error");
    return;
  }

  btn.disabled = true;
  const { error } = await sb.from("fichas").upsert(payload, { onConflict: "user_id" });
  btn.disabled = false;

  if (error) {
    console.error(error);
    showMsg(
      elFichaMsg,
      "No se pudo guardar. Puede que tu ficha ya esté en revisión o aprobada.",
      "error"
    );
    return;
  }

  showMsg(elFichaMsg, "Ficha enviada, queda pendiente de revisión", "ok");
  loadMyFicha();
}

function buildFichaReadOnly(ficha) {
  const wrap = document.createElement("div");
  wrap.className = "ficha-view";
  wrap.innerHTML = `
    ${ficha.imagen_url ? `<img class="ficha-view__img" src="${escapeAttr(ficha.imagen_url)}" alt="" />` : ""}
    <h2>${escapeHtml(ficha.nombre_personaje)}</h2>
    <dl class="ficha-view__meta">
      ${ficha.edad ? `<div><dt>Edad</dt><dd>${escapeHtml(ficha.edad)}</dd></div>` : ""}
      ${ficha.raza ? `<div><dt>Raza</dt><dd>${escapeHtml(ficha.raza)}</dd></div>` : ""}
    </dl>
    ${ficha.apariencia ? `<h3>Apariencia</h3><p>${escapeHtml(ficha.apariencia)}</p>` : ""}
    ${ficha.historia ? `<h3>Historia</h3><p>${escapeHtml(ficha.historia)}</p>` : ""}
    ${ficha.habilidades ? `<h3>Habilidades</h3><p>${escapeHtml(ficha.habilidades)}</p>` : ""}
  `;
  return wrap;
}

// ---------- Panel de staff ----------
async function loadStaffList() {
  let query = sb
    .from("fichas")
    .select("*, profiles!fichas_user_id_fkey(username, avatar_url)")
    .order("updated_at", { ascending: false });

  if (staffFilter) query = query.eq("status", staffFilter);

  const { data, error } = await query;
  if (error) {
    console.error(error);
    showMsg(elStaffMsg, "No se pudieron cargar las fichas.", "error");
    return;
  }
  renderStaffList(data);
}

function renderStaffList(fichas) {
  if (!fichas || fichas.length === 0) {
    elStaffList.innerHTML = `<p class="empty">No hay fichas que coincidan con este filtro.</p>`;
    return;
  }

  elStaffList.innerHTML = fichas.map((f) => {
    const owner = f.profiles || {};
    const avatar = owner.avatar_url || "";
    const excerpt = f.historia ? f.historia.slice(0, 220) + (f.historia.length > 220 ? "…" : "") : "";

    return `
      <article class="staff-card" data-id="${f.id}">
        <div class="staff-card__top">
          <img class="staff-card__avatar" src="${escapeAttr(avatar)}" alt="" />
          <div>
            <h2>${escapeHtml(f.nombre_personaje)}</h2>
            <span class="staff-card__owner">presentada por ${escapeHtml(owner.username || "?")}</span>
          </div>
          <div class="stamp stamp--${f.status} stamp--small">${STATUS_LABEL[f.status]}</div>
        </div>

        <dl class="staff-card__meta">
          ${f.edad ? `<div><dt>Edad</dt><dd>${escapeHtml(f.edad)}</dd></div>` : ""}
          ${f.raza ? `<div><dt>Raza</dt><dd>${escapeHtml(f.raza)}</dd></div>` : ""}
        </dl>

        ${excerpt ? `<p class="staff-card__excerpt">${escapeHtml(excerpt)}</p>` : ""}

        ${f.status === "denegada" && f.motivo_denegacion
          ? `<p class="callout callout--denegada callout--small"><strong>Motivo:</strong> ${escapeHtml(f.motivo_denegacion)}</p>`
          : ""}

        <div class="staff-card__actions">
          ${f.status !== "aprobada" ? `<button class="btn btn--small btn--success" data-action="aprobar">Aceptar</button>` : ""}
          ${f.status !== "denegada" ? `
            <details class="deny-box">
              <summary class="btn btn--small btn--danger">Denegar</summary>
              <form class="deny-box__form" data-action="denegar">
                <textarea name="motivo" rows="2" placeholder="Motivo de la denegación (se le mostrará al usuario)"></textarea>
                <button class="btn btn--small btn--danger" type="submit">Confirmar denegación</button>
              </form>
            </details>` : ""}
          <button class="btn btn--small btn--ghost" data-action="eliminar">Eliminar</button>
        </div>
      </article>
    `;
  }).join("");
}

async function onStaffListClick(e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const card = e.target.closest(".staff-card");
  const id = card.dataset.id;
  const action = btn.dataset.action;

  if (action === "aprobar") {
    await staffAction(id, { status: "aprobada", motivo_denegacion: null, reviewed_by: currentProfile.username });
  } else if (action === "eliminar") {
    if (!confirm("¿Eliminar esta ficha? El usuario podrá crear una nueva desde cero.")) return;
    const { error } = await sb.from("fichas").delete().eq("id", id);
    if (error) { console.error(error); showMsg(elStaffMsg, "No se pudo eliminar.", "error"); return; }
    showMsg(elStaffMsg, "Ficha eliminada", "ok");
    loadStaffList();
  }
}

async function onStaffListSubmit(e) {
  if (e.target.dataset.action !== "denegar") return;
  e.preventDefault();
  const card = e.target.closest(".staff-card");
  const id = card.dataset.id;
  const motivo = (new FormData(e.target).get("motivo") || "").trim() || "Sin motivo especificado";
  await staffAction(id, { status: "denegada", motivo_denegacion: motivo, reviewed_by: currentProfile.username });
}

async function staffAction(id, patch) {
  const { error } = await sb.from("fichas").update(patch).eq("id", id);
  if (error) {
    console.error(error);
    showMsg(elStaffMsg, "No se pudo actualizar la ficha.", "error");
    return;
  }
  showMsg(elStaffMsg, patch.status === "aprobada" ? "Ficha aprobada" : "Ficha denegada", "ok");
  loadStaffList();
}

// ---------- Utilidades ----------
function show(el, visible) { el.hidden = !visible; }

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = "alert alert--" + (type === "error" ? "error" : "ok");
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 5000);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }
