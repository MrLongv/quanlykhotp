const API_BASE = "https://warehouse-api.longvanasb.workers.dev";

const KTP_NORMAL_MAX_ROWS = 20;
const KTP_N_ROW_NO = 21;
const KTP_N_SLOTS = 30;
const KTP_G_ROW_NO = 22;
const KTP_G_SLOTS = 11;
const KTP_MAX_ROWS = 22;

const KTP_SHELVES_PER_ROW = 3;
const KTP_SLOTS_PER_SHELF = 6;
const L6_MAX_ROWS = 11;
const L6_DEFAULT_SLOTS_PER_ROW = 20;
const NX_MAX_ROWS = 9;
const NX_DEFAULT_SLOTS_PER_ROW = 4;
const NX_SLOT_LABELS = ["A", "B", "C", "D"];

const $ = (id) => document.getElementById(id);

let BODY_SCROLL_Y = 0;

function readSavedUser() {
  try {
    return JSON.parse(localStorage.getItem("warehouse_user") || "null");
  } catch {
    localStorage.removeItem("warehouse_user");
    return null;
  }
}

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
  stockMapByLocation: new Map(),
  locationMapById: new Map(),
  locationIdSet: new Set(),
  searchResults: [],
  pendingTransfers: [],
  selectedLocationId: null,
  token: localStorage.getItem("warehouse_token") || "",
  user: readSavedUser(),
};

function getAreaCodeById(areaId) {
  const id = Number(areaId || 0);
  if (id === 1) return "KTP";
  if (id === 2) return "L6";
  if (id === 3) return "NX";

  const area = State.areas.find((x) => Number(x.id) === id);
  return area?.code || "";
}

function getAreaMaxRows(areaId) {
  const code = getAreaCodeById(areaId);
  if (code === "KTP") return KTP_MAX_ROWS;
  if (code === "L6") return L6_MAX_ROWS;
  if (code === "NX") return NX_MAX_ROWS;
  return 20;
}

function getDefaultSlotsPerRow(areaId, rowNo = 0) {
  const code = getAreaCodeById(areaId);

  if (code === "KTP" && Number(rowNo) === KTP_N_ROW_NO) return KTP_N_SLOTS;
  if (code === "KTP" && Number(rowNo) === KTP_G_ROW_NO) return KTP_G_SLOTS;
  if (code === "KTP") return KTP_SLOTS_PER_SHELF;
  if (code === "L6") return L6_DEFAULT_SLOTS_PER_ROW;
  if (code === "NX") return NX_DEFAULT_SLOTS_PER_ROW;

  return 20;
}

function isKtpArea(areaId) {
  return getAreaCodeById(areaId) === "KTP";
}

function getKtpSpecialRow(rowNo) {
  const row = Number(rowNo || 0);
  if (row === KTP_N_ROW_NO) return { code: "N", label: "Dãy N", slots: KTP_N_SLOTS };
  if (row === KTP_G_ROW_NO) return { code: "G", label: "Dãy G", slots: KTP_G_SLOTS };
  return null;
}

function isKtpSpecialRow(areaId, rowNo) {
  return isKtpArea(areaId) && !!getKtpSpecialRow(rowNo);
}

function isParkingArea(areaId) {
  return getAreaCodeById(areaId) === "NX";
}

function getKtpRowLabel(rowNo) {
  const row = Number(rowNo || 0);
  const special = getKtpSpecialRow(row);

  if (!row) return "";
  if (special) return special.label;
  if (row <= 3) return `Dãy ${row}`;
  if (row >= 4 && row <= 20) return `G${row - 3}`;

  return `Dãy ${row}`;
}

function getSlotLabel(areaId, slotNo) {
  const slot = Number(slotNo || 0);
  if (!slot) return "";
  if (isParkingArea(areaId)) return NX_SLOT_LABELS[slot - 1] || String(slot);
  return String(slot).padStart(2, "0");
}

/* =========================
   BODY SCROLL LOCK
========================= */

function isAnyModalOpen() {
  return Array.from(document.querySelectorAll(".modal-backdrop")).some(
    (el) => !el.classList.contains("hidden")
  );
}

