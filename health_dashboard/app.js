const API_URL = window.HEALTH_API_URL || "/api/health";
const GAS_BRIDGE_URL = window.HEALTH_GAS_BRIDGE_URL || "";
const ACCESS_TOKEN_KEY = "ruang-sehat-access-token";
const apiBridgeRequests = new Map();
let apiBridgeFrame = null;
let apiBridgeReady = false;
let apiBridgeConfigurationError = "";
let apiBridgeTargetWindow = null;
let apiBridgeTargetOrigin = "";
let apiBridgeRequestId = 0;
const apiBridgeReadyWaiters = [];
const state = {
  accessToken:
    localStorage.getItem(ACCESS_TOKEN_KEY) ||
    sessionStorage.getItem(ACCESS_TOKEN_KEY) ||
    "",
  dashboard: null,
};

document.addEventListener("DOMContentLoaded", () => {
  initializeApiBridge();
  bindNavigation();
  bindForms();
  bindRecordActions();
  registerServiceWorker();
  document.querySelector("#remember-access").checked =
    Boolean(localStorage.getItem(ACCESS_TOKEN_KEY));

  const waLoginToken = new URLSearchParams(location.hash.slice(1)).get("wa_login");
  if (waLoginToken) {
    const cleanUrl = new URL(location.href);
    cleanUrl.hash = "";
    history.replaceState(null, "", cleanUrl.toString());
    redeemWaLogin(waLoginToken);
  } else if (state.accessToken) {
    openDashboard().catch((error) => {
      document.querySelector("#access-error").textContent = error.message;
    });
  } else {
    showAccessScreen();
  }
});

function initializeApiBridge() {
  if (!GAS_BRIDGE_URL) return;

  let bridgeUrl;
  try {
    bridgeUrl = new URL(GAS_BRIDGE_URL);
  } catch {
    apiBridgeConfigurationError =
      "Google Apps Script URL di config.js tidak valid.";
    return;
  }

  apiBridgeFrame = document.createElement("iframe");
  apiBridgeFrame.title = "Penghubung aman ke Google Apps Script";
  apiBridgeFrame.tabIndex = -1;
  apiBridgeFrame.setAttribute("aria-hidden", "true");
  apiBridgeFrame.style.cssText =
    "position:fixed;width:1px;height:1px;left:-2px;bottom:-2px;border:0;opacity:0;pointer-events:none;";

  window.addEventListener("message", (event) => {
    if (!isApiBridgeFrame(event.source, event.origin)) return;
    const message = event.data;
    if (message?.type === "health-api-bridge-ready") {
      apiBridgeTargetWindow = event.source;
      apiBridgeTargetOrigin = event.origin;
      apiBridgeReady = true;
      apiBridgeReadyWaiters.splice(0).forEach((resolve) => resolve());
      return;
    }
    if (
      event.source !== apiBridgeTargetWindow ||
      event.origin !== apiBridgeTargetOrigin
    ) {
      return;
    }
    if (message?.type !== "health-api-response") return;

    const pending = apiBridgeRequests.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    apiBridgeRequests.delete(message.id);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.result);
  });

  bridgeUrl.searchParams.set("bridge", "1");
  apiBridgeFrame.src = bridgeUrl.toString();
  document.body.appendChild(apiBridgeFrame);
}

function isApiBridgeFrame(source, origin) {
  if (!apiBridgeFrame || !source) return false;
  if (source === apiBridgeFrame.contentWindow) return true;

  let senderOrigin;
  try {
    senderOrigin = new URL(origin);
  } catch {
    return false;
  }
  const hostname = senderOrigin.hostname.toLowerCase();
  return (
    senderOrigin.protocol === "https:" &&
    (hostname === "script.google.com" ||
      hostname === "script.googleusercontent.com" ||
      hostname.endsWith(".script.googleusercontent.com") ||
      hostname.endsWith("-script.googleusercontent.com"))
  );
}

function waitForApiBridge() {
  if (apiBridgeReady) return Promise.resolve();
  if (apiBridgeConfigurationError) {
    return Promise.reject(new Error(apiBridgeConfigurationError));
  }
  if (!apiBridgeFrame) {
    return Promise.reject(new Error("Google Apps Script bridge belum dikonfigurasi."));
  }
  return new Promise((resolve, reject) => {
    const resolveWhenReady = () => {
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      const waiterIndex = apiBridgeReadyWaiters.indexOf(resolveWhenReady);
      if (waiterIndex >= 0) apiBridgeReadyWaiters.splice(waiterIndex, 1);
      reject(new Error("Google Apps Script belum merespons. Coba muat ulang halaman."));
    }, 20000);
    apiBridgeReadyWaiters.push(resolveWhenReady);
  });
}

