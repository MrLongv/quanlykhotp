const API_BASE = "https://warehouse-api.longvanasb.workers.dev";

const $ = (id) => document.getElementById(id);

const State = {
  currentAreaId: 1,
  currentAreaCode: "KTP",
  currentAreaName: "Kho thành phẩm",
  viewMode: "grid",
  filterMode: "all",
  areas: [],
  locations: [],
  allLocations: [],
  stocks: [],
  searchResults: [],
  selectedLocationId: null,
  token: localStorage.getItem("warehouse_token") || "",
  user: JSON.parse(localStorage.getItem("warehouse_user") || "null"),
};

/* =========================
   API HELPER
========================= */

function authHeaders() {
  const headers = { "Content-Type": "application/json" };

  if (State.token) {
    headers.Authorization = `Bearer ${State.token}`;
  }

  return headers;
}

async function apiGet(url) {
  const res = await fetch(API_BASE + url, {
    method: "GET",
    headers: authHeaders(),
  });

  if (res.status === 401) {
    forceLogout("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
    throw new Error("Unauthorized");
  }

  if (!res.ok) throw new Error("API GET lỗi: " + url);
  return await res.json();
}

async function apiPost(url, data) {
  const res = await fetch(API_BASE + url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data || {}),
  });

  if (res.status === 401) {
    forceLogout("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    let msg = "API POST lỗi: " + url;
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch {}
    throw new Error(msg);
  }

  return await res.json();
}

async function apiPut(url, data) {
  const res = await fetch(API_BASE + url, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(data || {}),
  });

  if (res.status === 401) {
    forceLogout("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    let msg = "API PUT lỗi: " + url;
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch {}
    throw new Error(msg);
  }

  return await res.json();
}

/* =========================
   INIT
========================= */

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();

  if (!State.token) {
    showLogin();
    return;
  }

  try {
    await loadMe();
    showApp();
    await loadInitialData();
  } catch (err) {
    console.error(err);
    forceLogout("Vui lòng đăng nhập lại.");
  }
});

async function loadInitialData() {
  try {
    showLoading(true);

    State.areas = await apiGet("/api/areas");
    State.locations = await apiGet(`/api/locations?areaId=${State.currentAreaId}`);

    const area1Locations = await apiGet("/api/locations?areaId=1");
    const area2Locations = await apiGet("/api/locations?areaId=2");
    State.allLocations = [...area1Locations, ...area2Locations];

    State.stocks = await apiGet("/api/stocks");

    renderAll();
    applyPermissionUI();
  } catch (err) {
    console.error(err);
    toast(err.message || "Không tải được dữ liệu. Kiểm tra Worker/API.");
  } finally {
    showLoading(false);
  }
}

/* =========================
   AUTH
========================= */

