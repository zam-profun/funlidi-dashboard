let allData = [];
let refreshInterval = null;
let lastRefreshTime = null;

document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initRefresh();
  initSearch();
  initDownload();
  initTimezone();

  loadSection("registros");
  startAutoRefresh();
});

function initNavigation() {
  const navBtns = document.querySelectorAll(".nav-btn");
  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      navBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const section = btn.dataset.section;
      switchSection(section);
      loadSection(section);
    });
  });
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
  };
  document.getElementById("sectionTitle").textContent = titles[section] || "Registros";
}

function loadSection(section) {
  if (section === "registros") loadTable();
  if (section === "estadisticas") { loadStats(); loadActivity(); }
  if (section === "anomalias") loadAnomalies();
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

setInterval(tickRefreshIndicator, 5000);