async function callApiBridge(request) {
  await waitForApiBridge();
  return new Promise((resolve, reject) => {
    apiBridgeRequestId += 1;
    const id = `${Date.now()}-${apiBridgeRequestId}`;
    const timeout = setTimeout(() => {
      apiBridgeRequests.delete(id);
      reject(new Error("Google Apps Script belum merespons. Coba lagi nanti."));
    }, 30000);
    apiBridgeRequests.set(id, { resolve, reject, timeout });
    apiBridgeTargetWindow.postMessage(
      { type: "health-api-request", id, request },
      apiBridgeTargetOrigin,
    );
  });
}

async function sendApiRequest(action, data, accessToken) {
  if (GAS_BRIDGE_URL) {
    const result = await callApiBridge({ action, data, accessToken });
    return {
      ok: result?.status === "success",
      status: result?.code === "unauthorized" ? 401 : 200,
      result,
    };
  }
  if (location.hostname.endsWith(".github.io")) {
    throw new Error(
      "Google Apps Script belum dikonfigurasi. Isi HEALTH_GAS_BRIDGE_URL di config.js.",
    );
  }

  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, data }),
    cache: "no-store",
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Respons server tidak dapat dibaca. Coba lagi nanti.");
  }
  return { ok: response.ok, status: response.status, result };
}

function bindNavigation() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => showPage(tab.dataset.view));
  });
  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.go));
  });
  document
    .querySelector("#appointment-filter")
    .addEventListener("change", renderAppointments);
  document.querySelector("#logout-button").addEventListener("click", () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    state.accessToken = "";
    state.dashboard = null;
    showAccessScreen();
  });
}

function bindForms() {
  document.querySelector("#access-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const phoneInput = document.querySelector("#access-phone");
    const passwordInput = document.querySelector("#access-password");
    const errorElement = document.querySelector("#access-error");
    const submitButton = document.querySelector("#access-submit");
    const submitLabel = document.querySelector("#access-submit-label");
    if (submitButton.disabled) return;

    errorElement.textContent = "";
    submitButton.disabled = true;
    submitButton.classList.add("is-loading");
    submitButton.setAttribute("aria-busy", "true");
    submitLabel.textContent = "Memeriksa akses...";
    try {
      const { ok, result } = await sendApiRequest(
        "loginWithPassword",
        {
          phone: phoneInput.value.trim(),
          password: passwordInput.value,
          remember: document.querySelector("#remember-access").checked,
        },
        "",
      );
      if (!ok || result?.status !== "success" || !result.data?.sessionToken) {
        throw new Error(
          result?.error ||
            result?.replyMessage ||
            "Nomor WhatsApp atau password tidak valid.",
        );
      }

      state.accessToken = result.data.sessionToken;
      await openDashboard();
      passwordInput.value = "";
    } catch (error) {
      state.accessToken = "";
      errorElement.textContent = error.message;
    } finally {
      passwordInput.value = "";
      submitButton.disabled = false;
      submitButton.classList.remove("is-loading");
      submitButton.setAttribute("aria-busy", "false");
      submitLabel.textContent = "Masuk";
    }
  });

  document
    .querySelector("#appointment-form")
    .addEventListener("submit", saveAppointment);
  document
    .querySelector("#cancel-appointment-edit")
    .addEventListener("click", resetAppointmentForm);
  document.querySelector("#nutrition-form").addEventListener("submit", saveNutrition);
  document.querySelector("#mother-form").addEventListener("submit", saveMotherHealth);
  document.querySelector("#category-form").addEventListener("submit", (event) =>
    saveOption(event, "category", "#new-category"),
  );
  document.querySelector("#location-form").addEventListener("submit", (event) =>
    saveOption(event, "location", "#new-location"),
  );
}

function bindRecordActions() {
  document.querySelector("#appointment-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-appointment-action]");
    if (!button) return;

    const appointment = state.dashboard?.appointments.find(
      (item) => item.id === button.dataset.id,
    );
    if (!appointment) return;

    if (button.dataset.appointmentAction === "edit") {
      beginAppointmentEdit(appointment);
      return;
    }
    if (
      button.dataset.appointmentAction === "delete" &&
      !window.confirm(`Hapus jadwal "${appointment.name}"?`)
    ) {
      return;
    }

    const action =
      button.dataset.appointmentAction === "complete"
        ? "completeAppointment"
        : "deleteAppointment";
    await runAction(action, { id: appointment.id });
  });
}