async function login() {
  const username = clean($("loginUsername").value);
  const password = clean($("loginPassword").value);

  if (!username || !password) {
    toast("Vui lòng nhập tài khoản và mật khẩu.");
    return;
  }

  try {
    showLoading(true);

    const data = await fetch(API_BASE + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(async (res) => {
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Đăng nhập không thành công.");
      return json;
    });

    State.token = data.token;
    State.user = data.user;

    localStorage.setItem("warehouse_token", State.token);
    localStorage.setItem("warehouse_user", JSON.stringify(State.user));

    showApp();
    renderUser();
    await loadInitialData();

    toast("Đăng nhập thành công.");
  } catch (err) {
    console.error(err);
    toast(err.message || "Đăng nhập không thành công.");
  } finally {
    showLoading(false);
  }
}

async function logout() {
  try {
    if (State.token) {
      await apiPost("/api/logout", {});
    }
  } catch (err) {
    console.warn(err);
  }

  forceLogout("Đã đăng xuất.");
}

function forceLogout(message = "") {
  State.token = "";
  State.user = null;

  localStorage.removeItem("warehouse_token");
  localStorage.removeItem("warehouse_user");

  closeAllModals();
  showLogin();

  if (message) toast(message);
}

async function loadMe() {
  const data = await apiGet("/api/me");
  State.user = data.user;
  localStorage.setItem("warehouse_user", JSON.stringify(State.user));
  renderUser();
}

function showLogin() {
  $("loginScreen")?.classList.remove("hidden");
  $("appShell")?.classList.add("hidden");
}

function showApp() {
  $("loginScreen")?.classList.add("hidden");
  $("appShell")?.classList.remove("hidden");
  renderUser();
}

function renderUser() {
  $("currentUserName") &&
    ($("currentUserName").textContent = State.user?.full_name || "Người dùng");

  $("currentUserRole") &&
    ($("currentUserRole").textContent = State.user?.role || "");
}

function isAdmin() {
  return State.user?.role === "admin";
}

function canEdit() {
  return State.user?.role === "admin" || State.user?.role === "staff";
}

function applyPermissionUI() {
  const editable = canEdit();
  const admin = isAdmin();

  $("btnAddRow") && ($("btnAddRow").style.display = admin ? "" : "none");
  $("btnAddSlot") && ($("btnAddSlot").style.display = admin ? "" : "none");
  $("btnOpenAddStock") && ($("btnOpenAddStock").style.display = editable ? "" : "none");
  $("btnOpenLogs") && ($("btnOpenLogs").style.display = admin ? "" : "none");
}

/* =========================
   EVENTS
========================= */

function bindEvents() {
  $("btnLogin")?.addEventListener("click", login);

  $("loginPassword")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });

  $("loginUsername")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });

  $("btnLogout")?.addEventListener("click", logout);
  $("btnRefresh")?.addEventListener("click", loadInitialData);

  $("btnExportExcel")?.addEventListener("click", () => exportExcelByArea(false));
  $("btnExportAllExcel")?.addEventListener("click", () => exportExcelByArea(true));

  $("btnOpenLogs")?.addEventListener("click", openLogsModal);
  $("btnCloseLogsModal")?.addEventListener("click", closeLogsModal);
  $("btnCloseLogs")?.addEventListener("click", closeLogsModal);
  $("btnReloadLogs")?.addEventListener("click", loadLogs);

  $("btnSearch")?.addEventListener("click", handleSearch);

  $("globalSearch")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  });

  $("globalSearch")?.addEventListener("search", () => {
    if (clean($("globalSearch").value)) handleSearch();
  });

  $("globalSearch")?.addEventListener("change", () => {
    if (clean($("globalSearch").value)) handleSearch();
  });

  $("globalSearch")?.addEventListener("input", () => {
    if (!clean($("globalSearch").value)) clearSearch();
  });

  $("btnClearSearch")?.addEventListener("click", clearSearch);
  $("btnCloseSearchResult")?.addEventListener("click", clearSearch);
  $("btnExportSearchExcel")?.addEventListener("click", exportSearchExcel);

  $("btnViewGrid")?.addEventListener("click", () => switchView("grid"));
  $("btnViewTable")?.addEventListener("click", () => switchView("table"));

  $("btnAddRow")?.addEventListener("click", openRowModal);
  $("btnAddSlot")?.addEventListener("click", openSlotModal);
  $("btnOpenAddStock")?.addEventListener("click", () => openStockModal());

  $("btnShowEmpty")?.addEventListener("click", () => {
    State.filterMode = "empty";
    renderLocations();
  });

  $("btnShowInStock")?.addEventListener("click", () => {
    State.filterMode = "used";
    renderLocations();
  });

  document.querySelectorAll(".area-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const areaId = Number(btn.dataset.areaId);
      const areaCode = btn.dataset.areaCode;
      selectArea(areaId, areaCode, btn);
    });
  });

  bindModalEvents();
}

function bindModalEvents() {
  $("btnCloseStockModal")?.addEventListener("click", closeStockModal);
  $("btnCancelStock")?.addEventListener("click", closeStockModal);
  $("btnSaveStock")?.addEventListener("click", saveStock);

  $("stockArea")?.addEventListener("change", async () => {
    await loadLocationsForSelect("stockArea", "stockLocation");
  });

  $("btnCloseMoveModal")?.addEventListener("click", closeMoveModal);
  $("btnCancelMove")?.addEventListener("click", closeMoveModal);
  $("btnConfirmMove")?.addEventListener("click", confirmMove);

  $("btnCloseRowModal")?.addEventListener("click", closeRowModal);
  $("btnCancelRow")?.addEventListener("click", closeRowModal);
  $("btnSaveRow")?.addEventListener("click", saveRow);

  $("btnCloseSlotModal")?.addEventListener("click", closeSlotModal);
  $("btnCancelSlot")?.addEventListener("click", closeSlotModal);
  $("btnSaveSlot")?.addEventListener("click", saveSlot);
  $("slotArea")?.addEventListener("change", toggleSlotShelfGroup);

  $("btnCloseDetailModal")?.addEventListener("click", closeDetailModal);
  $("btnCloseDetail")?.addEventListener("click", closeDetailModal);

  $("btnAddStockFromDetail")?.addEventListener("click", () => {
    if (!canEdit()) return toast("Bạn không có quyền thêm hàng.");

    const locationId = State.selectedLocationId;
    closeDetailModal();

    setTimeout(() => {
      openStockModal(null, locationId);
    }, 120);
  });

  $("btnClosePartialExportModal")?.addEventListener("click", closePartialExportModal);
  $("btnCancelPartialExport")?.addEventListener("click", closePartialExportModal);
  $("btnConfirmPartialExport")?.addEventListener("click", confirmPartialExport);
}

/* =========================
   AREA
========================= */

async function selectArea(areaId, areaCode, btn) {
  try {
    showLoading(true);

    State.currentAreaId = areaId;
    State.currentAreaCode = areaCode;
    State.filterMode = "all";
    State.currentAreaName = areaId === 1 ? "Kho thành phẩm" : "Lầu 6";

    document.querySelectorAll(".area-item").forEach((x) => x.classList.remove("active"));
    btn.classList.add("active");

    State.locations = await apiGet(`/api/locations?areaId=${areaId}`);

    renderAll();
    applyPermissionUI();
  } catch (err) {
    console.error(err);
    toast("Không tải được khu vực.");
  } finally {
    showLoading(false);
  }
}