function lockBodyScroll() {
  if (document.body.classList.contains("modal-open")) return;

  BODY_SCROLL_Y = window.scrollY || document.documentElement.scrollTop || 0;

  document.body.classList.add("modal-open");
  document.body.style.position = "fixed";
  document.body.style.top = `-${BODY_SCROLL_Y}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function unlockBodyScroll(force = false) {
  if (!force && isAnyModalOpen()) return;
  if (!document.body.classList.contains("modal-open")) return;

  document.body.classList.remove("modal-open");
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";

  window.scrollTo(0, BODY_SCROLL_Y || 0);
}

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

  if (!res.ok) {
    let msg = "API GET lỗi: " + url;
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch {}
    throw new Error(msg);
  }

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
    // Hiện giao diện ngay bằng thông tin user đã lưu,
    // đồng thời kiểm tra phiên đăng nhập và tải dữ liệu song song để giảm thời gian chờ.
    showApp();
    renderUser();

    await Promise.all([
      loadMe(),
      loadInitialData(),
    ]);
  } catch (err) {
    console.error(err);
    forceLogout("Vui lòng đăng nhập lại.");
  }
});

async function loadInitialData() {
  try {
    showLoading(true);

    const tasks = [loadCurrentAreaData()];

    // Khu vực rất ít thay đổi, chỉ đọc lần đầu để giảm request khi bấm Làm mới.
    if (!State.areas.length) {
      tasks.push(
        apiGet("/api/areas").then((areas) => {
          State.areas = areas || [];
        })
      );
    }

    await Promise.all(tasks);

    // Không tự đọc hàng chờ nhập khi mở web để giảm D1 read.
    // Chỉ tải khi bấm nút "Hàng chờ nhập".
    State.pendingTransfers = State.pendingTransfers || [];

    renderAll();
    applyPermissionUI();
  } catch (err) {
    console.error(err);
    toast(err.message || "Không tải được dữ liệu. Kiểm tra Worker/API.");
  } finally {
    showLoading(false);
  }
}

async function loadCurrentAreaData() {
  const areaId = Number(State.currentAreaId || 1);

  // Tải vị trí và hàng tồn song song để giảm thời gian chờ.
  const [locations, stocks] = await Promise.all([
    apiGet(`/api/locations?areaId=${areaId}`),
    apiGet(`/api/stocks?areaId=${areaId}&status=in_stock&limit=5000`),
  ]);

  State.locations = locations || [];

  // Mặc định chỉ giữ vị trí khu vực đang xem.
  // Khi cần chuyển hàng sang khu khác mới tải toàn bộ vị trí.
  State.allLocations = [...State.locations];
  rebuildLocationMaps();

  State.stocks = stocks || [];
  rebuildStockMap();
}

async function loadAllLocationsCached(force = false) {
  const areaIds = State.areas.length
    ? State.areas.map((x) => Number(x.id)).filter(Boolean)
    : [1, 2, 3];

  const hasAllAreas = areaIds.every((id) =>
    State.allLocations.some((x) => Number(x.area_id) === id)
  );

  if (!force && hasAllAreas) {
    return State.allLocations;
  }

  State.allLocations = await apiGet("/api/locations");
  rebuildLocationMaps();
  return State.allLocations;
}

function mergeStocks(rows) {
  (rows || []).forEach((row) => {
    const idx = State.stocks.findIndex((x) => Number(x.id) === Number(row.id));
    if (idx >= 0) {
      State.stocks[idx] = { ...State.stocks[idx], ...row };
    } else {
      State.stocks.push(row);
    }
  });

  rebuildStockMap();
}

/* =========================
   AUTH
========================= */

async function login() {
  const username = clean($("loginUsername")?.value);
  const password = clean($("loginPassword")?.value);

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

    blurActiveInput();

    showApp();
    renderUser();
    await loadInitialData();

    setTimeout(() => {
      blurActiveInput();
    }, 180);

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
  blurActiveInput();

  $("loginScreen")?.classList.add("hidden");
  $("appShell")?.classList.remove("hidden");
  renderUser();

  setTimeout(() => {
    blurActiveInput();
  }, 120);
}

function renderUser() {
  if ($("currentUserName")) {
    $("currentUserName").textContent = State.user?.full_name || "Người dùng";
  }

  if ($("currentUserRole")) {
    $("currentUserRole").textContent = State.user?.role || "";
  }
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

  if ($("btnAddRow")) $("btnAddRow").style.display = admin ? "" : "none";
  if ($("btnAddSlot")) $("btnAddSlot").style.display = admin ? "" : "none";
  if ($("btnOpenAddStock")) $("btnOpenAddStock").style.display = editable ? "" : "none";
  if ($("btnOpenLogs")) $("btnOpenLogs").style.display = admin ? "" : "none";
  if ($("btnOpenPendingTransfers")) $("btnOpenPendingTransfers").style.display = editable ? "" : "none";
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
      const areaCode = btn.datasetAreaCode || btn.dataset.areaCode;
      selectArea(areaId, areaCode, btn);
    });
  });

  setupBackTopButton();
  bindModalEvents();
  setupStockLocationPicker();
  setupCompleteTransferPicker();
  setupQuickJump();
}

function bindModalEvents() {
  $("btnCloseStockModal")?.addEventListener("click", closeStockModal);
  $("btnCancelStock")?.addEventListener("click", closeStockModal);
  $("btnSaveStock")?.addEventListener("click", saveStock);

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
  $("slotRowNo")?.addEventListener("input", toggleSlotShelfGroup);
  $("slotRowNo")?.addEventListener("change", toggleSlotShelfGroup);

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

  $("btnOpenPendingTransfers")?.addEventListener("click", openPendingTransferModal);
  $("btnClosePendingTransferModal")?.addEventListener("click", closePendingTransferModal);
  $("btnClosePendingTransfer")?.addEventListener("click", closePendingTransferModal);
  $("btnReloadPendingTransfer")?.addEventListener("click", loadPendingTransfers);

  $("btnCloseCompleteTransferModal")?.addEventListener("click", closeCompleteTransferModal);
  $("btnCancelCompleteTransfer")?.addEventListener("click", closeCompleteTransferModal);
  $("btnConfirmCompleteTransfer")?.addEventListener("click", confirmCompleteTransfer);
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
    State.currentAreaName = getAreaName(areaId);

    document.querySelectorAll(".area-item").forEach((x) => x.classList.remove("active"));
    btn?.classList.add("active");

    await loadCurrentAreaData();

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

  // Bảng có thể rất nhiều dòng, chỉ render khi người dùng đang xem dạng bảng.
  if (State.viewMode === "table") {
    renderTable();
  }

  renderPendingBadge();
}

function renderHeader() {
  if ($("currentAreaTitle")) {
    $("currentAreaTitle").textContent = State.currentAreaName;
  }

  if ($("currentAreaDesc")) {
    $("currentAreaDesc").textContent =
      isKtpArea(State.currentAreaId)
        ? `Sơ đồ Kho thành phẩm: 20 dãy chính (${getKtpRowLabel(1)}, ${getKtpRowLabel(2)}, ${getKtpRowLabel(3)}, G1-G17) + Dãy N 30 ô + Dãy G 11 ô`
        : isParkingArea(State.currentAreaId)
        ? `Sơ đồ Nhà xe: ${NX_MAX_ROWS} dãy, mỗi dãy 4 ô A, B, C, D`
        : `Sơ đồ Lầu 6: ${L6_MAX_ROWS} dãy, mỗi dãy ${L6_DEFAULT_SLOTS_PER_ROW} ô`;
  }
}

function renderSummary() {
  const usedLocationIds = new Set();
  let totalCartons = 0;

  State.stockMapByLocation.forEach((stocks, locationId) => {
    if (!State.locationIdSet.has(Number(locationId))) return;
    if (!stocks.length) return;

    usedLocationIds.add(Number(locationId));

    stocks.forEach((s) => {
      totalCartons += Number(s.carton_qty || 0);
    });
  });

  if ($("totalLocations")) $("totalLocations").textContent = State.locations.length;
  if ($("usedLocations")) $("usedLocations").textContent = usedLocationIds.size;
  if ($("emptyLocations")) {
    $("emptyLocations").textContent = Math.max(State.locations.length - usedLocationIds.size, 0);
  }
  if ($("totalCartons")) $("totalCartons").textContent = totalCartons;
}

function renderPendingBadge() {
  const btn = $("btnOpenPendingTransfers");
  if (!btn) return;

  const count = (State.pendingTransfers || []).length;
  btn.textContent = count > 0 ? `Hàng chờ nhập (${count})` : "Hàng chờ nhập";
}

function renderLocations() {
  const grid = $("warehouseGrid");
  if (!grid) return;

  let locations = [...State.locations].map((loc) => normalizeLocationParts(loc));

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

  if (isKtpArea(State.currentAreaId)) {
    renderKtpLocations(grid, locations);
  } else {
    renderSimpleAreaLocations(grid, locations);
  }
}

function renderKtpLocations(grid, locations) {
  const groupedRows = groupBy(locations, "row_no");

  grid.innerHTML = Object.keys(groupedRows)
    .sort((a, b) => Number(a) - Number(b))
    .map((rowNo) => {
      const rowNum = Number(rowNo);
      const special = getKtpSpecialRow(rowNum);
      const rowLocations = groupedRows[rowNo].sort(sortLocationByPosition);
      const groupedShelf = groupBy(rowLocations, "shelf_no");

      return `
        <div class="warehouse-row-map" data-row-jump="1-${rowNum}">
          <div class="warehouse-row-title">
            <div>
              <span class="row-badge">${getRowBadgeName(1, rowNo)}</span>
              <h3>${
                special
                  ? `Kho thành phẩm - ${special.label}, ${special.slots} ô`
                  : `Kho thành phẩm - ${KTP_SHELVES_PER_ROW} tầng, mỗi tầng ${KTP_SLOTS_PER_SHELF} ô`
              }</h3>
            </div>
            <small>${rowLocations.length} vị trí</small>
          </div>

          ${
            special
              ? `
                <div class="shelf-map twenty-slot-grid">
                  ${rowLocations.map(renderShelfBox).join("")}
                </div>
              `
              : `
                <div class="ktp-shelf-wrap">
                  ${Object.keys(groupedShelf)
                    .sort((a, b) => Number(a) - Number(b))
                    .map((shelfNo) => {
                      const shelfLocations = groupedShelf[shelfNo].sort(sortLocationByPosition);

                      return `
                        <div class="ktp-shelf-block">
                          <div class="ktp-shelf-title">
                            <strong>TẦNG ${shelfNo}</strong>
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
              `
          }
        </div>
      `;
    })
    .join("");
}