async function openDashboard() {
  const dashboard = await callApi("dashboard");
  state.dashboard = dashboard;
  document.querySelector("#access-screen").hidden = true;
  document.querySelector("#app-screen").hidden = false;
  document.querySelector("#logout-button").hidden = false;
  renderDashboard();
  return dashboard;
}

function showAccessScreen() {
  document.querySelector("#app-screen").hidden = true;
  document.querySelector("#logout-button").hidden = true;
  document.querySelector("#access-screen").hidden = false;
}

async function redeemWaLogin(token) {
  const errorElement = document.querySelector("#access-error");
  errorElement.textContent = "Memverifikasi tautan WhatsApp...";

  try {
    const { ok, result } = await sendApiRequest(
      "redeemWaLogin",
      {
        token,
        remember: document.querySelector("#remember-access").checked,
      },
      "",
    );
    if (!ok || result?.status !== "success" || !result.data?.sessionToken) {
      throw new Error(
        result?.error ||
          result?.replyMessage ||
          "Tautan login tidak valid. Minta tautan baru lewat WhatsApp.",
      );
    }

    state.accessToken = result.data.sessionToken;
    await openDashboard();
  } catch (error) {
    state.accessToken = "";
    errorElement.textContent = error.message;
  }
}

async function callApi(action, data = {}) {
  const { ok, status, result } = await sendApiRequest(
    action,
    data,
    state.accessToken,
  );
  if (status === 401 || result?.code === "unauthorized") {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    state.accessToken = "";
    showAccessScreen();
  }
  if (!ok || result?.status !== "success") {
    throw new Error(
      result?.error || result?.replyMessage || "Permintaan gagal.",
    );
  }

  if (document.querySelector("#remember-access").checked) {
    localStorage.setItem(ACCESS_TOKEN_KEY, state.accessToken);
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.setItem(ACCESS_TOKEN_KEY, state.accessToken);
  }
  return result.data;
}

function renderDashboard() {
  renderSummary();
  renderReminderStatus();
  renderAppointments();
  renderNutrition();
  renderMotherHealth();
  renderOptions();
}

function renderSummary() {
  const appointments = state.dashboard.appointments || [];
  const upcoming = appointments.filter(isUpcomingAppointment);
  document.querySelector("#summary-appointments").textContent = upcoming.length;
  document.querySelector("#summary-nutrition").textContent =
    (state.dashboard.nutrition || []).length;
  document.querySelector("#summary-mother").textContent =
    (state.dashboard.mother || []).length;

  const next = upcoming.sort((left, right) =>
    left.dateTime.localeCompare(right.dateTime),
  )[0];
  const nextElement = document.querySelector("#next-appointment");
  if (!next) {
    nextElement.className = "empty-state";
    nextElement.textContent = "Belum ada jadwal mendatang.";
    return;
  }
  nextElement.className = "record-card";
  nextElement.innerHTML = `
    <div class="record-top">
      <div>
        <h3>${escapeHtml(next.name)}</h3>
        <p>${escapeHtml(next.category)} · ${escapeHtml(formatDateTime(next.dateTime))}</p>
      </div>
      <span class="status-pill">${escapeHtml(statusLabel(next.status))}</span>
    </div>
    <div class="record-meta">
      <span>Lokasi: ${escapeHtml(next.location || "-")}</span>
      ${next.notes ? `<span>Persiapan: ${escapeHtml(next.notes)}</span>` : ""}
    </div>`;
}

function renderReminderStatus() {
  const reminder = state.dashboard.reminder || {};
  const statusElement = document.querySelector("#reminder-status");
  const detailElement = document.querySelector("#reminder-detail");

  let message;
  let warning = false;
  if (reminder.deliveryMode === "bot") {
    warning = true;
    message = `Reminder H-1 dan hari-H dikirim langsung oleh bot WhatsApp setelah pukul ${String(reminder.sendHour).padStart(2, "0")}.00 (${reminder.timeZone || "Asia/Jakarta"}). Bot harus tetap online; konfigurasi gateway Apps Script tidak diperlukan.`;
  } else if (!reminder.triggerInstalled) {
    warning = true;
    message =
      "Reminder H-1 belum aktif. Jalankan setupHealthSheets di Apps Script untuk menyiapkan sheet.";
  } else if (!reminder.gatewayConfigured) {
    warning = true;
    message =
      "Trigger reminder terpasang, tetapi konfigurasi gateway WhatsApp belum lengkap.";
  } else {
    message = `Reminder aktif: jadwal Pending untuk besok diperiksa setiap hari sekitar pukul ${String(reminder.sendHour).padStart(2, "0")}.00 (${reminder.scriptTimeZone}) dan dikirim ke nomor WhatsApp yang dikonfigurasi.`;
  }

  statusElement.classList.toggle("is-warning", warning);
  statusElement.textContent = message;
  detailElement.textContent = message;
}

