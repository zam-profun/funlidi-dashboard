let allData = [];
let refreshInterval = null;
let lastRefreshTime = null;
let currentModule = "bot";

document.addEventListener("DOMContentLoaded", () => {
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
  initConsultaSearch();
  initTimezone();

  loadSection("registros");
  startAutoRefresh();
});

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

function switchModule(module) {
  currentModule = module;
  document.getElementById("nav-bot").style.display = module === "bot" ? "" : "none";
  document.getElementById("nav-pagos").style.display = module === "pagos" ? "" : "none";
  document.getElementById("nav-ayudas").style.display = module === "ayudas" ? "" : "none";
  document.getElementById("nav-inventario").style.display = module === "inventario" ? "" : "none";
  document.getElementById("nav-consulta").style.display = module === "consulta" ? "" : "none";
  document.querySelectorAll(".content-section").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll(".sidebar-nav .nav-btn").forEach((b) => b.classList.remove("active"));

  document.body.classList.toggle("theme-ayudas", module === "ayudas");
  document.body.classList.toggle("theme-inventario", module === "inventario");

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
    "consulta-buscar": "Consulta General",
  };
  document.getElementById("sectionTitle").textContent = titles[section] || "Registros";
}

function loadSection(section) {
  if (section === "registros") loadTable();
  if (section === "estadisticas") { loadStats(); loadActivity(); }
  if (section === "anomalias") loadAnomalies();
  if (section === "pagos-resumen") loadPagosResumen();
  if (section === "pagos-registros") loadPagosRegistros();
  if (section === "pagos-flayer") loadPagosFlayer();
  if (section === "pagos-personas") loadPagosPersonas();
  if (section === "pagos-estadisticas") loadPagosStats();
  if (section === "ayudas-registros") loadAyudasRegistros();
  if (section === "ayudas-estadisticas") loadAyudasStats();
  if (section === "inventario-registros") loadInventarioRegistros();
  if (section === "inventario-estadisticas") loadInventarioStats();
  if (section === "consulta-buscar") loadConsulta();
}

function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    const active = document.querySelector(".nav-btn.active");
    if (active) loadSection(active.dataset.section);
  }, 60000);
}

function initRefresh() {
  document.getElementById("btnRefresh").addEventListener("click", () => {
    updateRefreshIndicator(true);
    const active = document.querySelector(".nav-btn.active");
    if (active) loadSection(active.dataset.section);
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

async function loadTable() {
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando datos...</p></div></td></tr>`;

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

async function loadPagosRegistros() {
  const tbody = document.getElementById("pagosTableBody");
  tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando registros de pagos...</p></div></td></tr>';

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

async function loadPagosPersonas() {
  const tbody = document.getElementById("pagosPersonasBody");
  tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando personas...</p></div></td></tr>';

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

async function loadAyudasRegistros() {
  const tbody = document.getElementById("ayudasTableBody");
  tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando datos...</p></div></td></tr>';

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

async function loadAyudasStats() {
  const el = document.getElementById("ayudasStatsGrid");
  el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando estadisticas...</p></div>';

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

async function loadInventarioRegistros() {
  const tbody = document.getElementById("inventarioTableBody");
  tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando datos...</p></div></td></tr>';

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

async function loadInventarioStats() {
  const el = document.getElementById("inventarioStatsGrid");
  el.innerHTML = '<div class="empty-state"><span class="material-icons empty-icon">inbox</span><p>Cargando estadisticas...</p></div>';

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

async function loadConsulta() {
  const q = document.getElementById("consultaSearchInput").value.trim();
  const resultsEl = document.getElementById("consultaResults");
  const hintEl = document.getElementById("consultaHint");

  if (q.length < 2) {
    hintEl.innerHTML = '<span class="material-icons consulta-hint-icon">info</span><span>Ingresa al menos 2 caracteres para buscar.</span>';
    resultsEl.innerHTML = "";
    return;
  }

  hintEl.style.display = "none";
  resultsEl.innerHTML = '<div class="consulta-loading"><span class="material-icons consulta-loading-icon">hourglass_top</span>Buscando en todos los modulos...</div>';

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
