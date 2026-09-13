let allData = [];
let refreshInterval = null;
let lastRefreshTime = null;
let currentModule = "bot";

// Users allowed to see and use the CIS module. Server enforces this too.
const CIS_ALLOWED_USERS = ["Angel", "Jeovani"];

function cisAccessAllowed() {
  const name = (document.getElementById("userNameDisplay").textContent || "").trim();
  return CIS_ALLOWED_USERS.includes(name);
}

function applyCisAccess() {
  if (cisAccessAllowed()) return;
  const sel = document.getElementById("moduleSelector");
  const opt = sel.querySelector('option[value="cis"]');
  if (opt) opt.remove();
  const nav = document.getElementById("nav-cis");
  if (nav) nav.style.display = "none";
}

document.addEventListener("DOMContentLoaded", function() {
  checkAuth().then(function(resp) {
    if (resp.authenticated) {
      document.getElementById("userNameDisplay").textContent = resp.username;
      document.getElementById("userBadge").style.display = "";
      initializeApp();
    }
  });

  document.getElementById("loginButton").addEventListener("click", login);
  document.getElementById("loginPassword").addEventListener("keydown", function(e) {
    if (e.key === "Enter") login();
  });
  document.getElementById("btnLogout").addEventListener("click", logout);
});

function checkAuth() {
  return fetch("/api/auth/check").then(function(r) { return r.json(); })
    .catch(function() { return {authenticated: false}; });
}

function login() {
  var pwd = document.getElementById("loginPassword").value;
  document.getElementById("loginError").textContent = "";
  fetch("/api/auth/login", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({password: pwd})
  }).then(function(r) {
    if (!r.ok) {
      document.getElementById("loginError").textContent = "Contraseña incorrecta";
      return;
    }
    return r.json();
  }).then(function(data) {
    if (!data) return;
    document.getElementById("loginOverlay").style.display = "none";
    document.getElementById("userNameDisplay").textContent = data.username;
    document.getElementById("userBadge").style.display = "";
    initializeApp();
  });
}

function logout() {
  fetch("/api/auth/logout", {method: "POST"}).then(function() {
    location.reload();
  });
}

function initializeApp() {
  applyCisAccess();
  initNavigation();
  initModuleSelector();
  initRefresh();
  initSearch();
  initPagosSearch();
  initDownload();
  initAyudasSearch();
  initAyudasDownload();
  initInventarioSearch();
  initInventarioDownload();
  initInventarioProductos();
  initCisSearch();
  initCisDownload();
  initLiderSearch();
  initLiderDownload();
  initMicrolingotesSearch();
  initMicrolingotesDownload();
  initDinaresSearch();
  initDinaresDownload();
  initContenedoresSearch();
  initContenedoresDownload();
  initConsultaSearch();
  initTimezone();
  initFarleySearch();
  initVerificacionSearch();
  initReparticionSearch();
  initReparticionDownload();
  initVaquitasSearch();
  initVaquitasDownload();

  loadSection("registros");
  startAutoRefresh();
}

function initNavigation() {
  document.querySelectorAll(".sidebar-nav").forEach((nav) => {
    nav.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        nav.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const section = btn.dataset.section;
        switchSection(section);
        loadSection(section);
      });
    });
  });
}

function initModuleSelector() {
  document.getElementById("moduleSelector").addEventListener("change", (e) => {
    switchModule(e.target.value);
  });
}

function goLiderModule() {
  document.getElementById("moduleSelector").value = "lider";
  switchModule("lider");
}

function switchModule(module) {
  if (module === "cis" && !cisAccessAllowed()) {
    switchModule("bot");
    document.getElementById("moduleSelector").value = "bot";
    return;
  }
  currentModule = module;
  document.getElementById("btnModuleLider").classList.toggle("active", module === "lider");
  document.getElementById("nav-bot").style.display = module === "bot" ? "" : "none";
  document.getElementById("nav-pagos").style.display = module === "pagos" ? "" : "none";
  document.getElementById("nav-ayudas").style.display = module === "ayudas" ? "" : "none";
  document.getElementById("nav-inventario").style.display = module === "inventario" ? "" : "none";
  document.getElementById("nav-cis").style.display = module === "cis" ? "" : "none";
  document.getElementById("nav-lider").style.display = module === "lider" ? "" : "none";
  document.getElementById("nav-microlingotes").style.display = module === "microlingotes" ? "" : "none";
  document.getElementById("nav-dinares").style.display = module === "dinares" ? "" : "none";
  document.getElementById("nav-contenedores").style.display = module === "contenedores" ? "" : "none";
  document.getElementById("nav-consulta").style.display = module === "consulta" ? "" : "none";
  document.getElementById("nav-farley").style.display = module === "farley" ? "" : "none";
  document.getElementById("nav-verificacion").style.display = module === "verificacion" ? "" : "none";
  document.getElementById("nav-reparticion").style.display = module === "reparticion" ? "" : "none";
  document.getElementById("nav-vaquitas").style.display = module === "vaquitas" ? "" : "none";
  document.querySelectorAll(".content-section").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll(".sidebar-nav .nav-btn").forEach((b) => b.classList.remove("active"));

  document.body.classList.toggle("theme-ayudas", module === "ayudas");
  document.body.classList.toggle("theme-inventario", module === "inventario");
  document.body.classList.toggle("theme-cis", module === "cis");
  document.body.classList.toggle("theme-lider", module === "lider");
  document.body.classList.toggle("theme-microlingotes", module === "microlingotes");
  document.body.classList.toggle("theme-dinares", module === "dinares");
  document.body.classList.toggle("theme-contenedores", module === "contenedores");
  document.body.classList.toggle("theme-farley", module === "farley");
  document.body.classList.toggle("theme-verificacion", module === "verificacion");
  document.body.classList.toggle("theme-reparticion", module === "reparticion");
  document.body.classList.toggle("theme-vaquitas", module === "vaquitas");

  const activeNav = document.getElementById("nav-" + module);
  const firstBtn = activeNav.querySelector(".nav-btn");
  if (firstBtn) {
    firstBtn.classList.add("active");
    const section = firstBtn.dataset.section;
    switchSection(section);
    loadSection(section);
  }
}

function switchSection(section) {
  document.querySelectorAll(".content-section").forEach((s) => s.classList.remove("active"));
  const target = document.getElementById(`section-${section}`);
  if (target) target.classList.add("active");

  const titles = {
    registros: "Registros",
    estadisticas: "Estadisticas",
    anomalias: "Anomalias",
    descargar: "Descargar",
    "pagos-resumen": "Resumen de Pagos",
    "pagos-registros": "Registros de Pagos",
    "pagos-flayer": "Por Flayer",
    "pagos-personas": "Personas",
    "pagos-estadisticas": "Estadisticas de Pagos",
    "ayudas-registros": "Registros - Ayudas H.",
    "ayudas-estadisticas": "Estadisticas - Ayudas H.",
    "ayudas-descargar": "Descargar - Ayudas H.",
    "inventario-registros": "Registros - Inventario",
    "inventario-estadisticas": "Estadisticas - Inventario",
    "inventario-descargar": "Descargar - Inventario",
    "inventario-productos": "Productos - Inventario",
    "cis-registros": "Registros - CIS",
    "cis-estadisticas": "Estadisticas - CIS",
    "cis-descargar": "Descargar - CIS",
    "lider-registros": "Registros - Lider",
    "lider-estadisticas": "Estadisticas - Lider",
    "lider-descargar": "Descargar - Lider",
    "microlingotes-registros": "Registros - Microlingotes",
    "microlingotes-estadisticas": "Estadisticas - Microlingotes",
    "microlingotes-descargar": "Descargar - Microlingotes",
    "dinares-registros": "Registros - Dinares",
    "dinares-estadisticas": "Estadisticas - Dinares",
    "dinares-descargar": "Descargar - Dinares",
    "contenedores-registros": "Registros - Contenedores",
    "contenedores-estadisticas": "Estadisticas - Contenedores",
    "contenedores-descargar": "Descargar - Contenedores",
    "consulta-buscar": "Consulta General",
    "farley-resumen": "Resumen - B. DATOS FARLEY",
    "farley-miembros": "Miembros - B. DATOS FARLEY",
    "farley-promociones": "Promociones - B. DATOS FARLEY",
    "farley-graficos": "Gr&aacute;ficos - B. DATOS FARLEY",
    "farley-detalle": "Detalle - B. DATOS FARLEY",
    "verificacion-resumen": "Resumen - Verificación",
    "verificacion-busqueda": "Búsqueda - Verificación",
    "verificacion-descargar": "Descargar - Verificación",
    "reparticion-registros": "Registros - Vaquita",
    "reparticion-descargar": "Descargar - Vaquita",
    "vaquitas-registros": "Directorio - Vaquitas",
    "vaquitas-descargar": "Descargar - Vaquitas",
  };
  document.getElementById("sectionTitle").textContent = titles[section] || "Registros";
}

function loadSection(section, silent) {
  if (section === "registros") loadTable(silent);
  if (section === "estadisticas") { loadStats(silent); loadActivity(silent); }
  if (section === "anomalias") loadAnomalies(silent);
  if (section === "pagos-resumen") loadPagosResumen(silent);
  if (section === "pagos-registros") loadPagosRegistros(silent);
  if (section === "pagos-flayer") loadPagosFlayer(silent);
  if (section === "pagos-personas") loadPagosPersonas(silent);
  if (section === "pagos-estadisticas") loadPagosStats(silent);
  if (section === "ayudas-registros") loadAyudasRegistros(silent);
  if (section === "ayudas-estadisticas") loadAyudasStats(silent);
  if (section === "inventario-registros") loadInventarioRegistros(silent);
  if (section === "inventario-estadisticas") loadInventarioStats(silent);
  if (section === "inventario-productos") loadInventarioProductos(silent);
  if (section === "cis-registros") loadCisRegistros(silent);
  if (section === "cis-estadisticas") loadCisStats(silent);
  if (section === "lider-registros") loadLiderRegistros(silent);
  if (section === "lider-estadisticas") loadLiderStats(silent);
  if (section === "microlingotes-registros") loadMicrolingotesRegistros(silent);
  if (section === "microlingotes-estadisticas") loadMicrolingotesStats(silent);
  if (section === "dinares-registros") loadDinaresRegistros(silent);
  if (section === "dinares-estadisticas") loadDinaresStats(silent);
  if (section === "contenedores-registros") loadContenedoresRegistros(silent);
  if (section === "contenedores-estadisticas") loadContenedoresStats(silent);
  if (section === "consulta-buscar") loadConsulta(silent);
  if (section === "farley-resumen") loadFarleyResumen(silent);
  if (section === "farley-miembros") loadFarleyMiembros(silent);
  if (section === "farley-promociones") loadFarleyPromociones(silent);
  if (section === "farley-graficos") loadFarleyGraficos(silent);
  if (section === "farley-detalle") loadFarleyDetalle(silent);
  if (section === "verificacion-resumen") loadVerificacionResumen(silent);
  if (section === "verificacion-busqueda") loadVerificacionBusqueda(silent);
  if (section === "reparticion-registros") loadReparticionRegistros(silent);
  if (section === "vaquitas-registros") loadVaquitasRegistros(silent);
}

function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    const active = document.querySelector(".nav-btn.active");
    if (active) loadSection(active.dataset.section, true);
  }, 60000);
}

function initRefresh() {
  document.getElementById("btnRefresh").addEventListener("click", () => {
    updateRefreshIndicator(true);
    const active = document.querySelector(".nav-btn.active");
    if (active) loadSection(active.dataset.section, true);
  });
}

function updateRefreshIndicator(force) {
  const el = document.getElementById("refreshIndicator");
  lastRefreshTime = new Date();
  if (force) {
    el.textContent = "Actualizando...";
    setTimeout(() => tickRefreshIndicator(), 500);
  } else {
    tickRefreshIndicator();
  }
}

function tickRefreshIndicator() {
  const el = document.getElementById("refreshIndicator");
  if (!lastRefreshTime) return;
  const seconds = Math.floor((new Date() - lastRefreshTime) / 1000);
  if (seconds < 60) {
    el.textContent = `Actualizado hace ${seconds} segundos`;
  } else {
    const mins = Math.floor(seconds / 60);
    el.textContent = `Actualizado hace ${mins} minuto${mins > 1 ? "s" : ""}`;
  }
}

function initTimezone() {
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const label = document.getElementById("tzLocalLabel");
  if (localTz && localTz !== "America/Bogota") {
    label.textContent = `o ver en ${localTz}`;
    label.style.cursor = "pointer";
    label.addEventListener("click", () => {
      document.getElementById("tzSelector").value = "local";
      onTimezoneChange();
    });
  }

  const saved = localStorage.getItem("funlidi_tz");
  if (saved) {
    document.getElementById("tzSelector").value = saved;
  }

  document.getElementById("tzSelector").addEventListener("change", onTimezoneChange);
}

function onTimezoneChange() {
  const val = document.getElementById("tzSelector").value;
  localStorage.setItem("funlidi_tz", val);
  const active = document.querySelector(".nav-btn.active");
  if (active) loadSection(active.dataset.section);
}

function getSelectedTimezone() {
  return document.getElementById("tzSelector").value;
}

function initSearch() {
  document.getElementById("searchInput").addEventListener("input", (e) => {
    renderTable(e.target.value);
  });
}

function initDownload() {
  document.getElementById("btnDownload").addEventListener("click", async () => {
    const btn = document.getElementById("btnDownload");
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons">hourglass_top</span> Preparando archivo...';

    try {
      const resp = await fetch("/api/download");
      if (!resp.ok) throw new Error("Error al descargar");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getFilenameFromResponse(resp);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      document.getElementById("downloadInfo").textContent =
        "Descarga completada. El archivo se ha guardado en tu computadora.";
    } catch (err) {
      document.getElementById("downloadInfo").textContent =
        "Ocurrio un error al descargar. Intenta de nuevo mas tarde.";
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons">description</span> Descargar XLSX';
    }
  });
}

function getFilenameFromResponse(resp) {
  const header = resp.headers.get("Content-Disposition");
  if (header) {
    const match = header.match(/filename="(.+)"/);
    if (match) return match[1];
  }
  const hoy = new Date();
  const dd = String(hoy.getDate()).padStart(2, "0");
  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
  const yyyy = hoy.getFullYear();
  return `Registros_FUNLIDI_${dd}-${mm}-${yyyy}.xlsx`;
}

async function loadTable(silent) {
  const tbody = document.getElementById("tableBody");
  if (!silent) tbody.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando datos...</p></div></td></tr>`;

  try {
    const resp = await fetch("/api/data");
    if (!resp.ok) throw new Error("Error al obtener datos");
    const json = await resp.json();
    allData = json.data || [];
    renderTable();
    updateRefreshIndicator(false);
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="empty-state"><span class="material-icons empty-icon">error</span><p>No se pudieron cargar los datos. Revisa que el servidor de Supabase este funcionando.</p></div></td></tr>`;
  }
}

function renderTable(searchTerm) {
  const tbody = document.getElementById("tableBody");
  let filtered = allData;

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = allData.filter((r) =>
      [r.nombres_completos, r.correo_electronico, r.numero_documento, r.telegram_username].some(
        (v) => v && String(v).toLowerCase().includes(term)
      )
    );
  }

  document.getElementById("tableCount").textContent = `${filtered.length} registro${filtered.length !== 1 ? "s" : ""}`;

  if (filtered.length === 0) {
    const msg = searchTerm
      ? "No se encontraron personas con ese nombre, correo o documento."
      : "Aun no hay personas registradas. Los datos apareceran automaticamente aqui cuando los usuarios comiencen a usar el bot de Telegram.";
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>${msg}</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((r) => {
      const nombre = r.nombres_completos || "-";
      const correo = r.correo_electronico || "-";
      const doc = r.numero_documento || "-";
      const usuario = r.telegram_username ? "@" + r.telegram_username : "-";
      const completo = nombre !== "-" && correo !== "-" && doc !== "-";
      const estadoClass = completo ? "estado-completo" : "estado-incompleto";
      const estadoTexto = completo ? "Completo" : "Incompleto";
      return `
    <tr>
      <td>${usuario}</td>
      <td>${nombre}</td>
      <td>${correo}</td>
      <td>${doc}</td>
      <td><span class="estado-badge ${estadoClass}">${estadoTexto}</span></td>
      <td>${formatDate(r.updated_at || r.created_at)}</td>
    </tr>`;
    })
    .join("");
}

async function loadStats() {
  try {
    const resp = await fetch("/api/stats");
    if (!resp.ok) throw new Error("Error al obtener estadisticas");
    const json = await resp.json();

    animateNumber("statTotal", json.total);
    animateNumber("statCompletados", json.completados);
    animateNumber("statIncompletos", json.incompletos);
    animateNumber("statRegistrosHoy", json.registros_hoy || 0);
    animateNumber("statActualizacionesHoy", json.actualizaciones_hoy || 0);
    animateNumber("statRegistrosSemana", json.registros_semana || 0);
    animateNumber("statActualizacionesSemana", json.actualizaciones_semana || 0);

    document.getElementById("statUltima").textContent = json.ultima_actualizacion
      ? formatDateStrict(json.ultima_actualizacion)
      : "Aun no hay registros";

    updateRefreshIndicator(false);
  } catch (err) {
    document.getElementById("statTotal").textContent = "?";
    document.getElementById("statCompletados").textContent = "?";
    document.getElementById("statIncompletos").textContent = "?";
    document.getElementById("statUltima").textContent = "Error al cargar";
    document.getElementById("statRegistrosHoy").textContent = "?";
    document.getElementById("statActualizacionesHoy").textContent = "?";
    document.getElementById("statRegistrosSemana").textContent = "?";
    document.getElementById("statActualizacionesSemana").textContent = "?";
  }
}