function renderAppointments() {
  if (!state.dashboard) return;
  const filter = document.querySelector("#appointment-filter").value;
  const appointments = [...(state.dashboard.appointments || [])]
    .filter((appointment) =>
      filter === "all" ? true : isUpcomingAppointment(appointment),
    )
    .sort((left, right) => right.dateTime.localeCompare(left.dateTime));
  const list = document.querySelector("#appointment-list");
  if (!appointments.length) {
    list.innerHTML = '<p class="empty-state">Tidak ada jadwal untuk filter ini.</p>';
    return;
  }

  list.innerHTML = appointments
    .map((appointment) => {
      const completed = appointment.status === "Selesai";
      return `
        <article class="record-card">
          <div class="record-top">
            <div>
              <h3>${escapeHtml(appointment.name)}</h3>
              <p>${escapeHtml(appointment.category)} · ${escapeHtml(formatDateTime(appointment.dateTime))}</p>
            </div>
            <span class="status-pill ${completed ? "is-complete" : ""}">${escapeHtml(statusLabel(appointment.status))}</span>
          </div>
          <div class="record-meta">
            <span>Lokasi: ${escapeHtml(appointment.location || "-")}</span>
            ${appointment.notes ? `<span>Persiapan: ${escapeHtml(appointment.notes)}</span>` : ""}
          </div>
          <div class="record-actions">
            <button class="small-button" type="button" data-appointment-action="edit" data-id="${escapeHtml(appointment.id)}">Ubah</button>
            ${completed ? "" : `<button class="small-button" type="button" data-appointment-action="complete" data-id="${escapeHtml(appointment.id)}">Tandai selesai</button>`}
            <button class="small-button danger" type="button" data-appointment-action="delete" data-id="${escapeHtml(appointment.id)}">Hapus</button>
          </div>
        </article>`;
    })
    .join("");
}

function renderNutrition() {
  const rows = [...(state.dashboard.nutrition || [])].sort((a, b) =>
    b.dateTime.localeCompare(a.dateTime),
  );
  const list = document.querySelector("#nutrition-list");
  list.innerHTML = rows.length
    ? rows
        .map(
          (item) => `
            <article class="record-card">
              <div class="record-top">
                <h3>${escapeHtml(item.food)}</h3>
                <span class="status-pill">${escapeHtml(item.category)}</span>
              </div>
              <div class="record-meta">
                <span>${escapeHtml(formatDateTime(item.dateTime))} · ${escapeHtml(item.portion)}</span>
                ${item.reaction ? `<span>Catatan: ${escapeHtml(item.reaction)}</span>` : ""}
              </div>
            </article>`,
        )
        .join("")
    : '<p class="empty-state">Belum ada catatan nutrisi.</p>';
}

function renderMotherHealth() {
  const rows = [...(state.dashboard.mother || [])].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const list = document.querySelector("#mother-list");
  list.innerHTML = rows.length
    ? rows
        .map(
          (item) => `
            <article class="record-card">
              <div class="record-top">
                <h3>${escapeHtml(formatDate(item.date))} · Minggu ${escapeHtml(item.pregnancyWeek)}</h3>
                <span class="status-pill">${escapeHtml(item.weightKg)} kg</span>
              </div>
              <div class="record-meta">
                ${item.bloodPressure ? `<span>Tekanan darah: ${escapeHtml(item.bloodPressure)}</span>` : ""}
                ${item.complaints ? `<span>Keluhan: ${escapeHtml(item.complaints)}</span>` : ""}
                ${item.doctorNotes ? `<span>Catatan dokter: ${escapeHtml(item.doctorNotes)}</span>` : ""}
              </div>
            </article>`,
        )
        .join("")
    : '<p class="empty-state">Belum ada perkembangan yang dicatat.</p>';
}

function renderOptions() {
  const options = state.dashboard.options || {};
  const categories = options.categories || [];
  const categorySelect = document.querySelector("#appointment-category");
  const selectedCategory = categorySelect.value;
  categorySelect.innerHTML = categories
    .map(
      (category) =>
        `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`,
    )
    .join("");
  if (categories.includes(selectedCategory)) {
    categorySelect.value = selectedCategory;
  }

  const locations = options.locations || [];
  document.querySelector("#location-options").innerHTML = locations
    .map((location) => `<option value="${escapeHtml(location)}"></option>`)
    .join("");
  document.querySelector("#category-list").innerHTML = categories
    .map((category) => `<span class="chip">${escapeHtml(category)}</span>`)
    .join("");
  document.querySelector("#settings-location-list").innerHTML = locations.length
    ? locations.map((location) => `<span class="chip">${escapeHtml(location)}</span>`).join("")
    : '<span class="muted">Belum ada lokasi tersimpan.</span>';
}