/* =========================
   RENDER
========================= */

function renderAll() {
  renderHeader();
  renderSummary();
  renderLocations();
  renderTable();
}

function renderHeader() {
  $("currentAreaTitle").textContent = State.currentAreaName;

  $("currentAreaDesc").textContent =
    State.currentAreaId === 1
      ? "Sơ đồ Kho thành phẩm: Dãy → Kệ → Ô"
      : "Sơ đồ Lầu 6: Dãy → Ô";
}

function renderSummary() {
  const locationIds = State.locations.map((x) => Number(x.id));

  const activeStocks = State.stocks.filter(
    (s) =>
      String(s.status || "in_stock") === "in_stock" &&
      locationIds.includes(Number(s.location_id))
  );

  const usedLocationIds = new Set(activeStocks.map((s) => Number(s.location_id)));

  $("totalLocations").textContent = State.locations.length;
  $("usedLocations").textContent = usedLocationIds.size;
  $("emptyLocations").textContent = Math.max(State.locations.length - usedLocationIds.size, 0);

  $("totalCartons").textContent = activeStocks.reduce(
    (sum, s) => sum + Number(s.carton_qty || 0),
    0
  );
}

function renderLocations() {
  const grid = $("warehouseGrid");
  if (!grid) return;

  let locations = [...State.locations];

  if (State.filterMode === "empty") {
    locations = locations.filter((loc) => getStocksByLocation(loc.id).length === 0);
  }

  if (State.filterMode === "used") {
    locations = locations.filter((loc) => getStocksByLocation(loc.id).length > 0);
  }

  if (!locations.length) {
    grid.innerHTML = `<div class="empty-state">Không có vị trí phù hợp.</div>`;
    return;
  }

  const grouped = groupBy(locations, "row_no");

  grid.innerHTML = Object.keys(grouped)
    .sort((a, b) => Number(a) - Number(b))
    .map((rowNo) => {
      const rowLocations = grouped[rowNo].sort(sortLocation);

      if (State.currentAreaId === 1) {
        const shelfGroups = groupBy(rowLocations, "shelf_no");

        return `
          <div class="warehouse-row-map">
            <div class="warehouse-row-title">
              <div>
                <span class="row-badge">DÃY ${String(rowNo).padStart(2, "0")}</span>
                <h3>Kho thành phẩm - 3 kệ, mỗi kệ 12 ô</h3>
              </div>
              <small>${rowLocations.length} vị trí</small>
            </div>

            ${Object.keys(shelfGroups)
              .sort((a, b) => Number(a) - Number(b))
              .map((shelfNo) => {
                const shelfLocations = shelfGroups[shelfNo].sort(sortLocation);

                return `
                  <div class="shelf-group">
                    <div class="shelf-group-title">
                      <strong>KỆ ${shelfNo}</strong>
                      <span>${shelfLocations.length} ô</span>
                    </div>

                    <div class="shelf-map ktp-slot-grid">
                      ${shelfLocations.map(renderShelfBox).join("")}
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        `;
      }

      return `
        <div class="warehouse-row-map">
          <div class="warehouse-row-title">
            <div>
              <span class="row-badge">DÃY ${String(rowNo).padStart(2, "0")}</span>
              <h3>Lầu 6</h3>
            </div>
            <small>${rowLocations.length} vị trí</small>
          </div>

          <div class="shelf-map twenty-slot-grid">
            ${rowLocations.map(renderShelfBox).join("")}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderShelfBox(loc) {
  const stocks = getStocksByLocation(loc.id);
  const totalCarton = stocks.reduce((sum, s) => sum + Number(s.carton_qty || 0), 0);

  const isEmpty = stocks.length === 0;
  const statusClass = isEmpty ? "empty" : totalCarton >= 50 ? "full" : "used";

  const shelfName =
    Number(loc.area_id) === 1
      ? `K${loc.shelf_no || getKtpShelfNo(loc.level_no)} - Ô ${String(
          loc.slot_no || getKtpSlotNo(loc.level_no)
        ).padStart(2, "0")}`
      : `Ô ${String(loc.slot_no || loc.level_no).padStart(2, "0")}`;

  const stockHtml = isEmpty
    ? `<div class="shelf-empty">TRỐNG</div>`
    : `
      <div class="shelf-stock-list">
        ${stocks
          .slice(0, 3)
          .map(
            (s) => `
              <div class="shelf-stock-item">
                <strong>${esc(s.style_code)}</strong>
                <span>${esc(s.po_no)}</span>
                <b>${Number(s.carton_qty || 0)} KIỆN</b>
              </div>
            `
          )
          .join("")}
        ${
          stocks.length > 3
            ? `<div class="shelf-more">+${stocks.length -