function renderSimpleAreaLocations(grid, locations) {
  const grouped = groupBy(locations, "row_no");

  grid.innerHTML = Object.keys(grouped)
    .sort((a, b) => Number(a) - Number(b))
    .map((rowNo) => {
      const rowLocations = grouped[rowNo].sort(sortLocationByPosition);

      return `
        <div class="warehouse-row-map" data-row-jump="${rowLocations[0]?.area_id || State.currentAreaId}-${Number(rowNo)}">
          <div class="warehouse-row-title">
            <div>
              <span class="row-badge">DÃY ${String(rowNo).padStart(2, "0")}</span>
              <h3>${esc(getAreaName(rowLocations[0]?.area_id || State.currentAreaId))}</h3>
            </div>
            <small>${rowLocations.length} vị trí</small>
          </div>

          <div class="shelf-map ${isParkingArea(rowLocations[0]?.area_id || State.currentAreaId) ? "four-slot-grid" : "twenty-slot-grid"}">
            ${rowLocations.map(renderShelfBox).join("")}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderShelfBox(rawLoc) {
  const loc = normalizeLocationParts(rawLoc);
  const stocks = getStocksByLocation(loc.id);
  const totalCarton = stocks.reduce((sum, s) => sum + Number(s.carton_qty || 0), 0);

  const isEmpty = stocks.length === 0;
  const statusClass = isEmpty ? "empty" : totalCarton >= 50 ? "full" : "used";

  const title = isParkingArea(loc.area_id)
    ? `Ô ${getSlotLabel(loc.area_id, loc.slot_no || loc.level_no)}`
    : `Ô ${getSlotLabel(loc.area_id, loc.slot_no || loc.level_no)}`;

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
            ? `<div class="shelf-more">+${stocks.length - 3} mã khác</div>`
            : ""
        }
      </div>
    `;

  return `
    <div class="shelf-box ${statusClass}">
      <div class="shelf-top">
        <strong>${title}</strong>
        <span>${esc(loc.location_code)}</span>
      </div>

      <div class="shelf-content">
        ${stockHtml}
      </div>

      <div class="shelf-actions">
        <button onclick="openDetailModal(${loc.id})">Chi tiết</button>
        ${
          canEdit()
            ? `<button onclick="openStockModal(null, ${loc.id})">+ Thêm</button>`
            : `<button disabled>Chỉ xem</button>`
        }
      </div>
    </div>
  `;
}

function renderTable() {
  const tbody = $("stockTableBody");
  if (!tbody) return;

  const currentLocationIds = new Set(State.locations.map((loc) => Number(loc.id)));

  const activeStocks = State.stocks.filter(
    (s) =>
      String(s.status || "in_stock") === "in_stock" &&
      currentLocationIds.has(Number(s.location_id))
  );

  if (!activeStocks.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center">Chưa có dữ liệu hàng tồn trong khu vực này.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = activeStocks
    .sort(sortStockByLocation)
    .map((s) => {
      const loc = normalizeLocationParts(getLocationById(s.location_id) || s);

      const actions = canEdit()
        ? `
          <button class="link-btn" onclick="editStockFromAnyModal(${s.id})">Sửa</button>
          <button class="link-btn" onclick="openMoveModal(${s.id})">Chuyển</button>
          <button class="link-btn transfer" onclick="createTransferTicket(${s.id})">Tạo phiếu chuyển</button>
          <button class="link-btn" onclick="openPartialExportModal(${s.id})">Xuất một phần</button>
          <button class="link-btn danger" onclick="markExported(${s.id})">Xuất hết</button>
        `
        : `<span class="muted-text">Chỉ xem</span>`;

      return `
        <tr>
          <td>${esc(loc.location_code || s.location_code || "")}</td>
          <td>${esc(getAreaName(loc.area_id || s.area_id))}</td>
          <td>${esc(getRowName(loc.area_id || s.area_id, loc.row_no || s.row_no))}</td>
          <td>${esc(getLevelText(loc))}</td>
          <td>${esc(s.style_code)}</td>
          <td>${esc(s.po_no)}</td>
          <td>${Number(s.carton_qty || 0)}</td>
          <td>${esc(s.note || "")}</td>
          <td>${actions}</td>
        </tr>
      `;
    })
    .join("");
}

/* =========================
   SEARCH
========================= */

async function handleSearch() {
  const q = clean($("globalSearch")?.value);

  if (!q) {
    toast("Nhập mã hàng hoặc PO cần tìm.");
    return;
  }

  try {
    showLoading(true);

    // Tìm kiếm trên Worker/D1 theo từ khóa, không cần tải toàn bộ stock về trình duyệt.
    const results = await apiGet(
      `/api/stocks/search?q=${encodeURIComponent(q)}`
    );

    mergeStocks(results);
    renderSearchResults(results);
  } catch (err) {
    console.error(err);
    toast(err.message || "Không tìm được dữ liệu.");
  } finally {
    showLoading(false);
  }
}

function renderSearchResults(results) {
  State.searchResults = results || [];

  const panel = $("searchResultPanel");
  const tbody = $("searchResultBody");
  if (!panel || !tbody) return;

  panel.classList.remove("hidden");

  if (!results.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center">Không tìm thấy hàng phù hợp.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = results
    .sort(sortStockByLocation)
    .map((s) => {
      const loc = normalizeLocationParts(getLocationById(s.location_id) || s);

      const actions = canEdit()
        ? `
          <button class="link-btn" onclick="openDetailModal(${s.location_id})">Xem vị trí</button>
          <button class="link-btn" onclick="editStockFromAnyModal(${s.id})">Sửa</button>
          <button class="link-btn transfer" onclick="createTransferTicket(${s.id})">Tạo phiếu chuyển</button>
          <button class="link-btn" onclick="openPartialExportModal(${s.id})">Xuất một phần</button>
          <button class="link-btn danger" onclick="markExported(${s.id})">Xuất hết</button>
        `
        : `<button class="link-btn" onclick="openDetailModal(${s.location_id})">Xem vị trí</button>`;

      return `
        <tr>
          <td>
            <strong>${esc(loc.location_code || s.location_code || "")}</strong>
           <div class="muted-text">
  ${esc(getAreaName(loc.area_id || s.area_id))} -
  ${esc(getRowName(loc.area_id || s.area_id, loc.row_no || s.row_no))} -
  ${esc(getLevelText(loc))}
</div>
          </td>
          <td>${esc(s.style_code)}</td>
          <td>${esc(s.po_no)}</td>
          <td>${esc(s.color || "")}</td>
          <td>${esc(s.size || "")}</td>
          <td>${Number(s.carton_qty || 0)}</td>
          <td>${esc(s.customer || "")}</td>
          <td>${actions}</td>
        </tr>
      `;
    })
    .join("");
}

function clearSearch() {
  if ($("globalSearch")) $("globalSearch").value = "";
  $("searchResultPanel")?.classList.add("hidden");
  State.searchResults = [];
}

/* =========================
   QUICK JUMP ROW
========================= */

function setupQuickJump() {
  buildJumpRows();

  $("jumpArea")?.addEventListener("change", () => {
    buildJumpRows();
  });

  $("btnJumpRow")?.addEventListener("click", jumpToSelectedRow);

  $("jumpRow")?.addEventListener("change", () => {
    jumpToSelectedRow();
  });
}

function buildJumpRows() {
  const areaId = Number($("jumpArea")?.value || State.currentAreaId || 1);
  const rowSelect = $("jumpRow");
  if (!rowSelect) return;

  rowSelect.innerHTML = `<option value="">Chọn dãy</option>`;

  const maxRow = getAreaMaxRows(areaId);

  for (let i = 1; i <= maxRow; i++) {
    rowSelect.insertAdjacentHTML(
      "beforeend",
      `<option value="${i}">${
  isKtpArea(areaId)
    ? getKtpRowLabel(i)
    : `Dãy ${String(i).padStart(2, "0")}`
}</option>`
    );
  }
}

async function jumpToSelectedRow() {
  const areaId = Number($("jumpArea")?.value || 1);
  const rowNo = Number($("jumpRow")?.value || 0);

  if (!rowNo) return toast("Vui lòng chọn dãy cần xem.");

  try {
    showLoading(true);

    if (Number(State.currentAreaId) !== areaId) {
      State.currentAreaId = areaId;
      State.currentAreaCode = getAreaCodeById(areaId);
      State.currentAreaName = getAreaName(areaId);
      State.filterMode = "all";

      document.querySelectorAll(".area-item").forEach((btn) => {
        btn.classList.toggle(
          "active",
          Number(btn.dataset.areaId) === areaId
        );
      });

      await loadCurrentAreaData();
      renderAll();
      applyPermissionUI();
    }

    setTimeout(() => {
      const target = document.querySelector(`[data-row-jump="${areaId}-${rowNo}"]`);

      if (!target) {
        toast(`Không tìm thấy Dãy ${rowNo}.`);
        return;
      }

      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      target.classList.add("row-highlight");

      setTimeout(() => {
        target.classList.remove("row-highlight");
      }, 1800);
    }, 120);

  } catch (err) {
    console.error(err);
    toast("Không nhảy tới dãy được.");
  } finally {
    showLoading(false);
  }
}

/* =========================
   STOCK LOCATION PICKER
========================= */

function setupStockLocationPicker() {
  $("stockArea")?.addEventListener("change", () => {
    resetStockPicker();
    buildStockRows();
    toggleStockShelf();
  });

  $("stockRow")?.addEventListener("change", () => {
    toggleStockShelf();
    buildStockSlots();
    resolveStockLocationId();
  });

  $("stockShelf")?.addEventListener("change", () => {
    buildStockSlots();
    resolveStockLocationId();
  });

  $("stockSlot")?.addEventListener("change", () => {
    resolveStockLocationId();
  });
}

function resetStockPicker() {
  if ($("stockRow")) $("stockRow").innerHTML = `<option value="">Chọn dãy</option>`;
  if ($("stockShelf")) $("stockShelf").value = "";
  if ($("stockSlot")) $("stockSlot").innerHTML = `<option value="">Chọn ô</option>`;
  if ($("stockLocation")) $("stockLocation").value = "";
}

function buildStockRows(selectedRow = "") {
  const areaId = Number($("stockArea")?.value || 1);
  const rowSelect = $("stockRow");
  if (!rowSelect) return;

  const rows = [
    ...new Set(
      State.allLocations
        .filter((loc) => Number(loc.area_id) === areaId)
        .map((loc) => Number(loc.row_no))
        .filter(Boolean)
    ),
  ].sort((a, b) => a - b);

  rowSelect.innerHTML = `<option value="">Chọn dãy</option>`;

  rows.forEach((rowNo) => {
    rowSelect.insertAdjacentHTML(
      "beforeend",
      `<option value="${rowNo}">${
  isKtpArea(areaId)
    ? getKtpRowLabel(rowNo)
    : `Dãy ${String(rowNo).padStart(2, "0")}`
}</option>`
    );
  });

  if (selectedRow) rowSelect.value = String(selectedRow);
}

function toggleStockShelf() {
  const areaId = Number($("stockArea")?.value || 1);
  const rowNo = Number($("stockRow")?.value || 0);
  const shelfGroup = $("stockShelfGroup");

  const showShelf = isKtpArea(areaId) && !isKtpSpecialRow(areaId, rowNo);

  if (shelfGroup) shelfGroup.style.display = showShelf ? "" : "none";
  if (!showShelf && $("stockShelf")) $("stockShelf").value = "";
}

function buildStockSlots(selectedSlot = "") {
  const areaId = Number($("stockArea")?.value || 1);
  const rowNo = Number($("stockRow")?.value || 0);
  const shelfNo = Number($("stockShelf")?.value || 0);
  const slotSelect = $("stockSlot");

  if (!slotSelect) return;

  slotSelect.innerHTML = `<option value="">Chọn ô</option>`;
  if (!rowNo) return;
  if (isKtpArea(areaId) && !isKtpSpecialRow(areaId, rowNo) && !shelfNo) return;

  const slots = State.allLocations
    .map((loc) => normalizeLocationParts(loc))
    .filter((loc) => {
      if (Number(loc.area_id) !== areaId) return false;
      if (Number(loc.row_no) !== rowNo) return false;
      if (isKtpArea(areaId)) {
        if (isKtpSpecialRow(areaId, rowNo)) return true;
        return Number(loc.shelf_no) === shelfNo;
      }
      return true;
    })
    .map((loc) => Number(loc.slot_no))
    .filter(Boolean)
    .sort((a, b) => a - b);

  slots.forEach((slotNo) => {
    slotSelect.insertAdjacentHTML(
      "beforeend",
      `<option value="${slotNo}">Ô ${getSlotLabel(areaId, slotNo)}</option>`
    );
  });

  if (selectedSlot) slotSelect.value = String(selectedSlot);
}

function resolveStockLocationId() {
  const areaId = Number($("stockArea")?.value || 1);
  const rowNo = Number($("stockRow")?.value || 0);
  const shelfNo = Number($("stockShelf")?.value || 0);
  const slotNo = Number($("stockSlot")?.value || 0);

  if ($("stockLocation")) $("stockLocation").value = "";

  if (!areaId || !rowNo || !slotNo) return;
  if (isKtpArea(areaId) && !isKtpSpecialRow(areaId, rowNo) && !shelfNo) return;

  const found = State.allLocations
    .map((loc) => normalizeLocationParts(loc))
    .find((loc) => {
      if (Number(loc.area_id) !== areaId) return false;
      if (Number(loc.row_no) !== rowNo) return false;
      if (Number(loc.slot_no) !== slotNo) return false;
      if (isKtpArea(areaId)) {
        if (isKtpSpecialRow(areaId, rowNo)) return true;
        return Number(loc.shelf_no) === shelfNo;
      }
      return true;
    });

  if (found && $("stockLocation")) $("stockLocation").value = found.id;
}

function fillPickerByLocation(locationId) {
  const loc = normalizeLocationParts(getLocationById(locationId));
  if (!loc) return;

  if ($("stockArea")) $("stockArea").value = String(loc.area_id);

  resetStockPicker();
  buildStockRows(loc.row_no);

  if (isKtpArea(loc.area_id) && !isKtpSpecialRow(loc.area_id, loc.row_no) && $("stockShelf")) {
    $("stockShelf").value = String(loc.shelf_no);
  }

  toggleStockShelf();
  buildStockSlots(loc.slot_no);

  if ($("stockSlot")) $("stockSlot").value = String(loc.slot_no);

  resolveStockLocationId();
}

/* =========================
   STOCK MODAL
========================= */

async function openStockModal(stockId = null, locationId = null) {
  if (!canEdit()) return toast("Bạn không có quyền thêm/sửa hàng.");

  closeMoveModal(false);
  closePartialExportModal(false);

  $("stockModal")?.classList.remove("hidden");
  lockBodyScroll();

  if ($("stockModalTitle")) {
    $("stockModalTitle").textContent = stockId ? "Sửa thông tin hàng" : "Thêm hàng vào vị trí";
  }

  resetStockForm();
  resetStockPicker();
  toggleStockShelf();
  buildStockRows();

  if (locationId) fillPickerByLocation(locationId);

  if (stockId) {
    const s = State.stocks.find((x) => Number(x.id) === Number(stockId));
    if (!s) return;

    $("stockId").value = s.id;

    fillPickerByLocation(s.location_id);

    $("styleCode").value = s.style_code || "";
    $("poNo").value = s.po_no || "";
    $("color").value = s.color || "";
    $("size").value = s.size || "";
    $("cartonQty").value = s.carton_qty || 0;
    $("customer").value = s.customer || "";
    $("note").value = s.note || "";
  }
}

function closeStockModal() {
  $("stockModal")?.classList.add("hidden");
  unlockBodyScroll();
}

function resetStockForm() {
  if ($("stockId")) $("stockId").value = "";
  if ($("stockArea")) $("stockArea").value = State.currentAreaId;
  if ($("stockLocation")) $("stockLocation").value = "";
  if ($("stockRow")) $("stockRow").value = "";
  if ($("stockShelf")) $("stockShelf").value = "";
  if ($("stockSlot")) $("stockSlot").value = "";
  if ($("styleCode")) $("styleCode").value = "";
  if ($("poNo")) $("poNo").value = "";
  if ($("color")) $("color").value = "";
  if ($("size")) $("size").value = "";
  if ($("cartonQty")) $("cartonQty").value = "";
  if ($("customer")) $("customer").value = "";
  if ($("note")) $("note").value = "";
}

async function saveStock() {
  if (!canEdit()) return toast("Bạn không có quyền lưu hàng.");

  resolveStockLocationId();

  const id = $("stockId").value;

  const payload = {
    location_id: Number($("stockLocation").value),
    style_code: clean($("styleCode").value),
    po_no: clean($("poNo").value),
    color: clean($("color").value),
    size: clean($("size").value),
    carton_qty: Number($("cartonQty").value || 0),
    customer: clean($("customer").value),
    note: clean($("note").value),
  };

  if (!payload.location_id) return toast("Vui lòng chọn đủ Khu vực, Dãy, Tầng/Ô.");
  if (!payload.style_code) return toast("Vui lòng nhập mã hàng.");
  if (!payload.po_no) return toast("Vui lòng nhập PO.");
  if (payload.carton_qty < 0) return toast("Số kiện không hợp lệ.");

  try {
    showLoading(true);

    if (id) {
      await apiPut(`/api/stocks/${id}`, payload);
      toast("Đã cập nhật hàng.");
    } else {
      await apiPost("/api/stocks", payload);
      toast("Đã thêm hàng vào vị trí.");
    }

    closeAllModals();
    await reloadStocksAndLocations();
  } catch (err) {
    console.error(err);
    toast(err.message || "Lưu không thành công.");
  } finally {
    showLoading(false);
  }
}

/* =========================
   MOVE STOCK
========================= */

async function openMoveModal(stockId) {
  if (!canEdit()) return toast("Bạn không có quyền chuyển vị trí.");

  closeStockModal();
  closeDetailModal();
  closePartialExportModal(false);

  const s = State.stocks.find((x) => Number(x.id) === Number(stockId));
  if (!s) return;

  const loc = normalizeLocationParts(getLocationById(s.location_id) || s);

  $("moveModal")?.classList.remove("hidden");
  lockBodyScroll();

  $("moveStockId").value = stockId;

  $("moveStockInfo").innerHTML = `
    <div class="info-box">
      <strong>${esc(s.po_no)} - ${esc(s.style_code)}</strong>
      <p>Đang ở: ${esc(loc.location_code || s.location_code || "")}</p>
      <p>${esc(getAreaName(loc.area_id))} - ${esc(getRowName(loc.area_id, loc.row_no))} - ${esc(getLevelText(loc))}</p>
      <p>Số kiện: ${Number(s.carton_qty || 0)}</p>
    </div>
  `;

  await loadAllLocationsForMove();
}

function closeMoveModal(clear = true) {
  $("moveModal")?.classList.add("hidden");
  unlockBodyScroll();

  if (clear) {
    if ($("moveStockId")) $("moveStockId").value = "";
    if ($("moveReason")) $("moveReason").value = "";
  }
}

async function confirmMove() {
  if (!canEdit()) return toast("Bạn không có quyền chuyển vị trí.");

  const stockId = $("moveStockId").value;
  const newLocationId = Number($("moveLocation").value);
  const reason = clean($("moveReason").value);

  if (!newLocationId) return toast("Vui lòng chọn vị trí mới.");

  try {
    showLoading(true);

    await apiPost(`/api/stocks/${stockId}/move`, {
      location_id: newLocationId,
      reason,
    });

    closeAllModals();
    toast("Đã chuyển vị trí.");
    await reloadStocksAndLocations();
  } catch (err) {
    console.error(err);
    toast(err.message || "Chuyển vị trí không thành công.");
  } finally {
    showLoading(false);
  }
}

/* =========================
   ADD ROW
========================= */

function openRowModal() {
  if (!isAdmin()) return toast("Chỉ admin được thêm dãy.");

  closeAllModals();
  $("rowModal")?.classList.remove("hidden");
  lockBodyScroll();

  $("rowArea").value = State.currentAreaId;
  $("newRowNo").value = "";
}

function closeRowModal() {
  $("rowModal")?.classList.add("hidden");
  unlockBodyScroll();
}

async function saveRow() {
  if (!isAdmin()) return toast("Chỉ admin được thêm dãy.");

  const areaId = Number($("rowArea").value);
  const rowNo = Number($("newRowNo").value);

  if (!areaId) return toast("Vui lòng chọn khu vực.");
  if (!rowNo || rowNo < 1) return toast("Số dãy không hợp lệ.");
  if (isKtpArea(areaId) && rowNo > KTP_MAX_ROWS) {
    return toast(`Kho thành phẩm chỉ có tối đa ${KTP_MAX_ROWS} dãy.`);
  }

  try {
    showLoading(true);

    await apiPost("/api/locations/add-row", {
      area_id: areaId,
      row_no: rowNo,
    });

    closeAllModals();
    toast("Đã thêm dãy mới.");

    if (areaId === State.currentAreaId) {
      await reloadStocksAndLocations();
    } else {
      await loadInitialData();
    }
  } catch (err) {
    console.error(err);
    toast(err.message || "Không thêm được dãy. Có thể dãy đã tồn tại.");
  } finally {
    showLoading(false);
  }
}

/* =========================
   ADD SLOT
========================= */

function openSlotModal() {
  if (!isAdmin()) return toast("Chỉ admin được thêm ô.");

  closeAllModals();

  $("slotModal")?.classList.remove("hidden");
  lockBodyScroll();

  $("slotArea").value = State.currentAreaId;
  $("slotRowNo").value = "";
  $("slotShelfNo").value = "1";
  $("slotCount").value = "";

  toggleSlotShelfGroup();
}

function closeSlotModal() {
  $("slotModal")?.classList.add("hidden");
  unlockBodyScroll();
}

function toggleSlotShelfGroup() {
  const areaId = Number($("slotArea")?.value || State.currentAreaId);
  const rowNo = Number($("slotRowNo")?.value || 0);
  const group = $("slotShelfGroup");

  if (!group) return;

  const showShelf = isKtpArea(areaId) && !isKtpSpecialRow(areaId, rowNo);
  group.style.display = showShelf ? "" : "none";

  if (!showShelf && $("slotShelfNo")) {
    $("slotShelfNo").value = "";
  }

  if ($("slotCount")) {
    $("slotCount").max = String(getDefaultSlotsPerRow(areaId, rowNo));
    $("slotCount").placeholder = isKtpSpecialRow(areaId, rowNo)
      ? `VD: ${getDefaultSlotsPerRow(areaId, rowNo)}`
      : isParkingArea(areaId)
      ? "VD: 1"
      : "VD: 3";
  }

  if ($("slotRowNo")) {
    $("slotRowNo").max = String(getAreaMaxRows(areaId));
  }
}

async function saveSlot() {
  if (!isAdmin()) return toast("Chỉ admin được thêm ô.");

  const areaId = Number($("slotArea").value);
  const rowNo = Number($("slotRowNo").value);
  const shelfNo = Number($("slotShelfNo").value || 0);
  const count = Number($("slotCount").value);

  if (!areaId) return toast("Vui lòng chọn khu vực.");
  if (!rowNo || rowNo < 1) return toast("Số dãy không hợp lệ.");
  if (!count || count < 1) return toast("Số ô cần thêm không hợp lệ.");
  if (rowNo > getAreaMaxRows(areaId)) {
    return toast(`${getAreaName(areaId)} chỉ có tối đa ${getAreaMaxRows(areaId)} dãy.`);
  }
  if (!isKtpArea(areaId) && count > getDefaultSlotsPerRow(areaId)) {
    return toast(`${getAreaName(areaId)} mỗi dãy tối đa ${getDefaultSlotsPerRow(areaId)} ô.`);
  }

  const payload = {
    area_id: areaId,
    row_no: rowNo,
    count,
  };

  if (isKtpArea(areaId)) {
    if (rowNo > getAreaMaxRows(areaId)) {
      return toast(`${getAreaName(areaId)} chỉ có tối đa ${getAreaMaxRows(areaId)} dãy.`);
    }

    if (isKtpSpecialRow(areaId, rowNo)) {
      const maxSlots = getDefaultSlotsPerRow(areaId, rowNo);
      if (count > maxSlots) {
        return toast(`${getKtpRowLabel(rowNo)} chỉ có tối đa ${maxSlots} ô.`);
      }
    } else {
      if (!shelfNo || shelfNo < 1 || shelfNo > KTP_SHELVES_PER_ROW) {
        return toast(`Kho TP chỉ có tầng 1 đến tầng ${KTP_SHELVES_PER_ROW}.`);
      }

      if (count > KTP_SLOTS_PER_SHELF) {
        return toast(`Mỗi tầng Kho TP chỉ có tối đa ${KTP_SLOTS_PER_SHELF} ô.`);
      }

      payload.shelf_no = shelfNo;
    }
  }

  try {
    showLoading(true);

    const res = await apiPost("/api/locations/add-slot", payload);

    closeAllModals();

    if (areaId === State.currentAreaId) {
      await reloadStocksAndLocations();
    } else {
      await loadInitialData();
    }

    toast(res.message || "Đã thêm ô mới.");
  } catch (err) {
    console.error(err);
    toast(err.message || "Không thêm được ô.");
  } finally {
    showLoading(false);
  }
}

/* =========================
   DETAIL MODAL
========================= */

function openDetailModal(locationId) {
  closeStockModal();
  closeMoveModal();
  closePartialExportModal(false);

  const loc = normalizeLocationParts(getLocationById(locationId));
  if (!loc) return;

  State.selectedLocationId = locationId;

  const stocks = getStocksByLocation(locationId);

  $("detailModal")?.classList.remove("hidden");
  lockBodyScroll();

  $("detailTitle").textContent = loc.location_code;
  $("detailSubTitle").textContent =
    isKtpArea(loc.area_id)
      ? isKtpSpecialRow(loc.area_id, loc.row_no)
        ? `Kho TP - ${getRowName(loc.area_id, loc.row_no)} - Ô ${getSlotLabel(loc.area_id, loc.slot_no || loc.level_no)}`
        : `Kho TP - ${getRowName(loc.area_id, loc.row_no)} - Tầng ${loc.shelf_no} - Ô ${getSlotLabel(loc.area_id, loc.slot_no)}`
      : `${getAreaName(loc.area_id)} - ${getRowName(loc.area_id, loc.row_no)} - Ô ${getSlotLabel(loc.area_id, loc.slot_no || loc.level_no)}`;

  if (!stocks.length) {
    $("detailContent").innerHTML = `<div class="empty-state">Vị trí này đang trống.</div>`;
    return;
  }

  $("detailContent").innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Mã hàng</th>
            <th>PO</th>
            <th>Màu</th>
            <th>Size</th>
            <th>Số kiện</th>
            <th>Khách hàng</th>
            <th>Ghi chú</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${stocks
            .map((s) => {
              const actions = canEdit()
                ? `
                  <button class="link-btn" onclick="editStockFromAnyModal(${s.id})">Sửa</button>
                  <button class="link-btn" onclick="openMoveModal(${s.id})">Chuyển</button>
                  <button class="link-btn transfer" onclick="createTransferTicket(${s.id})">Tạo phiếu chuyển</button>
                  <button class="link-btn" onclick="openPartialExportModal(${s.id})">Xuất một phần</button>
                  <button class="link-btn danger" onclick="markExported(${s.id})">Xuất hết</button>
                `
                : `<span class="muted-text">Chỉ xem</span>`;

              return `
                <tr>
                  <td>${esc(s.style_code)}</td>
                  <td>${esc(s.po_no)}</td>
                  <td>${esc(s.color || "")}</td>
                  <td>${esc(s.size || "")}</td>
                  <td>${Number(s.carton_qty || 0)}</td>
                  <td>${esc(s.customer || "")}</td>
                  <td>${esc(s.note || "")}</td>
                  <td>${actions}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function closeDetailModal() {
  $("detailModal")?.classList.add("hidden");
  State.selectedLocationId = null;
  unlockBodyScroll();
}

/* =========================
   PARTIAL EXPORT
========================= */

function openPartialExportModal(stockId) {
  if (!canEdit()) return toast("Bạn không có quyền xuất hàng.");

  closeDetailModal();
  closeStockModal();
  closeMoveModal();

  const s = State.stocks.find((x) => Number(x.id) === Number(stockId));
  if (!s) return toast("Không tìm thấy hàng.");

  const loc = normalizeLocationParts(getLocationById(s.location_id) || s);

  $("partialExportModal")?.classList.remove("hidden");
  lockBodyScroll();

  $("partialExportStockId").value = stockId;
  $("partialExportQty").value = "";
  $("partialExportNote").value = "";

  $("partialExportInfo").innerHTML = `
    <strong>${esc(s.po_no)} - ${esc(s.style_code)}</strong>
    <p>Vị trí: ${esc(loc.location_code || s.location_code || "")}</p>
    <p>${esc(getAreaName(loc.area_id))} - ${esc(getRowName(loc.area_id, loc.row_no))} - ${esc(getLevelText(loc))}</p>
    <p>Số kiện hiện có: <b>${Number(s.carton_qty || 0)}</b></p>
  `;
}

function closePartialExportModal(clear = true) {
  $("partialExportModal")?.classList.add("hidden");
  unlockBodyScroll();

  if (clear) {
    if ($("partialExportStockId")) $("partialExportStockId").value = "";
    if ($("partialExportQty")) $("partialExportQty").value = "";
    if ($("partialExportNote")) $("partialExportNote").value = "";
  }
}

async function confirmPartialExport() {
  if (!canEdit()) return toast("Bạn không có quyền xuất hàng.");

  const stockId = $("partialExportStockId").value;
  const qty = Number($("partialExportQty").value || 0);
  const note = clean($("partialExportNote").value);

  const s = State.stocks.find((x) => Number(x.id) === Number(stockId));
  if (!s) return toast("Không tìm thấy hàng.");

  const currentQty = Number(s.carton_qty || 0);

  if (!qty || qty <= 0) return toast("Vui lòng nhập số kiện xuất.");
  if (qty > currentQty) return toast("Số kiện xuất lớn hơn số kiện đang có.");

  const ok = confirm(`Xác nhận xuất ${qty} kiện? Còn lại ${currentQty - qty} kiện.`);
  if (!ok) return;

  try {
    showLoading(true);

    await apiPost(`/api/stocks/${stockId}/partial-export`, {
      carton_qty: qty,
      note,
    });

    closeAllModals();
    toast("Đã xuất một phần.");
    await reloadStocksAndLocations();
  } catch (err) {
    console.error(err);
    toast(err.message || "Xuất một phần không thành công.");
  } finally {
    showLoading(false);
  }
}

/* =========================
   EXPORTED
========================= */

async function markExported(stockId) {
  if (!canEdit()) return toast("Bạn không có quyền xuất hàng.");

  const ok = confirm("Đánh dấu lô hàng này đã xuất hết khỏi kho?");
  if (!ok) return;

  try {
    showLoading(true);

    await apiPost(`/api/stocks/${stockId}/exported`, {});
    toast("Đã đánh dấu xuất hết.");

    closeAllModals();
    await reloadStocksAndLocations();
  } catch (err) {
    console.error(err);
    toast(err.message || "Không cập nhật được trạng thái xuất.");
  } finally {
    showLoading(false);
  }
}

/* =========================
   TRANSFER PENDING
========================= */

async function loadPendingTransfersSilent() {
  try {
    State.pendingTransfers = await apiGet("/api/transfers/pending");
  } catch (err) {
    console.warn("Không tải được hàng chờ nhập:", err);
    State.pendingTransfers = [];
  }
}

async function loadPendingTransfers() {
  try {
    showLoading(true);
    State.pendingTransfers = await apiGet("/api/transfers/pending");
    renderPendingTransfers();
    renderPendingBadge();
  } catch (err) {
    console.error(err);
    toast(err.message || "Không tải được hàng chờ nhập.");
  } finally {
    showLoading(false);
  }
}

async function createTransferTicket(stockId) {
  if (!canEdit()) return toast("Bạn không có quyền tạo phiếu chuyển.");

  const s = State.stocks.find((x) => Number(x.id) === Number(stockId));
  if (!s) return toast("Không tìm thấy hàng.");

  const loc = normalizeLocationParts(getLocationById(s.location_id) || s);
  if (!loc) return toast("Không tìm thấy vị trí hàng.");

  const defaultTarget = isKtpArea(loc.area_id) ? 2 : 1;
  const targetAreaText = getAreaName(defaultTarget);

  const ok = confirm(
    `Tạo phiếu chuyển hàng này đến ${targetAreaText}?\n\n` +
      `Mã hàng: ${s.style_code}\n` +
      `PO: ${s.po_no}\n` +
      `Số kiện: ${Number(s.carton_qty || 0)}\n` +
      `Từ vị trí: ${loc.location_code || s.location_code || ""}`
  );

  if (!ok) return;

  try {
    showLoading(true);

    await apiPost("/api/transfers/create", {
      stock_id: stockId,
      target_area_id: defaultTarget,
      note: `Chờ chuyển từ ${loc.location_code || ""} đến ${targetAreaText}`,
    });

    toast("Đã tạo phiếu chuyển.");
    closeAllModals();

   await reloadStocksAndLocations();

// Chỉ tải hàng chờ nhập nếu modal đang mở,
// tránh tạo phiếu xong lại đọc thêm không cần thiết.
if (!$("pendingTransferModal")?.classList.contains("hidden")) {
  await loadPendingTransfers();
}
  } catch (err) {
    console.error(err);
    toast(err.message || "Không tạo được phiếu chuyển.");
  } finally {
    showLoading(false);
  }
}

async function openPendingTransferModal() {
  if (!canEdit()) return toast("Bạn không có quyền xem hàng chờ nhập.");

  closeAllModals();

  $("pendingTransferModal")?.classList.remove("hidden");
  lockBodyScroll();

  await loadPendingTransfers();
}

function closePendingTransferModal() {
  $("pendingTransferModal")?.classList.add("hidden");
  unlockBodyScroll();
}

function renderPendingTransfers() {
  const box = $("pendingTransferContent");
  if (!box) return;

  const rows = State.pendingTransfers || [];

  if (!rows.length) {
    box.innerHTML = `<div class="empty-state">Chưa có hàng chờ nhập.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Hàng</th>
            <th>Từ vị trí</th>
            <th>Đích</th>
            <th>Số kiện</th>
            <th>Người tạo</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (t) => `
              <tr>
                <td>
                  <strong>${esc(t.style_code)}</strong>
                  <div class="muted-text">PO: ${esc(t.po_no)}</div>
                  <div class="muted-text">${esc(t.color || "")} ${esc(t.size || "")}</div>
                </td>
                <td>${esc(t.from_location_code || "")}</td>
                <td>${esc(t.target_area_name || "")}</td>
                <td>${Number(t.carton_qty || 0)}</td>
                <td>
                  ${esc(t.created_by || "")}
                  <div class="muted-text">${esc(formatDateTime(t.created_at))}</div>
                </td>
                <td>
                  <button class="link-btn transfer" onclick="openCompleteTransferModal(${t.id})">
                    Nhập vào vị trí
                  </button>
                </td>
              </tr>
            `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function openCompleteTransferModal(transferId) {
  const t = (State.pendingTransfers || []).find((x) => Number(x.id) === Number(transferId));
  if (!t) return toast("Không tìm thấy phiếu chuyển.");

  try {
    showLoading(true);

    // Khi nhập hàng chờ vào vị trí mới mới tải đủ vị trí 2 khu.
    // Không tải lúc mở web để giảm D1 read.
    await loadAllLocationsCached();

    $("completeTransferModal")?.classList.remove("hidden");
    lockBodyScroll();

    $("completeTransferId").value = t.id;
    $("completeTransferArea").value = String(t.target_area_id);
    $("completeTransferLocation").value = "";
    $("completeTransferNote").value = "";

    $("completeTransferInfo").innerHTML = `
      <strong>${esc(t.style_code)} - PO ${esc(t.po_no)}</strong>
      <p>Từ vị trí: ${esc(t.from_location_code || "")}</p>
      <p>Đích: ${esc(t.target_area_name || "")}</p>
      <p>Số kiện: <b>${Number(t.carton_qty || 0)}</b></p>
    `;

    resetCompleteTransferPicker();
    buildCompleteTransferRows();
    toggleCompleteTransferShelf();
  } catch (err) {
    console.error(err);
    toast("Không tải được danh sách vị trí.");
  } finally {
    showLoading(false);
  }
}

function closeCompleteTransferModal() {
  $("completeTransferModal")?.classList.add("hidden");
  unlockBodyScroll();
}

async function confirmCompleteTransfer() {
  const transferId = Number($("completeTransferId")?.value || 0);

  resolveCompleteTransferLocationId();

  const locationId = Number($("completeTransferLocation")?.value || 0);
  const note = clean($("completeTransferNote")?.value || "");

  if (!transferId) return toast("Thiếu phiếu chuyển.");
  if (!locationId) return toast("Vui lòng chọn đủ vị trí nhập mới.");

  try {
    showLoading(true);

    await apiPost(`/api/transfers/${transferId}/complete`, {
      location_id: locationId,
      note,
    });

    toast("Đã nhập hàng vào vị trí mới.");

    closeAllModals();
    await reloadStocksAndLocations();
    await loadPendingTransfers();
  } catch (err) {
    console.error(err);
    toast(err.message || "Không nhập được hàng.");
  } finally {
    showLoading(false);
  }
}

/* =========================
   COMPLETE TRANSFER PICKER
========================= */

function setupCompleteTransferPicker() {
  $("completeTransferArea")?.addEventListener("change", () => {
    resetCompleteTransferPicker();
    buildCompleteTransferRows();
    toggleCompleteTransferShelf();
  });

  $("completeTransferRow")?.addEventListener("change", () => {
    toggleCompleteTransferShelf();
    buildCompleteTransferSlots();
    resolveCompleteTransferLocationId();
  });

  $("completeTransferShelf")?.addEventListener("change", () => {
    buildCompleteTransferSlots();
    resolveCompleteTransferLocationId();
  });

  $("completeTransferSlot")?.addEventListener("change", () => {
    resolveCompleteTransferLocationId();
  });
}

function resetCompleteTransferPicker() {
  if ($("completeTransferRow")) {
    $("completeTransferRow").innerHTML = `<option value="">Chọn dãy</option>`;
  }

  if ($("completeTransferShelf")) {
    $("completeTransferShelf").value = "";
  }

  if ($("completeTransferSlot")) {
    $("completeTransferSlot").innerHTML = `<option value="">Chọn ô</option>`;
  }

  if ($("completeTransferLocation")) {
    $("completeTransferLocation").value = "";
  }
}

function buildCompleteTransferRows() {
  const areaId = Number($("completeTransferArea")?.value || 1);
  const rowSelect = $("completeTransferRow");
  if (!rowSelect) return;

  const rows = [
    ...new Set(
      State.allLocations
        .filter((loc) => Number(loc.area_id) === areaId)
        .map((loc) => Number(loc.row_no))
        .filter(Boolean)
    ),
  ].sort((a, b) => a - b);

  rowSelect.innerHTML = `<option value="">Chọn dãy</option>`;

  rows.forEach((rowNo) => {
  rowSelect.insertAdjacentHTML(
    "beforeend",
    `<option value="${rowNo}">${
      isKtpArea(areaId)
        ? getKtpRowLabel(rowNo)
        : `Dãy ${String(rowNo).padStart(2, "0")}`
    }</option>`
  );
});
}

function toggleCompleteTransferShelf() {
  const areaId = Number($("completeTransferArea")?.value || 1);
  const rowNo = Number($("completeTransferRow")?.value || 0);
  const group = $("completeTransferShelfGroup");

  const showShelf = isKtpArea(areaId) && !isKtpSpecialRow(areaId, rowNo);

  if (group) group.style.display = showShelf ? "" : "none";

  if (!showShelf && $("completeTransferShelf")) {
    $("completeTransferShelf").value = "";
  }
}

function buildCompleteTransferSlots() {
  const areaId = Number($("completeTransferArea")?.value || 1);
  const rowNo = Number($("completeTransferRow")?.value || 0);
  const shelfNo = Number($("completeTransferShelf")?.value || 0);
  const slotSelect = $("completeTransferSlot");

  if (!slotSelect) return;

  slotSelect.innerHTML = `<option value="">Chọn ô</option>`;

  if (!rowNo) return;
  if (isKtpArea(areaId) && !isKtpSpecialRow(areaId, rowNo) && !shelfNo) return;

  const slots = State.allLocations
    .map((loc) => normalizeLocationParts(loc))
    .filter((loc) => {
      if (Number(loc.area_id) !== areaId) return false;
      if (Number(loc.row_no) !== rowNo) return false;

      if (isKtpArea(areaId)) {
        if (isKtpSpecialRow(areaId, rowNo)) return true;
        return Number(loc.shelf_no) === shelfNo;
      }

      return true;
    })
    .map((loc) => Number(loc.slot_no))
    .filter(Boolean)
    .sort((a, b) => a - b);

  slots.forEach((slotNo) => {
    slotSelect.insertAdjacentHTML(
      "beforeend",
      `<option value="${slotNo}">Ô ${getSlotLabel(areaId, slotNo)}</option>`
    );
  });
}

function resolveCompleteTransferLocationId() {
  const areaId = Number($("completeTransferArea")?.value || 1);
  const rowNo = Number($("completeTransferRow")?.value || 0);
  const shelfNo = Number($("completeTransferShelf")?.value || 0);
  const slotNo = Number($("completeTransferSlot")?.value || 0);

  if ($("completeTransferLocation")) {
    $("completeTransferLocation").value = "";
  }

  if (!areaId || !rowNo || !slotNo) return;
  if (isKtpArea(areaId) && !isKtpSpecialRow(areaId, rowNo) && !shelfNo) return;

  const found = State.allLocations
    .map((loc) => normalizeLocationParts(loc))
    .find((loc) => {
      if (Number(loc.area_id) !== areaId) return false;
      if (Number(loc.row_no) !== rowNo) return false;
      if (Number(loc.slot_no) !== slotNo) return false;

      if (isKtpArea(areaId)) {
        if (isKtpSpecialRow(areaId, rowNo)) return true;
        return Number(loc.shelf_no) === shelfNo;
      }

      return true;
    });

  if (found && $("completeTransferLocation")) {
    $("completeTransferLocation").value = found.id;
  }
}

/* =========================
   LOGS
========================= */

async function openLogsModal() {
  if (!isAdmin()) return toast("Chỉ admin được xem nhật ký.");

  $("logsModal")?.classList.remove("hidden");
  lockBodyScroll();

  await loadLogs();
}

function closeLogsModal() {
  $("logsModal")?.classList.add("hidden");
  unlockBodyScroll();
}

async function loadLogs() {
  if (!isAdmin()) return;

  const tbody = $("logsTableBody");
  if (!tbody) return;

  try {
    showLoading(true);

    const logs = await apiGet("/api/logs?limit=200");

    if (!logs.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center">Chưa có nhật ký thao tác.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = logs
      .map(
        (l) => `
          <tr>
            <td>${esc(formatDateTime(l.created_at))}</td>
            <td>${esc(l.user_name || "")}</td>
            <td>${esc(l.action || "")}</td>
            <td>${esc(l.style_code || "")}</td>
            <td>${esc(l.po_no || "")}</td>
            <td>${esc(l.content || "")}</td>
            <td>${l.old_carton_qty ?? ""}</td>
            <td>${l.new_carton_qty ?? ""}</td>
          </tr>
        `
      )
      .join("");
  } catch (err) {
    console.error(err);
    toast(err.message || "Không tải được nhật ký.");
  } finally {
    showLoading(false);
  }
}

/* =========================
   VIEW
========================= */

function switchView(mode) {
  State.viewMode = mode;

  $("btnViewGrid")?.classList.toggle("active", mode === "grid");
  $("btnViewTable")?.classList.toggle("active", mode === "table");

  $("warehouseGrid")?.classList.toggle("hidden", mode !== "grid");
  $("tablePanel")?.classList.toggle("hidden", mode !== "table");

  if (mode === "table") {
    renderTable();
  } else {
    renderLocations();
  }
}

/* =========================
   SELECT LOADERS - MOVE ONLY
========================= */

async function loadAllLocationsForMove() {
  const select = $("moveLocation");
  if (!select) return;

  select.innerHTML = `<option value="">Chọn vị trí</option>`;

  const all = await loadAllLocationsCached();

  all
    .map((loc) => normalizeLocationParts(loc))
    .sort(sortLocationByPosition)
    .forEach((loc) => {
      select.insertAdjacentHTML(
        "beforeend",
        `<option value="${loc.id}">${esc(getLocationSelectText(loc))}</option>`
      );
    });
}
/* =========================
   RELOAD
========================= */

async function reloadStocksAndLocations() {
  await loadCurrentAreaData();

  // Không tự đọc hàng chờ nhập sau mỗi thao tác.
  // Nếu modal hàng chờ nhập đang mở thì người dùng có thể bấm "Tải lại".
  State.pendingTransfers = State.pendingTransfers || [];

  renderAll();
  applyPermissionUI();
}

/* =========================
   EXPORT EXCEL XLSX
========================= */

async function exportExcelByArea(exportAll = false) {
  if (typeof XLSX === "undefined") {
    toast("Chưa tải được thư viện Excel. Kiểm tra index.html.");
    return;
  }

  try {
    showLoading(true);

    let exportAreaId = exportAll ? 0 : Number(State.currentAreaId);
    let exportRows = [];

    if (exportAll) {
      // Chỉ khi bấm "Xuất tất cả" mới đọc toàn bộ stock.
      await loadAllLocationsCached();
      exportRows = await apiGet("/api/stocks?status=in_stock&limit=5000");
    } else {
      // Xuất khu hiện tại thì chỉ đọc khu hiện tại.
      exportRows = await apiGet(
        `/api/stocks?areaId=${exportAreaId}&status=in_stock&limit=5000`
      );
      mergeStocks(exportRows);
    }

    exportRows = exportRows
      .filter((s) => String(s.status || "in_stock") === "in_stock")
      .sort(sortStockByLocation);

    const data = buildExcelData(exportRows);

    if (!data.length) {
      toast("Không có dữ liệu để xuất.");
      return;
    }

    writeExcelFile(
      data,
      exportAreaId === 0
        ? "Toan bo kho"
        : exportAreaId === 1
        ? "Kho thanh pham"
        : exportAreaId === 2
        ? "Lau 6"
        : "Nha xe",
      exportAreaId === 0
        ? `ton-kho-toan-bo-${todayText()}.xlsx`
        : exportAreaId === 1
        ? `ton-kho-thanh-pham-${todayText()}.xlsx`
        : exportAreaId === 2
        ? `ton-kho-lau-6-${todayText()}.xlsx`
        : `ton-kho-nha-xe-${todayText()}.xlsx`
    );

    toast("Đã xuất Excel.");
  } catch (err) {
    console.error(err);
    toast(err.message || "Xuất Excel không thành công.");
  } finally {
    showLoading(false);
  }
}

function exportSearchExcel() {
  if (typeof XLSX === "undefined") {
    toast("Chưa tải được thư viện Excel.");
    return;
  }

  const rows = (State.searchResults || [])
    .filter((s) => String(s.status || "in_stock") === "in_stock")
    .sort(sortStockByLocation);

  if (!rows.length) {
    toast("Không có kết quả tìm kiếm để xuất.");
    return;
  }

  const data = buildExcelData(rows);

  const keyword = clean($("globalSearch")?.value || "tim-kiem")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-");

  writeExcelFile(
    data,
    "Ket qua tim kiem",
    `ket-qua-tim-kiem-${keyword}-${todayText()}.xlsx`
  );

  toast("Đã xuất Excel kết quả tìm kiếm.");
}

function buildExcelData(rows) {
  return rows.map((s) => {
    const loc = normalizeLocationParts(getLocationById(s.location_id) || s);

    return {
      "Khu vực": cleanExcelText(getAreaName(loc.area_id || s.area_id)),
      "Mã vị trí": cleanExcelText(loc.location_code || s.location_code),
      "Dãy": getRowName(loc.area_id || s.area_id, loc.row_no || s.row_no),
      "Kệ": isKtpArea(loc.area_id || s.area_id) && !isKtpSpecialRow(loc.area_id || s.area_id, loc.row_no || s.row_no)
        ? Number(loc.shelf_no || 0)
        : "",
      "Ô": isParkingArea(loc.area_id || s.area_id)
        ? getSlotLabel(loc.area_id || s.area_id, loc.slot_no || loc.level_no || 0)
        : Number(loc.slot_no || loc.level_no || 0),
      "Kệ/Ô": cleanExcelText(getLevelText(loc)),
      "Mã hàng": cleanExcelText(s.style_code),
      "PO": cleanExcelText(s.po_no),
      "Màu": cleanExcelText(s.color),
      "Size": cleanExcelText(s.size),
      "Số kiện": Number(s.carton_qty || 0),
      "Khách hàng": cleanExcelText(s.customer),
      "Ghi chú": cleanExcelText(s.note),
    };
  });
}

function writeExcelFile(data, sheetName, fileName) {
  const ws = XLSX.utils.json_to_sheet(data);

  ws["!cols"] = [
    { wch: 18 },
    { wch: 22 },
    { wch: 14 },
    { wch: 8 },
    { wch: 8 },
    { wch: 14 },
    { wch: 24 },
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
    { wch: 20 },
    { wch: 36 },
  ];

  ws["!autofilter"] = {
    ref: `A1:M${data.length + 1}`,
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

/* =========================
   BACK TO TOP
========================= */

function setupBackTopButton() {
  const btn = $("btnBackTop");
  if (!btn) return;

  const updateBackTop = () => {
    const y = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

    if (y > 360) {
      btn.classList.remove("hidden");
    } else {
      btn.classList.add("hidden");
    }
  };

  window.addEventListener("scroll", updateBackTop, { passive: true });
  document.addEventListener("scroll", updateBackTop, { passive: true });

  btn.addEventListener("click", () => {
    btn.classList.add("hidden");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });

    document.documentElement.scrollTo({
      top: 0,
      behavior: "smooth",
    });

    document.body.scrollTo({
      top: 0,
      behavior: "smooth",
    });

    setTimeout(() => {
      $("jumpRow")?.focus();
    }, 500);
  });

  updateBackTop();
}

/* =========================
   MODAL HELPERS
========================= */

function closeAllModals() {
  $("detailModal")?.classList.add("hidden");
  $("stockModal")?.classList.add("hidden");
  $("moveModal")?.classList.add("hidden");
  $("rowModal")?.classList.add("hidden");
  $("slotModal")?.classList.add("hidden");
  $("partialExportModal")?.classList.add("hidden");
  $("logsModal")?.classList.add("hidden");
  $("pendingTransferModal")?.classList.add("hidden");
  $("completeTransferModal")?.classList.add("hidden");

  State.selectedLocationId = null;
  unlockBodyScroll(true);
}

function editStockFromAnyModal(stockId) {
  if (!canEdit()) return toast("Bạn không có quyền sửa hàng.");

  closeAllModals();

  setTimeout(() => {
    openStockModal(stockId);
  }, 160);
}

/* =========================
   HELPERS
========================= */

function rebuildStockMap() {
  State.stockMapByLocation = new Map();

  (State.stocks || [])
    .filter((s) => String(s.status || "in_stock") === "in_stock")
    .forEach((s) => {
      const locationId = Number(s.location_id);
      if (!locationId) return;

      if (!State.stockMapByLocation.has(locationId)) {
        State.stockMapByLocation.set(locationId, []);
      }

      State.stockMapByLocation.get(locationId).push(s);
    });
}

function rebuildLocationMaps() {
  State.locationMapById = new Map();
  State.locationIdSet = new Set();

  (State.allLocations || []).forEach((loc) => {
    const id = Number(loc.id);
    if (!id) return;
    State.locationMapById.set(id, loc);
  });

  (State.locations || []).forEach((loc) => {
    const id = Number(loc.id);
    if (!id) return;
    State.locationIdSet.add(id);
    State.locationMapById.set(id, loc);
  });
}

function getStocksByLocation(locationId) {
  return State.stockMapByLocation.get(Number(locationId)) || [];
}

function getLocationById(id) {
  return State.locationMapById.get(Number(id)) || null;
}

function getAreaName(areaId) {
  const id = Number(areaId);
  if (id === 1) return "Kho thành phẩm";
  if (id === 2) return "Lầu 6";
  if (id === 3) return "Nhà xe";

  const area = State.areas.find((x) => Number(x.id) === id);
  return area?.name || "";
}

function getRowName(areaId, rowNo) {
  const row = Number(rowNo || 0);
  if (!row) return "";

  if (isKtpArea(areaId)) {
    return getKtpRowLabel(row);
  }

  return `Dãy ${row}`;
}

function getRowBadgeName(areaId, rowNo) {
  const row = Number(rowNo || 0);
  if (!row) return "";

  if (isKtpArea(areaId)) {
    return getKtpRowLabel(row).toUpperCase();
  }

  return `DÃY ${String(row).padStart(2, "0")}`;
}

function normalizeLocationParts(loc) {
  if (!loc) return null;

  const areaId = Number(loc.area_id || 0);
  const rowNo = Number(loc.row_no || 0);
  const levelNo = Number(loc.level_no || 0);

  let shelfNo = Number(loc.shelf_no || 0);
  let slotNo = Number(loc.slot_no || 0);

  if (isKtpArea(areaId)) {
    if (isKtpSpecialRow(areaId, rowNo)) {
      shelfNo = 0;
      if (!slotNo) slotNo = levelNo;
    } else {
      if (!shelfNo) shelfNo = Math.floor((levelNo - 1) / KTP_SLOTS_PER_SHELF) + 1;
      if (!slotNo) slotNo = ((levelNo - 1) % KTP_SLOTS_PER_SHELF) + 1;
    }
  } else {
    shelfNo = 0;
    if (!slotNo) slotNo = levelNo;
  }

  return {
    ...loc,
    area_id: areaId,
    row_no: rowNo,
    level_no: levelNo,
    shelf_no: shelfNo,
    slot_no: slotNo,
    slot_label: getSlotLabel(areaId, slotNo || levelNo),
  };
}

function getLevelText(loc) {
  const x = normalizeLocationParts(loc);
  if (!x) return "";

  if (isKtpArea(x.area_id)) {
    if (isKtpSpecialRow(x.area_id, x.row_no)) {
      return `Ô ${getSlotLabel(x.area_id, x.slot_no || x.level_no)}`;
    }

    return `Tầng ${x.shelf_no} - Ô ${getSlotLabel(x.area_id, x.slot_no)}`;
  }

  return `Ô ${getSlotLabel(x.area_id, x.slot_no || x.level_no)}`;
}

function getLocationSelectText(loc) {
  const x = normalizeLocationParts(loc);
  if (!x) return "";

  if (isKtpArea(x.area_id)) {
    if (isKtpSpecialRow(x.area_id, x.row_no)) {
      return `${x.location_code} - Kho TP - ${getRowName(x.area_id, x.row_no)} - Ô ${getSlotLabel(x.area_id, x.slot_no || x.level_no)}`;
    }

    return `${x.location_code} - Kho TP - ${getRowName(x.area_id, x.row_no)} - Tầng ${x.shelf_no} - Ô ${getSlotLabel(x.area_id, x.slot_no)}`;
  }

  return `${x.location_code} - ${getAreaName(x.area_id)} - ${getRowName(x.area_id, x.row_no)} - Ô ${getSlotLabel(x.area_id, x.slot_no || x.level_no)}`;
}

function sortLocationByPosition(a, b) {
  const ax = normalizeLocationParts(a);
  const bx = normalizeLocationParts(b);

  if (Number(ax.area_id) !== Number(bx.area_id)) return Number(ax.area_id) - Number(bx.area_id);
  if (Number(ax.row_no) !== Number(bx.row_no)) return Number(ax.row_no) - Number(bx.row_no);
  if (Number(ax.shelf_no) !== Number(bx.shelf_no)) return Number(ax.shelf_no) - Number(bx.shelf_no);
  return Number(ax.slot_no) - Number(bx.slot_no);
}

function sortStockByLocation(a, b) {
  const locA = normalizeLocationParts(getLocationById(a.location_id) || a);
  const locB = normalizeLocationParts(getLocationById(b.location_id) || b);

  return sortLocationByPosition(locA, locB);
}

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const value = item[key];
    acc[value] = acc[value] || [];
    acc[value].push(item);
    return acc;
  }, {});
}

function blurActiveInput() {
  try {
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }

    $("loginUsername")?.blur();
    $("loginPassword")?.blur();
    $("globalSearch")?.blur();
  } catch {}
}

function clean(v) {
  return String(v || "").trim();
}

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanExcelText(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\t/g, " ")
    .trim();
}

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(v) {
  if (!v) return "";

  let raw = String(v).trim();

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
    raw = raw.replace(" ", "T") + "Z";
  }

  return new Date(raw).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function toast(message) {
  const box = $("toast");
  const text = $("toastText");

  if (!box || !text) return alert(message);

  text.textContent = message;
  box.classList.remove("hidden");

  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    box.classList.add("hidden");
  }, 2500);
}

function showLoading(show) {
  $("loadingOverlay")?.classList.toggle("hidden", !show);
}

/* Cho phép gọi từ HTML onclick */
window.openStockModal = openStockModal;
window.openMoveModal = openMoveModal;
window.openDetailModal = openDetailModal;
window.openPartialExportModal = openPartialExportModal;
window.markExported = markExported;
window.editStockFromAnyModal = editStockFromAnyModal;
window.createTransferTicket = createTransferTicket;
window.openCompleteTransferModal = openCompleteTransferModal;