async function loadActivity() {
  const tbody = document.getElementById("activityBody");

  try {
    const resp = await fetch("/api/activity");
    if (!resp.ok) throw new Error("Error al obtener actividad");
    const json = await resp.json();
    const items = json.actividades || [];

    if (items.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="4"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Aun no hay actividad registrada.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = items
      .map((a) => {
        const tipoClass =
          a.tipo === "Nuevo registro" ? "tipo-nuevo" : "tipo-actualizado";
        return `
      <tr>
        <td>${a.nombre}</td>
        <td>${a.usuario}</td>
        <td><span class="tipo-badge ${tipoClass}">${a.tipo}</span></td>
        <td>${formatDate(a.timestamp)}</td>
      </tr>`;
      })
      .join("");
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4"><div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar la actividad.</p></div></td></tr>`;
  }
}

async function loadAnomalies() {
  const container = document.getElementById("anomaliasContainer");

  try {
    const resp = await fetch("/api/anomalies");
    if (!resp.ok) throw new Error("Error al obtener anomalias");
    const json = await resp.json();
    const items = json.anomalias || [];

    if (items.length === 0) {
      container.innerHTML = `<div class="no-anomalies"><span class="material-icons no-anomalies-icon">verified</span><p>No se detectaron anomalias. Todos los datos parecen estar en orden.</p></div>`;
      return;
    }

    container.innerHTML =
      `<p class="anomalies-count">Se encontraron ${items.length} anomalia${items.length !== 1 ? "s" : ""}:</p>` +
      items
        .map((a) => {
          const icono =
            a.tipo === "documento"
              ? "badge"
              : a.tipo === "correo"
              ? "mail"
              : "person";
          return `
      <div class="anomaly-card">
        <div class="anomaly-header">
          <span class="material-icons anomaly-icon">${icono}</span>
          <div class="anomaly-header-text">
            <strong>${a.descripcion}</strong>
          </div>
        </div>
        <div class="anomaly-users">
          ${a.involucrados
            .map(
              (i) =>
                `<span class="anomaly-user"><span class="material-icons anomaly-user-icon">account_circle</span>${i.usuario} - ${i.nombre}</span>`
            )
            .join("")}
        </div>
      </div>`;
        })
        .join("");
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar las anomalias.</p></div>`;
  }
}

function animateNumber(elId, target) {
  const el = document.getElementById(elId);
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;

  const diff = target - current;
  const step = diff > 0 ? 1 : -1;
  const duration = 300;
  const interval = Math.max(duration / Math.abs(diff), 10);

  let val = current;
  const timer = setInterval(() => {
    val += step;
    el.textContent = val;
    if (val === target) clearInterval(timer);
  }, interval);
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const tz = getSelectedTimezone();
    const opts = {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    };
    if (tz !== "local") opts.timeZone = tz;
    return d.toLocaleDateString("es-CO", opts);
  } catch {
    return dateStr;
  }
}

function formatDateStrict(dateStr) {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const tz = getSelectedTimezone();
    const opts = {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    };
    if (tz !== "local") opts.timeZone = tz;
    return d.toLocaleDateString("es-CO", opts);
  } catch {
    return dateStr;
  }
}

// ========== PAGOS FUNCTIONS ==========

let pagosAllData = [];
let pagosFilteredData = [];
let pagosPersonasAll = [];

function initPagosSearch() {
  document.getElementById("pagosSearchInput").addEventListener("input", () => {
    renderPagosTable();
  });
  document.getElementById("pagosFlayerFilter").addEventListener("change", () => {
    renderPagosTable();
  });
  document.getElementById("pagosPersonasSearch").addEventListener("input", () => {
    renderPagosPersonas();
  });
  document.getElementById("pagosPersonasFlayer").addEventListener("change", () => {
    renderPagosPersonas();
  });
}

function formatCOP(val) {
  return "$" + Number(val).toLocaleString("es-CO");
}

function formatDateShort(dateStr) {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

async function loadPagosResumen() {
  const el = document.getElementById("pagosResumenContent");
  try {
    const resp = await fetch("/api/pagos/stats");
    if (!resp.ok) throw new Error("Error");
    const json = await resp.json();
    const d = json;

    let html = '<div class="stats-grid">';
    html += '<div class="stat-card"><span class="material-icons stat-icon">payments</span><div class="stat-info"><span class="stat-value">' + formatCOP(d.total_cop) + '</span><span class="stat-label">Total recaudado</span></div></div>';
    html += '<div class="stat-card"><span class="material-icons stat-icon">people</span><div class="stat-info"><span class="stat-value">' + d.total_personas_unicas + '</span><span class="stat-label">Personas unicas</span></div></div>';
    html += '<div class="stat-card"><span class="material-icons stat-icon">receipt_long</span><div class="stat-info"><span class="stat-value">' + d.total_transacciones + '</span><span class="stat-label">Transacciones</span></div></div>';
    html += '<div class="stat-card"><span class="material-icons stat-icon">schedule</span><div class="stat-info"><span class="stat-value stat-date">' + formatDateShort(d.ultima_transaccion) + '</span><span class="stat-label">Ultima transaccion</span></div></div>';
    html += '</div>';

    html += '<h3 class="section-subtitle">Desglose por Flayer</h3>';
    html += '<div class="flayer-grid">';
    for (const f of d.por_flayer) {
      html += '<div class="flayer-card">';
      html += '<div class="flayer-card-header">';
      html += '<span class="material-icons flayer-card-icon">category</span>';
      html += '<strong>' + f.flayer + '</strong>';
      html += '</div>';
      html += '<div class="flayer-card-body">';
      html += '<div class="flayer-stat"><span class="flayer-stat-label">Total COP</span><span class="flayer-stat-value">' + formatCOP(f.total_cop) + '</span></div>';
      html += '<div class="flayer-stat"><span class="flayer-stat-label">Cantidad</span><span class="flayer-stat-value">' + f.cantidad + '</span></div>';
      html += '<div class="flayer-stat"><span class="flayer-stat-label">Personas</span><span class="flayer-stat-value">' + f.personas_unicas + '</span></div>';
      html += '<div class="flayer-stat"><span class="flayer-stat-label">Porcentaje</span><span class="flayer-stat-value">' + f.porcentaje_cop + '%</span></div>';
      html += '<div class="bar-track"><div class="bar-fill" style="width:' + f.porcentaje_cop + '%"></div></div>';
      html += '</div></div>';
    }
    html += '</div>';

    html += '<h3 class="section-subtitle">Transacciones por Dia</h3>';
    html += '<div class="dia-list">';
    for (const dia of d.por_dia) {
      html += '<div class="dia-item"><span class="dia-fecha">' + formatDateShort(dia.fecha) + '</span><span class="dia-cant">' + dia.cantidad + ' trans.</span><span class="dia-valor">' + formatCOP(dia.total_cop) + '</span></div>';
    }
    html += '</div>';

    el.innerHTML = html;
    updateRefreshIndicator(false);
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar resumen de pagos.</p></div>';
  }
}

async function loadPagosRegistros(silent) {
  const tbody = document.getElementById("pagosTableBody");
  if (!silent) tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando registros de pagos...</p></div></td></tr>';

  try {
    const resp = await fetch("/api/pagos/data");
    if (!resp.ok) throw new Error("Error");
    const json = await resp.json();
    pagosAllData = json.data || [];

    const flayerSet = new Set();
    for (const r of pagosAllData) {
      if (r.flayer) flayerSet.add(r.flayer);
    }
    const sel = document.getElementById("pagosFlayerFilter");
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">Todos los flayers</option>';
    for (const f of [...flayerSet].sort()) {
      sel.innerHTML += '<option value="' + f.replace(/"/g, "&quot;") + '">' + f + '</option>';
    }
    sel.value = currentVal;

    renderPagosTable();
    updateRefreshIndicator(false);
  } catch (err) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar registros de pagos.</p></div></td></tr>';
  }
}

function renderPagosTable() {
  const tbody = document.getElementById("pagosTableBody");
  const search = document.getElementById("pagosSearchInput").value.toLowerCase();
  const flayerFilter = document.getElementById("pagosFlayerFilter").value;

  let filtered = pagosAllData;
  if (search) {
    filtered = filtered.filter(function(r) {
      return (r.nombres && r.nombres.toLowerCase().includes(search)) ||
             (r.identificacion && r.identificacion.toLowerCase().includes(search)) ||
             (r.referencia && r.referencia.toLowerCase().includes(search));
    });
  }
  if (flayerFilter) {
    filtered = filtered.filter(function(r) { return r.flayer === flayerFilter; });
  }

  document.getElementById("pagosTableCount").textContent = filtered.length + " registro" + (filtered.length !== 1 ? "s" : "");

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>' + (search ? "No se encontraron registros con ese filtro." : "No hay registros de pago.") + '</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(function(r) {
    return '<tr><td>' + (r.identificacion || "-") + '</td><td>' + (r.nombres || "-") + '</td><td>' + (r.referencia || "-") + '</td><td>' + formatDateShort(r.fecha) + '</td><td>' + (r.hora || "-") + '</td><td><span class="flayer-badge">' + (r.flayer || "-") + '</span></td><td class="valor-cell">' + formatCOP(r.valor) + '</td></tr>';
  }).join("");
}

async function loadPagosFlayer() {
  const el = document.getElementById("pagosFlayerContent");
  try {
    const resp = await fetch("/api/pagos/stats");
    if (!resp.ok) throw new Error("Error");
    const statsJson = await resp.json();

    const dataResp = await fetch("/api/pagos/data");
    if (!dataResp.ok) throw new Error("Error");
    const dataJson = await dataResp.json();
    const records = dataJson.data || [];

    const grouped = {};
    for (const r of records) {
      const f = r.flayer || "SIN ESPECIFICAR";
      if (!grouped[f]) grouped[f] = [];
      grouped[f].push(r);
    }

    let html = "";
    const flayers = statsJson.por_flayer || [];
    for (const f of flayers) {
      const items = grouped[f.flayer] || [];
      html += '<div class="flayer-detail-card">';
      html += '<div class="flayer-detail-header">';
      html += '<span class="material-icons flayer-detail-icon">category</span>';
      html += '<div class="flayer-detail-info">';
      html += '<strong>' + f.flayer + '</strong>';
      html += '<span class="flayer-detail-meta">' + f.cantidad + ' transacciones | ' + formatCOP(f.total_cop) + ' | ' + f.personas_unicas + ' personas</span>';
      html += '</div>';
      html += '<span class="flayer-detail-pct">' + f.porcentaje_cop + '%</span>';
      html += '</div>';
      html += '<div class="table-wrapper" style="margin-top:12px"><table class="data-table"><thead><tr><th>ID</th><th>Nombre</th><th>Referencia</th><th>Fecha</th><th>Valor</th></tr></thead><tbody>';
      for (const item of items) {
        html += '<tr><td>' + (item.identificacion || "-") + '</td><td>' + (item.nombres || "-") + '</td><td>' + (item.referencia || "-") + '</td><td>' + formatDateShort(item.fecha) + '</td><td class="valor-cell">' + formatCOP(item.valor) + '</td></tr>';
      }
      html += '</tbody></table></div></div>';
    }

    el.innerHTML = html;
    updateRefreshIndicator(false);
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar datos por flayer.</p></div>';
  }
}

async function loadPagosPersonas(silent) {
  const tbody = document.getElementById("pagosPersonasBody");
  if (!silent) tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando personas...</p></div></td></tr>';

  try {
    const resp = await fetch("/api/pagos/personas");
    if (!resp.ok) throw new Error("Error");
    const json = await resp.json();
    pagosPersonasAll = json.personas || [];

    const flayerSet = new Set();
    for (const p of pagosPersonasAll) {
      for (const f of p.flyers) flayerSet.add(f);
    }
    const sel = document.getElementById("pagosPersonasFlayer");
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">Todos los flayers</option>';
    for (const f of [...flayerSet].sort()) {
      sel.innerHTML += '<option value="' + f.replace(/"/g, "&quot;") + '">' + f + '</option>';
    }
    sel.value = currentVal;

    renderPagosPersonas();
    updateRefreshIndicator(false);
  } catch (err) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar personas.</p></div></td></tr>';
  }
}

function renderPagosPersonas() {
  const tbody = document.getElementById("pagosPersonasBody");
  const search = document.getElementById("pagosPersonasSearch").value.toLowerCase();
  const flayerFilter = document.getElementById("pagosPersonasFlayer").value;

  let filtered = pagosPersonasAll;
  if (search) {
    filtered = filtered.filter(function(p) {
      return (p.nombres && p.nombres.toLowerCase().includes(search)) ||
             (p.identificacion && p.identificacion.toLowerCase().includes(search));
    });
  }
  if (flayerFilter) {
    filtered = filtered.filter(function(p) {
      return p.flyers && p.flyers.indexOf(flayerFilter) !== -1;
    });
  }

  document.getElementById("pagosPersonasCount").textContent = filtered.length + " persona" + (filtered.length !== 1 ? "s" : "");

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>' + (search ? "No se encontraron personas con ese filtro." : "No hay personas registradas.") + '</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(function(p) {
    return '<tr><td>' + (p.identificacion || "-") + '</td><td>' + (p.nombres || "-") + '</td><td class="valor-cell">' + formatCOP(p.total_gastado) + '</td><td>' + p.transacciones + '</td><td>' + p.flyers.map(function(f) { return '<span class="flayer-badge">' + f + '</span>'; }).join(" ") + '</td><td>' + formatDateShort(p.ultimo_pago) + '</td></tr>';
  }).join("");
}

async function loadPagosStats() {
  const el = document.getElementById("pagosStatsContent");
  try {
    const resp = await fetch("/api/pagos/stats");
    if (!resp.ok) throw new Error("Error");
    const d = await resp.json();

    let html = '<h3 class="section-subtitle">COP por Flayer</h3>';
    html += '<div class="bar-chart">';
    const maxCop = d.por_flayer.length > 0 ? d.por_flayer[0].total_cop : 1;
    for (const f of d.por_flayer) {
      const pct = Math.round(f.total_cop / maxCop * 100);
      html += '<div class="bar-item"><span class="bar-label">' + f.flayer + '</span><div class="bar-track"><div class="bar-fill bar-fill-cop" style="width:' + pct + '%"></div></div><span class="bar-value">' + formatCOP(f.total_cop) + '</span></div>';
    }
    html += '</div>';

    html += '<h3 class="section-subtitle" style="margin-top:32px">Personas por Flayer</h3>';
    html += '<div class="bar-chart">';
    const maxPeople = d.por_flayer.length > 0 ? d.por_flayer[0].personas_unicas : 1;
    for (const f of d.por_flayer) {
      const pct = Math.round(f.personas_unicas / maxPeople * 100);
      html += '<div class="bar-item"><span class="bar-label">' + f.flayer + '</span><div class="bar-track"><div class="bar-fill bar-fill-people" style="width:' + pct + '%"></div></div><span class="bar-value">' + f.personas_unicas + ' pers.</span></div>';
    }
    html += '</div>';

    html += '<h3 class="section-subtitle" style="margin-top:32px">Transacciones por Dia</h3>';
    html += '<div class="bar-chart">';
    const maxDia = d.por_dia.length > 0 ? Math.max.apply(Math, d.por_dia.map(function(x) { return x.cantidad; })) : 1;
    for (const dia of d.por_dia) {
      const pct = Math.round(dia.cantidad / maxDia * 100);
      html += '<div class="bar-item"><span class="bar-label bar-label-date">' + formatDateShort(dia.fecha) + '</span><div class="bar-track"><div class="bar-fill bar-fill-dia" style="width:' + pct + '%"></div></div><span class="bar-value">' + dia.cantidad + ' (' + formatCOP(dia.total_cop) + ')</span></div>';
    }
    html += '</div>';

    el.innerHTML = html;
    updateRefreshIndicator(false);
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar estadisticas de pagos.</p></div>';
  }
}

// ========== AYUDAS HUMANITARIAS FUNCTIONS ==========

let ayudasAllData = [];
let ayudasExpandedRow = null;
let ayudasBenefExpanded = {};

function initAyudasSearch() {
  document.getElementById("ayudasSearchInput").addEventListener("input", renderAyudasTable);
  document.getElementById("ayudasPaisFilter").addEventListener("change", renderAyudasTable);
  document.getElementById("ayudasEstadoFilter").addEventListener("change", renderAyudasTable);
  document.getElementById("btnAyudasAdd").addEventListener("click", openAyudasAddModal);
}

function initAyudasDownload() {
  document.getElementById("btnAyudasDownload").addEventListener("click", async () => {
    const btn = document.getElementById("btnAyudasDownload");
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons">hourglass_top</span> Preparando archivo...';
    try {
      const resp = await fetch("/api/ayudas/download");
      if (!resp.ok) throw new Error("Error al descargar");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getAyudasFilename(resp);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      document.getElementById("ayudasDownloadInfo").textContent = "Descarga completada.";
    } catch (err) {
      document.getElementById("ayudasDownloadInfo").textContent = "Error al descargar.";
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons">description</span> Descargar XLSX';
    }
  });
}

function getAyudasFilename(resp) {
  const header = resp.headers.get("Content-Disposition");
  if (header) {
    const m = header.match(/filename="(.+)"/);
    if (m) return m[1];
  }
  const hoy = new Date();
  return `Ayudas_Humanitarias_${String(hoy.getDate()).padStart(2,"0")}-${String(hoy.getMonth()+1).padStart(2,"0")}-${hoy.getFullYear()}.xlsx`;
}

function getCountryFlag(pais) {
  const flags = {
    "COLOMBIA": "🇨🇴", "VENEZUELA": "🇻🇪", "ECUADOR": "🇪🇨", "PERU": "🇵🇪",
    "ARGENTINA": "🇦🇷", "CHILE": "🇨🇱", "BRASIL": "🇧🇷", "BOLIVIA": "🇧🇴",
    "PARAGUAY": "🇵🇾", "URUGUAY": "🇺🇾", "PANAMA": "🇵🇦", "COSTA RICA": "🇨🇷",
    "NICARAGUA": "🇳🇮", "HONDURAS": "🇭🇳", "EL SALVADOR": "🇸🇻", "GUATEMALA": "🇬🇹",
    "MEXICO": "🇲🇽", "ESTADOS UNIDOS": "🇺🇸", "ESPAÑA": "🇪🇸", "ITALIA": "🇮🇹",
    "FRANCIA": "🇫🇷", "ALEMANIA": "🇩🇪", "REINO UNIDO": "🇬🇧", "CANADA": "🇨🇦",
    "REPUBLICA DOMINICANA": "🇩🇴", "CUBA": "🇨🇺", "PUERTO RICO": "🇵🇷",
    "HAITI": "🇭🇹", "JAPON": "🇯🇵", "CHINA": "🇨🇳",
  };
  const key = (pais || "").toUpperCase().trim();
  return flags[key] || "🌍";
}

function getAyudasEstadoBadge(estado) {
  if (estado === "completo") return '<span class="estado-badge estado-completo">Completo</span>';
  if (estado === "sin_banco") return '<span class="estado-badge estado-sinbanco">Sin banco</span>';
  return '<span class="estado-badge estado-incompleto">Incompleto</span>';
}

function buildAyudasDetailHtml(r, idx) {
  const f = (v) => v && String(v).trim() && String(v).trim() !== "VACIO" ? String(v).trim() : "—";
  const flag = getCountryFlag(r.pais);
  return `
    <div class="ayudas-detail-card">
      <div class="ayudas-detail-section">
        <div class="ayudas-detail-title"><span class="material-icons">person</span> INFORMACION PERSONAL</div>
        <div class="ayudas-detail-grid">
          <div class="ayudas-detail-item"><span class="material-icons">badge</span><span class="ayudas-detail-label">Nombres:</span><span class="ayudas-detail-value">${f(r.nombre)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">assignment_ind</span><span class="ayudas-detail-label">Cedula/DNI:</span><span class="ayudas-detail-value">${f(r.dni)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">public</span><span class="ayudas-detail-label">Pais:</span><span class="ayudas-detail-value">${flag} ${f(r.pais)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">location_city</span><span class="ayudas-detail-label">Ciudad:</span><span class="ayudas-detail-value">${f(r.ciudad)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">flight</span><span class="ayudas-detail-label">Pasaporte:</span><span class="ayudas-detail-value">${f(r.pasaporte)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">work</span><span class="ayudas-detail-label">Ocupacion:</span><span class="ayudas-detail-value">${f(r.ocupacion)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">phone</span><span class="ayudas-detail-label">Telefono:</span><span class="ayudas-detail-value">${f(r.telefono)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">email</span><span class="ayudas-detail-label">Correo:</span><span class="ayudas-detail-value">${f(r.correo)}</span></div>
        </div>
      </div>
      <div class="ayudas-detail-section">
        <div class="ayudas-detail-title"><span class="material-icons">account_balance</span> INFORMACION BANCARIA</div>
        <div class="ayudas-detail-grid">
          <div class="ayudas-detail-item"><span class="material-icons">account_balance</span><span class="ayudas-detail-label">Banco:</span><span class="ayudas-detail-value">${f(r.banco)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">swap_horiz</span><span class="ayudas-detail-label">Swift:</span><span class="ayudas-detail-value">${f(r.swift)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">credit_card</span><span class="ayudas-detail-label">Cuenta:</span><span class="ayudas-detail-value">${f(r.nbancaria)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">category</span><span class="ayudas-detail-label">Tipo:</span><span class="ayudas-detail-value">${f(r.tipocuenta)}</span></div>
        </div>
      </div>
      <div class="ayudas-detail-section">
        <div class="ayudas-detail-title"><span class="material-icons">people</span> BENEFICIARIOS (${(r.beneficiarios||[]).length})</div>
        ${(r.beneficiarios||[]).length === 0 ? '<div style="color:#9E9E9E;font-size:13px">No tiene beneficiarios registrados.</div>' : (r.beneficiarios||[]).map((b, bi) => {
          const key = idx + '-' + b.beneficiary_number;
          const isBenefExpanded = ayudasBenefExpanded[key];
          const benefIcon = isBenefExpanded ? 'expand_less' : 'expand_more';
          const benefName = f(b.nombre);
          return `
          <div class="ayudas-benef-card">
            <div class="ayudas-benef-header" onclick="event.stopPropagation();toggleAyudasBenef(${idx}, ${b.beneficiary_number})">
              <span class="material-icons">person</span> Beneficiario #${b.beneficiary_number} - ${benefName}
              <span class="material-icons ayudas-expand-icon" style="margin-left:auto">${benefIcon}</span>
            </div>
            ${isBenefExpanded ? `
            <div class="ayudas-benef-grid">
              <div class="ayudas-detail-item"><span class="material-icons">badge</span><span class="ayudas-detail-label">Nombres:</span><span class="ayudas-detail-value">${f(b.nombre)}</span></div>
              <div class="ayudas-detail-item"><span class="material-icons">assignment_ind</span><span class="ayudas-detail-label">Cedula/DNI:</span><span class="ayudas-detail-value">${f(b.dni)}</span></div>
              <div class="ayudas-detail-item"><span class="material-icons">public</span><span class="ayudas-detail-label">Pais:</span><span class="ayudas-detail-value">${getCountryFlag(b.pais)} ${f(b.pais)}</span></div>
              <div class="ayudas-detail-item"><span class="material-icons">location_city</span><span class="ayudas-detail-label">Ciudad:</span><span class="ayudas-detail-value">${f(b.ciudad)}</span></div>
              <div class="ayudas-detail-item"><span class="material-icons">flight</span><span class="ayudas-detail-label">Pasaporte:</span><span class="ayudas-detail-value">${f(b.pasaporte)}</span></div>
              <div class="ayudas-detail-item"><span class="material-icons">work</span><span class="ayudas-detail-label">Ocupacion:</span><span class="ayudas-detail-value">${f(b.ocupacion)}</span></div>
              <div class="ayudas-detail-item"><span class="material-icons">phone</span><span class="ayudas-detail-label">Telefono:</span><span class="ayudas-detail-value">${f(b.telefono)}</span></div>
              <div class="ayudas-detail-item"><span class="material-icons">email</span><span class="ayudas-detail-label">Correo:</span><span class="ayudas-detail-value">${f(b.correo)}</span></div>
            </div>` : ''}
          </div>`;
        }).join('')}
      </div>
      <div class="ayudas-detail-section ayudas-detail-section-meta">
        <div class="ayudas-detail-meta-row">
          <span class="material-icons">schedule</span> Creado: ${formatDate(r.created_at)}
          <span class="material-icons" style="margin-left:20px">update</span> Actualizado: ${formatDate(r.updated_at)}
        </div>
      </div>
      <div class="ayudas-detail-section" style="border-bottom:none">
        <div class="ayudas-detail-title" style="font-size:13px">
          <span class="material-icons" style="font-size:18px">security</span>
          AUTORIZACI&Oacute;N BENEFICIARIOS
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:6px 0">
          <span style="font-size:13px">Permitir agregar beneficiarios desde el bot</span>
          <label class="toggle-switch">
            <input type="checkbox" ${r.beneficiarios_autorizado ? 'checked' : ''} onchange="toggleBenefApproval(${r.telegram_user_id}, this.checked)">
            <span class="toggle-slider"></span>
          </label>
          <span style="font-size:12px;color:#9E9E9E" id="benefApprovalStatus-${r.telegram_user_id}">${r.beneficiarios_autorizado ? 'Autorizado' : 'No autorizado'}</span>
        </div>
      </div>
      <div class="inventario-detail-actions">
        <button class="btn btn-sm btn-edit" onclick="event.stopPropagation();openAyudasEditModal(${r.telegram_user_id})">
          <span class="material-icons" style="font-size:16px">edit</span> Editar
        </button>
        <button class="btn btn-sm btn-delete" onclick="event.stopPropagation();openAyudasDeleteModal(${r.telegram_user_id})">
          <span class="material-icons" style="font-size:16px">delete</span> Eliminar
        </button>
      </div>
    </div>`;
}

function toggleAyudasDetail(idx) {
  const tbody = document.getElementById("ayudasTableBody");
  if (ayudasExpandedRow === idx) {
    ayudasExpandedRow = null;
    ayudasBenefExpanded = {};
    renderAyudasTable();
    return;
  }
  ayudasExpandedRow = idx;
  ayudasBenefExpanded = {};
  renderAyudasTable();
}

function toggleAyudasBenef(rowIdx, benefN) {
  const key = rowIdx + '-' + benefN;
  if (ayudasBenefExpanded[key]) {
    delete ayudasBenefExpanded[key];
  } else {
    ayudasBenefExpanded[key] = true;
  }
  renderAyudasTable();
}

async function loadAyudasRegistros(silent) {
  const tbody = document.getElementById("ayudasTableBody");
  if (!silent) tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando datos...</p></div></td></tr>';

  try {
    const resp = await fetch("/api/ayudas/data");
    if (!resp.ok) throw new Error("Error");
    const json = await resp.json();
    ayudasAllData = json.data || [];

    const paises = new Set();
    for (const r of ayudasAllData) {
      if (r.pais && r.pais.trim() && r.pais !== "VACIO") paises.add(r.pais.trim().toUpperCase());
    }
    const sel = document.getElementById("ayudasPaisFilter");
    const cur = sel.value;
    sel.innerHTML = '<option value="">Todos los paises</option>';
    for (const p of [...paises].sort()) {
      sel.innerHTML += '<option value="' + p.replace(/"/g, "&quot;") + '">' + p + '</option>';
    }
    sel.value = cur;

    renderAyudasTable();
    updateRefreshIndicator(false);
  } catch (err) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar datos.</p></div></td></tr>';
  }
}

function renderAyudasTable() {
  const tbody = document.getElementById("ayudasTableBody");
  const search = document.getElementById("ayudasSearchInput").value.toLowerCase();
  const paisFilter = document.getElementById("ayudasPaisFilter").value;
  const estadoFilter = document.getElementById("ayudasEstadoFilter").value;

  let filtered = ayudasAllData;
  if (search) {
    filtered = filtered.filter((r) => {
      const mainMatch = [r.nombre, r.dni, r.pais, r.ciudad, r.telefono, r.correo, r.banco, r.ocupacion, r.pasaporte]
        .some((v) => v && String(v).toLowerCase().includes(search));
      if (mainMatch) return true;
      const benefs = r.beneficiarios || [];
      return benefs.some((b) =>
        [b.nombre, b.dni, b.pais, b.ciudad, b.telefono, b.correo, b.ocupacion, b.pasaporte]
          .some((v) => v && String(v).toLowerCase().includes(search))
      );
    });
  }
  if (paisFilter) {
    filtered = filtered.filter((r) => (r.pais || "").toUpperCase().trim() === paisFilter);
  }
  if (estadoFilter) {
    filtered = filtered.filter((r) => r.estado === estadoFilter);
  }

  document.getElementById("ayudasTableCount").textContent = filtered.length + " registro" + (filtered.length !== 1 ? "s" : "");

  if (filtered.length === 0) {
    const msg = search || paisFilter || estadoFilter
      ? "No se encontraron registros con esos filtros."
      : "Aun no hay registros de Ayudas Humanitarias.";
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>' + msg + '</p></div></td></tr>';
    return;
  }

  let html = "";
  for (let i = 0; i < filtered.length; i++) {
    const r = filtered[i];
    const flag = getCountryFlag(r.pais);
    const expandIcon = ayudasExpandedRow === i ? "expand_less" : "expand_more";
    const isExpanded = ayudasExpandedRow === i;

    html += '<tr class="ayudas-row" onclick="toggleAyudasDetail(' + i + ')">';
    html += '<td class="ayudas-expand-cell"><span class="material-icons ayudas-expand-icon">' + expandIcon + '</span></td>';
    const benefCount = (r.beneficiarios || []).length;
    const benefBadge = benefCount > 0 ? ' <span class="benef-count-badge">' + benefCount + ' benef.</span>' : '';
    html += '<td><strong>' + (r.nombre || "—") + '</strong>' + benefBadge + '</td>';
    html += '<td>' + (r.dni || "—") + '</td>';
    html += '<td>' + flag + ' ' + (r.pais || "—") + '</td>';
    html += '<td>' + (r.telefono || "—") + '</td>';
    html += '<td>' + getAyudasEstadoBadge(r.estado) + '</td>';
    html += '<td>' + formatDate(r.updated_at || r.created_at) + '</td>';
    html += '</tr>';

    if (isExpanded) {
      html += '<tr class="ayudas-detail-row"><td colspan="7">' + buildAyudasDetailHtml(r, i) + '</td></tr>';
    }
  }
  tbody.innerHTML = html;
}

async function loadAyudasStats(silent) {
  const el = document.getElementById("ayudasStatsGrid");
  if (!silent) el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando estadisticas...</p></div>';

  try {
    const resp = await fetch("/api/ayudas/stats");
    if (!resp.ok) throw new Error("Error");
    const d = await resp.json();

    el.innerHTML =
      '<div class="stat-card"><span class="material-icons stat-icon">people</span><div class="stat-info"><span class="stat-value">' + d.total + '</span><span class="stat-label">Total de registros</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">check_circle</span><div class="stat-info"><span class="stat-value">' + d.completos + '</span><span class="stat-label">Completos</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">account_balance</span><div class="stat-info"><span class="stat-value">' + d.sin_banco + '</span><span class="stat-label">Sin banco (N/A)</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">warning</span><div class="stat-info"><span class="stat-value">' + d.incompletos + '</span><span class="stat-label">Incompletos</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">people</span><div class="stat-info"><span class="stat-value">' + (d.total_beneficiarios || 0) + '</span><span class="stat-label">Beneficiarios</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">public</span><div class="stat-info"><span class="stat-value">' + d.paises.length + '</span><span class="stat-label">Paises distintos</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">today</span><div class="stat-info"><span class="stat-value">' + d.registros_hoy + '</span><span class="stat-label">Registros de hoy</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">date_range</span><div class="stat-info"><span class="stat-value">' + d.registros_semana + '</span><span class="stat-label">Registros esta semana</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">schedule</span><div class="stat-info"><span class="stat-value stat-date">' + (d.ultima_actualizacion ? formatDateStrict(d.ultima_actualizacion) : "—") + '</span><span class="stat-label">Ultima actualizacion</span></div></div>';

    if (d.paises.length > 0) {
      el.innerHTML += '<div style="grid-column:1/-1;margin-top:8px"><h3 class="section-subtitle">Paises registrados</h3><div class="ayudas-paises-list">';
      for (const p of d.paises) {
        el.innerHTML += '<span class="ayudas-pais-tag">' + getCountryFlag(p) + ' ' + p + '</span>';
      }
      el.innerHTML += '</div></div>';
    }

    updateRefreshIndicator(false);
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar estadisticas.</p></div>';
  }
}


// ========== AYUDAS CRUD FUNCTIONS ==========


function openAyudasAddModal() {
  document.getElementById("ayudasEditTelegramUserId").value = "";
  document.getElementById("ayudasModalTitle").textContent = "Añadir registro";
  document.getElementById("ayudFormUsername").value = "";
  document.getElementById("ayudFormNombre").value = "";
  document.getElementById("ayudFormDni").value = "";
  document.getElementById("ayudFormPais").value = "";
  document.getElementById("ayudFormCiudad").value = "";
  document.getElementById("ayudFormPasaporte").value = "";
  document.getElementById("ayudFormOcupacion").value = "";
  document.getElementById("ayudFormTelefono").value = "";
  document.getElementById("ayudFormCorreo").value = "";
  document.getElementById("ayudFormBanco").value = "";
  document.getElementById("ayudFormSwift").value = "";
  document.getElementById("ayudFormNbancaria").value = "";
  document.getElementById("ayudFormTipocuenta").value = "";
  document.getElementById("ayudFormTipocuentaOtro").value = "";
  document.getElementById("ayudFormTipocuentaOtro").style.display = "none";
  document.getElementById("btnAyudasModalSubmit").textContent = "Guardar";
  document.getElementById("ayudasBeneficiariosContainer").innerHTML = "";
  document.getElementById("ayudasModalOverlay").style.display = "flex";
}


function openAyudasEditModal(telegramUserId) {
  const r = ayudasAllData.find(function(item) { return item.telegram_user_id === telegramUserId; });
  if (!r) return;

  document.getElementById("ayudasEditTelegramUserId").value = telegramUserId;
  document.getElementById("ayudasModalTitle").textContent = "Editar registro";
  document.getElementById("ayudFormUsername").value = r.telegram_username || "";
  document.getElementById("ayudFormNombre").value = r.nombre || "";
  document.getElementById("ayudFormDni").value = r.dni || "";
  document.getElementById("ayudFormPais").value = r.pais || "";
  document.getElementById("ayudFormCiudad").value = r.ciudad || "";
  document.getElementById("ayudFormPasaporte").value = r.pasaporte || "";
  document.getElementById("ayudFormOcupacion").value = r.ocupacion || "";
  document.getElementById("ayudFormTelefono").value = r.telefono || "";
  document.getElementById("ayudFormCorreo").value = r.correo || "";
  document.getElementById("ayudFormBanco").value = r.banco || "";
  document.getElementById("ayudFormSwift").value = r.swift || "";
  document.getElementById("ayudFormNbancaria").value = r.nbancaria || "";
  var tipocuenta = r.tipocuenta || "";
  if (tipocuenta === "AHORROS" || tipocuenta === "CORRIENTE" || tipocuenta === "OTRA") {
    document.getElementById("ayudFormTipocuenta").value = tipocuenta;
    document.getElementById("ayudFormTipocuentaOtro").value = "";
    document.getElementById("ayudFormTipocuentaOtro").style.display = "none";
  } else if (tipocuenta && tipocuenta !== "—") {
    document.getElementById("ayudFormTipocuenta").value = "OTRA";
    document.getElementById("ayudFormTipocuentaOtro").value = tipocuenta;
    document.getElementById("ayudFormTipocuentaOtro").style.display = "";
  } else {
    document.getElementById("ayudFormTipocuenta").value = "";
    document.getElementById("ayudFormTipocuentaOtro").value = "";
    document.getElementById("ayudFormTipocuentaOtro").style.display = "none";
  }
  document.getElementById("btnAyudasModalSubmit").textContent = "Actualizar";

  // Build beneficiary cards
  var container = document.getElementById("ayudasBeneficiariosContainer");
  container.innerHTML = "";
  var benefs = r.beneficiarios || [];
  for (var i = 0; i < benefs.length; i++) {
    ayudasAddBeneficiario(benefs[i]);
  }

  document.getElementById("ayudasModalOverlay").style.display = "flex";
}


function closeAyudasModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("ayudasModalOverlay").style.display = "none";
}


function getAyudasFormData() {
  var tipocuenta = document.getElementById("ayudFormTipocuenta").value;
  if (tipocuenta === "OTRA") {
    var otroVal = document.getElementById("ayudFormTipocuentaOtro").value.trim();
    if (otroVal) tipocuenta = otroVal;
  }

  // Collect beneficiaries
  var container = document.getElementById("ayudasBeneficiariosContainer");
  var benefCards = container.querySelectorAll(".beneficiario-card");
  var beneficiarios = [];
  for (var i = 0; i < benefCards.length; i++) {
    var card = benefCards[i];
    beneficiarios.push({
      nombre: (card.querySelector('[name="benef-nombre"]') || {}).value || "",
      dni: (card.querySelector('[name="benef-dni"]') || {}).value || "",
      pais: (card.querySelector('[name="benef-pais"]') || {}).value || "",
      ciudad: (card.querySelector('[name="benef-ciudad"]') || {}).value || "",
      pasaporte: (card.querySelector('[name="benef-pasaporte"]') || {}).value || "",
      ocupacion: (card.querySelector('[name="benef-ocupacion"]') || {}).value || "",
      telefono: (card.querySelector('[name="benef-telefono"]') || {}).value || "",
      correo: (card.querySelector('[name="benef-correo"]') || {}).value || "",
    });
  }

  return {
    telegram_username: document.getElementById("ayudFormUsername").value.trim(),
    nombre: document.getElementById("ayudFormNombre").value.trim(),
    dni: document.getElementById("ayudFormDni").value.trim(),
    pais: document.getElementById("ayudFormPais").value.trim(),
    ciudad: document.getElementById("ayudFormCiudad").value.trim(),
    pasaporte: document.getElementById("ayudFormPasaporte").value.trim(),
    ocupacion: document.getElementById("ayudFormOcupacion").value.trim(),
    telefono: document.getElementById("ayudFormTelefono").value.trim(),
    correo: document.getElementById("ayudFormCorreo").value.trim(),
    banco: document.getElementById("ayudFormBanco").value.trim(),
    swift: document.getElementById("ayudFormSwift").value.trim(),
    nbancaria: document.getElementById("ayudFormNbancaria").value.trim(),
    tipocuenta: tipocuenta,
    beneficiarios: beneficiarios,
  };
}


async function submitAyudasForm() {
  var nombre = document.getElementById("ayudFormNombre").value.trim();
  if (!nombre) {
    alert("El campo Nombres y Apellidos es obligatorio.");
    document.getElementById("ayudFormNombre").focus();
    return;
  }

  var btn = document.getElementById("btnAyudasModalSubmit");
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    var editId = document.getElementById("ayudasEditTelegramUserId").value;
    var data = getAyudasFormData();
    var url, method;

    if (editId) {
      url = "/api/ayudas/edit/" + editId;
      method = "PUT";
    } else {
      url = "/api/ayudas/add";
      method = "POST";
    }

    var resp = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!resp.ok) {
      var errData = await resp.json().catch(function() { return {}; });
      throw new Error(errData.detail || "Error al guardar");
    }

    closeAyudasModal();
    ayudasExpandedRow = null;
    await loadAyudasRegistros();
  } catch (err) {
    alert(err.message || "Ocurrio un error al guardar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = document.getElementById("ayudasEditTelegramUserId").value ? "Actualizar" : "Guardar";
  }
}


function openAyudasDeleteModal(telegramUserId) {
  document.getElementById("ayudasDeleteTelegramUserId").value = telegramUserId;
  document.getElementById("ayudasDeleteOverlay").style.display = "flex";
}


function closeAyudasDeleteModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("ayudasDeleteOverlay").style.display = "none";
}


async function executeAyudasDelete() {
  var telegramUserId = document.getElementById("ayudasDeleteTelegramUserId").value;
  if (!telegramUserId) return;

  var btn = document.querySelector("#ayudasDeleteModal .btn-danger");
  btn.disabled = true;
  btn.textContent = "Eliminando...";

  try {
    var resp = await fetch("/api/ayudas/delete/" + telegramUserId, {
      method: "DELETE",
    });

    if (!resp.ok) throw new Error("Error al eliminar");

    closeAyudasDeleteModal();
    ayudasExpandedRow = null;
    await loadAyudasRegistros();
  } catch (err) {
    alert("Ocurrio un error al eliminar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Eliminar";
  }
}


function ayudasAddBeneficiario(data) {
  var container = document.getElementById("ayudasBeneficiariosContainer");
  var count = container.querySelectorAll(".beneficiario-card").length;
  if (count >= 10) {
    alert("Máximo 10 beneficiarios.");
    return;
  }
  var idx = count;

  var div = document.createElement("div");
  div.className = "beneficiario-card";
  div.dataset.idx = idx;

  var n = data ? (data.nombre || "") : "";
  var d = data ? (data.dni || "") : "";
  var p = data ? (data.pais || "") : "";
  var c = data ? (data.ciudad || "") : "";
  var pas = data ? (data.pasaporte || "") : "";
  var o = data ? (data.ocupacion || "") : "";
  var t = data ? (data.telefono || "") : "";
  var e = data ? (data.correo || "") : "";

  div.innerHTML =
    '<div class="beneficiario-header">' +
      '<span>Beneficiario #' + (idx + 1) + '</span>' +
      '<button type="button" class="beneficiario-remove" onclick="ayudasRemoveBeneficiario(this)">&times;</button>' +
    '</div>' +
    '<div class="form-row">' +
      '<input class="form-input" name="benef-nombre" placeholder="Nombre" value="' + escHtml(n) + '">' +
      '<input class="form-input" name="benef-dni" placeholder="DNI" value="' + escHtml(d) + '">' +
    '</div>' +
    '<div class="form-row">' +
      '<input class="form-input" name="benef-pais" placeholder="País" value="' + escHtml(p) + '">' +
      '<input class="form-input" name="benef-ciudad" placeholder="Ciudad" value="' + escHtml(c) + '">' +
    '</div>' +
    '<div class="form-row">' +
      '<input class="form-input" name="benef-pasaporte" placeholder="Pasaporte" value="' + escHtml(pas) + '">' +
      '<input class="form-input" name="benef-ocupacion" placeholder="Ocupación" value="' + escHtml(o) + '">' +
    '</div>' +
    '<div class="form-row">' +
      '<input class="form-input" name="benef-telefono" placeholder="Teléfono" value="' + escHtml(t) + '">' +
      '<input class="form-input" name="benef-correo" placeholder="Correo" value="' + escHtml(e) + '">' +
    '</div>';

  container.appendChild(div);
  renumberBeneficiarios();
}


function ayudasRemoveBeneficiario(btn) {
  var card = btn.closest(".beneficiario-card");
  if (card) {
    card.remove();
    renumberBeneficiarios();
  }
}


function renumberBeneficiarios() {
  var container = document.getElementById("ayudasBeneficiariosContainer");
  var cards = container.querySelectorAll(".beneficiario-card");
  for (var i = 0; i < cards.length; i++) {
    var hdr = cards[i].querySelector(".beneficiario-header span:first-child");
    if (hdr) hdr.textContent = "Beneficiario #" + (i + 1);
  }
}


function ayudasToggleOtroTipoCuenta() {
  var sel = document.getElementById("ayudFormTipocuenta");
  var otro = document.getElementById("ayudFormTipocuentaOtro");
  otro.style.display = sel.value === "OTRA" ? "" : "none";
  if (sel.value !== "OTRA") otro.value = "";
}


function escHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}


async function toggleBenefApproval(telegramUserId, checked) {
  try {
    await fetch("/api/ayudas/toggle-benef-approval/" + telegramUserId, { method: "PUT" });
    await loadAyudasRegistros();
  } catch (err) {
    alert("Error al cambiar autorización.");
  }
}


setInterval(tickRefreshIndicator, 5000);


// ========== INVENTARIO FUNCTIONS ==========

let inventarioAllData = [];

function initInventarioSearch() {
  document.getElementById("inventarioSearchInput").addEventListener("input", renderInventarioTable);
  document.getElementById("inventarioPaisFilter").addEventListener("change", renderInventarioTable);
  document.getElementById("inventarioEstadoFilter").addEventListener("change", renderInventarioTable);
  document.getElementById("btnInventarioAdd").addEventListener("click", () => {
    openInventarioAddModal();
  });
}

function initInventarioDownload() {
  document.getElementById("btnInventarioDownload").addEventListener("click", async () => {
    const btn = document.getElementById("btnInventarioDownload");
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons">hourglass_top</span> Preparando archivo...';
    try {
      const resp = await fetch("/api/inventario/download");
      if (!resp.ok) throw new Error("Error al descargar");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getInventarioFilename(resp);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      document.getElementById("inventarioDownloadInfo").textContent = "Descarga completada.";
    } catch (err) {
      document.getElementById("inventarioDownloadInfo").textContent = "Error al descargar.";
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons">description</span> Descargar XLSX';
    }
  });
}

function getInventarioFilename(resp) {
  const header = resp.headers.get("Content-Disposition");
  if (header) {
    const m = header.match(/filename="(.+)"/);
    if (m) return m[1];
  }
  const hoy = new Date();
  return `Inventario_Adquisiciones_${String(hoy.getDate()).padStart(2,"0")}-${String(hoy.getMonth()+1).padStart(2,"0")}-${hoy.getFullYear()}.xlsx`;
}

// ========== INVENTARIO PRODUCTOS ==========

let inventarioProductosExpanded = {};

function initInventarioProductos() {
  document.getElementById("section-inventario-productos").addEventListener("click", function(e) {
    const toggleBtn = e.target.closest(".product-card-toggle");
    if (toggleBtn) {
      const card = toggleBtn.closest(".product-card");
      const product = card.dataset.product;
      const body = card.querySelector(".product-card-body");
      const isHidden = body.style.display === "none";
      body.style.display = isHidden ? "" : "none";
      toggleBtn.innerHTML = isHidden
        ? '<span class="material-icons">expand_less</span>'
        : '<span class="material-icons">expand_more</span>';
      return;
    }
    const dlBtn = e.target.closest(".product-card-download");
    if (dlBtn) {
      const product = dlBtn.dataset.product;
      downloadInventarioProducto(product);
      return;
    }
  });
}

async function downloadInventarioProducto(producto) {
  const btn = document.querySelector(`.product-card-download[data-product="${producto}"]`);
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons">hourglass_top</span> Preparando...';
  try {
    const resp = await fetch("/api/inventario/productos/download/" + producto);
    if (!resp.ok) throw new Error("Error al descargar");
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const header = resp.headers.get("Content-Disposition");
    let filename = header && header.match(/filename="(.+)"/) ? header.match(/filename="(.+)"/)[1] : (producto + ".xlsx");
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Error al descargar el archivo.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function loadInventarioProductos(silent) {
  const container = document.getElementById("inventarioProductosContainer");
  if (!silent) container.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando productos...</p></div>';

  try {
    const resp = await fetch("/api/inventario/productos");
    if (!resp.ok) throw new Error("Error");
    const json = await resp.json();
    renderInventarioProductos(json.productos || {});
    updateRefreshIndicator(false);
  } catch (err) {
    container.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar productos.</p></div>';
  }
}

function renderInventarioProductos(productos) {
  const container = document.getElementById("inventarioProductosContainer");

  const productIcons = {
    cajamicro: "inventory_2",
    cajadinar: "inventory_2",
    per_aleman: "auto_stories",
    per_top: "star",
    per_dragon: "auto_stories",
  };

  const productColors = {
    cajamicro: "#81C784",
    cajadinar: "#4CAF50",
    per_aleman: "#66BB6A",
    per_top: "#43A047",
    per_dragon: "#388E3C",
  };

  let html = '<div class="productos-grid">';
  for (const [key, prod] of Object.entries(productos)) {
    const icon = productIcons[key] || "inventory_2";
    const color = productColors[key] || "#81C784";
    const hasBuyers = prod.buyers && prod.buyers.length > 0;

    html += '<div class="product-card" data-product="' + key + '">';
    html += '  <div class="product-card-header" style="border-left: 4px solid ' + color + '">';
    html += '    <span class="material-icons product-card-icon" style="color:' + color + '">' + icon + '</span>';
    html += '    <div class="product-card-info">';
    html += '      <div class="product-card-title">' + prod.label + '</div>';
    html += '      <div class="product-card-meta">';
    html += '        <span class="product-stat"><strong>' + prod.total_buyers + '</strong> compradores</span>';
    html += '        <span class="product-stat-sep">|</span>';
    html += '        <span class="product-stat"><strong>' + prod.total_qty.toLocaleString() + '</strong> unidades</span>';
    html += '      </div>';
    html += '    </div>';
    html += '    <div class="product-card-actions">';
    html += '      <button class="btn btn-sm product-card-download" data-product="' + key + '" title="Descargar Excel de ' + prod.label + '">';
    html += '        <span class="material-icons" style="font-size:16px">download</span> XLSX';
    html += '      </button>';
    html += '      <button class="btn btn-sm product-card-toggle" title="Ver compradores">';
    html += '        <span class="material-icons">expand_more</span>';
    html += '      </button>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div class="product-card-body" style="display:none">';

    if (hasBuyers) {
      html += '    <table class="data-table product-buyer-table">';
      html += '      <thead><tr><th>Nombres y Apellidos</th><th>Usuario Telegram</th><th>DNI</th><th>Pa&iacute;s</th><th style="text-align:right">Cantidad</th></tr></thead>';
      html += '      <tbody>';
      for (const b of prod.buyers) {
        const uname = b.telegram_username ? (b.telegram_username.startsWith("@") ? b.telegram_username : "@" + b.telegram_username) : "—";
        html += '        <tr><td>' + escHtml(b.nombre) + '</td><td>' + uname + '</td><td>' + escHtml(b.dni) + '</td><td>' + escHtml(b.pais) + '</td><td style="text-align:right;font-weight:600">' + b.cantidad.toLocaleString() + '</td></tr>';
      }
      html += '      </tbody>';
      html += '    </table>';
    } else {
      html += '    <div class="empty-state" style="padding:20px"><span class="material-icons empty-icon" style="font-size:32px">inventory</span><p>No hay compradores para este producto.</p></div>';
    }

    html += '  </div>';
    html += '</div>';
  }
  html += '</div>';

  container.innerHTML = html;
}

async function loadInventarioRegistros(silent) {
  const tbody = document.getElementById("inventarioTableBody");
  if (!silent) tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando datos...</p></div></td></tr>';

  try {
    const resp = await fetch("/api/inventario/data");
    if (!resp.ok) throw new Error("Error");
    const json = await resp.json();
    inventarioAllData = json.data || [];

    const paises = new Set();
    for (const r of inventarioAllData) {
      if (r.pais && r.pais.trim() && r.pais !== "VACIO") paises.add(r.pais.trim().toUpperCase());
    }
    const sel = document.getElementById("inventarioPaisFilter");
    const cur = sel.value;
    sel.innerHTML = '<option value="">Todos los paises</option>';
    for (const p of [...paises].sort()) {
      sel.innerHTML += '<option value="' + p.replace(/"/g, "&quot;") + '">' + p + '</option>';
    }
    sel.value = cur;

    renderInventarioTable();
    updateRefreshIndicator(false);
  } catch (err) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar datos.</p></div></td></tr>';
  }
}

let inventarioExpandedRow = null;

function getInventarioEstado(r) {
  const MATERIALS = ["cajamicro", "cajadinar", "per_aleman", "per_top", "per_dragon"];
  const personal = r.nombre && r.dni && r.pais;
  const hasMat = MATERIALS.some((k) => r[k] && String(r[k]).trim() !== "" && String(r[k]).trim() !== "0");
  if (personal && hasMat) return "completo";
  return "incompleto";
}

function getInventarioEstadoBadge(estado) {
  if (estado === "completo") return '<span class="estado-badge estado-completo">Completo</span>';
  return '<span class="estado-badge estado-incompleto">Incompleto</span>';
}

function buildInventarioDetailHtml(r) {
  const f = (v) => v && String(v).trim() && String(v).trim() !== "VACIO" && String(v).trim() !== "0" ? String(v).trim() : "—";
  const flag = getCountryFlag(r.pais);
  const usuario = r.telegram_username ? "@" + r.telegram_username : "—";

  const materials = [
    { icon: "inventory_2", label: "Cajas Microlingotes de Oro (500 unds x 391gr)", val: f(r.cajamicro) },
    { icon: "inventory_2", label: "Cajas Dinares Irakies Rojos (40.000 notas)",    val: f(r.cajadinar) },
    { icon: "article",     label: "Pergaminos Alemanes",                           val: f(r.per_aleman) },
    { icon: "article",     label: "Pergaminos Top Nonillon",                       val: f(r.per_top) },
    { icon: "inventory_2", label: "Cajas Pergaminos Dragones Amarillos (x 200)",  val: f(r.per_dragon) },
  ];

  return `
    <div class="ayudas-detail-card">
      <div class="ayudas-detail-section">
        <div class="ayudas-detail-title"><span class="material-icons">person</span> INFORMACION PERSONAL</div>
        <div class="ayudas-detail-grid">
          <div class="ayudas-detail-item"><span class="material-icons">badge</span><span class="ayudas-detail-label">Nombres:</span><span class="ayudas-detail-value">${f(r.nombre)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">assignment_ind</span><span class="ayudas-detail-label">Cedula/DNI:</span><span class="ayudas-detail-value">${f(r.dni)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">public</span><span class="ayudas-detail-label">Pais:</span><span class="ayudas-detail-value">${flag} ${f(r.pais)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">alternate_email</span><span class="ayudas-detail-label">Telegram:</span><span class="ayudas-detail-value">${usuario}</span></div>
        </div>
      </div>
      <div class="ayudas-detail-section">
        <div class="ayudas-detail-title"><span class="material-icons">inventory</span> MATERIAL ADQUIRIDO</div>
        <div class="ayudas-detail-grid">
          ${materials.map(m => `
          <div class="ayudas-detail-item">
            <span class="material-icons">${m.icon}</span>
            <span class="ayudas-detail-label">${m.label}:</span>
            <span class="ayudas-detail-value ${m.val !== '—' ? 'inventario-qty-badge' : ''}">${m.val}</span>
          </div>`).join('')}
        </div>
      </div>
      <div class="ayudas-detail-section ayudas-detail-section-meta">
        <div class="ayudas-detail-meta-row">
          <span class="material-icons">schedule</span> Creado: ${formatDate(r.created_at)}
          <span class="material-icons" style="margin-left:20px">update</span> Actualizado: ${formatDate(r.updated_at)}
        </div>
      </div>
      <div class="inventario-detail-actions">
        <button class="btn btn-sm btn-edit" onclick="event.stopPropagation();openInventarioEditModal(${r.telegram_user_id})">
          <span class="material-icons" style="font-size:16px">edit</span> Editar
        </button>
        <button class="btn btn-sm btn-delete" onclick="event.stopPropagation();openInventarioDeleteModal(${r.telegram_user_id})">
          <span class="material-icons" style="font-size:16px">delete</span> Eliminar
        </button>
      </div>
    </div>`;
}

function toggleInventarioDetail(idx) {
  if (inventarioExpandedRow === idx) {
    inventarioExpandedRow = null;
  } else {
    inventarioExpandedRow = idx;
  }
  renderInventarioTable();
}

function renderInventarioTable() {
  const tbody = document.getElementById("inventarioTableBody");
  const search = document.getElementById("inventarioSearchInput").value.toLowerCase();
  const paisFilter = document.getElementById("inventarioPaisFilter").value;
  const estadoFilter = document.getElementById("inventarioEstadoFilter").value;

  let filtered = inventarioAllData;
  if (search) {
    filtered = filtered.filter((r) =>
      [r.nombre, r.dni, r.pais, r.telegram_username]
        .some((v) => v && String(v).toLowerCase().includes(search))
    );
  }
  if (paisFilter) {
    filtered = filtered.filter((r) => (r.pais || "").toUpperCase().trim() === paisFilter);
  }
  if (estadoFilter) {
    filtered = filtered.filter((r) => getInventarioEstado(r) === estadoFilter);
  }

  document.getElementById("inventarioTableCount").textContent = filtered.length + " registro" + (filtered.length !== 1 ? "s" : "");

  if (filtered.length === 0) {
    const msg = search || paisFilter || estadoFilter
      ? "No se encontraron registros con esos filtros."
      : "Aun no hay registros de Inventario.";
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>' + msg + '</p></div></td></tr>';
    return;
  }

  let html = "";
  for (let i = 0; i < filtered.length; i++) {
    const r = filtered[i];
    const flag = getCountryFlag(r.pais);
    const estado = getInventarioEstado(r);
    const expandIcon = inventarioExpandedRow === i ? "expand_less" : "expand_more";
    const isExpanded = inventarioExpandedRow === i;

    html += '<tr class="ayudas-row" onclick="toggleInventarioDetail(' + i + ')"><td class="ayudas-expand-cell"><span class="material-icons ayudas-expand-icon">' + expandIcon + '</span></td>';
    html += '<td><strong>' + (r.nombre || "—") + '</strong></td>';
    html += '<td>' + (r.dni || "—") + '</td>';
    html += '<td>' + flag + ' ' + (r.pais || "—") + '</td>';
    html += '<td>' + getInventarioEstadoBadge(estado) + '</td>';
    html += '<td>' + formatDate(r.updated_at || r.created_at) + '</td>';
    html += '</tr>';

    if (isExpanded) {
      html += '<tr class="ayudas-detail-row"><td colspan="6">' + buildInventarioDetailHtml(r) + '</td></tr>';
    }
  }
  tbody.innerHTML = html;
}

async function loadInventarioStats(silent) {
  const el = document.getElementById("inventarioStatsGrid");
  if (!silent) el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando estadisticas...</p></div>';

  try {
    const resp = await fetch("/api/inventario/stats");
    if (!resp.ok) throw new Error("Error");
    const d = await resp.json();

    el.innerHTML =
      '<div class="stat-card"><span class="material-icons stat-icon">people</span><div class="stat-info"><span class="stat-value">' + d.total + '</span><span class="stat-label">Total de registros</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">inventory_2</span><div class="stat-info"><span class="stat-value">' + d.cajamicro_total + '</span><span class="stat-label">Total Cajas Micro</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">inventory_2</span><div class="stat-info"><span class="stat-value">' + d.cajadinar_total + '</span><span class="stat-label">Total Cajas Dinar</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">article</span><div class="stat-info"><span class="stat-value">' + d.per_aleman_total + '</span><span class="stat-label">Pergaminos Alemanes</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">article</span><div class="stat-info"><span class="stat-value">' + d.per_top_total + '</span><span class="stat-label">Pergaminos Top Nonillon</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">inventory_2</span><div class="stat-info"><span class="stat-value">' + d.per_dragon_total + '</span><span class="stat-label">Cajas Perg. Dragones</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">today</span><div class="stat-info"><span class="stat-value">' + d.registros_hoy + '</span><span class="stat-label">Registros de hoy</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">date_range</span><div class="stat-info"><span class="stat-value">' + d.registros_semana + '</span><span class="stat-label">Registros esta semana</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">schedule</span><div class="stat-info"><span class="stat-value stat-date">' + (d.ultima_actualizacion ? formatDateStrict(d.ultima_actualizacion) : "—") + '</span><span class="stat-label">Ultima actualizacion</span></div></div>';

    updateRefreshIndicator(false);
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar estadisticas.</p></div>';
  }
}


// ========== INVENTARIO CRUD FUNCTIONS ==========


function openInventarioAddModal() {
  document.getElementById("editTelegramUserId").value = "";
  document.getElementById("inventarioModalTitle").textContent = "Añadir registro";
  document.getElementById("invFormUsername").value = "";
  document.getElementById("invFormNombre").value = "";
  document.getElementById("invFormDni").value = "";
  document.getElementById("invFormPais").value = "";
  document.getElementById("invFormCajamicro").value = "";
  document.getElementById("invFormCajadinar").value = "";
  document.getElementById("invFormPerAleman").value = "";
  document.getElementById("invFormPerTop").value = "";
  document.getElementById("invFormPerDragon").value = "";
  document.getElementById("btnInventarioModalSubmit").textContent = "Guardar";
  document.getElementById("inventarioModalOverlay").style.display = "flex";
}


function openInventarioEditModal(telegramUserId) {
  const r = inventarioAllData.find(function(item) { return item.telegram_user_id === telegramUserId; });
  if (!r) return;

  document.getElementById("editTelegramUserId").value = telegramUserId;
  document.getElementById("inventarioModalTitle").textContent = "Editar registro";
  document.getElementById("invFormUsername").value = r.telegram_username || "";
  document.getElementById("invFormNombre").value = r.nombre || "";
  document.getElementById("invFormDni").value = r.dni || "";
  document.getElementById("invFormPais").value = r.pais || "";
  document.getElementById("invFormCajamicro").value = r.cajamicro || "";
  document.getElementById("invFormCajadinar").value = r.cajadinar || "";
  document.getElementById("invFormPerAleman").value = r.per_aleman || "";
  document.getElementById("invFormPerTop").value = r.per_top || "";
  document.getElementById("invFormPerDragon").value = r.per_dragon || "";
  document.getElementById("btnInventarioModalSubmit").textContent = "Actualizar";
  document.getElementById("inventarioModalOverlay").style.display = "flex";
}


function closeInventarioModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("inventarioModalOverlay").style.display = "none";
}


function getInventarioFormData() {
  return {
    telegram_username: document.getElementById("invFormUsername").value.trim(),
    nombre: document.getElementById("invFormNombre").value.trim(),
    dni: document.getElementById("invFormDni").value.trim(),
    pais: document.getElementById("invFormPais").value.trim(),
    cajamicro: document.getElementById("invFormCajamicro").value.trim(),
    cajadinar: document.getElementById("invFormCajadinar").value.trim(),
    per_aleman: document.getElementById("invFormPerAleman").value.trim(),
    per_top: document.getElementById("invFormPerTop").value.trim(),
    per_dragon: document.getElementById("invFormPerDragon").value.trim(),
  };
}


async function submitInventarioForm() {
  const nombre = document.getElementById("invFormNombre").value.trim();
  if (!nombre) {
    alert("El campo Nombres y Apellidos es obligatorio.");
    document.getElementById("invFormNombre").focus();
    return;
  }

  const btn = document.getElementById("btnInventarioModalSubmit");
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    const editId = document.getElementById("editTelegramUserId").value;
    const data = getInventarioFormData();
    let url, method;

    if (editId) {
      url = "/api/inventario/edit/" + editId;
      method = "PUT";
    } else {
      url = "/api/inventario/add";
      method = "POST";
    }

    const resp = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.detail || "Error al guardar");
    }

    closeInventarioModal();
    inventarioExpandedRow = null;
    await loadInventarioRegistros();
  } catch (err) {
    alert(err.message || "Ocurrio un error al guardar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = document.getElementById("editTelegramUserId").value ? "Actualizar" : "Guardar";
  }
}


function openInventarioDeleteModal(telegramUserId) {
  document.getElementById("deleteTelegramUserId").value = telegramUserId;
  document.getElementById("inventarioDeleteOverlay").style.display = "flex";
}


function closeInventarioDeleteModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("inventarioDeleteOverlay").style.display = "none";
}


async function executeInventarioDelete() {
  const telegramUserId = document.getElementById("deleteTelegramUserId").value;
  if (!telegramUserId) return;

  const btn = document.querySelector("#inventarioDeleteModal .btn-danger");
  btn.disabled = true;
  btn.textContent = "Eliminando...";

  try {
    const resp = await fetch("/api/inventario/delete/" + telegramUserId, {
      method: "DELETE",
    });

    if (!resp.ok) throw new Error("Error al eliminar");

    closeInventarioDeleteModal();
    inventarioExpandedRow = null;
    await loadInventarioRegistros();
  } catch (err) {
    alert("Ocurrio un error al eliminar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Eliminar";
  }
}


// ========== CIS FUNCTIONS ==========

let cisAllData = [];
let cisExpandedRow = null;

function initCisSearch() {
  document.getElementById("cisSearchInput").addEventListener("input", renderCisTable);
  document.getElementById("cisTipoFilter").addEventListener("change", renderCisTable);
  document.getElementById("cisEstadoFilter").addEventListener("change", renderCisTable);
  document.getElementById("btnCisAdd").addEventListener("click", openCisAddModal);
}

function initCisDownload() {
  document.getElementById("btnCisDownload").addEventListener("click", async () => {
    const btn = document.getElementById("btnCisDownload");
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons">hourglass_top</span> Preparando archivo...';
    try {
      const resp = await fetch("/api/cis/download");
      if (!resp.ok) throw new Error("Error al descargar");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getCisFilename(resp);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Ocurrio un error al descargar. Intenta de nuevo.");
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons">download</span> Descargar Excel';
    }
  });
  document.getElementById("btnCisExportDocxHab").addEventListener("click", () => exportCisBatch("docx", "habilitados", "btnCisExportDocxHab"));
  document.getElementById("btnCisExportPdfHab").addEventListener("click", () => exportCisBatch("pdf", "habilitados", "btnCisExportPdfHab"));
  document.getElementById("btnCisExportDocxAll").addEventListener("click", () => exportCisBatch("docx", "all", "btnCisExportDocxAll"));
  document.getElementById("btnCisExportPdfAll").addEventListener("click", () => exportCisBatch("pdf", "all", "btnCisExportPdfAll"));
  document.getElementById("btnCisTemplateUpload").addEventListener("click", uploadCisTemplate);
  loadCisTemplateStatus();
}

function loadCisTemplateStatus() {
  const el = document.getElementById("cisTemplateStatus");
  fetch("/api/cis/template/status")
    .then((resp) => resp.json())
    .then((d) => {
      if (d.source === "uploaded") el.textContent = "Plantilla activa: subida (" + (d.filename || "") + ").";
      else if (d.source === "env") el.textContent = "Plantilla activa: configurada por variable de entorno.";
      else if (d.source === "bundled") el.textContent = "Plantilla activa: incluida en el servidor.";
      else el.textContent = "Sin plantilla: suba el .docx para poder generar documentos.";
    })
    .catch(() => { el.textContent = "No se pudo consultar la plantilla."; });
}

function uploadCisTemplate() {
  const input = document.getElementById("cisTemplateFile");
  if (!input.files || !input.files[0]) {
    alert("Seleccione un archivo .docx primero.");
    return;
  }
  const btn = document.getElementById("btnCisTemplateUpload");
  btn.disabled = true;
  const fd = new FormData();
  fd.append("file", input.files[0]);
  fetch("/api/cis/template", { method: "POST", body: fd })
    .then((resp) => {
      if (!resp.ok) return resp.json().catch(() => ({})).then((j) => { throw new Error(j.detail || "Error al subir"); });
      return resp.json();
    })
    .then(() => {
      input.value = "";
      loadCisTemplateStatus();
      alert("Plantilla guardada.");
    })
    .catch((err) => alert(err.message || "Ocurrio un error al subir."))
    .finally(() => { btn.disabled = false; });
}

function getCisFilename(resp) {
  const header = resp.headers.get("Content-Disposition");
  if (header) {
    const m = header.match(/filename="(.+)"/);
    if (m) return m[1];
  }
  return "CIS.xlsx";
}

async function loadCisRegistros(silent) {
  const tbody = document.getElementById("cisTableBody");
  if (!silent) tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando datos...</p></div></td></tr>';
  try {
    const resp = await fetch("/api/cis/data");
    if (!resp.ok) throw new Error("Error");
    const json = await resp.json();
    cisAllData = json.data || [];
    renderCisTable();
    updateRefreshIndicator(false);
  } catch (err) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar datos.</p></div></td></tr>';
  }
}

function cisDocNumber(r) {
  if (r.tipo_documento === "ID") return r.cc || "-";
  return r.pasaporte || r.cc || "-";
}

function cisHabilitadoBadge(r) {
  if (r.habilitado) return '<span class="estado-badge estado-completo">Habilitado</span>';
  return '<span class="estado-badge estado-incompleto">No habilitado</span>';
}

function toggleCisHabilitado(id) {
  fetch("/api/cis/toggle-habilitado/" + id, { method: "PUT" })
    .then((resp) => resp.json())
    .then(() => loadCisRegistros())
    .catch(() => alert("Ocurrio un error al cambiar el estado."));
}

function renderCisTable() {
  const tbody = document.getElementById("cisTableBody");
  const search = document.getElementById("cisSearchInput").value.toLowerCase();
  const tipoFilter = document.getElementById("cisTipoFilter").value;
  const estadoFilter = document.getElementById("cisEstadoFilter").value;

  let filtered = cisAllData;
  if (search) {
    filtered = filtered.filter((r) =>
      [r.nombre_completo, r.pasaporte, r.cc, r.pais, r.telegram, r.correo]
        .some((v) => v && String(v).toLowerCase().includes(search))
    );
  }
  if (tipoFilter) {
    filtered = filtered.filter((r) => (r.tipo_documento || "").toUpperCase() === tipoFilter);
  }
  if (estadoFilter) {
    filtered = filtered.filter((r) => estadoFilter === "habilitado" ? r.habilitado : !r.habilitado);
  }

  document.getElementById("cisTableCount").textContent = filtered.length + " registro" + (filtered.length !== 1 ? "s" : "");

  if (filtered.length === 0) {
    const msg = search || tipoFilter || estadoFilter ? "No se encontraron registros con esos filtros." : "Aun no hay registros de CIS.";
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>' + msg + '</p></div></td></tr>';
    return;
  }

  let html = "";
  for (let i = 0; i < filtered.length; i++) {
    const r = filtered[i];
    const flag = getCountryFlag(r.pais);
    const expandIcon = cisExpandedRow === i ? "expand_less" : "expand_more";
    const isExpanded = cisExpandedRow === i;

    html += '<tr class="ayudas-row" onclick="toggleCisDetail(' + i + ')"><td class="ayudas-expand-cell"><span class="material-icons ayudas-expand-icon">' + expandIcon + '</span></td>';
    html += '<td><strong>' + escHtml(r.nombre_completo || "-") + '</strong></td>';
    html += '<td>' + escHtml(cisDocNumber(r)) + '</td>';
    html += '<td>' + flag + ' ' + escHtml(r.pais || "-") + '</td>';
    html += '<td>' + (r.tipo_documento || "-") + '</td>';
    html += '<td>' + cisHabilitadoBadge(r) + '</td>';
    html += '<td>' + formatDate(r.updated_at || r.created_at) + '</td>';
    html += '</tr>';

    if (isExpanded) {
      html += '<tr class="ayudas-detail-row"><td colspan="7">' + buildCisDetailHtml(r) + '</td></tr>';
    }
  }
  tbody.innerHTML = html;
}

function buildCisDetailHtml(r) {
  const f = (v) => v && String(v).trim() && String(v).trim() !== "VACIO" ? String(v).trim() : "-";
  const flag = getCountryFlag(r.pais);
  const rows = [
    { icon: "badge", label: "Tipo documento", val: f(r.tipo_documento) },
    { icon: "fingerprint", label: "Pasaporte", val: f(r.pasaporte) },
    { icon: "fingerprint", label: "CC / Cedula", val: f(r.cc) },
    { icon: "cake", label: "Fecha de nacimiento", val: f(r.date_of_birth) },
    { icon: "person", label: "Genero", val: f(r.gender) },
    { icon: "phone", label: "Telefono", val: f(r.telephone) },
    { icon: "mail", label: "Correo", val: f(r.email) },
    { icon: "event", label: "Expedicion", val: f(r.fecha_expedicion) },
    { icon: "event", label: "Vencimiento", val: f(r.fecha_vencimiento) },
    { icon: "account_balance", label: "Autoridad emisora", val: f(r.autoridad_emisora) },
    { icon: "home", label: "Direccion", val: f(r.street_address) },
    { icon: "location_city", label: "Ciudad", val: f(r.ciudad) },
    { icon: "map", label: "Departamento", val: f(r.departamento) },
    { icon: "public", label: "Pais", val: flag + " " + f(r.pais) },
    { icon: "pin", label: "Codigo postal", val: f(r.codigo_postal) },
    { icon: "telegram", label: "Telegram", val: r.telegram ? "@" + String(r.telegram).replace(/^@/, "") : "-" },
    { icon: "paid", label: "Cantidad participacion", val: f(r.cantidad_participacion) },
  ];
  const items = rows.map((x) => '<div class="ayudas-detail-item"><span class="material-icons ayudas-detail-icon">' + x.icon + '</span><span class="ayudas-detail-label">' + x.label + '</span><span class="ayudas-detail-value">' + x.val + '</span></div>').join("");
  const estadoBtn = r.habilitado
    ? '<button class="btn btn-secondary" onclick="toggleCisHabilitado(\'' + r.id + '\')">Deshabilitar</button>'
    : '<button class="btn btn-primary" onclick="toggleCisHabilitado(\'' + r.id + '\')">Habilitar</button>';
    return '<div class="ayudas-detail-card"><div class="ayudas-detail-grid">' + items + '</div><div class="ayudas-detail-actions">' + estadoBtn +
    ' <button class="btn btn-primary" onclick="event.stopPropagation();downloadCisFast(\'' + r.id + '\')">Generar DOCX</button>' +
    ' <button class="btn btn-secondary" onclick="event.stopPropagation();openCisPreview(\'' + r.id + '\')">Vista previa PDF</button>' +
    ' <button class="btn btn-secondary" onclick="event.stopPropagation();downloadCisFile(\'' + r.id + '\',\'docx\')">DOCX completo</button>' +
    ' <button class="btn btn-secondary" onclick="event.stopPropagation();downloadCisFile(\'' + r.id + '\',\'pdf\')">PDF</button>' +
    ' <button class="btn btn-secondary" onclick="event.stopPropagation();openCisEditModal(\'' + r.id + '\')">Editar</button>' +
    ' <button class="btn btn-danger" onclick="event.stopPropagation();openCisDeleteModal(\'' + r.id + '\')">Eliminar</button></div></div>';
}

function downloadCisFast(id) {
  window.open("/api/cis/generate/" + id, "_blank");
}

function openCisPreview(id) {
  const r = cisAllData.find((item) => item.id === id);
  document.getElementById("cisPreviewTitle").textContent = "Vista previa - " + (r && r.nombre_completo ? r.nombre_completo : "CIS");
  document.getElementById("cisPreviewFrame").src = "about:blank";
  document.getElementById("cisPreviewOverlay").style.display = "flex";
  fetch("/api/cis/preview/" + id)
    .then((resp) => {
      if (!resp.ok) return resp.json().catch(() => ({})).then((j) => { throw new Error(j.detail || "No se pudo generar la vista previa"); });
      return resp.blob();
    })
    .then((blob) => {
      document.getElementById("cisPreviewFrame").src = URL.createObjectURL(blob);
    })
    .catch((err) => {
      closeCisPreview();
      alert(err.message || "No se pudo generar la vista previa.");
    });
}

function closeCisPreview(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("cisPreviewFrame").src = "about:blank";
  document.getElementById("cisPreviewOverlay").style.display = "none";
}

function downloadCisFile(id, fmt) {
  window.open("/api/cis/file/" + id + "?format=" + fmt, "_blank");
}

function exportCisBatch(fmt, scope, btnId) {
  const btn = document.getElementById(btnId);
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons">hourglass_top</span> Generando... (puede tardar)';
  fetch("/api/cis/export?format=" + fmt + "&scope=" + scope)
    .then((resp) => {
      if (!resp.ok) throw new Error("Error");
      const disp = resp.headers.get("Content-Disposition") || "";
      const m = disp.match(/filename="(.+)"/);
      return resp.blob().then((blob) => ({ blob, name: m ? m[1] : ("CIS_" + fmt + ".zip") }));
    })
    .then(({ blob, name }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    })
    .catch(() => alert("Ocurrio un error al exportar. Intenta de nuevo."))
    .finally(() => { btn.disabled = false; btn.innerHTML = orig; });
}

function toggleCisDetail(idx) {
  cisExpandedRow = cisExpandedRow === idx ? null : idx;
  renderCisTable();
}

async function loadCisStats(silent) {
  const el = document.getElementById("cisStatsGrid");
  if (!silent) el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando estadisticas...</p></div>';
  try {
    const resp = await fetch("/api/cis/stats");
    if (!resp.ok) throw new Error("Error");
    const d = await resp.json();
    const tipos = Object.keys(d.tipos || {}).map((t) => '<div class="stat-card"><span class="material-icons stat-icon">badge</span><div class="stat-info"><span class="stat-value">' + d.tipos[t] + '</span><span class="stat-label">' + t + '</span></div></div>').join("");
    el.innerHTML =
      '<div class="stat-card"><span class="material-icons stat-icon">people</span><div class="stat-info"><span class="stat-value">' + d.total + '</span><span class="stat-label">Total clientes</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">check_circle</span><div class="stat-info"><span class="stat-value">' + d.habilitados + '</span><span class="stat-label">Habilitados</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">cancel</span><div class="stat-info"><span class="stat-value">' + d.no_habilitados + '</span><span class="stat-label">No habilitados</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">fingerprint</span><div class="stat-info"><span class="stat-value">' + d.con_documento + '</span><span class="stat-label">Con documento</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">schedule</span><div class="stat-info"><span class="stat-value">' + (d.ultima_actualizacion ? formatDate(d.ultima_actualizacion) : "-") + '</span><span class="stat-label">Ultima actualizacion</span></div></div>' +
      tipos;
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar estadisticas.</p></div>';
  }
}

function openCisAddModal() {
  document.getElementById("cisEditId").value = "";
  document.getElementById("cisModalTitle").textContent = "Anadir cliente";
  ["cisFormNombre", "cisFormFirst", "cisFormMiddle", "cisFormLast", "cisFormDob", "cisFormSsn", "cisFormCountryCit", "cisFormLanguages", "cisFormOfficer", "cisFormPasaporte", "cisFormCc", "cisFormPais", "cisFormFechaExp", "cisFormFechaVenc", "cisFormAutoridad", "cisFormDireccion", "cisFormZip", "cisFormCiudad", "cisFormDepartamento", "cisFormUrbanizacion", "cisFormDistrito", "cisFormTelefono", "cisFormCorreo", "cisFormTelegram", "cisFormCantidad"].forEach((id) => document.getElementById(id).value = "");
  document.getElementById("cisFormTipo").value = "PASAPORTE";
  document.getElementById("cisFormGender").value = "MALE";
  document.getElementById("cisFormHabilitado").checked = false;
  document.getElementById("btnCisModalSubmit").textContent = "Guardar";
  document.getElementById("cisModalOverlay").style.display = "flex";
}

function openCisEditModal(id) {
  const r = cisAllData.find((item) => item.id === id);
  if (!r) return;
  document.getElementById("cisEditId").value = id;
  document.getElementById("cisModalTitle").textContent = "Editar cliente";
  document.getElementById("cisFormNombre").value = r.nombre_completo || "";
  document.getElementById("cisFormFirst").value = r.first_name || "";
  document.getElementById("cisFormMiddle").value = r.middle_name || "";
  document.getElementById("cisFormLast").value = r.last_name || "";
  document.getElementById("cisFormGender").value = (r.gender || "MALE").toUpperCase();
  document.getElementById("cisFormDob").value = r.date_of_birth || "";
  document.getElementById("cisFormSsn").value = r.ssn || "";
  document.getElementById("cisFormCountryCit").value = r.country_citizenship || "";
  document.getElementById("cisFormLanguages").value = r.languages || "";
  document.getElementById("cisFormOfficer").value = r.officer_name || "";
  document.getElementById("cisFormTipo").value = (r.tipo_documento || "PASAPORTE").toUpperCase();
  document.getElementById("cisFormPasaporte").value = r.pasaporte || "";
  document.getElementById("cisFormCc").value = r.cc || "";
  document.getElementById("cisFormPais").value = r.pais || "";
  document.getElementById("cisFormFechaExp").value = r.fecha_expedicion || "";
  document.getElementById("cisFormFechaVenc").value = r.fecha_vencimiento || "";
  document.getElementById("cisFormAutoridad").value = r.autoridad_emisora || "";
  document.getElementById("cisFormDireccion").value = r.street_address || "";
  document.getElementById("cisFormZip").value = r.codigo_postal || "";
  document.getElementById("cisFormCiudad").value = r.ciudad || "";
  document.getElementById("cisFormDepartamento").value = r.departamento || "";
  document.getElementById("cisFormUrbanizacion").value = r.urbanizacion || "";
  document.getElementById("cisFormDistrito").value = r.distrito || "";
  document.getElementById("cisFormTelefono").value = r.telephone || "";
  document.getElementById("cisFormCorreo").value = r.email || "";
  document.getElementById("cisFormTelegram").value = r.telegram || "";
  document.getElementById("cisFormCantidad").value = r.cantidad_participacion || "";
  document.getElementById("cisFormHabilitado").checked = !!r.habilitado;
  document.getElementById("btnCisModalSubmit").textContent = "Actualizar";
  document.getElementById("cisModalOverlay").style.display = "flex";
}

function closeCisModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("cisModalOverlay").style.display = "none";
}

function getCisFormData() {
  return {
    nombre_completo: document.getElementById("cisFormNombre").value.trim(),
    first_name: document.getElementById("cisFormFirst").value.trim(),
    middle_name: document.getElementById("cisFormMiddle").value.trim(),
    last_name: document.getElementById("cisFormLast").value.trim(),
    gender: document.getElementById("cisFormGender").value.trim().toUpperCase(),
    date_of_birth: document.getElementById("cisFormDob").value.trim(),
    ssn: document.getElementById("cisFormSsn").value.trim(),
    country_citizenship: document.getElementById("cisFormCountryCit").value.trim(),
    languages: document.getElementById("cisFormLanguages").value.trim(),
    officer_name: document.getElementById("cisFormOfficer").value.trim(),
    tipo_documento: document.getElementById("cisFormTipo").value.trim().toUpperCase(),
    pasaporte: document.getElementById("cisFormPasaporte").value.trim(),
    cc: document.getElementById("cisFormCc").value.trim(),
    pais: document.getElementById("cisFormPais").value.trim(),
    fecha_expedicion: document.getElementById("cisFormFechaExp").value.trim(),
    fecha_vencimiento: document.getElementById("cisFormFechaVenc").value.trim(),
    autoridad_emisora: document.getElementById("cisFormAutoridad").value.trim(),
    street_address: document.getElementById("cisFormDireccion").value.trim(),
    codigo_postal: document.getElementById("cisFormZip").value.trim(),
    ciudad: document.getElementById("cisFormCiudad").value.trim(),
    departamento: document.getElementById("cisFormDepartamento").value.trim(),
    urbanizacion: document.getElementById("cisFormUrbanizacion").value.trim(),
    distrito: document.getElementById("cisFormDistrito").value.trim(),
    telephone: document.getElementById("cisFormTelefono").value.trim(),
    email: document.getElementById("cisFormCorreo").value.trim(),
    telegram: document.getElementById("cisFormTelegram").value.trim(),
    cantidad_participacion: document.getElementById("cisFormCantidad").value.trim(),
    habilitado: document.getElementById("cisFormHabilitado").checked,
  };
}

async function submitCisForm() {
  const nombre = document.getElementById("cisFormNombre").value.trim();
  if (!nombre) {
    alert("El campo Nombre Completo es obligatorio.");
    document.getElementById("cisFormNombre").focus();
    return;
  }

  const btn = document.getElementById("btnCisModalSubmit");
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    const editId = document.getElementById("cisEditId").value;
    const data = getCisFormData();
    let url, method;
    if (editId) {
      url = "/api/cis/edit/" + editId;
      method = "PUT";
    } else {
      url = "/api/cis/add";
      method = "POST";
    }
    const resp = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.detail || "Error al guardar");
    }
    closeCisModal();
    cisExpandedRow = null;
    await loadCisRegistros();
  } catch (err) {
    alert(err.message || "Ocurrio un error al guardar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = document.getElementById("cisEditId").value ? "Actualizar" : "Guardar";
  }
}

function openCisDeleteModal(id) {
  document.getElementById("cisDeleteId").value = id;
  document.getElementById("cisDeleteOverlay").style.display = "flex";
}

function closeCisDeleteModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("cisDeleteOverlay").style.display = "none";
}

async function executeCisDelete() {
  const id = document.getElementById("cisDeleteId").value;
  if (!id) return;
  const btn = document.querySelector("#cisDeleteModal .btn-danger");
  btn.disabled = true;
  btn.textContent = "Eliminando...";
  try {
    const resp = await fetch("/api/cis/delete/" + id, { method: "DELETE" });
    if (!resp.ok) throw new Error("Error al eliminar");
    closeCisDeleteModal();
    cisExpandedRow = null;
    await loadCisRegistros();
  } catch (err) {
    alert("Ocurrio un error al eliminar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Eliminar";
  }
}


// ========== MICROLINGOTES FUNCTIONS ==========

let microlingotesAllData = [];
let microlingotesExpandedRow = null;

function initMicrolingotesSearch() {
  document.getElementById("microlingotesSearchInput").addEventListener("input", renderMicrolingotesTable);
  document.getElementById("microlingotesValidadoFilter").addEventListener("change", renderMicrolingotesTable);
  document.getElementById("btnMicrolingotesAdd").addEventListener("click", openMicrolingotesAddModal);
}

function initMicrolingotesDownload() {
  document.getElementById("btnMicrolingotesDownload").addEventListener("click", async () => {
    const btn = document.getElementById("btnMicrolingotesDownload");
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons">hourglass_top</span> Preparando archivo...';
    try {
      const resp = await fetch("/api/microlingotes/download");
      if (!resp.ok) throw new Error("Error al descargar");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getMicrolingotesFilename(resp);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      document.getElementById("microlingotesDownloadInfo").textContent = "Descarga completada.";
    } catch (err) {
      document.getElementById("microlingotesDownloadInfo").textContent = "Error al descargar.";
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons">description</span> Descargar XLSX';
    }
  });
}

function getMicrolingotesFilename(resp) {
  const header = resp.headers.get("Content-Disposition");
  if (header) {
    const m = header.match(/filename="(.+)"/);
    if (m) return m[1];
  }
  const hoy = new Date();
  return `Microlingotes_Validacion_${String(hoy.getDate()).padStart(2,"0")}-${String(hoy.getMonth()+1).padStart(2,"0")}-${hoy.getFullYear()}.xlsx`;
}

async function loadMicrolingotesRegistros(silent) {
  const tbody = document.getElementById("microlingotesTableBody");
  if (!silent) tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando datos...</p></div></td></tr>';

  try {
    const resp = await fetch("/api/microlingotes/data");
    if (!resp.ok) throw new Error("Error");
    const json = await resp.json();
    microlingotesAllData = json.data || [];
    renderMicrolingotesTable();
    updateRefreshIndicator(false);
  } catch (err) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar datos.</p></div></td></tr>';
  }
}

function microlingotesBadge(validado) {
  if (validado) return '<span class="estado-badge estado-completo">Validado</span>';
  return '<span class="estado-badge estado-incompleto">No validado</span>';
}

function microlingotesToggleHtml(r) {
  const checked = r.validado ? "checked" : "";
  const uname = escHtml(r.telegram_username || "");
  return '<label class="switch" title="Marcar/desmarcar validación">' +
    '<input type="checkbox" ' + checked + ' onclick="event.stopPropagation();toggleMicrolingotesValidacion(\'' + uname + '\', this.checked)" data-username="' + uname + '">' +
    '<span class="slider round"></span></label>';
}

async function toggleMicrolingotesValidacion(username, validado) {
  try {
    const resp = await fetch("/api/microlingotes/set-validacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_username: username, validado: validado }),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.detail || "Error al actualizar");
    }
    await loadMicrolingotesRegistros();
  } catch (err) {
    alert(err.message || "Error al actualizar la validación.");
    await loadMicrolingotesRegistros();
  }
}

function toggleMicrolingotesDetail(idx) {
  microlingotesExpandedRow = microlingotesExpandedRow === idx ? null : idx;
  renderMicrolingotesTable();
}

function buildMicrolingotesDetailHtml(r) {
  const f = (v) => (v && String(v).trim() && String(v).trim() !== "VACIO" ? String(v).trim() : "—");
  const flag = getCountryFlag(r.pais);
  const usuario = r.telegram_username ? "@" + r.telegram_username : "—";
  const cantidad = (r.cantidad === null || r.cantidad === undefined) ? "—" : Number(r.cantidad).toLocaleString();

  return `
    <div class="ayudas-detail-card">
      <div class="ayudas-detail-section">
        <div class="ayudas-detail-title"><span class="material-icons">person</span> INFORMACION PERSONAL</div>
        <div class="ayudas-detail-grid">
          <div class="ayudas-detail-item"><span class="material-icons">badge</span><span class="ayudas-detail-label">Nombres:</span><span class="ayudas-detail-value">${escHtml(f(r.nombre_completo))}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">assignment_ind</span><span class="ayudas-detail-label">Documento:</span><span class="ayudas-detail-value">${escHtml(f(r.documento))}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">public</span><span class="ayudas-detail-label">Pais:</span><span class="ayudas-detail-value">${flag} ${escHtml(f(r.pais))}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">alternate_email</span><span class="ayudas-detail-label">Telegram:</span><span class="ayudas-detail-value">${escHtml(usuario)}</span></div>
        </div>
      </div>
      <div class="ayudas-detail-section">
        <div class="ayudas-detail-title"><span class="material-icons">inventory_2</span> MATERIAL ADQUIRIDO</div>
        <div class="ayudas-detail-grid">
          <div class="ayudas-detail-item"><span class="material-icons">inventory_2</span><span class="ayudas-detail-label">Cajas Microlingotes:</span><span class="ayudas-detail-value inventario-qty-badge">${cantidad}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">category</span><span class="ayudas-detail-label">Material:</span><span class="ayudas-detail-value">${escHtml(f(r.material))}</span></div>
        </div>
      </div>
      <div class="ayudas-detail-section">
        <div class="ayudas-detail-title"><span class="material-icons">verified</span> VALIDACION EN EL BOT</div>
        <div class="ayudas-detail-grid">
          <div class="ayudas-detail-item"><span class="material-icons">check_circle</span><span class="ayudas-detail-label">Estado:</span><span class="ayudas-detail-value">${microlingotesBadge(r.validado)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">schedule</span><span class="ayudas-detail-label">Validado el:</span><span class="ayudas-detail-value">${r.validated_at ? formatDate(r.validated_at) : "—"}</span></div>
        </div>
      </div>
      <div class="ayudas-detail-section ayudas-detail-section-meta">
        <div class="ayudas-detail-meta-row">
          <span class="material-icons">schedule</span> Creado: ${formatDate(r.created_at)}
          <span class="material-icons" style="margin-left:20px">update</span> Actualizado: ${formatDate(r.updated_at)}
        </div>
      </div>
      <div class="inventario-detail-actions">
        <button class="btn btn-sm btn-edit" onclick="event.stopPropagation();openMicrolingotesEditModal(${r.id})">
          <span class="material-icons" style="font-size:16px">edit</span> Editar
        </button>
        <button class="btn btn-sm btn-delete" onclick="event.stopPropagation();openMicrolingotesDeleteModal(${r.id})">
          <span class="material-icons" style="font-size:16px">delete</span> Eliminar
        </button>
      </div>
    </div>`;
}

function renderMicrolingotesTable() {
  const tbody = document.getElementById("microlingotesTableBody");
  const search = document.getElementById("microlingotesSearchInput").value.toLowerCase();
  const validadoFilter = document.getElementById("microlingotesValidadoFilter").value;

  let filtered = microlingotesAllData;
  if (search) {
    filtered = filtered.filter((r) =>
      [r.nombre_completo, r.documento, r.pais, r.telegram_username]
        .some((v) => v && String(v).toLowerCase().includes(search))
    );
  }
  if (validadoFilter === "validado") {
    filtered = filtered.filter((r) => r.validado);
  } else if (validadoFilter === "novalidado") {
    filtered = filtered.filter((r) => !r.validado);
  }

  document.getElementById("microlingotesTableCount").textContent = filtered.length + " registro" + (filtered.length !== 1 ? "s" : "");

  if (filtered.length === 0) {
    const msg = search || validadoFilter
      ? "No se encontraron registros con esos filtros."
      : "Aun no hay registros de Microlingotes.";
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>' + msg + '</p></div></td></tr>';
    return;
  }

  let html = "";
  for (let i = 0; i < filtered.length; i++) {
    const r = filtered[i];
    const flag = getCountryFlag(r.pais);
    const usuario = r.telegram_username ? "@" + r.telegram_username : "—";
    const expandIcon = microlingotesExpandedRow === i ? "expand_less" : "expand_more";
    const isExpanded = microlingotesExpandedRow === i;
    const cantidad = (r.cantidad === null || r.cantidad === undefined) ? "—" : Number(r.cantidad).toLocaleString();

    html += '<tr class="ayudas-row" onclick="toggleMicrolingotesDetail(' + i + ')"><td class="ayudas-expand-cell"><span class="material-icons ayudas-expand-icon">' + expandIcon + '</span></td>';
    html += '<td><strong>' + escHtml(r.nombre_completo || "—") + '</strong></td>';
    html += '<td>' + escHtml(usuario) + '</td>';
    html += '<td>' + escHtml(r.documento || "—") + '</td>';
    html += '<td>' + flag + ' ' + escHtml(r.pais || "—") + '</td>';
    html += '<td style="text-align:right">' + cantidad + '</td>';
    html += '<td>' + microlingotesToggleHtml(r) + '</td>';
    html += '<td>' + (r.validated_at ? formatDate(r.validated_at) : "—") + '</td>';
    html += '</tr>';

    if (isExpanded) {
      html += '<tr class="ayudas-detail-row"><td colspan="8">' + buildMicrolingotesDetailHtml(r) + '</td></tr>';
    }
  }
  tbody.innerHTML = html;
}

async function loadMicrolingotesStats(silent) {
  const el = document.getElementById("microlingotesStatsGrid");
  if (!silent) el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando estadisticas...</p></div>';

  try {
    const resp = await fetch("/api/microlingotes/stats");
    if (!resp.ok) throw new Error("Error");
    const d = await resp.json();

    el.innerHTML =
      '<div class="stat-card"><span class="material-icons stat-icon">people</span><div class="stat-info"><span class="stat-value">' + d.total + '</span><span class="stat-label">Total de personas</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">verified</span><div class="stat-info"><span class="stat-value">' + d.validados + '</span><span class="stat-label">Validados</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">pending</span><div class="stat-info"><span class="stat-value">' + d.novalidados + '</span><span class="stat-label">No validados</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">percent</span><div class="stat-info"><span class="stat-value">' + d.pct_validado + '%</span><span class="stat-label">% Validado</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">inventory_2</span><div class="stat-info"><span class="stat-value">' + Number(d.total_cajas).toLocaleString() + '</span><span class="stat-label">Total cajas</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">public</span><div class="stat-info"><span class="stat-value">' + d.paises + '</span><span class="stat-label">Paises</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">schedule</span><div class="stat-info"><span class="stat-value stat-date">' + (d.ultima_validacion ? formatDateStrict(d.ultima_validacion) : "—") + '</span><span class="stat-label">Ultima validacion</span></div></div>';

    updateRefreshIndicator(false);
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar estadisticas.</p></div>';
  }
}

// ========== MICROLINGOTES CRUD ==========

function openMicrolingotesAddModal() {
  document.getElementById("microlingotesEditId").value = "";
  document.getElementById("microlingotesModalTitle").textContent = "Añadir persona";
  document.getElementById("microFormUsername").value = "";
  document.getElementById("microFormNombre").value = "";
  document.getElementById("microFormDocumento").value = "";
  document.getElementById("microFormPais").value = "";
  document.getElementById("microFormCantidad").value = "";
  document.getElementById("microFormMaterial").value = "";
  document.getElementById("btnMicrolingotesModalSubmit").textContent = "Guardar";
  document.getElementById("microlingotesModalOverlay").style.display = "flex";
}

function openMicrolingotesEditModal(id) {
  const r = microlingotesAllData.find(function (item) { return item.id === id; });
  if (!r) return;

  document.getElementById("microlingotesEditId").value = id;
  document.getElementById("microlingotesModalTitle").textContent = "Editar persona";
  document.getElementById("microFormUsername").value = r.telegram_username || "";
  document.getElementById("microFormNombre").value = r.nombre_completo || "";
  document.getElementById("microFormDocumento").value = r.documento || "";
  document.getElementById("microFormPais").value = r.pais || "";
  document.getElementById("microFormCantidad").value = r.cantidad || "";
  document.getElementById("microFormMaterial").value = r.material || "";
  document.getElementById("btnMicrolingotesModalSubmit").textContent = "Actualizar";
  document.getElementById("microlingotesModalOverlay").style.display = "flex";
}

function closeMicrolingotesModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("microlingotesModalOverlay").style.display = "none";
}

function getMicrolingotesFormData() {
  return {
    telegram_username: document.getElementById("microFormUsername").value.trim(),
    nombre_completo: document.getElementById("microFormNombre").value.trim(),
    documento: document.getElementById("microFormDocumento").value.trim(),
    pais: document.getElementById("microFormPais").value.trim(),
    cantidad: document.getElementById("microFormCantidad").value.trim(),
    material: document.getElementById("microFormMaterial").value.trim(),
  };
}

async function submitMicrolingotesForm() {
  const nombre = document.getElementById("microFormNombre").value.trim();
  if (!nombre) {
    alert("El campo Nombres y Apellidos es obligatorio.");
    document.getElementById("microFormNombre").focus();
    return;
  }
  const username = document.getElementById("microFormUsername").value.trim();
  if (!username) {
    alert("El usuario de Telegram es obligatorio.");
    document.getElementById("microFormUsername").focus();
    return;
  }

  const btn = document.getElementById("btnMicrolingotesModalSubmit");
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    const editId = document.getElementById("microlingotesEditId").value;
    const data = getMicrolingotesFormData();
    let url, method;

    if (editId) {
      url = "/api/microlingotes/edit/" + editId;
      method = "PUT";
    } else {
      url = "/api/microlingotes/add";
      method = "POST";
    }

    const resp = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.detail || "Error al guardar");
    }

    closeMicrolingotesModal();
    microlingotesExpandedRow = null;
    await loadMicrolingotesRegistros();
  } catch (err) {
    alert(err.message || "Ocurrio un error al guardar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = document.getElementById("microlingotesEditId").value ? "Actualizar" : "Guardar";
  }
}

function openMicrolingotesDeleteModal(id) {
  document.getElementById("microlingotesDeleteId").value = id;
  document.getElementById("microlingotesDeleteOverlay").style.display = "flex";
}

function closeMicrolingotesDeleteModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("microlingotesDeleteOverlay").style.display = "none";
}

async function executeMicrolingotesDelete() {
  const id = document.getElementById("microlingotesDeleteId").value;
  if (!id) return;

  const btn = document.querySelector("#microlingotesDeleteModal .btn-danger");
  btn.disabled = true;
  btn.textContent = "Eliminando...";

  try {
    const resp = await fetch("/api/microlingotes/delete/" + id, { method: "DELETE" });
    if (!resp.ok) throw new Error("Error al eliminar");

    closeMicrolingotesDeleteModal();
    microlingotesExpandedRow = null;
    await loadMicrolingotesRegistros();
  } catch (err) {
    alert("Ocurrio un error al eliminar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Eliminar";
  }
}


// ========== DINARES FUNCTIONS ==========

let dinaresAllData = [];
let dinaresExpandedRow = null;

function initDinaresSearch() {
  document.getElementById("dinaresSearchInput").addEventListener("input", renderDinaresTable);
  document.getElementById("dinaresValidadoFilter").addEventListener("change", renderDinaresTable);
  document.getElementById("btnDinaresAdd").addEventListener("click", openDinaresAddModal);
}

function initDinaresDownload() {
  document.getElementById("btnDinaresDownload").addEventListener("click", async () => {
    const btn = document.getElementById("btnDinaresDownload");
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons">hourglass_top</span> Preparando archivo...';
    try {
      const resp = await fetch("/api/dinares/download");
      if (!resp.ok) throw new Error("Error al descargar");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getDinaresFilename(resp);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      document.getElementById("dinaresDownloadInfo").textContent = "Descarga completada.";
    } catch (err) {
      document.getElementById("dinaresDownloadInfo").textContent = "Error al descargar.";
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons">description</span> Descargar XLSX';
    }
  });
}

function getDinaresFilename(resp) {
  const header = resp.headers.get("Content-Disposition");
  if (header) {
    const m = header.match(/filename="(.+)"/);
    if (m) return m[1];
  }
  const hoy = new Date();
  return `Dinares_Validacion_${String(hoy.getDate()).padStart(2,"0")}-${String(hoy.getMonth()+1).padStart(2,"0")}-${hoy.getFullYear()}.xlsx`;
}

async function loadDinaresRegistros(silent) {
  const tbody = document.getElementById("dinaresTableBody");
  if (!silent) tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando datos...</p></div></td></tr>';

  try {
    const resp = await fetch("/api/dinares/data");
    if (!resp.ok) throw new Error("Error");
    const json = await resp.json();
    dinaresAllData = json.data || [];
    renderDinaresTable();
    updateRefreshIndicator(false);
  } catch (err) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar datos.</p></div></td></tr>';
  }
}

function dinaresBadge(validado) {
  if (validado) return '<span class="estado-badge estado-completo">Validado</span>';
  return '<span class="estado-badge estado-incompleto">No validado</span>';
}

function dinaresToggleHtml(r) {
  const checked = r.validado ? "checked" : "";
  const uname = escHtml(r.telegram_username || "");
  return '<label class="switch" title="Marcar/desmarcar validación">' +
    '<input type="checkbox" ' + checked + ' onclick="event.stopPropagation();toggleDinaresValidacion(\'' + uname + '\', this.checked)" data-username="' + uname + '">' +
    '<span class="slider round"></span></label>';
}

async function toggleDinaresValidacion(username, validado) {
  try {
    const resp = await fetch("/api/dinares/set-validacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_username: username, validado: validado }),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.detail || "Error al actualizar");
    }
    await loadDinaresRegistros();
  } catch (err) {
    alert(err.message || "Error al actualizar la validación.");
    await loadDinaresRegistros();
  }
}

function toggleDinaresDetail(idx) {
  dinaresExpandedRow = dinaresExpandedRow === idx ? null : idx;
  renderDinaresTable();
}

function buildDinaresDetailHtml(r) {
  const f = (v) => (v && String(v).trim() && String(v).trim() !== "VACIO" ? String(v).trim() : "—");
  const flag = getCountryFlag(r.pais);
  const usuario = r.telegram_username ? "@" + r.telegram_username : "—";
  const cantidad = (r.cantidad === null || r.cantidad === undefined) ? "—" : Number(r.cantidad).toLocaleString();

  return `
    <div class="ayudas-detail-card">
      <div class="ayudas-detail-section">
        <div class="ayudas-detail-title"><span class="material-icons">person</span> INFORMACION PERSONAL</div>
        <div class="ayudas-detail-grid">
          <div class="ayudas-detail-item"><span class="material-icons">badge</span><span class="ayudas-detail-label">Nombres:</span><span class="ayudas-detail-value">${escHtml(f(r.nombre_completo))}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">assignment_ind</span><span class="ayudas-detail-label">Documento:</span><span class="ayudas-detail-value">${escHtml(f(r.documento))}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">public</span><span class="ayudas-detail-label">Pais:</span><span class="ayudas-detail-value">${flag} ${escHtml(f(r.pais))}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">alternate_email</span><span class="ayudas-detail-label">Telegram:</span><span class="ayudas-detail-value">${escHtml(usuario)}</span></div>
        </div>
      </div>
      <div class="ayudas-detail-section">
        <div class="ayudas-detail-title"><span class="material-icons">inventory_2</span> MATERIAL ADQUIRIDO</div>
        <div class="ayudas-detail-grid">
          <div class="ayudas-detail-item"><span class="material-icons">inventory_2</span><span class="ayudas-detail-label">Cajas Dinares:</span><span class="ayudas-detail-value inventario-qty-badge">${cantidad}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">category</span><span class="ayudas-detail-label">Material:</span><span class="ayudas-detail-value">${escHtml(f(r.material))}</span></div>
        </div>
      </div>
      <div class="ayudas-detail-section">
        <div class="ayudas-detail-title"><span class="material-icons">verified</span> VALIDACION EN EL BOT</div>
        <div class="ayudas-detail-grid">
          <div class="ayudas-detail-item"><span class="material-icons">check_circle</span><span class="ayudas-detail-label">Estado:</span><span class="ayudas-detail-value">${dinaresBadge(r.validado)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">schedule</span><span class="ayudas-detail-label">Validado el:</span><span class="ayudas-detail-value">${r.validated_at ? formatDate(r.validated_at) : "—"}</span></div>
        </div>
      </div>
      <div class="ayudas-detail-section ayudas-detail-section-meta">
        <div class="ayudas-detail-meta-row">
          <span class="material-icons">schedule</span> Creado: ${formatDate(r.created_at)}
          <span class="material-icons" style="margin-left:20px">update</span> Actualizado: ${formatDate(r.updated_at)}
        </div>
      </div>
      <div class="inventario-detail-actions">
        <button class="btn btn-sm btn-edit" onclick="event.stopPropagation();openDinaresEditModal(${r.id})">
          <span class="material-icons" style="font-size:16px">edit</span> Editar
        </button>
        <button class="btn btn-sm btn-delete" onclick="event.stopPropagation();openDinaresDeleteModal(${r.id})">
          <span class="material-icons" style="font-size:16px">delete</span> Eliminar
        </button>
      </div>
    </div>`;
}

function renderDinaresTable() {
  const tbody = document.getElementById("dinaresTableBody");
  const search = document.getElementById("dinaresSearchInput").value.toLowerCase();
  const validadoFilter = document.getElementById("dinaresValidadoFilter").value;

  let filtered = dinaresAllData;
  if (search) {
    filtered = filtered.filter((r) =>
      [r.nombre_completo, r.documento, r.pais, r.telegram_username]
        .some((v) => v && String(v).toLowerCase().includes(search))
    );
  }
  if (validadoFilter === "validado") {
    filtered = filtered.filter((r) => r.validado);
  } else if (validadoFilter === "novalidado") {
    filtered = filtered.filter((r) => !r.validado);
  }

  document.getElementById("dinaresTableCount").textContent = filtered.length + " registro" + (filtered.length !== 1 ? "s" : "");

  if (filtered.length === 0) {
    const msg = search || validadoFilter
      ? "No se encontraron registros con esos filtros."
      : "Aun no hay registros de Dinares.";
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>' + msg + '</p></div></td></tr>';
    return;
  }

  let html = "";
  for (let i = 0; i < filtered.length; i++) {
    const r = filtered[i];
    const flag = getCountryFlag(r.pais);
    const usuario = r.telegram_username ? "@" + r.telegram_username : "—";
    const expandIcon = dinaresExpandedRow === i ? "expand_less" : "expand_more";
    const isExpanded = dinaresExpandedRow === i;
    const cantidad = (r.cantidad === null || r.cantidad === undefined) ? "—" : Number(r.cantidad).toLocaleString();

    html += '<tr class="ayudas-row" onclick="toggleDinaresDetail(' + i + ')"><td class="ayudas-expand-cell"><span class="material-icons ayudas-expand-icon">' + expandIcon + '</span></td>';
    html += '<td><strong>' + escHtml(r.nombre_completo || "—") + '</strong></td>';
    html += '<td>' + escHtml(usuario) + '</td>';
    html += '<td>' + escHtml(r.documento || "—") + '</td>';
    html += '<td>' + flag + ' ' + escHtml(r.pais || "—") + '</td>';
    html += '<td style="text-align:right">' + cantidad + '</td>';
    html += '<td>' + dinaresToggleHtml(r) + '</td>';
    html += '<td>' + (r.validated_at ? formatDate(r.validated_at) : "—") + '</td>';
    html += '</tr>';

    if (isExpanded) {
      html += '<tr class="ayudas-detail-row"><td colspan="8">' + buildDinaresDetailHtml(r) + '</td></tr>';
    }
  }
  tbody.innerHTML = html;
}

async function loadDinaresStats(silent) {
  const el = document.getElementById("dinaresStatsGrid");
  if (!silent) el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando estadisticas...</p></div>';

  try {
    const resp = await fetch("/api/dinares/stats");
    if (!resp.ok) throw new Error("Error");
    const d = await resp.json();

    el.innerHTML =
      '<div class="stat-card"><span class="material-icons stat-icon">people</span><div class="stat-info"><span class="stat-value">' + d.total + '</span><span class="stat-label">Total de personas</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">verified</span><div class="stat-info"><span class="stat-value">' + d.validados + '</span><span class="stat-label">Validados</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">pending</span><div class="stat-info"><span class="stat-value">' + d.novalidados + '</span><span class="stat-label">No validados</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">percent</span><div class="stat-info"><span class="stat-value">' + d.pct_validado + '%</span><span class="stat-label">% Validado</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">inventory_2</span><div class="stat-info"><span class="stat-value">' + Number(d.total_cajas).toLocaleString() + '</span><span class="stat-label">Total cajas</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">public</span><div class="stat-info"><span class="stat-value">' + d.paises + '</span><span class="stat-label">Paises</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">schedule</span><div class="stat-info"><span class="stat-value stat-date">' + (d.ultima_validacion ? formatDateStrict(d.ultima_validacion) : "—") + '</span><span class="stat-label">Ultima validacion</span></div></div>';

    updateRefreshIndicator(false);
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar estadisticas.</p></div>';
  }
}

// ========== DINARES CRUD ==========

function openDinaresAddModal() {
  document.getElementById("dinaresEditId").value = "";
  document.getElementById("dinaresModalTitle").textContent = "Añadir persona";
  document.getElementById("dinarFormUsername").value = "";
  document.getElementById("dinarFormNombre").value = "";
  document.getElementById("dinarFormDocumento").value = "";
  document.getElementById("dinarFormPais").value = "";
  document.getElementById("dinarFormCantidad").value = "";
  document.getElementById("dinarFormMaterial").value = "";
  document.getElementById("btnDinaresModalSubmit").textContent = "Guardar";
  document.getElementById("dinaresModalOverlay").style.display = "flex";
}

function openDinaresEditModal(id) {
  const r = dinaresAllData.find(function (item) { return item.id === id; });
  if (!r) return;

  document.getElementById("dinaresEditId").value = id;
  document.getElementById("dinaresModalTitle").textContent = "Editar persona";
  document.getElementById("dinarFormUsername").value = r.telegram_username || "";
  document.getElementById("dinarFormNombre").value = r.nombre_completo || "";
  document.getElementById("dinarFormDocumento").value = r.documento || "";
  document.getElementById("dinarFormPais").value = r.pais || "";
  document.getElementById("dinarFormCantidad").value = r.cantidad || "";
  document.getElementById("dinarFormMaterial").value = r.material || "";
  document.getElementById("btnDinaresModalSubmit").textContent = "Actualizar";
  document.getElementById("dinaresModalOverlay").style.display = "flex";
}

function closeDinaresModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("dinaresModalOverlay").style.display = "none";
}

function getDinaresFormData() {
  return {
    telegram_username: document.getElementById("dinarFormUsername").value.trim(),
    nombre_completo: document.getElementById("dinarFormNombre").value.trim(),
    documento: document.getElementById("dinarFormDocumento").value.trim(),
    pais: document.getElementById("dinarFormPais").value.trim(),
    cantidad: document.getElementById("dinarFormCantidad").value.trim(),
    material: document.getElementById("dinarFormMaterial").value.trim(),
  };
}

async function submitDinaresForm() {
  const nombre = document.getElementById("dinarFormNombre").value.trim();
  if (!nombre) {
    alert("El campo Nombres y Apellidos es obligatorio.");
    document.getElementById("dinarFormNombre").focus();
    return;
  }
  const username = document.getElementById("dinarFormUsername").value.trim();
  if (!username) {
    alert("El usuario de Telegram es obligatorio.");
    document.getElementById("dinarFormUsername").focus();
    return;
  }

  const btn = document.getElementById("btnDinaresModalSubmit");
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    const editId = document.getElementById("dinaresEditId").value;
    const data = getDinaresFormData();
    let url, method;

    if (editId) {
      url = "/api/dinares/edit/" + editId;
      method = "PUT";
    } else {
      url = "/api/dinares/add";
      method = "POST";
    }

    const resp = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.detail || "Error al guardar");
    }

    closeDinaresModal();
    dinaresExpandedRow = null;
    await loadDinaresRegistros();
  } catch (err) {
    alert(err.message || "Ocurrio un error al guardar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = document.getElementById("dinaresEditId").value ? "Actualizar" : "Guardar";
  }
}

function openDinaresDeleteModal(id) {
  document.getElementById("dinaresDeleteId").value = id;
  document.getElementById("dinaresDeleteOverlay").style.display = "flex";
}

function closeDinaresDeleteModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("dinaresDeleteOverlay").style.display = "none";
}

async function executeDinaresDelete() {
  const id = document.getElementById("dinaresDeleteId").value;
  if (!id) return;

  const btn = document.querySelector("#dinaresDeleteModal .btn-danger");
  btn.disabled = true;
  btn.textContent = "Eliminando...";

  try {
    const resp = await fetch("/api/dinares/delete/" + id, { method: "DELETE" });
    if (!resp.ok) throw new Error("Error al eliminar");

    closeDinaresDeleteModal();
    dinaresExpandedRow = null;
    await loadDinaresRegistros();
  } catch (err) {
    alert("Ocurrio un error al eliminar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Eliminar";
  }
}


// ========== CONTENEDORES FUNCTIONS ==========

let contenedoresAllData = [];
let contenedoresExpandedRow = null;

function initContenedoresSearch() {
  document.getElementById("contenedoresSearchInput").addEventListener("input", renderContenedoresTable);
  document.getElementById("contenedoresValidadoFilter").addEventListener("change", renderContenedoresTable);
  document.getElementById("btnContenedoresAdd").addEventListener("click", openContenedoresAddModal);
}

function initContenedoresDownload() {
  document.getElementById("btnContenedoresDownload").addEventListener("click", async () => {
    const btn = document.getElementById("btnContenedoresDownload");
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons">hourglass_top</span> Preparando archivo...';
    try {
      const resp = await fetch("/api/contenedores/download");
      if (!resp.ok) throw new Error("Error al descargar");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getContenedoresFilename(resp);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      document.getElementById("contenedoresDownloadInfo").textContent = "Descarga completada.";
    } catch (err) {
      document.getElementById("contenedoresDownloadInfo").textContent = "Error al descargar.";
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons">description</span> Descargar XLSX';
    }
  });
}

function getContenedoresFilename(resp) {
  const header = resp.headers.get("Content-Disposition");
  if (header) {
    const m = header.match(/filename="(.+)"/);
    if (m) return m[1];
  }
  const hoy = new Date();
  return `Contenedores_Validacion_${String(hoy.getDate()).padStart(2,"0")}-${String(hoy.getMonth()+1).padStart(2,"0")}-${hoy.getFullYear()}.xlsx`;
}

async function loadContenedoresRegistros(silent) {
  const tbody = document.getElementById("contenedoresTableBody");
  if (!silent) tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando datos...</p></div></td></tr>';

  try {
    const resp = await fetch("/api/contenedores/data");
    if (!resp.ok) throw new Error("Error");
    const json = await resp.json();
    contenedoresAllData = json.data || [];
    renderContenedoresTable();
    updateRefreshIndicator(false);
  } catch (err) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar datos.</p></div></td></tr>';
  }
}

function contenedoresBadge(validado) {
  if (validado) return '<span class="estado-badge estado-completo">Validado</span>';
  return '<span class="estado-badge estado-incompleto">No validado</span>';
}

function contenedoresToggleHtml(r) {
  const checked = r.validado ? "checked" : "";
  const uname = escHtml(r.telegram_username || "");
  return '<label class="switch" title="Marcar/desmarcar validación">' +
    '<input type="checkbox" ' + checked + ' onclick="event.stopPropagation();toggleContenedoresValidacion(\'' + uname + '\', this.checked)" data-username="' + uname + '">' +
    '<span class="slider round"></span></label>';
}

async function toggleContenedoresValidacion(username, validado) {
  try {
    const resp = await fetch("/api/contenedores/set-validacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_username: username, validado: validado }),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.detail || "Error al actualizar");
    }
    await loadContenedoresRegistros();
  } catch (err) {
    alert(err.message || "Error al actualizar la validación.");
    await loadContenedoresRegistros();
  }
}

function toggleContenedoresDetail(idx) {
  contenedoresExpandedRow = contenedoresExpandedRow === idx ? null : idx;
  renderContenedoresTable();
}

function buildContenedoresDetailHtml(r) {
  const f = (v) => (v && String(v).trim() && String(v).trim() !== "VACIO" ? String(v).trim() : "—");
  const flag = getCountryFlag(r.pais);
  const usuario = r.telegram_username ? "@" + r.telegram_username : "—";
  const cantidad = (r.cantidad === null || r.cantidad === undefined) ? "—" : Number(r.cantidad).toLocaleString();

  return `
    <div class="ayudas-detail-card">
      <div class="ayudas-detail-section">
        <div class="ayudas-detail-title"><span class="material-icons">person</span> INFORMACION PERSONAL</div>
        <div class="ayudas-detail-grid">
          <div class="ayudas-detail-item"><span class="material-icons">badge</span><span class="ayudas-detail-label">Nombres:</span><span class="ayudas-detail-value">${escHtml(f(r.nombre_completo))}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">assignment_ind</span><span class="ayudas-detail-label">Documento:</span><span class="ayudas-detail-value">${escHtml(f(r.documento))}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">public</span><span class="ayudas-detail-label">Pais:</span><span class="ayudas-detail-value">${flag} ${escHtml(f(r.pais))}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">alternate_email</span><span class="ayudas-detail-label">Telegram:</span><span class="ayudas-detail-value">${escHtml(usuario)}</span></div>
        </div>
      </div>
      <div class="ayudas-detail-section">
        <div class="ayudas-detail-title"><span class="material-icons">inventory_2</span> MATERIAL ADQUIRIDO</div>
        <div class="ayudas-detail-grid">
          <div class="ayudas-detail-item"><span class="material-icons">inventory_2</span><span class="ayudas-detail-label">Cajas:</span><span class="ayudas-detail-value inventario-qty-badge">${cantidad}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">category</span><span class="ayudas-detail-label">Material:</span><span class="ayudas-detail-value">${escHtml(f(r.material))}</span></div>
        </div>
      </div>
      <div class="ayudas-detail-section">
        <div class="ayudas-detail-title"><span class="material-icons">verified</span> VALIDACION EN EL BOT</div>
        <div class="ayudas-detail-grid">
          <div class="ayudas-detail-item"><span class="material-icons">check_circle</span><span class="ayudas-detail-label">Estado:</span><span class="ayudas-detail-value">${contenedoresBadge(r.validado)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">schedule</span><span class="ayudas-detail-label">Validado el:</span><span class="ayudas-detail-value">${r.validated_at ? formatDate(r.validated_at) : "—"}</span></div>
        </div>
      </div>
      <div class="ayudas-detail-section ayudas-detail-section-meta">
        <div class="ayudas-detail-meta-row">
          <span class="material-icons">schedule</span> Creado: ${formatDate(r.created_at)}
          <span class="material-icons" style="margin-left:20px">update</span> Actualizado: ${formatDate(r.updated_at)}
        </div>
      </div>
      <div class="inventario-detail-actions">
        <button class="btn btn-sm btn-edit" onclick="event.stopPropagation();openContenedoresEditModal(${r.id})">
          <span class="material-icons" style="font-size:16px">edit</span> Editar
        </button>
        <button class="btn btn-sm btn-delete" onclick="event.stopPropagation();openContenedoresDeleteModal(${r.id})">
          <span class="material-icons" style="font-size:16px">delete</span> Eliminar
        </button>
      </div>
    </div>`;
}

function renderContenedoresTable() {
  const tbody = document.getElementById("contenedoresTableBody");
  const search = document.getElementById("contenedoresSearchInput").value.toLowerCase();
  const validadoFilter = document.getElementById("contenedoresValidadoFilter").value;

  let filtered = contenedoresAllData;
  if (search) {
    filtered = filtered.filter((r) =>
      [r.nombre_completo, r.documento, r.pais, r.telegram_username]
        .some((v) => v && String(v).toLowerCase().includes(search))
    );
  }
  if (validadoFilter === "validado") {
    filtered = filtered.filter((r) => r.validado);
  } else if (validadoFilter === "novalidado") {
    filtered = filtered.filter((r) => !r.validado);
  }

  document.getElementById("contenedoresTableCount").textContent = filtered.length + " registro" + (filtered.length !== 1 ? "s" : "");

  if (filtered.length === 0) {
    const msg = search || validadoFilter
      ? "No se encontraron registros con esos filtros."
      : "Aun no hay registros de Contenedores.";
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>' + msg + '</p></div></td></tr>';
    return;
  }

  let html = "";
  for (let i = 0; i < filtered.length; i++) {
    const r = filtered[i];
    const flag = getCountryFlag(r.pais);
    const usuario = r.telegram_username ? "@" + r.telegram_username : "—";
    const expandIcon = contenedoresExpandedRow === i ? "expand_less" : "expand_more";
    const isExpanded = contenedoresExpandedRow === i;
    const cantidad = (r.cantidad === null || r.cantidad === undefined) ? "—" : Number(r.cantidad).toLocaleString();

    html += '<tr class="ayudas-row" onclick="toggleContenedoresDetail(' + i + ')"><td class="ayudas-expand-cell"><span class="material-icons ayudas-expand-icon">' + expandIcon + '</span></td>';
    html += '<td><strong>' + escHtml(r.nombre_completo || "—") + '</strong></td>';
    html += '<td>' + escHtml(usuario) + '</td>';
    html += '<td>' + escHtml(r.documento || "—") + '</td>';
    html += '<td>' + flag + ' ' + escHtml(r.pais || "—") + '</td>';
    html += '<td style="text-align:right">' + cantidad + '</td>';
    html += '<td>' + contenedoresToggleHtml(r) + '</td>';
    html += '<td>' + (r.validated_at ? formatDate(r.validated_at) : "—") + '</td>';
    html += '</tr>';

    if (isExpanded) {
      html += '<tr class="ayudas-detail-row"><td colspan="8">' + buildContenedoresDetailHtml(r) + '</td></tr>';
    }
  }
  tbody.innerHTML = html;
}

async function loadContenedoresStats(silent) {
  const el = document.getElementById("contenedoresStatsGrid");
  if (!silent) el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando estadisticas...</p></div>';

  try {
    const resp = await fetch("/api/contenedores/stats");
    if (!resp.ok) throw new Error("Error");
    const d = await resp.json();

    el.innerHTML =
      '<div class="stat-card"><span class="material-icons stat-icon">people</span><div class="stat-info"><span class="stat-value">' + d.total + '</span><span class="stat-label">Total de personas</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">verified</span><div class="stat-info"><span class="stat-value">' + d.validados + '</span><span class="stat-label">Validados</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">pending</span><div class="stat-info"><span class="stat-value">' + d.novalidados + '</span><span class="stat-label">No validados</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">percent</span><div class="stat-info"><span class="stat-value">' + d.pct_validado + '%</span><span class="stat-label">% Validado</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">inventory_2</span><div class="stat-info"><span class="stat-value">' + Number(d.total_cajas).toLocaleString() + '</span><span class="stat-label">Total cajas</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">public</span><div class="stat-info"><span class="stat-value">' + d.paises + '</span><span class="stat-label">Paises</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">schedule</span><div class="stat-info"><span class="stat-value stat-date">' + (d.ultima_validacion ? formatDateStrict(d.ultima_validacion) : "—") + '</span><span class="stat-label">Ultima validacion</span></div></div>';

    updateRefreshIndicator(false);
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar estadisticas.</p></div>';
  }
}

// ========== CONTENEDORES CRUD ==========

function openContenedoresAddModal() {
  document.getElementById("contenedoresEditId").value = "";
  document.getElementById("contenedoresModalTitle").textContent = "Añadir persona";
  document.getElementById("contenedorFormUsername").value = "";
  document.getElementById("contenedorFormNombre").value = "";
  document.getElementById("contenedorFormDocumento").value = "";
  document.getElementById("contenedorFormPais").value = "";
  document.getElementById("contenedorFormCantidad").value = "";
  document.getElementById("contenedorFormMaterial").value = "";
  document.getElementById("btnContenedoresModalSubmit").textContent = "Guardar";
  document.getElementById("contenedoresModalOverlay").style.display = "flex";
}

function openContenedoresEditModal(id) {
  const r = contenedoresAllData.find(function (item) { return item.id === id; });
  if (!r) return;

  document.getElementById("contenedoresEditId").value = id;
  document.getElementById("contenedoresModalTitle").textContent = "Editar persona";
  document.getElementById("contenedorFormUsername").value = r.telegram_username || "";
  document.getElementById("contenedorFormNombre").value = r.nombre_completo || "";
  document.getElementById("contenedorFormDocumento").value = r.documento || "";
  document.getElementById("contenedorFormPais").value = r.pais || "";
  document.getElementById("contenedorFormCantidad").value = r.cantidad || "";
  document.getElementById("contenedorFormMaterial").value = r.material || "";
  document.getElementById("btnContenedoresModalSubmit").textContent = "Actualizar";
  document.getElementById("contenedoresModalOverlay").style.display = "flex";
}

function closeContenedoresModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("contenedoresModalOverlay").style.display = "none";
}

function getContenedoresFormData() {
  return {
    telegram_username: document.getElementById("contenedorFormUsername").value.trim(),
    nombre_completo: document.getElementById("contenedorFormNombre").value.trim(),
    documento: document.getElementById("contenedorFormDocumento").value.trim(),
    pais: document.getElementById("contenedorFormPais").value.trim(),
    cantidad: document.getElementById("contenedorFormCantidad").value.trim(),
    material: document.getElementById("contenedorFormMaterial").value.trim(),
  };
}

async function submitContenedoresForm() {
  const nombre = document.getElementById("contenedorFormNombre").value.trim();
  if (!nombre) {
    alert("El campo Nombres y Apellidos es obligatorio.");
    document.getElementById("contenedorFormNombre").focus();
    return;
  }
  const username = document.getElementById("contenedorFormUsername").value.trim();
  if (!username) {
    alert("El usuario de Telegram es obligatorio.");
    document.getElementById("contenedorFormUsername").focus();
    return;
  }

  const btn = document.getElementById("btnContenedoresModalSubmit");
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    const editId = document.getElementById("contenedoresEditId").value;
    const data = getContenedoresFormData();
    let url, method;

    if (editId) {
      url = "/api/contenedores/edit/" + editId;
      method = "PUT";
    } else {
      url = "/api/contenedores/add";
      method = "POST";
    }

    const resp = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.detail || "Error al guardar");
    }

    closeContenedoresModal();
    contenedoresExpandedRow = null;
    await loadContenedoresRegistros();
  } catch (err) {
    alert(err.message || "Ocurrio un error al guardar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = document.getElementById("contenedoresEditId").value ? "Actualizar" : "Guardar";
  }
}

function openContenedoresDeleteModal(id) {
  document.getElementById("contenedoresDeleteId").value = id;
  document.getElementById("contenedoresDeleteOverlay").style.display = "flex";
}

function closeContenedoresDeleteModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("contenedoresDeleteOverlay").style.display = "none";
}

async function executeContenedoresDelete() {
  const id = document.getElementById("contenedoresDeleteId").value;
  if (!id) return;

  const btn = document.querySelector("#contenedoresDeleteModal .btn-danger");
  btn.disabled = true;
  btn.textContent = "Eliminando...";

  try {
    const resp = await fetch("/api/contenedores/delete/" + id, { method: "DELETE" });
    if (!resp.ok) throw new Error("Error al eliminar");

    closeContenedoresDeleteModal();
    contenedoresExpandedRow = null;
    await loadContenedoresRegistros();
  } catch (err) {
    alert("Ocurrio un error al eliminar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Eliminar";
  }
}


// ========== REPARTICION VAQUITA FUNCTIONS ==========

let reparticionAllData = [];
let reparticionExpandedRow = null;

function initReparticionSearch() {
  document.getElementById("reparticionSearchInput").addEventListener("input", renderReparticionTable);
  document.getElementById("btnReparticionAdd").addEventListener("click", openReparticionAddModal);
}

function initReparticionDownload() {
  document.getElementById("btnReparticionDownload").addEventListener("click", async () => {
    const btn = document.getElementById("btnReparticionDownload");
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons">hourglass_top</span> Preparando archivo...';
    try {
      const resp = await fetch("/api/reparticion/download");
      if (!resp.ok) throw new Error("Error al descargar");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getReparticionFilename(resp);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      document.getElementById("reparticionDownloadInfo").textContent = "Descarga completada.";
    } catch (err) {
      document.getElementById("reparticionDownloadInfo").textContent = "Error al descargar.";
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons">description</span> Descargar XLSX';
    }
  });
}

function getReparticionFilename(resp) {
  const header = resp.headers.get("Content-Disposition");
  if (header) {
    const m = header.match(/filename="(.+)"/);
    if (m) return m[1];
  }
  const hoy = new Date();
  return `Reparticion_Vaquita_${String(hoy.getDate()).padStart(2,"0")}-${String(hoy.getMonth()+1).padStart(2,"0")}-${hoy.getFullYear()}.xlsx`;
}

async function loadReparticionRegistros(silent) {
  const tbody = document.getElementById("reparticionTableBody");
  if (!silent) tbody.innerHTML = '<tr class="empty-row"><td colspan="10"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando datos...</p></div></td></tr>';

  try {
    const resp = await fetch("/api/reparticion/data");
    if (!resp.ok) throw new Error("Error");
    const json = await resp.json();
    reparticionAllData = json.data || [];
    renderReparticionTable();
    updateRefreshIndicator(false);
  } catch (err) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="10"><div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar datos.</p></div></td></tr>';
  }
}

function renderReparticionTable() {
  const tbody = document.getElementById("reparticionTableBody");
  const search = document.getElementById("reparticionSearchInput").value.toLowerCase();

  let filtered = reparticionAllData;
  if (search) {
    filtered = filtered.filter((r) =>
      [r.telegram_username, r.nombres, r.documento, r.pais]
        .some((v) => v && String(v).toLowerCase().includes(search))
    );
  }

  document.getElementById("reparticionTableCount").textContent = filtered.length + " registro" + (filtered.length !== 1 ? "s" : "");

  if (filtered.length === 0) {
    const msg = search
      ? "No se encontraron registros con ese filtro."
      : "Aun no hay registros de Reparticion Vaquita.";
    tbody.innerHTML = '<tr class="empty-row"><td colspan="10"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>' + msg + '</p></div></td></tr>';
    return;
  }

  let html = "";
  for (let i = 0; i < filtered.length; i++) {
    const r = filtered[i];
    const expandIcon = reparticionExpandedRow === i ? "expand_less" : "expand_more";
    const isExpanded = reparticionExpandedRow === i;
    const usuario = r.telegram_username ? (r.telegram_username.startsWith("@") ? r.telegram_username : "@" + r.telegram_username) : "—";

    html += '<tr class="ayudas-row" onclick="toggleReparticionDetail(' + i + ')"><td class="ayudas-expand-cell"><span class="material-icons ayudas-expand-icon">' + expandIcon + '</span></td>';
    html += '<td>' + usuario + '</td>';
    html += '<td class="valor-cell">' + formatCOP(r.aporte || 0) + '</td>';
    html += '<td class="valor-cell">' + (r.cant_zim || 0) + '</td>';
    html += '<td class="valor-cell">' + (r.cant_dinar || 0) + '</td>';
    html += '<td class="valor-cell">' + (r.cant_oro || 0) + '</td>';
    html += '<td class="valor-cell">' + (r.cajas_total || 0) + '</td>';
    html += '<td>' + (r.nombres || "—") + '</td>';
    html += '<td>' + (r.documento || "—") + '</td>';
    html += '<td>' + (r.pais || "—") + '</td>';
    html += '</tr>';

    if (isExpanded) {
      html += '<tr class="ayudas-detail-row"><td colspan="10">' + buildReparticionDetailHtml(r) + '</td></tr>';
    }
  }
  tbody.innerHTML = html;
}

function buildReparticionDetailHtml(r) {
  const f = (v) => v && String(v).trim() && String(v).trim() !== "VACIO" && String(v).trim() !== "0" ? String(v).trim() : "—";
  const usuario = r.telegram_username ? (r.telegram_username.startsWith("@") ? r.telegram_username : "@" + r.telegram_username) : "—";
  const hasMatch = r.nombres || r.documento || r.pais;

  const products = [
    { icon: "payments", label: "Aporte COP", val: formatCOP(r.aporte || 0) },
    { icon: "inventory_2", label: "Cant. ZIM", val: f(r.cant_zim) },
    { icon: "inventory_2", label: "Cant. DINAR", val: f(r.cant_dinar) },
    { icon: "inventory_2", label: "Cant. ORO", val: f(r.cant_oro) },
    { icon: "inventory_2", label: "Cajas Total", val: f(r.cajas_total) },
  ];

  return `
    <div class="ayudas-detail-card">
      <div class="ayudas-detail-section">
        <div class="ayudas-detail-title"><span class="material-icons">inventory</span> PRODUCTOS</div>
        <div class="ayudas-detail-grid">
          ${products.map(m => `
          <div class="ayudas-detail-item">
            <span class="material-icons">${m.icon}</span>
            <span class="ayudas-detail-label">${m.label}:</span>
            <span class="ayudas-detail-value" style="font-weight:700">${m.val}</span>
          </div>`).join('')}
        </div>
      </div>
      <div class="ayudas-detail-section">
        <div class="ayudas-detail-title"><span class="material-icons">person</span> INFORMACION PERSONAL</div>
        ${hasMatch ? `
        <div class="ayudas-detail-grid">
          <div class="ayudas-detail-item"><span class="material-icons">badge</span><span class="ayudas-detail-label">Nombres:</span><span class="ayudas-detail-value">${f(r.nombres)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">assignment_ind</span><span class="ayudas-detail-label">Documento:</span><span class="ayudas-detail-value">${f(r.documento)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">public</span><span class="ayudas-detail-label">Pais:</span><span class="ayudas-detail-value">${getCountryFlag(r.pais)} ${f(r.pais)}</span></div>
          <div class="ayudas-detail-item"><span class="material-icons">alternate_email</span><span class="ayudas-detail-label">Telegram:</span><span class="ayudas-detail-value">${usuario}</span></div>
        </div>
        <div style="margin-top:10px;font-size:12px;color:#9E9E9E;display:flex;align-items:center;gap:6px">
          <span class="material-icons" style="font-size:16px">check_circle</span>
          Datos personales obtenidos de la base de datos del sistema (coincidencia por @usuario)
        </div>
        ` : `
        <div style="display:flex;align-items:center;gap:8px;padding:12px;background:#FFF3E0;border-radius:8px;font-size:13px;color:#E65100">
          <span class="material-icons" style="font-size:20px">search_off</span>
          No se encontraron datos personales en las bases de datos. Usa "Editar" para ingresarlos manualmente.
        </div>
        `}
      </div>
      <div class="ayudas-detail-section ayudas-detail-section-meta">
        <div class="ayudas-detail-meta-row">
          <span class="material-icons">schedule</span> Creado: ${formatDate(r.created_at)}
          <span class="material-icons" style="margin-left:20px">update</span> Actualizado: ${formatDate(r.updated_at)}
        </div>
      </div>
      <div class="inventario-detail-actions">
        <button class="btn btn-sm btn-edit" onclick="event.stopPropagation();openReparticionEditModal(${r.id})">
          <span class="material-icons" style="font-size:16px">edit</span> Editar
        </button>
        <button class="btn btn-sm btn-delete" onclick="event.stopPropagation();openReparticionDeleteModal(${r.id})">
          <span class="material-icons" style="font-size:16px">delete</span> Eliminar
        </button>
      </div>
    </div>`;
}

function toggleReparticionDetail(idx) {
  if (reparticionExpandedRow === idx) {
    reparticionExpandedRow = null;
  } else {
    reparticionExpandedRow = idx;
  }
  renderReparticionTable();
}

// ========== REPARTICION MODALS ==========

function openReparticionEditModal(id) {
  const r = reparticionAllData.find(function(item) { return item.id === id; });
  if (!r) return;

  document.getElementById("reparticionEditId").value = id;
  document.getElementById("reparticionModalTitle").textContent = "Editar registro";
  document.getElementById("repFormUsername").value = r.telegram_username || "";
  document.getElementById("repFormAporte").value = r.aporte || "";
  document.getElementById("repFormZim").value = r.cant_zim || "";
  document.getElementById("repFormDinar").value = r.cant_dinar || "";
  document.getElementById("repFormOro").value = r.cant_oro || "";
  document.getElementById("repFormCajas").value = r.cajas_total || "";
  document.getElementById("repFormNombres").value = r.nombres || "";
  document.getElementById("repFormDocumento").value = r.documento || "";
  document.getElementById("repFormPais").value = r.pais || "";
  document.getElementById("btnReparticionModalSubmit").textContent = "Actualizar";
  document.getElementById("reparticionModalOverlay").style.display = "flex";
}

function openReparticionAddModal() {
  document.getElementById("reparticionEditId").value = "";
  document.getElementById("reparticionModalTitle").textContent = "Añadir registro";
  document.getElementById("repFormUsername").value = "";
  document.getElementById("repFormAporte").value = "";
  document.getElementById("repFormZim").value = "";
  document.getElementById("repFormDinar").value = "";
  document.getElementById("repFormOro").value = "";
  document.getElementById("repFormCajas").value = "";
  document.getElementById("repFormNombres").value = "";
  document.getElementById("repFormDocumento").value = "";
  document.getElementById("repFormPais").value = "";
  document.getElementById("btnReparticionModalSubmit").textContent = "Guardar";
  document.getElementById("reparticionModalOverlay").style.display = "flex";
}

function closeReparticionModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("reparticionModalOverlay").style.display = "none";
}

function getReparticionFormData() {
  return {
    telegram_username: document.getElementById("repFormUsername").value.trim(),
    aporte: document.getElementById("repFormAporte").value.trim(),
    cant_zim: document.getElementById("repFormZim").value.trim(),
    cant_dinar: document.getElementById("repFormDinar").value.trim(),
    cant_oro: document.getElementById("repFormOro").value.trim(),
    cajas_total: document.getElementById("repFormCajas").value.trim(),
    nombres: document.getElementById("repFormNombres").value.trim(),
    documento: document.getElementById("repFormDocumento").value.trim(),
    pais: document.getElementById("repFormPais").value.trim(),
  };
}

async function submitReparticionForm() {
  const editId = document.getElementById("reparticionEditId").value;
  const isEditing = !!editId;

  const btn = document.getElementById("btnReparticionModalSubmit");
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    const data = getReparticionFormData();
    let url, method;

    if (isEditing) {
      url = "/api/reparticion/edit/" + editId;
      method = "PUT";
    } else {
      url = "/api/reparticion/add";
      method = "POST";
    }

    const resp = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.detail || "Error al guardar");
    }

    closeReparticionModal();
    reparticionExpandedRow = null;
    await loadReparticionRegistros();
  } catch (err) {
    alert(err.message || "Ocurrio un error al guardar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = document.getElementById("reparticionEditId").value ? "Actualizar" : "Guardar";
  }
}

function openReparticionDeleteModal(id) {
  document.getElementById("reparticionDeleteId").value = id;
  document.getElementById("reparticionDeleteOverlay").style.display = "flex";
}

function closeReparticionDeleteModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("reparticionDeleteOverlay").style.display = "none";
}

async function executeReparticionDelete() {
  const id = document.getElementById("reparticionDeleteId").value;
  if (!id) return;

  const btn = document.querySelector("#reparticionDeleteModal .btn-danger");
  btn.disabled = true;
  btn.textContent = "Eliminando...";

  try {
    const resp = await fetch("/api/reparticion/delete/" + id, {
      method: "DELETE",
    });

    if (!resp.ok) throw new Error("Error al eliminar");

    closeReparticionDeleteModal();
    reparticionExpandedRow = null;
    await loadReparticionRegistros();
  } catch (err) {
    alert("Ocurrio un error al eliminar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Eliminar";
  }
}


// ========== VAQUITA DIRECTORIO + PRODUCTOS FUNCTIONS ==========

const VAQUITAS_MODS = {
  directorio: {
    title: "Directorio de Clientes",
    info: "Directorio unificado de clientes Vaquitas. Campos: usuario, nombres, documento, pa&iacute;s y lista de productos donde participa.",
    headers: ["", "Usuario Telegram", "Nombres y Apellidos", "Documento", "Pa&iacute;s", "Productos"],
    mainFields: ["telegram_username", "nombres", "documento", "pais"],
    detailFields: ["telegram_username", "nombres", "documento", "pais"],
    formFields: [
      { id: "vaqFUsername", label: "Telegram @username", type: "text", key: "telegram_username" },
      { id: "vaqFNombres", label: "Nombres y Apellidos", type: "text", key: "nombres" },
      { id: "vaqFDocumento", label: "Documento", type: "text", key: "documento" },
      { id: "vaqFPais", label: "Pa&iacute;s", type: "text", key: "pais" },
      { id: "vaqFProductos", label: "Productos (separados por coma)", type: "text", key: "productos" },
    ],
  },
  aguila_roja: {
    title: "Aguila Roja",
    info: "Participaciones del Aguila Roja. Campos: cupo y porcentaje.",
    headers: ["", "Usuario Telegram", "Nombres y Apellidos", "Documento", "Pa&iacute;s", "Cupo", "Porcentaje"],
    mainFields: ["telegram_username", "nombres", "documento", "pais"],
    detailFields: ["telegram_username", "nombres", "documento", "pais", "cupo", "porcentaje"],
    formFields: [
      { id: "vaqFUsername", label: "Telegram @username", type: "text", key: "telegram_username" },
      { id: "vaqFNombres", label: "Nombres y Apellidos", type: "text", key: "nombres" },
      { id: "vaqFDocumento", label: "Documento", type: "text", key: "documento" },
      { id: "vaqFPais", label: "Pa&iacute;s", type: "text", key: "pais" },
      { id: "vaqFCupo", label: "Cupo", type: "number", key: "cupo" },
      { id: "vaqFPorcentaje", label: "Porcentaje", type: "number", key: "porcentaje" },
    ],
  },
  aguila_verde: {
    title: "Aguila Verde",
    info: "Participaciones del Aguila Verde. Campos: cupos y porcentaje.",
    headers: ["", "Usuario Telegram", "Nombres y Apellidos", "Documento", "Pa&iacute;s", "Cupos", "Porcentaje"],
    mainFields: ["telegram_username", "nombres", "documento", "pais"],
    detailFields: ["telegram_username", "nombres", "documento", "pais", "cupos", "porcentaje"],
    formFields: [
      { id: "vaqFUsername", label: "Telegram @username", type: "text", key: "telegram_username" },
      { id: "vaqFNombres", label: "Nombres y Apellidos", type: "text", key: "nombres" },
      { id: "vaqFDocumento", label: "Documento", type: "text", key: "documento" },
      { id: "vaqFPais", label: "Pa&iacute;s", type: "text", key: "pais" },
      { id: "vaqFCupos", label: "Cupos", type: "number", key: "cupos" },
      { id: "vaqFPorcentaje", label: "Porcentaje", type: "number", key: "porcentaje" },
    ],
  },
  googolplex: {
    title: "Vaquita Googolplex",
    info: "Participaciones de la Vaquita Googolplex. Campos: cantidad y tipo.",
    headers: ["", "Usuario Telegram", "Nombres y Apellidos", "Documento", "Pa&iacute;s", "Cantidad", "Tipo"],
    mainFields: ["telegram_username", "nombres", "documento", "pais"],
    detailFields: ["telegram_username", "nombres", "documento", "pais", "cantidad", "tipo"],
    formFields: [
      { id: "vaqFUsername", label: "Telegram @username", type: "text", key: "telegram_username" },
      { id: "vaqFNombres", label: "Nombres y Apellidos", type: "text", key: "nombres" },
      { id: "vaqFDocumento", label: "Documento", type: "text", key: "documento" },
      { id: "vaqFPais", label: "Pa&iacute;s", type: "text", key: "pais" },
      { id: "vaqFCantidad", label: "Cantidad", type: "number", key: "cantidad" },
      { id: "vaqFTipo", label: "Tipo", type: "text", key: "tipo" },
    ],
  },
  listado1: {
    title: "Listado 1 - Vaquita 20 Contenedores",
    info: "Participaciones del Listado 1 (20 contenedores). Cajas ZIM / DINAR / ORO con sus materiales.",
    headers: ["", "Usuario Telegram", "Nombres y Apellidos", "Documento", "Pa&iacute;s", "Cajas ZIM", "Cajas DINAR", "Cajas ORO", "Material ZIM", "Material DINAR", "Material ORO"],
    mainFields: ["telegram_username", "nombres", "documento", "pais", "cajas_zim", "cajas_dinar", "cajas_oro"],
    detailFields: ["telegram_username", "nombres", "documento", "pais", "cajas_zim", "cajas_dinar", "cajas_oro", "material_zim", "material_dinar", "material_oro"],
    formFields: [
      { id: "vaqFUsername", label: "Telegram @username", type: "text", key: "telegram_username" },
      { id: "vaqFNombres", label: "Nombres y Apellidos", type: "text", key: "nombres" },
      { id: "vaqFDocumento", label: "Documento", type: "text", key: "documento" },
      { id: "vaqFPais", label: "Pa&iacute;s", type: "text", key: "pais" },
      { id: "vaqFCajasZim", label: "Cajas ZIM", type: "number", key: "cajas_zim" },
      { id: "vaqFCajasDinar", label: "Cajas DINAR", type: "number", key: "cajas_dinar" },
      { id: "vaqFCajasOro", label: "Cajas ORO", type: "number", key: "cajas_oro" },
      { id: "vaqFMatZim", label: "Material ZIM", type: "text", key: "material_zim" },
      { id: "vaqFMatDinar", label: "Material DINAR", type: "text", key: "material_dinar" },
      { id: "vaqFMatOro", label: "Material ORO", type: "text", key: "material_oro" },
    ],
  },
  listado2: {
    title: "Listado 2 - Vaquita 20 Contenedores",
    info: "Participaciones del Listado 2 (20 contenedores). Cajas ZIM / DINAR / ORO con sus materiales.",
    headers: ["", "Usuario Telegram", "Nombres y Apellidos", "Documento", "Pa&iacute;s", "Cajas ZIM", "Cajas DINAR", "Cajas ORO", "Material ZIM", "Material DINAR", "Material ORO"],
    mainFields: ["telegram_username", "nombres", "documento", "pais", "cajas_zim", "cajas_dinar", "cajas_oro"],
    detailFields: ["telegram_username", "nombres", "documento", "pais", "cajas_zim", "cajas_dinar", "cajas_oro", "material_zim", "material_dinar", "material_oro"],
    formFields: [
      { id: "vaqFUsername", label: "Telegram @username", type: "text", key: "telegram_username" },
      { id: "vaqFNombres", label: "Nombres y Apellidos", type: "text", key: "nombres" },
      { id: "vaqFDocumento", label: "Documento", type: "text", key: "documento" },
      { id: "vaqFPais", label: "Pa&iacute;s", type: "text", key: "pais" },
      { id: "vaqFCajasZim", label: "Cajas ZIM", type: "number", key: "cajas_zim" },
      { id: "vaqFCajasDinar", label: "Cajas DINAR", type: "number", key: "cajas_dinar" },
      { id: "vaqFCajasOro", label: "Cajas ORO", type: "number", key: "cajas_oro" },
      { id: "vaqFMatZim", label: "Material ZIM", type: "text", key: "material_zim" },
      { id: "vaqFMatDinar", label: "Material DINAR", type: "text", key: "material_dinar" },
      { id: "vaqFMatOro", label: "Material ORO", type: "text", key: "material_oro" },
    ],
  },
};

let vaquitasAllData = [];
let vaquitasExpandedRow = null;
let vaquitasCurrentMod = "directorio";

function getVaquitasCurrentMod() {
  const active = document.querySelector("#nav-vaquitas .nav-btn.active");
  return active && active.dataset.mod ? active.dataset.mod : vaquitasCurrentMod;
}

function vaquitasModCfg() {
  return VAQUITAS_MODS[getVaquitasCurrentMod()];
}

function initVaquitasSearch() {
  document.getElementById("vaquitasSearchInput").addEventListener("input", renderVaquitasTable);
  document.getElementById("btnVaquitasAdd").addEventListener("click", openVaquitasAddModal);
}

function initVaquitasDownload() {
  document.querySelectorAll("[data-dlmod]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const mod = btn.dataset.dlmod;
      const info = document.getElementById("vaquitasDownloadInfo");
      btn.disabled = true;
      const original = btn.innerHTML;
      btn.innerHTML = '<span class="material-icons">hourglass_top</span> Preparando...';
      try {
        const resp = await fetch("/api/vaquitas/" + mod + "/download");
        if (!resp.ok) throw new Error("Error al descargar");
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = getVaquitasFilename(resp, mod);
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        info.textContent = "Descarga completada: " + (VAQUITAS_MODS[mod] ? VAQUITAS_MODS[mod].title : mod) + ".";
      } catch (err) {
        info.textContent = "Error al descargar.";
      } finally {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    });
  });
}

function getVaquitasFilename(resp, mod) {
  const header = resp.headers.get("Content-Disposition");
  if (header) {
    const m = header.match(/filename="(.+)"/);
    if (m) return m[1];
  }
  const hoy = new Date();
  return `Vaquitas_${mod}_${String(hoy.getDate()).padStart(2,"0")}-${String(hoy.getMonth()+1).padStart(2,"0")}-${hoy.getFullYear()}.xlsx`;
}

async function loadVaquitasRegistros(silent) {
  const mod = getVaquitasCurrentMod();
  vaquitasCurrentMod = mod;
  const cfg = VAQUITAS_MODS[mod];
  document.getElementById("vaquitasInfoBanner").innerHTML = cfg.info;
  document.getElementById("sectionTitle").textContent = cfg.title + " - Vaquitas";
  renderVaquitasHeaders(cfg);

  const tbody = document.getElementById("vaquitasTableBody");
  if (!silent) tbody.innerHTML = '<tr class="empty-row"><td colspan="' + cfg.headers.length + '"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando datos...</p></div></td></tr>';

  try {
    const resp = await fetch("/api/vaquitas/" + mod + "/data");
    if (!resp.ok) throw new Error("Error");
    const json = await resp.json();
    vaquitasAllData = json.data || [];
    renderVaquitasTable();
    updateRefreshIndicator(false);
  } catch (err) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="' + cfg.headers.length + '"><div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar datos.</p></div></td></tr>';
  }
}

function renderVaquitasHeaders(cfg) {
  const thead = document.getElementById("vaquitasTableHead");
  const html = cfg.headers.map((h, i) => {
    if (i === 0) return '<th style="width:36px">' + h + '</th>';
    return '<th>' + h + '</th>';
  }).join("");
  thead.innerHTML = "<tr>" + html + "</tr>";
}

function renderVaquitasTable() {
  const tbody = document.getElementById("vaquitasTableBody");
  const cfg = vaquitasModCfg();
  const search = document.getElementById("vaquitasSearchInput").value.toLowerCase();

  let filtered = vaquitasAllData;
  if (search) {
    filtered = filtered.filter((r) =>
      [r.telegram_username, r.nombres, r.documento, r.pais]
        .some((v) => v && String(v).toLowerCase().includes(search))
    );
  }

  document.getElementById("vaquitasTableCount").textContent = filtered.length + " registro" + (filtered.length !== 1 ? "s" : "");

  if (filtered.length === 0) {
    const msg = search
      ? "No se encontraron registros con ese filtro."
      : "Aun no hay registros en este modulo.";
    tbody.innerHTML = '<tr class="empty-row"><td colspan="' + cfg.headers.length + '"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>' + msg + '</p></div></td></tr>';
    return;
  }

  let html = "";
  for (let i = 0; i < filtered.length; i++) {
    const r = filtered[i];
    const expandIcon = vaquitasExpandedRow === i ? "expand_less" : "expand_more";
    const isExpanded = vaquitasExpandedRow === i;
    const usuario = r.telegram_username ? (r.telegram_username.startsWith("@") ? r.telegram_username : "@" + r.telegram_username) : "—";

    html += '<tr class="ayudas-row" onclick="toggleVaquitasDetail(' + i + ')"><td class="ayudas-expand-cell"><span class="material-icons ayudas-expand-icon">' + expandIcon + '</span></td>';
    html += '<td>' + usuario + '</td>';
    html += '<td>' + (r.nombres || "—") + '</td>';
    html += '<td>' + (r.documento || "—") + '</td>';
    html += '<td>' + (r.pais || "—") + '</td>';

    for (let j = 5; j < cfg.headers.length; j++) {
      const key = cfg.mainFields[j - 1] || null;
      if (!key) { html += '<td></td>'; continue; }
      const v = r[key];
      if (typeof v === "number") {
        html += '<td class="valor-cell">' + v + '</td>';
      } else {
        html += '<td>' + (v && String(v).trim() ? (key === "productos" ? fmtProductos(v) : v) : "—") + '</td>';
      }
    }
    html += '</tr>';

    if (isExpanded) {
      html += '<tr class="ayudas-detail-row"><td colspan="' + cfg.headers.length + '">' + buildVaquitasDetailHtml(r, cfg) + '</td></tr>';
    }
  }
  tbody.innerHTML = html;
}

function fmtProductos(v) {
  if (Array.isArray(v)) {
    return v.map((p) => p.replace("participaciones_", "").replace("_", " ")).join(", ");
  }
  return String(v || "").replace(/participaciones_/g, "").replace(/_/g, " ");
}

function buildVaquitasDetailHtml(r, cfg) {
  const f = (v) => v && String(v).trim() && String(v).trim() !== "VACIO" && String(v).trim() !== "0" ? String(v).trim() : "—";
  const usuario = r.telegram_username ? (r.telegram_username.startsWith("@") ? r.telegram_username : "@" + r.telegram_username) : "—";

  const numLabels = { cupo: "Cupo", porcentaje: "Porcentaje", cupos: "Cupos", cantidad: "Cantidad", cajas_zim: "Cajas ZIM", cajas_dinar: "Cajas DINAR", cajas_oro: "Cajas ORO" };

  const items = cfg.detailFields.map((k) => {
    const v = r[k];
    if (k === "telegram_username") return { icon: "alternate_email", label: "Telegram", val: usuario };
    if (k === "nombres") return { icon: "badge", label: "Nombres", val: f(v) };
    if (k === "documento") return { icon: "assignment_ind", label: "Documento", val: f(v) };
    if (k === "pais") return { icon: "public", label: "Pais", val: getCountryFlag(r.pais) + " " + f(v) };
    if (k === "productos") return { icon: "inventory_2", label: "Productos", val: f(fmtProductos(v)) };
    if (k.startsWith("material_")) return { icon: "category", label: "Material " + k.replace("material_", "").toUpperCase(), val: f(v) };
    if (typeof v === "number") return { icon: "inventory_2", label: numLabels[k] || k, val: String(v) };
    return { icon: "inventory_2", label: numLabels[k] || k, val: f(v) };
  });

  const grid = items.map((m) =>
    '<div class="ayudas-detail-item"><span class="material-icons">' + m.icon + '</span><span class="ayudas-detail-label">' + m.label + ':</span><span class="ayudas-detail-value" style="font-weight:700">' + m.val + '</span></div>'
  ).join('');

  return `
    <div class="ayudas-detail-card">
      <div class="ayudas-detail-section">
        <div class="ayudas-detail-title"><span class="material-icons">person</span> DATOS DEL REGISTRO</div>
        <div class="ayudas-detail-grid">${grid}</div>
      </div>
      <div class="ayudas-detail-section ayudas-detail-section-meta">
        <div class="ayudas-detail-meta-row">
          <span class="material-icons">schedule</span> Creado: ${formatDate(r.created_at)}
          <span class="material-icons" style="margin-left:20px">update</span> Actualizado: ${formatDate(r.updated_at)}
        </div>
      </div>
      <div class="inventario-detail-actions">
        <button class="btn btn-sm btn-edit" onclick="event.stopPropagation();openVaquitasEditModal(${r.id})">
          <span class="material-icons" style="font-size:16px">edit</span> Editar
        </button>
        <button class="btn btn-sm btn-delete" onclick="event.stopPropagation();openVaquitasDeleteModal(${r.id})">
          <span class="material-icons" style="font-size:16px">delete</span> Eliminar
        </button>
      </div>
    </div>`;
}

function toggleVaquitasDetail(idx) {
  if (vaquitasExpandedRow === idx) {
    vaquitasExpandedRow = null;
  } else {
    vaquitasExpandedRow = idx;
  }
  renderVaquitasTable();
}

// ========== VAQUITAS MODALS ==========

function buildVaquitasForm(cfg) {
  const fields = cfg.formFields.map((fld) => {
    const full = '<div class="form-group"><label class="form-label">' + fld.label + '</label><input type="' + fld.type + '" id="' + fld.id + '" class="form-input" placeholder=""></div>';
    if (fld.type === "number") return full;
    return full;
  });
  return fields.join("");
}

function setVaquitasFormValues(r, cfg) {
  cfg.formFields.forEach((fld) => {
    const el = document.getElementById(fld.id);
    if (!el) return;
    let v = r[fld.key];
    if (fld.key === "productos" && Array.isArray(v)) v = v.join(", ");
    el.value = (v === null || v === undefined) ? "" : v;
  });
}

function openVaquitasEditModal(id) {
  const mod = getVaquitasCurrentMod();
  vaquitasCurrentMod = mod;
  const cfg = VAQUITAS_MODS[mod];
  const r = vaquitasAllData.find((item) => item.id === id);
  if (!r) return;

  document.getElementById("vaquitasEditId").value = id;
  document.getElementById("vaquitasEditMod").value = mod;
  document.getElementById("vaquitasModalTitle").textContent = "Editar registro - " + cfg.title;
  document.getElementById("vaquitasFormFields").innerHTML = buildVaquitasForm(cfg);
  setVaquitasFormValues(r, cfg);
  document.getElementById("btnVaquitasModalSubmit").textContent = "Actualizar";
  document.getElementById("vaquitasModalOverlay").style.display = "flex";
}

function openVaquitasAddModal() {
  const mod = getVaquitasCurrentMod();
  vaquitasCurrentMod = mod;
  const cfg = VAQUITAS_MODS[mod];

  document.getElementById("vaquitasEditId").value = "";
  document.getElementById("vaquitasEditMod").value = mod;
  document.getElementById("vaquitasModalTitle").textContent = "Añadir registro - " + cfg.title;
  document.getElementById("vaquitasFormFields").innerHTML = buildVaquitasForm(cfg);
  cfg.formFields.forEach((fld) => {
    const el = document.getElementById(fld.id);
    if (el) el.value = "";
  });
  document.getElementById("btnVaquitasModalSubmit").textContent = "Guardar";
  document.getElementById("vaquitasModalOverlay").style.display = "flex";
}

function closeVaquitasModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("vaquitasModalOverlay").style.display = "none";
}

function getVaquitasFormData() {
  const mod = document.getElementById("vaquitasEditMod").value || getVaquitasCurrentMod();
  const cfg = VAQUITAS_MODS[mod];
  const data = {};
  cfg.formFields.forEach((fld) => {
    const el = document.getElementById(fld.id);
    if (!el) return;
    data[fld.key] = el.value.trim();
  });
  return data;
}

async function submitVaquitasForm() {
  const editId = document.getElementById("vaquitasEditId").value;
  const mod = document.getElementById("vaquitasEditMod").value || getVaquitasCurrentMod();
  const isEditing = !!editId;

  const btn = document.getElementById("btnVaquitasModalSubmit");
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    const data = getVaquitasFormData();
    let url, method;
    if (isEditing) {
      url = "/api/vaquitas/" + mod + "/edit/" + editId;
      method = "PUT";
    } else {
      url = "/api/vaquitas/" + mod + "/add";
      method = "POST";
    }

    const resp = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.detail || "Error al guardar");
    }

    closeVaquitasModal();
    vaquitasExpandedRow = null;
    await loadVaquitasRegistros();
  } catch (err) {
    alert(err.message || "Ocurrio un error al guardar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = document.getElementById("vaquitasEditId").value ? "Actualizar" : "Guardar";
  }
}

function openVaquitasDeleteModal(id) {
  document.getElementById("vaquitasDeleteId").value = id;
  document.getElementById("vaquitasDeleteMod").value = getVaquitasCurrentMod();
  document.getElementById("vaquitasDeleteOverlay").style.display = "flex";
}

function closeVaquitasDeleteModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("vaquitasDeleteOverlay").style.display = "none";
}

async function executeVaquitasDelete() {
  const id = document.getElementById("vaquitasDeleteId").value;
  const mod = document.getElementById("vaquitasDeleteMod").value || getVaquitasCurrentMod();
  if (!id) return;

  const btn = document.querySelector("#vaquitasDeleteModal .btn-danger");
  btn.disabled = true;
  btn.textContent = "Eliminando...";

  try {
    const resp = await fetch("/api/vaquitas/" + mod + "/delete/" + id, {
      method: "DELETE",
    });
    if (!resp.ok) throw new Error("Error al eliminar");
    closeVaquitasDeleteModal();
    vaquitasExpandedRow = null;
    await loadVaquitasRegistros();
  } catch (err) {
    alert("Ocurrio un error al eliminar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Eliminar";
  }
}


// ========== CONSULTA FUNCTIONS ==========

function initConsultaSearch() {
  const input = document.getElementById("consultaSearchInput");
  const btn = document.getElementById("btnConsultaSearch");

  input.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      loadConsulta();
    }
  });

  btn.addEventListener("click", function() {
    loadConsulta();
  });
}

async function loadConsulta(silent) {
  const q = document.getElementById("consultaSearchInput").value.trim();
  const resultsEl = document.getElementById("consultaResults");
  const hintEl = document.getElementById("consultaHint");

  if (q.length < 2) {
    if (!silent) {
      hintEl.innerHTML = '<span class="material-icons consulta-hint-icon">info</span><span>Ingresa al menos 2 caracteres para buscar.</span>';
      resultsEl.innerHTML = "";
    }
    return;
  }

  hintEl.style.display = "none";
  if (!silent) resultsEl.innerHTML = '<div class="consulta-loading"><span class="material-icons consulta-loading-icon">hourglass_top</span>Buscando en todos los modulos...</div>';

  try {
    const resp = await fetch("/api/consulta?q=" + encodeURIComponent(q));
    if (!resp.ok) throw new Error("Error en la consulta");
    const json = await resp.json();
    renderConsulta(json);
    updateRefreshIndicator(false);
  } catch (err) {
    resultsEl.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al realizar la consulta. Intenta de nuevo.</p></div>';
  }
}

function renderConsulta(data) {
  const resultsEl = document.getElementById("consultaResults");
  const hintEl = document.getElementById("consultaHint");
  const persons = data.persons || [];

  if (persons.length === 0) {
    hintEl.style.display = "flex";
    hintEl.innerHTML = '<span class="material-icons consulta-hint-icon">search_off</span><span>No se encontraron resultados para "' + data.query + '".</span>';
    resultsEl.innerHTML = "";
    return;
  }

  let html = '<div class="consulta-summary">' + persons.length + " persona" + (persons.length !== 1 ? "s" : "") + ' encontrada' + (persons.length !== 1 ? "s" : "") + ' para "' + data.query + '"</div>';

  for (const p of persons) {
    const name = p.name || "(sin nombre)";
    const idents = [];
    if (p.identifiers.dni) idents.push("DNI: " + p.identifiers.dni);
    if (p.identifiers.telegram_username) idents.push("@" + p.identifiers.telegram_username);
    if (p.identifiers.email) idents.push(p.identifiers.email);
    const identStr = idents.join(" · ");

    let sourcesHtml = "";

    // BOT section
    if (p.bot && p.bot.exists) {
      sourcesHtml += buildConsultaSourceHtml("bot", "smart_toy", "BOT Principal", [
        { label: "Nombres", val: p.bot.nombres_completos },
        { label: "Documento", val: p.bot.numero_documento },
        { label: "Email", val: p.bot.correo_electronico },
        { label: "Telegram", val: p.bot.telegram_username ? "@" + p.bot.telegram_username : null },
        { label: "Actualizaci\u00f3n", val: formatDate(p.bot.updated_at) },
      ]);
    }

    // AYUDAS section
    if (p.ayudas && p.ayudas.exists) {
      const benefStr = p.ayudas.beneficiarios > 0 ? p.ayudas.beneficiarios + " beneficiario" + (p.ayudas.beneficiarios !== 1 ? "s" : "") : "0";
      const estadoBadge = p.ayudas.estado === "completo" ? '<span class="estado-badge estado-completo">Completo</span>'
        : p.ayudas.estado === "sin_banco" ? '<span class="estado-badge estado-sinbanco">Sin banco</span>'
        : '<span class="estado-badge estado-incompleto">Incompleto</span>';

      let extraHtml = '<div class="consulta-field"><span class="consulta-field-label">Beneficiarios:</span> ' + benefStr + "</div>";
      extraHtml += '<div class="consulta-field"><span class="consulta-field-label">Estado:</span> ' + estadoBadge + "</div>";

      sourcesHtml += buildConsultaSourceHtml("ayudas", "volunteer_activism", "Ayudas Humanitarias", [
        { label: "Nombre", val: p.ayudas.nombre },
        { label: "DNI", val: p.ayudas.dni },
        { label: "Pa\u00eds", val: p.ayudas.pais },
        { label: "Tel\u00e9fono", val: p.ayudas.telefono },
        { label: "Correo", val: p.ayudas.correo },
        { label: "Actualizaci\u00f3n", val: formatDate(p.ayudas.updated_at) },
      ], extraHtml);
    }

    // INVENTARIO section
    if (p.inventario && p.inventario.exists) {
      const mats = p.inventario.materiales || {};
      const hasMat = mats.cajamicro || mats.cajadinar || mats.per_aleman || mats.per_top || mats.per_dragon;

      let matHtml = "";
      if (hasMat) {
        matHtml = '<div class="consulta-field"><span class="consulta-field-label">Materiales:</span></div>';
        if (mats.cajamicro) matHtml += '<div class="consulta-mat-row"><span class="consulta-mat-label">Cajas Micro:</span><span class="consulta-mat-val">' + mats.cajamicro + "</span></div>";
        if (mats.cajadinar) matHtml += '<div class="consulta-mat-row"><span class="consulta-mat-label">Cajas Dinar:</span><span class="consulta-mat-val">' + mats.cajadinar + "</span></div>";
        if (mats.per_aleman) matHtml += '<div class="consulta-mat-row"><span class="consulta-mat-label">Perg. Alemanes:</span><span class="consulta-mat-val">' + mats.per_aleman + "</span></div>";
        if (mats.per_top) matHtml += '<div class="consulta-mat-row"><span class="consulta-mat-label">Perg. Nonillon:</span><span class="consulta-mat-val">' + mats.per_top + "</span></div>";
        if (mats.per_dragon) matHtml += '<div class="consulta-mat-row"><span class="consulta-mat-label">Cajas Dragones:</span><span class="consulta-mat-val">' + mats.per_dragon + "</span></div>";
      }

      sourcesHtml += buildConsultaSourceHtml("inventario", "inventory", "Inventario", [
        { label: "Nombre", val: p.inventario.nombre },
        { label: "DNI", val: p.inventario.dni },
        { label: "Pa\u00eds", val: p.inventario.pais },
        { label: "Actualizaci\u00f3n", val: formatDate(p.inventario.updated_at) },
      ], hasMat ? matHtml : "");
    }

    // PAGOS section
    if (p.pagos && p.pagos.exists) {
      let pagosExtra = '<div class="consulta-field"><span class="consulta-field-label">Transacciones:</span> ' + p.pagos.transacciones + "</div>";
      pagosExtra += '<div class="consulta-field"><span class="consulta-field-label">Total COP:</span> <strong>' + formatCOP(p.pagos.total_cop) + "</strong></div>";
      if (p.pagos.ultimo_pago) {
        pagosExtra += '<div class="consulta-field"><span class="consulta-field-label">\u00daltimo pago:</span> ' + formatDateShort(p.pagos.ultimo_pago) + "</div>";
      }

      const detalles = p.pagos.detalles || [];
      if (detalles.length > 0) {
        pagosExtra += '<div class="consulta-pagos-mini"><table class="consulta-pagos-table"><thead><tr><th>Fecha</th><th>Flayer</th><th>Valor</th></tr></thead><tbody>';
        for (const d of detalles) {
          pagosExtra += "<tr><td>" + formatDateShort(d.fecha) + "</td><td>" + (d.flayer || "-") + "</td><td class='valor-cell'>" + formatCOP(d.valor) + "</td></tr>";
        }
        pagosExtra += "</tbody></table></div>";
      }

      sourcesHtml += buildConsultaSourceHtml("pagos", "payments", "Pagos", [], pagosExtra);
    }

    // FARLEY (CRM) section
    if (p.farley && p.farley.exists) {
      let farleyExtra = '<div class="consulta-field"><span class="consulta-field-label">Compras:</span> ' + p.farley.purchase_count + '</div>';
      farleyExtra += '<div class="consulta-field"><span class="consulta-field-label">Total gastado:</span> <strong>$' + (p.farley.total_spent || 0).toLocaleString() + '</strong></div>';
      if (p.farley.categories && p.farley.categories.length > 0) {
        farleyExtra += '<div class="consulta-field"><span class="consulta-field-label">Categorías:</span> ' + p.farley.categories.map(function(t) { return '<span class="tag tag-' + t + '">' + (FARLEY_TAG_NAMES[t] || t) + '</span>'; }).join(' ') + '</div>';
      }
      const purchases = p.farley.purchases || [];
      if (purchases.length > 0) {
        farleyExtra += '<div class="consulta-pagos-mini"><table class="consulta-pagos-table"><thead><tr><th>Fecha</th><th>Promoción</th><th>Valor</th></tr></thead><tbody>';
        for (const pu of purchases) {
          farleyExtra += '<tr><td>' + (pu.date || '-') + '</td><td>' + (pu.flayer || '-') + '</td><td class="valor-cell">' + (pu.amount ? '$' + pu.amount.toLocaleString() : '-') + '</td></tr>';
        }
        farleyExtra += '</tbody></table></div>';
      }
      sourcesHtml += buildConsultaSourceHtml("farley", "assignment", "B. DATOS - FARLEY", [
        { label: "Nombre", val: p.farley.name },
        { label: "Cédula", val: p.farley.cedula },
        { label: "Email", val: p.farley.email },
        { label: "Teléfono", val: p.farley.phone },
        { label: "Ubicación", val: [p.farley.city, p.farley.department, p.farley.country].filter(Boolean).join(', ') },
      ], farleyExtra);
    }

    html += '<div class="consulta-result-card">';
    html += '<div class="consulta-person-header">';
    html += '<span class="material-icons consulta-person-icon">person</span>';
    html += '<div class="consulta-person-info">';
    html += '<span class="consulta-person-name">' + name + "</span>";
    if (identStr) html += '<span class="consulta-person-identifiers">' + identStr + "</span>";
    html += "</div></div>";
    html += sourcesHtml;
    html += "</div>";
  }

  resultsEl.innerHTML = html;
}

function buildConsultaSourceHtml(sourceClass, icon, title, fields, extraHtml) {
  let bodyHtml = "";
  for (const f of fields) {
    if (f.val) {
      bodyHtml += '<div class="consulta-field"><span class="consulta-field-label">' + f.label + ":</span> " + f.val + "</div>";
    }
  }
  if (extraHtml) bodyHtml += extraHtml;

  if (!bodyHtml) return "";

  return (
    '<div class="consulta-source-section consulta-source-' + sourceClass + '">' +
      '<div class="consulta-source-header" onclick="toggleConsultaSource(this)">' +
        '<span class="material-icons consulta-source-icon">' + icon + "</span>" +
        '<span class="consulta-source-title">' + title + "</span>" +
        '<span class="material-icons consulta-source-arrow">expand_less</span>' +
      "</div>" +
      '<div class="consulta-source-body">' + bodyHtml + "</div>" +
    "</div>"
  );
}

function toggleConsultaSource(headerEl) {
  const section = headerEl.closest(".consulta-source-section");
  const body = section.querySelector(".consulta-source-body");
  const arrow = section.querySelector(".consulta-source-arrow");

  if (body.style.display === "none") {
    body.style.display = "";
    arrow.textContent = "expand_less";
  } else {
    body.style.display = "none";
    arrow.textContent = "expand_more";
  }
}


// ========== FARLEY (CRM) FUNCTIONS ==========

let crmData = null;
let crmMembersSort = { key: 'purchase_count', dir: -1 };
let crmMembersPage = 0;
const CRM_PAGE_SIZE = 25;
let crmActiveTags = new Set();
let crmSelectedMemberIdx = 0;
let crmDetalleSearch = '';
const FARLEY_TAG_NAMES = { dinar: "DINARES", gold: "ORO", membership: "MEMBRESIAS", vaquita: "VAQUITAS", bonus: "BONUS", card: "TARJETA", other: "OTROS" };

function initFarleySearch() {
  document.getElementById("farleySearchInput").addEventListener("input", function() {
    loadFarleyMiembros();
  });
}

async function _ensureCrmData() {
  if (crmData) return;
  try {
    const resp = await fetch("/api/crm/data");
    if (!resp.ok) throw new Error("Error al cargar CRM");
    crmData = await resp.json();
  } catch (err) {
    crmData = { summary: { total_members: 0, total_purchases: 0, total_collected: 0, category_totals: {}, flayers: [] }, members: [] };
  }
}

// ========== RESUMEN ==========

async function loadFarleyResumen(silent) {
  const el = document.getElementById("farleyResumenContent");
  if (!silent) el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando resumen...</p></div>';
  await _ensureCrmData();
  const s = crmData.summary;
  const m = crmData.members;
  const topBuyers = [...m].sort(function(a, b) { return b.purchase_count - a.purchase_count; }).slice(0, 10);
  const catNames = FARLEY_TAG_NAMES;

  let html = '<div class="stats-grid">';
  html += '<div class="stat-card"><span class="material-icons stat-icon">people</span><div class="stat-info"><span class="stat-value">' + s.total_members + '</span><span class="stat-label">Miembros</span></div></div>';
  html += '<div class="stat-card"><span class="material-icons stat-icon">receipt_long</span><div class="stat-info"><span class="stat-value">' + s.total_purchases + '</span><span class="stat-label">Compras Totales</span></div></div>';
  html += '<div class="stat-card"><span class="material-icons stat-icon">payments</span><div class="stat-info"><span class="stat-value">' + formatCOP(s.total_collected) + '</span><span class="stat-label">Total Recaudado</span></div></div>';
  html += '<div class="stat-card"><span class="material-icons stat-icon">local_offer</span><div class="stat-info"><span class="stat-value">' + s.flayers.length + '</span><span class="stat-label">Tipos de Promoción</span></div></div>';
  html += '<div class="stat-card"><span class="material-icons stat-icon">bar_chart</span><div class="stat-info"><span class="stat-value">' + (s.total_purchases / s.total_members).toFixed(1) + '</span><span class="stat-label">Promedio x Miembro</span></div></div>';
  html += '<div class="stat-card"><span class="material-icons stat-icon">credit_card</span><div class="stat-info"><span class="stat-value">NEQUI</span><span class="stat-label">Pago Principal</span></div></div>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(350px,1fr));gap:16px;margin-top:20px">';
  html += '<div class="stat-card"><div class="stat-info"><span class="stat-label" style="font-size:14px;font-weight:600;color:#212121">🏆 Top Compradores</span></div><div class="table-wrapper" style="margin-top:8px"><table class="data-table" style="font-size:12px"><thead><tr><th>#</th><th>Nombre</th><th style="text-align:right">Compras</th><th style="text-align:right">Total</th></tr></thead><tbody>';
  for (let i = 0; i < topBuyers.length; i++) {
    const b = topBuyers[i];
    html += '<tr><td>' + (i + 1) + '</td><td>' + b.name + '</td><td class="text-right">' + b.purchase_count + '</td><td class="text-right">' + formatCOP(b.total_spent || 0) + '</td></tr>';
  }
  html += '</tbody></table></div></div>';

  const catEntries = Object.entries(s.category_totals).sort(function(a, b) { return b[1] - a[1]; });
  html += '<div class="stat-card"><div class="stat-info"><span class="stat-label" style="font-size:14px;font-weight:600;color:#212121">🏷️ Compras por Categoría</span></div><div class="table-wrapper" style="margin-top:8px"><table class="data-table" style="font-size:12px"><thead><tr><th>Categoría</th><th style="text-align:right">Compras</th></tr></thead><tbody>';
  for (const [k, v] of catEntries) {
    html += '<tr><td><span class="tag tag-' + k + '">' + (catNames[k] || k) + '</span></td><td class="text-right">' + v + '</td></tr>';
  }
  html += '</tbody></table></div></div>';
  html += '</div>';

  el.innerHTML = html;
  updateRefreshIndicator(false);
}

// ========== MIEMBROS ==========

async function loadFarleyMiembros(silent) {
  const tbody = document.getElementById("farleyTableBody");
  if (!silent) tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando miembros...</p></div></td></tr>';

  await _ensureCrmData();
  const search = document.getElementById("farleySearchInput").value.toLowerCase();
  let members = crmData.members;

  if (search) {
    members = members.filter(function(m) {
      return (m.name && m.name.toLowerCase().includes(search)) ||
             (m.cedula && m.cedula.toLowerCase().includes(search)) ||
             (m.email && m.email.toLowerCase().includes(search)) ||
             (m.phone && m.phone.toLowerCase().includes(search));
    });
  }

  members.sort(function(a, b) {
    let va = a[crmMembersSort.key], vb = b[crmMembersSort.key];
    if (typeof va === "string") va = va.toLowerCase();
    if (typeof vb === "string") vb = vb.toLowerCase();
    if (va < vb) return -1 * crmMembersSort.dir;
    if (va > vb) return 1 * crmMembersSort.dir;
    return 0;
  });

  const totalPages = Math.ceil(members.length / CRM_PAGE_SIZE);
  if (crmMembersPage >= totalPages) crmMembersPage = totalPages - 1;
  if (crmMembersPage < 0) crmMembersPage = 0;
  const start = crmMembersPage * CRM_PAGE_SIZE;
  const page = members.slice(start, start + CRM_PAGE_SIZE);

  document.getElementById("farleyTableCount").textContent = members.length + " miembro" + (members.length !== 1 ? "s" : "");

  if (page.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>' + (search ? "No se encontraron miembros." : "No hay miembros registrados.") + '</p></div></td></tr>';
    document.getElementById("farleyPagination").innerHTML = "";
    updateRefreshIndicator(false);
    return;
  }

  tbody.innerHTML = page.map(function(m) {
    return '<tr><td style="font-weight:500">' + (m.name || "—") + '</td><td style="color:#9E9E9E">' + (m.cedula || "—") + '</td><td style="color:#9E9E9E;font-size:12px">' + (m.email || "—") + '</td><td style="color:#9E9E9E;font-size:12px">' + (m.phone || "—") + '</td><td style="color:#9E9E9E;font-size:12px">' + [m.city, m.department, m.country].filter(Boolean).join(", ") + '</td><td class="text-right">' + m.purchase_count + '</td><td class="text-right">' + formatCOP(m.total_spent || 0) + '</td></tr>';
  }).join("");

  let pagHtml = '<div class="pagination">';
  pagHtml += '<button onclick="crmMembersPage=0;loadFarleyMiembros()"' + (crmMembersPage === 0 ? ' disabled' : '') + '>««</button>';
  pagHtml += '<button onclick="crmMembersPage=Math.max(0,crmMembersPage-1);loadFarleyMiembros()"' + (crmMembersPage === 0 ? ' disabled' : '') + '>«</button>';
  pagHtml += '<span style="padding:6px 12px;font-size:12px;color:#9E9E9E">Página ' + (crmMembersPage + 1) + ' de ' + totalPages + '</span>';
  pagHtml += '<button onclick="crmMembersPage=Math.min(' + (totalPages - 1) + ',crmMembersPage+1);loadFarleyMiembros()"' + (crmMembersPage >= totalPages - 1 ? ' disabled' : '') + '>»</button>';
  pagHtml += '<button onclick="crmMembersPage=' + (totalPages - 1) + ';loadFarleyMiembros()"' + (crmMembersPage >= totalPages - 1 ? ' disabled' : '') + '>»»</button>';
  pagHtml += '</div>';
  document.getElementById("farleyPagination").innerHTML = pagHtml;
  updateRefreshIndicator(false);
}

function farleySortKey(k) {
  if (crmMembersSort.key === k) crmMembersSort.dir *= -1;
  else { crmMembersSort.key = k; crmMembersSort.dir = -1; }
  loadFarleyMiembros();
}

// ========== PROMOCIONES ==========

async function loadFarleyPromociones(silent) {
  const el = document.getElementById("farleyPromocionesContent");
  if (!silent) el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando promociones...</p></div>';
  await _ensureCrmData();

  const flayers = crmData.summary.flayers;
  const s = crmData.summary;
  const catNames = FARLEY_TAG_NAMES;
  const allTags = ["dinar", "gold", "membership", "vaquita", "bonus", "card", "other"];
  const isAll = crmActiveTags.size === 0;

  const filtered = flayers.filter(function(f) {
    if (isAll) return true;
    return f.tags.some(function(t) { return crmActiveTags.has(t); });
  });

  const groups = {};
  for (const t of allTags) groups[t] = [];
  for (const f of filtered) {
    for (const t of f.tags) {
      if (groups[t]) groups[t].push(f);
    }
  }

  let tagOrder = allTags.filter(function(t) {
    return !isAll ? crmActiveTags.has(t) : groups[t].length > 0;
  });

  let html = '<div class="filter-bar" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;align-items:center">';
  html += '<span class="filter-label" style="font-size:12px;color:#9E9E9E;margin-right:8px">Filtrar por categoría:</span>';
  html += '<button class="filter-btn' + (isAll ? ' active' : '') + '" data-tag="all" style="padding:6px 16px;border-radius:20px;border:1px solid #E0E0E0;background:' + (isAll ? 'var(--clr-primary)' : '#FFFFFF') + ';color:' + (isAll ? '#212121' : '#9E9E9E') + ';cursor:pointer;font-size:12px;font-weight:500">Todas (' + s.total_purchases + ')</button>';
  for (const t of allTags) {
    const isActive = crmActiveTags.has(t);
    html += '<button class="filter-btn' + (isActive ? ' active' : '') + '" data-tag="' + t + '" onclick="farleyToggleTag(\'' + t + '\')" style="padding:6px 16px;border-radius:20px;border:1px solid #E0E0E0;background:' + (isActive ? 'var(--clr-primary)' : '#FFFFFF') + ';color:' + (isActive ? '#212121' : '#9E9E9E') + ';cursor:pointer;font-size:12px;font-weight:500"><span class="tag tag-' + t + '">' + catNames[t] + '</span> (' + (s.category_totals[t] || 0) + ')</button>';
  }
  html += '</div>';
  html += '<div style="margin-bottom:16px;font-size:12px;color:#9E9E9E">';
  html += isAll ? 'Mostrando todos los ' + flayers.length + ' tipos de promoción' : 'Mostrando ' + filtered.length + ' promociones con las etiquetas seleccionadas';
  html += '</div>';

  for (const tag of tagOrder) {
    const items = groups[tag];
    if (!items || items.length === 0) continue;
    const totalDinar = items.reduce(function(s, f) { return s + f.dinar_qty; }, 0);
    const totalGold = items.reduce(function(s, f) { return s + f.gold_qty; }, 0);
    const allGrams = [...new Set(items.flatMap(function(f) { return f.gold_grams || []; }))].sort(function(a, b) { return a - b; });
    const gramStr = allGrams.length ? allGrams.map(function(g) { return g + "GR"; }).join("/") : "";
    const totalMemb = items.reduce(function(s, f) { return s + f.membership_qty; }, 0);
    const totalCard = items.reduce(function(s, f) { return s + f.card_qty; }, 0);
    const totalPurchases = items.reduce(function(s, f) { return s + f.count; }, 0);
    const totalAmount = items.reduce(function(s, f) { return s + f.total_amount; }, 0);

    html += '<div class="flayer-group" style="margin-bottom:16px;background:#FFFFFF;border:1px solid #E0E0E0;border-radius:10px;overflow:hidden">';
    html += '<div class="flayer-group-header" onclick="farleyToggleGroup(this)" style="padding:14px 18px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;font-weight:600;transition:.2s">';
    html += '<span><span class="tag tag-' + tag + '">' + catNames[tag] + '</span> <strong>' + items.length + '</strong> promociones · <strong>' + totalPurchases + '</strong> compras</span>';
    html += '<span style="display:flex;gap:14px;align-items:center;font-size:12px">';
    if (totalDinar > 0) html += '<span style="color:#c4956a">📦 ' + totalDinar.toLocaleString() + ' dinares</span>';
    if (totalGold > 0) html += '<span style="color:#d4a017">🥇 ' + totalGold.toLocaleString() + (gramStr ? ' (' + gramStr + ')' : '') + '</span>';
    if (totalMemb > 0) html += '<span style="color:#5a8ec4">🎫 ' + totalMemb + ' membresías</span>';
    if (totalCard > 0) html += '<span style="color:#5a9a6a">💳 ' + totalCard + ' tarjetas</span>';
    html += '<span style="color:#9E9E9E">' + formatCOP(totalAmount) + '</span>';
    html += '<span class="count-badge" style="background:var(--clr-primary);color:#212121;padding:2px 12px;border-radius:20px;font-size:12px">' + items.length + '</span>';
    html += '</span></div>';
    html += '<div class="flayer-group-body" style="display:none;border-top:1px solid #E0E0E0">';

    items.sort(function(a, b) { return b.count - a.count; });
    for (const f of items) {
      const fGramStr = f.gold_grams && f.gold_grams.length ? f.gold_grams.map(function(g) { return g + "GR"; }).join("/") : "";
      html += '<div class="flayer-row" style="padding:10px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;border-bottom:1px solid #F5F5F5">';
      html += '<div class="name" style="flex:1;min-width:200px;font-size:13px">' + f.name + ' <span style="color:#9E9E9E;font-size:11px">×' + f.count + '</span></div>';
      html += '<div class="stats" style="display:flex;gap:16px;font-size:12px">';
      if (f.dinar_qty > 0) html += '<span style="color:#c4956a">📦 ' + f.dinar_qty + ' dinares</span>';
      if (f.gold_qty > 0) html += '<span style="color:#d4a017">🥇 ' + f.gold_qty + (fGramStr ? ' (' + fGramStr + ')' : '') + '</span>';
      if (f.membership_qty > 0) html += '<span style="color:#5a8ec4">🎫 ' + f.membership_qty + '</span>';
      if (f.card_qty > 0) html += '<span style="color:#5a9a6a">💳 ' + f.card_qty + '</span>';
      html += '<span style="color:#9E9E9E">' + formatCOP(f.total_amount || 0) + '</span>';
      const otherTags = f.tags.filter(function(t) { return t !== tag; });
      for (const ot of otherTags) {
        html += '<span class="tag tag-' + ot + '" style="font-size:10px">' + (FARLEY_TAG_NAMES[ot] || ot) + '</span>';
      }
      html += '</div>';
      if (f.benefit_samples && f.benefit_samples.length) {
        html += '<div style="font-size:11px;color:#9E9E9E;margin-top:4px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Ej: ' + f.benefit_samples[0] + '</div>';
      }
      html += '</div>';
    }
    html += '</div></div>';
  }

  if (filtered.length === 0) {
    html += '<div class="empty-state" style="padding:40px;text-align:center;color:#9E9E9E;font-size:14px">No hay promociones con los filtros seleccionados</div>';
  }

  el.innerHTML = html;
  updateRefreshIndicator(false);
}

function farleyToggleTag(tag) {
  if (tag === "all") {
    crmActiveTags.clear();
  } else {
    if (crmActiveTags.has(tag)) crmActiveTags.delete(tag);
    else crmActiveTags.add(tag);
  }
  loadFarleyPromociones();
}

function farleyToggleGroup(headerEl) {
  const body = headerEl.nextElementSibling;
  body.style.display = body.style.display === "block" ? "none" : "block";
}

// ========== GRÁFICOS ==========

async function loadFarleyGraficos(silent) {
  const el = document.getElementById("farleyGraficosContent");
  if (!silent) el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando gráficos...</p></div>';
  await _ensureCrmData();

  const s = crmData.summary;
  const members = crmData.members;

  // Payment methods
  let payCounts = {};
  let yearCounts = {};
  for (const m of members) {
    for (const p of m.purchases) {
      const pm = p.payment || "Otro";
      payCounts[pm] = (payCounts[pm] || 0) + 1;
      const yr = p.year || 0;
      yearCounts[yr] = (yearCounts[yr] || 0) + 1;
    }
  }

  let paySorted = Object.entries(payCounts).sort(function(a, b) { return b[1] - a[1]; });

  // Top 10 members
  let topMembers = [...members].sort(function(a, b) { return b.purchase_count - a.purchase_count; }).slice(0, 10);

  // Top 10 flayers
  let topFlayers = [...s.flayers].sort(function(a, b) { return b.count - a.count; }).slice(0, 10);

  // Category totals
  let catEntries = Object.entries(s.category_totals).sort(function(a, b) { return b[1] - a[1]; });

  // Distribution
  let dist = {};
  for (const m of members) {
    const c = m.purchase_count;
    dist[c] = (dist[c] || 0) + 1;
  }
  let distKeys = Object.keys(dist).sort(function(a, b) { return parseInt(a) - parseInt(b); });

  // Timeline
  let monthCounts = {};
  for (const m of members) {
    for (const p of m.purchases) {
      if (p.date) {
        const month = p.date.slice(0, 7);
        monthCounts[month] = (monthCounts[month] || 0) + 1;
      }
    }
  }
  let monthLabels = Object.keys(monthCounts).sort();
  const maxMonth = monthLabels.length > 0 ? Math.max.apply(Math, monthLabels.map(function(m) { return monthCounts[m]; })) : 1;

  let html = '';

  // Category chart
  html += '<h3 class="section-subtitle">Compras por Categoría</h3>';
  html += '<div class="bar-chart">';
  const maxCat = catEntries.length > 0 ? catEntries[0][1] : 1;
  for (const [k, v] of catEntries) {
    const pct = Math.round(v / maxCat * 100);
    html += '<div class="bar-item"><span class="bar-label">' + k + '</span><div class="bar-track"><div class="bar-fill bar-fill-cop" style="width:' + pct + '%"></div></div><span class="bar-value">' + v + '</span></div>';
  }
  html += '</div>';

  // Top 10 members
  html += '<h3 class="section-subtitle" style="margin-top:32px">Top 10 Miembros por Compras</h3>';
  html += '<div class="bar-chart">';
  const maxTop = topMembers.length > 0 ? topMembers[0].purchase_count : 1;
  for (const m of topMembers) {
    const pct = Math.round(m.purchase_count / maxTop * 100);
    html += '<div class="bar-item"><span class="bar-label">' + m.name + '</span><div class="bar-track"><div class="bar-fill bar-fill-people" style="width:' + pct + '%"></div></div><span class="bar-value">' + m.purchase_count + '</span></div>';
  }
  html += '</div>';

  // Top 10 flayers
  html += '<h3 class="section-subtitle" style="margin-top:32px">Top 10 Promociones más Vendidas</h3>';
  html += '<div class="bar-chart">';
  const maxFl = topFlayers.length > 0 ? topFlayers[0].count : 1;
  for (const f of topFlayers) {
    const pct = Math.round(f.count / maxFl * 100);
    html += '<div class="bar-item"><span class="bar-label" style="font-size:11px">' + f.name + '</span><div class="bar-track"><div class="bar-fill bar-fill-dia" style="width:' + pct + '%"></div></div><span class="bar-value">' + f.count + '</span></div>';
  }
  html += '</div>';

  // Payment methods
  html += '<h3 class="section-subtitle" style="margin-top:32px">Método de Pago</h3>';
  html += '<div class="bar-chart">';
  const maxPay = paySorted.length > 0 ? paySorted[0][1] : 1;
  for (const [pm, cnt] of paySorted) {
    const pct = Math.round(cnt / maxPay * 100);
    html += '<div class="bar-item"><span class="bar-label">' + pm + '</span><div class="bar-track"><div class="bar-fill bar-fill-cop" style="width:' + pct + '%"></div></div><span class="bar-value">' + cnt + '</span></div>';
  }
  html += '</div>';

  // Distribution
  html += '<h3 class="section-subtitle" style="margin-top:32px">Distribución de Compras por Miembro</h3>';
  html += '<div class="bar-chart">';
  const maxDist = Math.max.apply(Math, distKeys.map(function(k) { return dist[k]; }));
  for (const k of distKeys) {
    const pct = Math.round(dist[k] / maxDist * 100);
    html += '<div class="bar-item"><span class="bar-label">' + k + ' compras</span><div class="bar-track"><div class="bar-fill bar-fill-people" style="width:' + pct + '%"></div></div><span class="bar-value">' + dist[k] + ' miembros</span></div>';
  }
  html += '</div>';

  // Timeline
  html += '<h3 class="section-subtitle" style="margin-top:32px">Compras en el Tiempo</h3>';
  html += '<div class="bar-chart">';
  for (const m of monthLabels) {
    const pct = Math.round(monthCounts[m] / maxMonth * 100);
    html += '<div class="bar-item"><span class="bar-label bar-label-date">' + m + '</span><div class="bar-track"><div class="bar-fill bar-fill-dia" style="width:' + pct + '%"></div></div><span class="bar-value">' + monthCounts[m] + '</span></div>';
  }
  html += '</div>';

  el.innerHTML = html;
  updateRefreshIndicator(false);
}

// ========== DETALLE ==========

let crmDetalleView = "list";

async function loadFarleyDetalle() {
  const el = document.getElementById("farleyDetalleContent");
  await _ensureCrmData();

  const members = crmData.members;
  const q = crmDetalleSearch.toLowerCase();
  const filtered = q ? members.filter(function(m) {
    return (m.name && m.name.toLowerCase().includes(q)) || (m.cedula && m.cedula.toLowerCase().includes(q));
  }) : [];

  let html = "";
  html += '<div class="consulta-search-wrapper" style="margin-bottom:16px">';
  html += '<span class="material-icons consulta-search-icon">search</span>';
  html += '<input type="text" id="farleyDetalleSearchInput" class="consulta-search-input" placeholder="Buscar por nombre o c\u00e9dula..." value="' + crmDetalleSearch + '">';
  html += "</div>";

  if (crmDetalleView === "detail" && crmSelectedMemberIdx >= 0 && members[crmSelectedMemberIdx]) {
    html += farleyBuildDetailView(members[crmSelectedMemberIdx]);
  } else {
    crmDetalleView = "list";
    if (crmDetalleSearch && filtered.length === 0) {
      html += '<div class="empty-state"><span class="material-icons empty-icon">search_off</span><p>No se encontraron miembros con ese nombre o c\u00e9dula.</p></div>';
    } else if (crmDetalleSearch) {
      html += '<div style="font-size:13px;color:#9E9E9E;margin-bottom:12px">' + filtered.length + " resultado" + (filtered.length !== 1 ? "s" : "") + '</div>';
      for (let i = 0; i < filtered.length; i++) {
        const m = filtered[i];
        const realIdx = members.indexOf(m);
        const tagsList = [...new Set(m.purchases.flatMap(function(p) { return p.tags; }))];
        html += '<div class="farley-detalle-card" onclick="farleySelectMember(' + realIdx + ')">';
        html += '<div class="farley-detalle-card-top">';
        html += '<div class="farley-detalle-card-name"><span class="material-icons" style="font-size:20px;color:var(--clr-primary);vertical-align:middle;margin-right:8px">person</span><strong>' + m.name + '</strong></div>';
        html += '<div class="farley-detalle-card-stats">';
        html += '<span class="farley-stat-badge">' + m.purchase_count + ' compras</span>';
        html += '<span class="farley-stat-badge farley-stat-amount">' + formatCOP(m.total_spent || 0) + '</span>';
        html += "</div></div>";
        html += '<div class="farley-detalle-card-meta">';
        html += "<span>" + (m.cedula || "—") + "</span>";
        if (m.email) html += '<span> \u00b7 ' + m.email + "</span>";
        if (m.phone) html += '<span> \u00b7 ' + m.phone + "</span>";
        html += "</div>";
        if (tagsList.length > 0) {
          html += '<div class="farley-detalle-card-tags">';
          html += tagsList.map(function(t) { return '<span class="tag tag-' + t + '">' + (FARLEY_TAG_NAMES[t] || t) + "</span>"; }).join(" ");
          html += "</div>";
        }
        html += '<div class="farley-detalle-card-action"><span class="material-icons" style="font-size:18px;vertical-align:middle">visibility</span> Ver detalle</div>';
        html += "</div>";
      }
    } else {
      html += '<div class="empty-state" style="padding:20px"><span class="material-icons empty-icon">person_search</span><p>Escribe un nombre o c\u00e9dula para buscar miembros.</p></div>';
    }
  }

  el.innerHTML = html;

  document.getElementById("farleyDetalleSearchInput").addEventListener("input", function() {
    crmDetalleView = "list";
    crmDetalleSearch = this.value;
    loadFarleyDetalle();
  });
}

function farleySelectMember(idx) {
  crmSelectedMemberIdx = idx;
  crmDetalleView = "detail";
  loadFarleyDetalle();
}

function farleyBackToList() {
  crmDetalleView = "list";
  loadFarleyDetalle();
}

function farleyBuildDetailView(member) {
  const tagsList = [...new Set(member.purchases.flatMap(function(p) { return p.tags; }))];
  const totalDinar = member.purchases.reduce(function(s, p) { return s + p.dinar_qty; }, 0);
  const totalGold = member.purchases.reduce(function(s, p) { return s + p.gold_qty; }, 0);
  const totalMemb = member.purchases.reduce(function(s, p) { return s + p.membership_qty; }, 0);
  const totalCard = member.purchases.reduce(function(s, p) { return s + p.card_qty; }, 0);

  let html = "";
  html += '<div class="farley-detalle-back" onclick="farleyBackToList()">';
  html += '<span class="material-icons" style="font-size:20px;vertical-align:middle">arrow_back</span> Volver a resultados';
  html += "</div>";

  html += '<div class="ayudas-detail-card">';
  html += '<div class="ayudas-detail-section">';
  html += '<div class="ayudas-detail-title"><span class="material-icons">person</span> ' + member.name + "</div>";
  html += '<div class="ayudas-detail-grid">';
  html += '<div class="ayudas-detail-item"><span class="material-icons">badge</span><span class="ayudas-detail-label">C\u00e9dula:</span><span class="ayudas-detail-value">' + (member.cedula || "—") + "</span></div>";
  html += '<div class="ayudas-detail-item"><span class="material-icons">email</span><span class="ayudas-detail-label">Email:</span><span class="ayudas-detail-value">' + (member.email || "—") + "</span></div>";
  html += '<div class="ayudas-detail-item"><span class="material-icons">phone</span><span class="ayudas-detail-label">Tel\u00e9fono:</span><span class="ayudas-detail-value">' + (member.phone || "—") + "</span></div>";
  html += '<div class="ayudas-detail-item"><span class="material-icons">send</span><span class="ayudas-detail-label">Telegram:</span><span class="ayudas-detail-value">' + (member.telegram || "—") + "</span></div>";
  html += '<div class="ayudas-detail-item"><span class="material-icons">public</span><span class="ayudas-detail-label">Ubicaci\u00f3n:</span><span class="ayudas-detail-value">' + [member.city, member.department, member.country].filter(Boolean).join(", ") + "</span></div>";
  html += '<div class="ayudas-detail-item"><span class="material-icons">cake</span><span class="ayudas-detail-label">Nacimiento:</span><span class="ayudas-detail-value">' + (member.birthdate || "—") + "</span></div>";
  html += "</div></div>";

  html += '<div class="ayudas-detail-section">';
  html += '<div style="margin-bottom:12px"><strong style="font-size:14px">' + member.purchase_count + " compras</strong>";
  html += '<span style="color:#9E9E9E;margin-left:12px">Total: ' + formatCOP(member.total_spent || 0) + "</span>";
  html += '<span style="margin-left:12px">' + tagsList.map(function(t) { return '<span class="tag tag-' + t + '">' + (FARLEY_TAG_NAMES[t] || t) + "</span>"; }).join(" ") + "</span></div>";

  if (totalDinar > 0 || totalGold > 0 || totalMemb > 0 || totalCard > 0) {
    html += '<div style="display:flex;gap:16px;font-size:13px;margin-bottom:14px;flex-wrap:wrap">';
    if (totalDinar > 0) html += '<span style="color:#c4956a">\ud83d\udce6 Total dinares recibidos: <strong>' + totalDinar + "</strong></span>";
    if (totalGold > 0) html += '<span style="color:#d4a017">\ud83e\udd47 Total gold recibidos: <strong>' + totalGold + "</strong></span>";
    if (totalMemb > 0) html += '<span style="color:#5a8ec4">\ud83c\udfab Total membres\u00edas: <strong>' + totalMemb + "</strong></span>";
    if (totalCard > 0) html += '<span style="color:#5a9a6a">\ud83d\udcb3 Total tarjetas: <strong>' + totalCard + "</strong></span>";
    html += "</div>";
  }

  const purchases = member.purchases || [];
  if (purchases.length > 0) {
    html += '<div class="table-wrapper"><table class="data-table"><thead><tr><th>#</th><th>Fecha</th><th>Promoci\u00f3n</th><th>Beneficio</th><th class="text-right">Monto</th><th>Pago</th><th>Tags</th><th>L\u00edder</th></tr></thead><tbody>';
    for (let i = 0; i < purchases.length; i++) {
      const p = purchases[i];
      const gGram = p.gold_grams ? " " + p.gold_grams + "GR" : "";
      const tagHtml = p.tags.map(function(t) {
        return t === "gold" && gGram ? '<span class="tag tag-' + t + '">' + (FARLEY_TAG_NAMES[t] || t) + gGram + "</span>" : '<span class="tag tag-' + t + '">' + (FARLEY_TAG_NAMES[t] || t) + "</span>";
      }).join(" ");
      const benefitText = p.benefit_text ? p.benefit_text.slice(0, 80) + (p.benefit_text.length > 80 ? "..." : "") : "—";
      html += '<tr><td>' + (i + 1) + '</td><td style="white-space:nowrap">' + (p.date || "—") + '</td><td style="max-width:220px">' + (p.flayer || "—") + '</td><td style="max-width:260px;font-size:12px;color:#9E9E9E">' + benefitText + '</td><td class="text-right">' + (p.amount ? formatCOP(p.amount) : "—") + '</td><td>' + (p.payment || "—") + '</td><td>' + tagHtml + '</td><td style="color:#9E9E9E;font-size:12px">' + (p.leader || "—") + '</td></tr>';
    }
    html += "</tbody></table></div>";
  } else {
    html += '<div class="empty-state" style="padding:20px;text-align:center;color:#9E9E9E">No tiene compras registradas.</div>';
  }

  html += "</div></div>";
  return html;
}


// ========== VERIFICACION FUNCTIONS ==========


function initVerificacionSearch() {
  document.getElementById("btnVerifSearch").addEventListener("click", searchVerificacion);
  document.getElementById("verifSearchInput").addEventListener("keydown", function(e) {
    if (e.key === "Enter") searchVerificacion();
  });
}


async function loadVerificacionResumen(silent) {
  var el = document.getElementById("verificacionStatsGrid");
  if (!silent) el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando estadisticas...</p></div>';

  try {
    var resp = await fetch("/api/verificacion");
    if (!resp.ok) throw new Error("Error");
    var d = await resp.json();
    var s = d.stats;

    el.innerHTML =
      '<div class="stat-card"><span class="material-icons stat-icon">people</span><div class="stat-info"><span class="stat-value">' + s.matched + '</span><span class="stat-label">En ambas bases</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">person_search</span><div class="stat-info"><span class="stat-value">' + s.only_farley + '</span><span class="stat-label">Solo en FARLEY</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">person_search</span><div class="stat-info"><span class="stat-value">' + s.only_inventario + '</span><span class="stat-label">Solo en INVENTARIO</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">groups</span><div class="stat-info"><span class="stat-value">' + s.total_farley + '</span><span class="stat-label">Total FARLEY</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">inventory</span><div class="stat-info"><span class="stat-value">' + s.total_inventario + '</span><span class="stat-label">Total INVENTARIO</span></div></div>' +
      '<div class="stat-card" style="border-color:#E53935"><span class="material-icons stat-icon" style="color:#E53935">sync_problem</span><div class="stat-info"><span class="stat-value" style="color:#E53935">' + s.mismatch_total + '</span><span class="stat-label">Discrepancias totales</span></div></div>' +
      '<div class="stat-card" style="border-color:#E53935"><span class="material-icons stat-icon" style="color:#E53935">money_off</span><div class="stat-info"><span class="stat-value" style="color:#E53935">' + s.mismatch_dinar + '</span><span class="stat-label">Diferencias en Dinares</span></div></div>' +
      '<div class="stat-card" style="border-color:#E53935"><span class="material-icons stat-icon" style="color:#E53935">circle</span><div class="stat-info"><span class="stat-value" style="color:#E53935">' + s.mismatch_oro + '</span><span class="stat-label">Diferencias en Oro</span></div></div>';

    updateRefreshIndicator(false);
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar estadisticas.</p></div>';
  }
}


function loadVerificacionBusqueda(silent) {
  if (silent) return;
  document.getElementById("verifResults").innerHTML = "";
  document.getElementById("verifTableCount").textContent = "";
}


async function searchVerificacion() {
  var q = document.getElementById("verifSearchInput").value.trim();
  if (!q) return;

  var results = document.getElementById("verifResults");
  var count = document.getElementById("verifTableCount");
  results.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Buscando...</p></div>';
  count.textContent = "";

  try {
    var resp = await fetch("/api/verificacion?q=" + encodeURIComponent(q));
    if (!resp.ok) throw new Error("Error");
    var d = await resp.json();

    count.textContent = d.total + " resultado" + (d.total !== 1 ? "s" : "");

    if (d.total === 0) {
      results.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">search_off</span><p>No se encontraron resultados para "' + escHtml(q) + '"</p></div>';
      return;
    }

    var html = "";
    for (var i = 0; i < d.persons.length; i++) {
      html += buildVerificacionCard(d.persons[i]);
    }
    results.innerHTML = html;
  } catch (err) {
    results.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al buscar.</p></div>';
  }
}


function buildVerificacionCard(p) {
  var matchTypeLabel, matchTypeClass;
  if (p.match_type === "both") {
    matchTypeLabel = "AMBOS";
    matchTypeClass = "verif-badge-both";
  } else if (p.match_type === "farley_only") {
    matchTypeLabel = "SOLO FARLEY";
    matchTypeClass = "verif-badge-farley";
  } else {
    matchTypeLabel = "SOLO INVENTARIO";
    matchTypeClass = "verif-badge-inv";
  }

  var name = p.name || "—";
  var cedula = p.cedula || "";
  var telegram = p.telegram || "";

  var compRows = "";
  for (var i = 0; i < p.comparison.length; i++) {
    var c = p.comparison[i];
    var fVal = c.farley !== null && c.farley !== undefined ? c.farley : "—";
    var iVal = c.inventario !== null && c.inventario !== undefined ? c.inventario : "—";

    var statusIcon, statusClass;
    if (c.status === "ok") {
      statusIcon = "check_circle";
      statusClass = "verif-ok";
    } else if (c.status === "mismatch") {
      statusIcon = "cancel";
      statusClass = "verif-mismatch";
    } else if (c.status === "only_farley") {
      statusIcon = "arrow_back";
      statusClass = "verif-only";
    } else if (c.status === "only_inv") {
      statusIcon = "arrow_forward";
      statusClass = "verif-only";
    } else {
      statusIcon = "remove_circle_outline";
      statusClass = "verif-absent";
    }

    compRows +=
      '<div class="verif-row">' +
        '<span class="verif-label">' + c.label + '</span>' +
        '<span class="verif-value verif-value-farley">' + fVal + '</span>' +
        '<span class="verif-value verif-value-inv">' + iVal + '</span>' +
        '<span class="verif-status ' + statusClass + '"><span class="material-icons" style="font-size:16px">' + statusIcon + '</span></span>' +
      '</div>';

    if (c.detail) {
      compRows +=
        '<div class="verif-row verif-row-detail">' +
          '<span class="verif-label"></span>' +
          '<span class="verif-detail">' + c.detail + '</span>' +
          '<span></span><span></span>' +
        '</div>';
    }
  }

  return (
    '<div class="verif-card">' +
      '<div class="verif-card-header">' +
        '<div class="verif-card-info">' +
          '<strong class="verif-card-name">' + escHtml(name) + '</strong>' +
          (cedula ? '<span class="verif-card-cedula">' + escHtml(cedula) + '</span>' : '') +
          (telegram ? '<span class="verif-card-telegram">' + escHtml(telegram) + '</span>' : '') +
        '</div>' +
        '<span class="verif-badge ' + matchTypeClass + '">' + matchTypeLabel + '</span>' +
      '</div>' +
      '<div class="verif-compare-header">' +
        '<span class="verif-label" style="font-weight:700">Material</span>' +
        '<span class="verif-value" style="font-weight:700;color:#1976D2">FARLEY</span>' +
        '<span class="verif-value" style="font-weight:700;color:#4CAF50">INVENTARIO</span>' +
        '<span class="verif-status" style="font-weight:700">¿OK?</span>' +
      '</div>' +
      compRows +
    '</div>'
  );
}

// ========== LIDER CANAL ==========

let liderAllData = [];
let liderExpandedFilterIdx = null;
let liderEntriesCache = {};
let liderCurrentPerson = null;

function liderPersonKey(p) {
  return (p.nombre_completo || "") + "|" + (p.documento || "");
}

function initLiderSearch() {
  const searchInput = document.getElementById("liderSearchInput");
  if (searchInput) searchInput.addEventListener("input", renderLiderTable);
  const liderFilter = document.getElementById("liderLiderFilter");
  if (liderFilter) liderFilter.addEventListener("change", renderLiderTable);
  const btnAdd = document.getElementById("btnLiderAdd");
  if (btnAdd) btnAdd.addEventListener("click", function() { openLiderUsuarioModal(); });
}

function initLiderDownload() {
  const btn = document.getElementById("btnLiderDownload");
  if (!btn) return;
  btn.addEventListener("click", async function() {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons">hourglass_top</span> Preparando archivo...';
    const info = document.getElementById("liderDownloadInfo");
    try {
      const resp = await fetch("/api/lider/download");
      if (!resp.ok) throw new Error("Error");
      const blob = await resp.blob();
      const cd = resp.headers.get("Content-Disposition") || "";
      let filename = "Lider_Canal.xlsx";
      const m = cd.match(/filename="(.+?)"/);
      if (m) filename = m[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (info) info.textContent = "Descarga completada.";
    } catch (err) {
      if (info) info.textContent = "Error al descargar el archivo.";
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons">description</span> Descargar XLSX';
    }
  });
}

async function loadLiderRegistros(silent) {
  const tbody = document.getElementById("liderTableBody");
  if (!tbody) return;
  if (!silent) tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando datos...</p></div></td></tr>';
  try {
    const resp = await fetch("/api/lider/data");
    if (!resp.ok) throw new Error("Error");
    const json = await resp.json();
    liderAllData = json.data || [];
    liderExpandedFilterIdx = null;
    renderLiderTable();
    updateRefreshIndicator(false);
  } catch (err) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar datos.</p></div></td></tr>';
  }
}

function liderFlagLabel(lider) {
  if (lider === "MARIA") return "MARIA ELVIRA SUS";
  if (lider === "OTRO") return "OTRO";
  return "N/A";
}

function liderBadge(lider) {
  if (lider === "MARIA") return '<span class="estado-badge estado-completo">MARIA ELVIRA</span>';
  if (lider === "OTRO") return '<span class="estado-badge estado-incompleto">OTRO</span>';
  return '<span class="estado-badge" style="background:#EEEEEE;color:#9E9E9E">N/A</span>';
}

function liderSelectHtml(r) {
  const cur = r.lider || "";
  const uname = (r.telegram_username || "").replace(/"/g, "");
  return '<select class="lider-select" data-username="' + escHtml(uname) + '" onchange="setLiderFlag(this)" title="Cambiar LIDER">' +
    '<option value=""' + (cur === "" ? " selected" : "") + '>N/A</option>' +
    '<option value="MARIA"' + (cur === "MARIA" ? " selected" : "") + '>MARIA ELVIRA</option>' +
    '<option value="OTRO"' + (cur === "OTRO" ? " selected" : "") + '>OTRO</option>' +
    '</select>';
}

async function setLiderFlag(selectEl) {
  const username = selectEl.getAttribute("data-username");
  const lider = selectEl.value;
  if (!username) {
    selectEl.value = "";
    alert("Este registro no tiene usuario de Telegram para asignar LIDER.");
    return;
  }
  try {
    const resp = await fetch("/api/lider/set-lider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_username: username, lider: lider }),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(function() { return {}; });
      throw new Error(errData.detail || "Error al actualizar");
    }
    await loadLiderRegistros();
  } catch (err) {
    alert(err.message || "Error al actualizar el lider.");
    await loadLiderRegistros();
  }
}

function liderBracketMemb(r) {
  const o = (r.origenes || {}).membresias || {};
  const parts = [];
  if (o.regaladas) parts.push(o.regaladas + " regaladas");
  if (o.sorteo) parts.push(o.sorteo + " sorteo");
  if (o.compradas) parts.push(o.compradas + " compradas");
  return parts.length ? '<div class="lider-bracket">' + parts.join(", ") + '</div>' : "";
}

function liderBracketPer(r) {
  const o = (r.origenes || {}).pergaminos || {};
  const parts = [];
  if (o.regalados) parts.push(o.regalados + " regalados");
  if (o.sorteo) parts.push(o.sorteo + " sorteo");
  if (o.comprados) parts.push(o.comprados + " comprados");
  return parts.length ? '<div class="lider-bracket">' + parts.join(", ") + '</div>' : "";
}

async function toggleLiderDetail(filterIdx) {
  liderExpandedFilterIdx = liderExpandedFilterIdx === filterIdx ? null : filterIdx;
  if (liderExpandedFilterIdx === null) {
    liderCurrentPerson = null;
  } else {
    liderCurrentPerson = liderAllData.filter(function(r) {
      const s = document.getElementById("liderSearchInput") ? document.getElementById("liderSearchInput").value.toLowerCase() : "";
      const f = document.getElementById("liderLiderFilter") ? document.getElementById("liderLiderFilter").value : "";
      let ok = true;
      if (s) {
        ok = [r.nombre_completo, r.documento, r.pais, r.telegram_username].some(function(v) {
          return v && String(v).toLowerCase().includes(s);
        });
      }
      if (ok && f === "MARIA") ok = r.lider === "MARIA";
      else if (ok && f === "OTRO") ok = r.lider === "OTRO";
      else if (ok && f === "NA") ok = !r.lider;
      return ok;
    })[filterIdx];
    const p = liderCurrentPerson;
    const pkey = p ? liderPersonKey(p) : null;
    if (p && pkey && !liderEntriesCache[pkey]) {
      try {
        const params = new URLSearchParams();
        if (p.nombre_completo) params.set("nombre", p.nombre_completo);
        if (p.documento) params.set("documento", p.documento);
        const resp = await fetch("/api/lider/entradas?" + params.toString());
        if (resp.ok) {
          const json = await resp.json();
          liderEntriesCache[pkey] = json.data || [];
        }
      } catch (e) {}
    }
  }
  renderLiderTable();
}

function liderDetailHtml(r) {
  const f = function(v) {
    if (v && String(v).trim() && String(v).trim().toUpperCase() !== "VACIO") return String(v).trim();
    return "—";
  };
  const flag = getCountryFlag(r.pais);
  const usuario = r.telegram_username ? "@" + r.telegram_username : "—";
  const entries = liderEntriesCache[liderPersonKey(r)] || [];

  let entriesHtml = "";
  if (entries.length === 0) {
    entriesHtml = '<div style="padding:14px;color:#9E9E9E;font-size:13px">Sin entradas registradas.</div>';
  } else {
    entriesHtml = '<div class="table-wrapper"><table class="data-table"><thead><tr><th>#</th><th>Origen</th><th>Membresias</th><th>Material 1</th><th>Pergaminos</th><th>Material 2</th><th style="width:88px"></th></tr></thead><tbody>';
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      entriesHtml += '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + escHtml(e.origen || "—") + '</td>' +
        '<td class="text-right">' + (e.cantidad_1 || 0) + '</td>' +
        '<td style="font-size:11px">' + escHtml(e.material_1 || "—") + '</td>' +
        '<td class="text-right">' + (e.cantidad_2 || 0) + '</td>' +
        '<td style="font-size:11px">' + escHtml(e.material_2 || "—") + '</td>' +
        '<td style="text-align:right;white-space:nowrap">' +
          '<span class="material-icons ayudas-action-icon" title="Editar" onclick="event.stopPropagation();openLiderEditModal(' + e.id + ')">edit</span> ' +
          '<span class="material-icons ayudas-action-icon" title="Eliminar" style="color:#ef5350" onclick="event.stopPropagation();openLiderDeleteModal(' + e.id + ')">delete</span>' +
        '</td></tr>';
    }
    entriesHtml += '</tbody></table></div>';
  }

  return '<div class="ayudas-detail-card">' +
    '<div class="ayudas-detail-section">' +
      '<div class="ayudas-detail-title"><span class="material-icons">person</span> INFORMACION PERSONAL</div>' +
      '<div class="ayudas-detail-grid">' +
        '<div class="ayudas-detail-item"><span class="material-icons">badge</span><span class="ayudas-detail-label">Nombres:</span><span class="ayudas-detail-value">' + escHtml(f(r.nombre_completo)) + '</span></div>' +
        '<div class="ayudas-detail-item"><span class="material-icons">assignment_ind</span><span class="ayudas-detail-label">Documento:</span><span class="ayudas-detail-value">' + escHtml(f(r.documento)) + '</span></div>' +
        '<div class="ayudas-detail-item"><span class="material-icons">public</span><span class="ayudas-detail-label">Pais:</span><span class="ayudas-detail-value">' + flag + ' ' + escHtml(f(r.pais)) + '</span></div>' +
        '<div class="ayudas-detail-item"><span class="material-icons">alternate_email</span><span class="ayudas-detail-label">Telegram:</span><span class="ayudas-detail-value">' + escHtml(usuario) + '</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="ayudas-detail-section">' +
      '<div class="ayudas-detail-title"><span class="material-icons">inventory_2</span> MATERIALES</div>' +
      '<div class="ayudas-detail-grid">' +
        '<div class="ayudas-detail-item"><span class="material-icons">confirmation_number</span><span class="ayudas-detail-label">Membresias:</span><span class="ayudas-detail-value">' + (r.total_membresias || 0) + '</span></div>' +
        '<div class="ayudas-detail-item"><span class="material-icons">description</span><span class="ayudas-detail-label">Pergaminos:</span><span class="ayudas-detail-value">' + (r.total_pergaminos || 0) + '</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="ayudas-detail-section">' +
      '<div class="ayudas-detail-title"><span class="material-icons">supervisor_account</span> LIDER ELEGIDO</div>' +
      '<div class="ayudas-detail-grid">' +
        '<div class="ayudas-detail-item"><span class="material-icons">check_circle</span><span class="ayudas-detail-label">Lider:</span><span class="ayudas-detail-value">' + liderBadge(r.lider) + '</span></div>' +
        '<div class="ayudas-detail-item"><span class="material-icons">schedule</span><span class="ayudas-detail-label">Actualizado:</span><span class="ayudas-detail-value">' + (r.lider_updated_at ? formatDate(r.lider_updated_at) : "—") + '</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="ayudas-detail-section">' +
      '<div class="ayudas-detail-title"><span class="material-icons">list_alt</span> ENTRADAS (' + entries.length + ')</div>' +
      entriesHtml +
    '</div>' +
    '<div class="inventario-detail-actions">' +
      '<button class="btn btn-sm btn-edit" onclick="openLiderAddModal()"><span class="material-icons" style="font-size:16px">add</span> A&ntilde;adir entrada</button>' +
      '<button class="btn btn-sm btn-edit" onclick="openLiderPersonaEditModal()"><span class="material-icons" style="font-size:16px">manage_accounts</span> Editar usuario</button>' +
      '<button class="btn btn-sm btn-delete" onclick="openLiderPersonaDeleteModal()"><span class="material-icons" style="font-size:16px">person_remove</span> Eliminar usuario</button>' +
    '</div>' +
  '</div>';
}

function renderLiderTable() {
  const tbody = document.getElementById("liderTableBody");
  if (!tbody) return;
  const search = document.getElementById("liderSearchInput") ? document.getElementById("liderSearchInput").value.toLowerCase() : "";
  const liderFilter = document.getElementById("liderLiderFilter") ? document.getElementById("liderLiderFilter").value : "";

  let filtered = liderAllData;
  if (search) {
    filtered = filtered.filter(function(r) {
      return [r.nombre_completo, r.documento, r.pais, r.telegram_username].some(function(v) {
        return v && String(v).toLowerCase().includes(search);
      });
    });
  }
  if (liderFilter === "MARIA") filtered = filtered.filter(function(r) { return r.lider === "MARIA"; });
  else if (liderFilter === "OTRO") filtered = filtered.filter(function(r) { return r.lider === "OTRO"; });
  else if (liderFilter === "NA") filtered = filtered.filter(function(r) { return !r.lider; });

  document.getElementById("liderTableCount").textContent = filtered.length + " registro" + (filtered.length !== 1 ? "s" : "");

  if (filtered.length === 0) {
    const msg = search || liderFilter ? "No se encontraron registros con esos filtros." : "Aun no hay registros de Lider.";
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>' + msg + '</p></div></td></tr>';
    return;
  }

  let html = "";
  for (let i = 0; i < filtered.length; i++) {
    const r = filtered[i];
    const flag = getCountryFlag(r.pais);
    const usuario = r.telegram_username ? "@" + r.telegram_username : "—";
    const isExpanded = liderExpandedFilterIdx === i;
    const expandIcon = isExpanded ? "expand_less" : "expand_more";

    html += '<tr class="ayudas-row" onclick="toggleLiderDetail(' + i + ')"><td class="ayudas-expand-cell"><span class="material-icons ayudas-expand-icon">' + expandIcon + '</span></td>';
    html += '<td><strong>' + escHtml(r.nombre_completo || "—") + '</strong></td>';
    html += '<td>' + escHtml(usuario) + '</td>';
    html += '<td>' + escHtml(r.documento || "—") + '</td>';
    html += '<td>' + flag + ' ' + escHtml(r.pais || "—") + '</td>';
    html += '<td class="text-right"><strong>' + (r.total_membresias || 0) + '</strong>' + liderBracketMemb(r) + '</td>';
    html += '<td class="text-right"><strong>' + (r.total_pergaminos || 0) + '</strong>' + liderBracketPer(r) + '</td>';
    html += '<td>' + liderSelectHtml(r) + '</td>';
    html += '</tr>';

    if (isExpanded) {
      liderCurrentPerson = r;
      html += '<tr class="ayudas-detail-row"><td colspan="8">' + liderDetailHtml(r) + '</td></tr>';
    }
  }
  tbody.innerHTML = html;
}

async function loadLiderStats(silent) {
  const el = document.getElementById("liderStatsGrid");
  if (!el) return;
  if (!silent) el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando estadisticas...</p></div>';
  try {
    const resp = await fetch("/api/lider/stats");
    if (!resp.ok) throw new Error("Error");
    const d = await resp.json();
    const origenMap = {
      REGALADO: "Regalados",
      MEMBRESIA_SORTEO: "Membresias por sorteo",
      PERGAMINO_SORTEO: "Pergaminos por sorteo",
      COMPRADO: "Comprados",
    };
    const origenHtml = Object.keys(d.origenes || {}).map(function(o) {
      return '<div class="stat-card"><span class="material-icons stat-icon">category</span><div class="stat-info"><span class="stat-value">' + d.origenes[o] + '</span><span class="stat-label">' + (origenMap[o] || o) + '</span></div></div>';
    }).join("");

    el.innerHTML =
      '<div class="stat-card"><span class="material-icons stat-icon">people</span><div class="stat-info"><span class="stat-value">' + d.total_personas + '</span><span class="stat-label">Total de personas</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">list_alt</span><div class="stat-info"><span class="stat-value">' + d.total_entradas + '</span><span class="stat-label">Total de entradas</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">confirmation_number</span><div class="stat-info"><span class="stat-value">' + d.total_membresias + '</span><span class="stat-label">Total membresias</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">description</span><div class="stat-info"><span class="stat-value">' + d.total_pergaminos + '</span><span class="stat-label">Total pergaminos</span></div></div>' +
      '<div class="stat-card" style="border-color:#81C784"><span class="material-icons stat-icon" style="color:#43A047">supervisor_account</span><div class="stat-info"><span class="stat-value">' + d.lider_maria + '</span><span class="stat-label">Lider MARIA ELVIRA</span></div></div>' +
      '<div class="stat-card" style="border-color:#90CAF9"><span class="material-icons stat-icon" style="color:#1E88E5">person</span><div class="stat-info"><span class="stat-value">' + d.lider_otro + '</span><span class="stat-label">Lider OTRO</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">help_outline</span><div class="stat-info"><span class="stat-value">' + d.lider_na + '</span><span class="stat-label">Lider N/A</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">public</span><div class="stat-info"><span class="stat-value">' + d.paises + '</span><span class="stat-label">Paises</span></div></div>' +
      '<div class="stat-card"><span class="material-icons stat-icon">schedule</span><div class="stat-info"><span class="stat-value stat-date">' + (d.ultima_actualizacion ? formatDateStrict(d.ultima_actualizacion) : "—") + '</span><span class="stat-label">Ultima actualizacion</span></div></div>' +
      origenHtml;

    updateRefreshIndicator(false);
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">error</span><p>Error al cargar estadisticas.</p></div>';
  }
}

// ========== LIDER CRUD (entradas) ==========

function findLiderEntryById(id) {
  for (const p of liderAllData) {
    const entries = liderEntriesCache[liderPersonKey(p)] || [];
    const found = entries.find(function(e) { return e.id === id; });
    if (found) return found;
  }
  return null;
}

function openLiderAddModal() {
  const p = liderCurrentPerson;
  if (!p) {
    alert("Abre primero el detalle de un usuario para a\u00f1adirle una entrada.");
    return;
  }
  document.getElementById("liderEditId").value = "";
  document.getElementById("liderModalTitle").textContent = "A&ntilde;adir entrada";
  document.getElementById("liderFormUsername").value = p.telegram_username || "";
  document.getElementById("liderFormNombre").value = p.nombre_completo || "";
  document.getElementById("liderFormDocumento").value = p.documento || "";
  document.getElementById("liderFormPais").value = p.pais || "";
  const label = document.getElementById("liderEntryForLabel");
  if (label) {
    label.style.display = "";
    label.textContent = "Para: " + (p.nombre_completo || "—") + " (solo datos de producto)";
  }
  document.getElementById("liderFormCant1").value = "0";
  document.getElementById("liderFormMat1").value = "MEMBRESIA DE 100 BI";
  document.getElementById("liderFormCant2").value = "0";
  document.getElementById("liderFormMat2").value = "PERGAMINOS ALEMANES DORADOS";
  document.getElementById("liderFormOrigen").value = "REGALADO";
  document.getElementById("btnLiderModalSubmit").textContent = "Guardar";
  document.getElementById("liderModalOverlay").style.display = "flex";
}

function openLiderEditModal(id) {
  const entry = findLiderEntryById(id);
  if (!entry) return;
  document.getElementById("liderEditId").value = id;
  document.getElementById("liderModalTitle").textContent = "Editar entrada";
  const label = document.getElementById("liderEntryForLabel");
  if (label) label.style.display = "none";
  document.getElementById("liderFormCant1").value = entry.cantidad_1 || 0;
  document.getElementById("liderFormMat1").value = entry.material_1 || "";
  document.getElementById("liderFormCant2").value = entry.cantidad_2 || 0;
  document.getElementById("liderFormMat2").value = entry.material_2 || "";
  document.getElementById("liderFormOrigen").value = entry.origen || "REGALADO";
  document.getElementById("btnLiderModalSubmit").textContent = "Guardar";
  document.getElementById("liderModalOverlay").style.display = "flex";
}

function closeLiderModal(e) {
  const overlay = document.getElementById("liderModalOverlay");
  if (e && e.target !== overlay) return;
  overlay.style.display = "none";
}

async function submitLiderForm() {
  const id = document.getElementById("liderEditId").value;
  const body = {
    cantidad_1: document.getElementById("liderFormCant1").value,
    material_1: document.getElementById("liderFormMat1").value.trim(),
    cantidad_2: document.getElementById("liderFormCant2").value,
    material_2: document.getElementById("liderFormMat2").value.trim(),
    origen: document.getElementById("liderFormOrigen").value,
  };
  if (!id) {
    body.telegram_username = document.getElementById("liderFormUsername").value.trim().replace(/^@/, "");
    body.nombre_completo = document.getElementById("liderFormNombre").value.trim();
    body.documento = document.getElementById("liderFormDocumento").value.trim();
    body.pais = document.getElementById("liderFormPais").value.trim();
  }
  try {
    const url = id ? "/api/lider/entradas/edit/" + id : "/api/lider/entradas/add";
    const resp = await fetch(url, {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(function() { return {}; });
      throw new Error(errData.detail || "Error al guardar");
    }
    closeLiderModal();
    liderEntriesCache = {};
    await loadLiderRegistros();
  } catch (err) {
    alert(err.message || "Error al guardar.");
  }
}

// ========== LIDER CRUD (usuario) ==========

function openLiderUsuarioModal() {
  document.getElementById("liderUsuarioFormNombre").value = "";
  document.getElementById("liderUsuarioFormUsername").value = "";
  document.getElementById("liderUsuarioFormDocumento").value = "";
  document.getElementById("liderUsuarioFormPais").value = "";
  document.getElementById("liderUsuarioModalOverlay").style.display = "flex";
}

function closeLiderUsuarioModal(e) {
  const overlay = document.getElementById("liderUsuarioModalOverlay");
  if (e && e.target !== overlay) return;
  overlay.style.display = "none";
}

async function submitLiderUsuarioForm() {
  const body = {
    nombre_completo: document.getElementById("liderUsuarioFormNombre").value.trim(),
    telegram_username: document.getElementById("liderUsuarioFormUsername").value.trim().replace(/^@/, ""),
    documento: document.getElementById("liderUsuarioFormDocumento").value.trim(),
    pais: document.getElementById("liderUsuarioFormPais").value.trim(),
  };
  try {
    const resp = await fetch("/api/lider/usuario/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(function() { return {}; });
      throw new Error(errData.detail || "Error al crear el usuario");
    }
    closeLiderUsuarioModal();
    liderEntriesCache = {};
    await loadLiderRegistros();
  } catch (err) {
    alert(err.message || "Error al crear el usuario.");
  }
}

function openLiderDeleteModal(id) {
  document.getElementById("liderDeleteId").value = id;
  document.getElementById("liderDeleteOverlay").style.display = "flex";
}

function closeLiderDeleteModal(e) {
  const overlay = document.getElementById("liderDeleteOverlay");
  if (e && e.target !== overlay) return;
  overlay.style.display = "none";
}

async function executeLiderDelete() {
  const id = document.getElementById("liderDeleteId").value;
  try {
    const resp = await fetch("/api/lider/entradas/delete/" + id, { method: "DELETE" });
    if (!resp.ok) {
      const errData = await resp.json().catch(function() { return {}; });
      throw new Error(errData.detail || "Error al eliminar");
    }
    closeLiderDeleteModal();
    liderEntriesCache = {};
    await loadLiderRegistros();
  } catch (err) {
    alert(err.message || "Error al eliminar.");
  }
}

// ========== LIDER CRUD (persona) ==========

function openLiderPersonaEditModal() {
  const p = liderCurrentPerson;
  if (!p) return;
  document.getElementById("liderPersonaEditNombreOrig").value = p.nombre_completo || "";
  document.getElementById("liderPersonaEditDocOrig").value = p.documento || "";
  document.getElementById("liderPersonaEditUserOrig").value = p.telegram_username || "";
  document.getElementById("liderPersonaFormUsername").value = p.telegram_username || "";
  document.getElementById("liderPersonaFormNombre").value = p.nombre_completo || "";
  document.getElementById("liderPersonaFormDocumento").value = p.documento || "";
  document.getElementById("liderPersonaFormPais").value = p.pais || "";
  const n = p.num_entradas || 0;
  document.getElementById("liderPersonaEditHint").textContent =
    "Se actualizar\u00e1n " + n + " entrada" + (n !== 1 ? "s" : "") + " de esta persona.";
  document.getElementById("liderPersonaEditOverlay").style.display = "flex";
}

function closeLiderPersonaEditModal(e) {
  const overlay = document.getElementById("liderPersonaEditOverlay");
  if (e && e.target !== overlay) return;
  overlay.style.display = "none";
}

async function submitLiderPersonaForm() {
  const body = {
    nombre: document.getElementById("liderPersonaEditNombreOrig").value,
    documento: document.getElementById("liderPersonaEditDocOrig").value,
    telegram_username: document.getElementById("liderPersonaEditUserOrig").value,
    new_nombre: document.getElementById("liderPersonaFormNombre").value.trim(),
    new_documento: document.getElementById("liderPersonaFormDocumento").value.trim(),
    new_pais: document.getElementById("liderPersonaFormPais").value.trim(),
    new_telegram_username: document.getElementById("liderPersonaFormUsername").value.trim().replace(/^@/, ""),
  };
  try {
    const resp = await fetch("/api/lider/persona/edit", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(function() { return {}; });
      throw new Error(errData.detail || "Error al guardar");
    }
    closeLiderPersonaEditModal();
    liderEntriesCache = {};
    await loadLiderRegistros();
  } catch (err) {
    alert(err.message || "Error al guardar.");
  }
}

function openLiderPersonaDeleteModal() {
  const p = liderCurrentPerson;
  if (!p) return;
  document.getElementById("liderPersonaDeleteNombre").value = p.nombre_completo || "";
  document.getElementById("liderPersonaDeleteDoc").value = p.documento || "";
  document.getElementById("liderPersonaDeleteUser").value = p.telegram_username || "";
  document.getElementById("liderPersonaDeleteName").textContent =
    (p.nombre_completo || "Sin nombre") + "  ·  " + (p.documento || "sin documento");
  document.getElementById("liderPersonaDeleteImpact").textContent =
    "Se eliminar\u00e1n " + (p.num_entradas || 0) + " entrada" + ((p.num_entradas || 0) !== 1 ? "s" : "") +
    " · " + (p.total_membresias || 0) + " membres\u00edas · " + (p.total_pergaminos || 0) + " pergaminos. Esta acci\u00f3n no se puede deshacer.";
  document.getElementById("liderPersonaDeleteOverlay").style.display = "flex";
}

function closeLiderPersonaDeleteModal(e) {
  const overlay = document.getElementById("liderPersonaDeleteOverlay");
  if (e && e.target !== overlay) return;
  overlay.style.display = "none";
}

async function executeLiderPersonaDelete() {
  const body = {
    nombre: document.getElementById("liderPersonaDeleteNombre").value,
    documento: document.getElementById("liderPersonaDeleteDoc").value,
    telegram_username: document.getElementById("liderPersonaDeleteUser").value,
  };
  try {
    const resp = await fetch("/api/lider/persona/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(function() { return {}; });
      throw new Error(errData.detail || "Error al eliminar");
    }
    closeLiderPersonaDeleteModal();
    liderEntriesCache = {};
    liderCurrentPerson = null;
    await loadLiderRegistros();
  } catch (err) {
    alert(err.message || "Error al eliminar.");
  }
}