async function saveAppointment(event) {
  event.preventDefault();
  const id = document.querySelector("#appointment-id").value;
  const payload = {
    id,
    category: document.querySelector("#appointment-category").value,
    name: document.querySelector("#appointment-name").value.trim(),
    dateTime: document.querySelector("#appointment-date").value,
    location: document.querySelector("#appointment-location").value.trim(),
    notes: document.querySelector("#appointment-notes").value.trim(),
  };
  const saved = await runAction(
    id ? "updateAppointment" : "createAppointment",
    payload,
  );
  if (saved) resetAppointmentForm();
}

async function saveNutrition(event) {
  event.preventDefault();
  const saved = await runAction("createNutrition", {
    category: document.querySelector("#nutrition-category").value,
    food: document.querySelector("#nutrition-food").value.trim(),
    portion: document.querySelector("#nutrition-portion").value.trim(),
    reaction: document.querySelector("#nutrition-reaction").value.trim(),
  });
  if (saved) event.target.reset();
}

async function saveMotherHealth(event) {
  event.preventDefault();
  const saved = await runAction("createMotherHealth", {
    pregnancyWeek: document.querySelector("#pregnancy-week").value,
    weightKg: document.querySelector("#mother-weight").value,
    bloodPressure: document.querySelector("#blood-pressure").value.trim(),
    complaints: document.querySelector("#mother-complaints").value.trim(),
    doctorNotes: document.querySelector("#doctor-notes").value.trim(),
  });
  if (saved) event.target.reset();
}

async function saveOption(event, type, inputSelector) {
  event.preventDefault();
  const input = document.querySelector(inputSelector);
  const saved = await runAction("addOption", { type, name: input.value.trim() });
  if (saved) input.value = "";
}

async function runAction(action, data) {
  const messageElement = document.querySelector("#app-message");
  messageElement.classList.remove("is-error");
  messageElement.textContent = "Menyimpan...";
  try {
    const result = await callApi(action, data);
    await openDashboard();
    messageElement.textContent = result?.message || "Perubahan berhasil disimpan.";
    return true;
  } catch (error) {
    messageElement.classList.add("is-error");
    messageElement.textContent = error.message;
    return false;
  }
}

function beginAppointmentEdit(appointment) {
  document.querySelector("#appointment-id").value = appointment.id;
  document.querySelector("#appointment-category").value = appointment.category;
  document.querySelector("#appointment-name").value = appointment.name;
  document.querySelector("#appointment-date").value = appointment.dateTime;
  document.querySelector("#appointment-location").value = appointment.location;
  document.querySelector("#appointment-notes").value = appointment.notes;
  document.querySelector("#appointment-form-title").textContent = "Ubah jadwal";
  document.querySelector("#save-appointment").textContent = "Simpan perubahan";
  document.querySelector("#cancel-appointment-edit").hidden = false;
  showPage("appointments");
  document.querySelector("#appointment-form-title").scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
}

function resetAppointmentForm() {
  const form = document.querySelector("#appointment-form");
  form.reset();
  document.querySelector("#appointment-id").value = "";
  document.querySelector("#appointment-form-title").textContent = "Tambah jadwal";
  document.querySelector("#save-appointment").textContent = "Simpan jadwal";
  document.querySelector("#cancel-appointment-edit").hidden = true;
}

function showPage(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.view === name;
    tab.classList.toggle("is-active", active);
    if (active) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
  document.querySelectorAll(".view").forEach((page) => {
    page.classList.toggle("is-visible", page.dataset.page === name);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function isUpcomingAppointment(appointment) {
  return (
    appointment.status !== "Selesai" &&
    String(appointment.dateTime || "").slice(0, 10) >= localDateKey()
  );
}

function localDateKey() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDateTime(value) {
  const [datePart, timePart] = String(value || "").split("T");
  if (!datePart) return "-";
  return `${formatDate(datePart)}${timePart ? `, ${timePart.slice(0, 5)}` : ""}`;
}

function formatDate(value) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "-";
}

function statusLabel(status) {
  if (status === "Reminded_H-1") return "H-1 terkirim";
  if (status === "Reminded_HariH") return "Hari ini terkirim";
  if (status === "Selesai") return "Selesai";
  return "Menunggu";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./service-worker.js").catch((error) => {
    console.error("Service worker registration failed:", error.message);
  });
}
