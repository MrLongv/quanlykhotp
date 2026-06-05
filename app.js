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

  $("btnViewGrid")?.addEventListener("click", () => switchView("grid"));
  $("btnViewTable")?.addEventListener("click", () => switchView("table"));

  $("btnAddRow")?.addEventListener("click", openRowModal);
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
      ? "Sơ đồ Kho thành phẩm: mỗi dãy có 3 kệ/tầng"
      : "Sơ đồ Lầu 6: quản lý theo từng dãy và ô";
}

function renderSummary() {
  const locationIds = State.locations.map((x) => x.id);

  const activeStocks = State.stocks.filter(
    (s) => s.status === "in_stock" && locationIds.includes(Number(s.location_id))
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
      const rowLocations = grouped[rowNo].sort(
        (a, b) => Number(a.level_no) - Number(b.level_no)
      );

      return `
        <div class="warehouse-row-map">
          <div class="warehouse-row-title">
            <div>
              <span class="row-badge">DÃY ${String(rowNo).padStart(2, "0")}</span>
              <h3>${State.currentAreaName}</h3>
            </div>
            <small>${rowLocations.length} vị trí</small>
          </div>

          <div class="shelf-map ${
            State.currentAreaId === 1 ? "three-level" : "twenty-slot-grid"
          }">
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
    State.currentAreaId === 1
      ? `KỆ ${loc.level_no}`
      : `Ô ${String(loc.level_no).padStart(2, "0")}`;

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
        <strong>${shelfName}</strong>
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
      s.status === "in_stock" &&
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
      const loc = getLocationById(s.location_id);

      const levelText =
        Number(loc?.area_id) === 1
          ? `Kệ ${loc?.level_no}`
          : `Ô ${String(loc?.level_no).padStart(2, "0")}`;

      const actions = canEdit()
        ? `
          <button class="link-btn" onclick="editStockFromAnyModal(${s.id})">Sửa</button>
          <button class="link-btn" onclick="openMoveModal(${s.id})">Chuyển</button>
          <button class="link-btn" onclick="openPartialExportModal(${s.id})">Xuất một phần</button>
          <button class="link-btn danger" onclick="markExported(${s.id})">Xuất hết</button>
        `
        : `<span class="muted-text">Chỉ xem</span>`;

      return `
        <tr>
          <td>${esc(loc?.location_code || s.location_code || "")}</td>
          <td>${esc(getAreaName(loc?.area_id || s.area_id))}</td>
          <td>${esc(loc?.row_no || s.row_no || "")}</td>
          <td>${esc(levelText)}</td>
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

function handleSearch() {
  const q = clean($("globalSearch").value).toLowerCase();

  if (!q) {
    toast("Nhập mã hàng hoặc PO cần tìm.");
    return;
  }

  const results = State.stocks.filter((s) => {
    const loc = getLocationById(s.location_id);

    const text = [
      s.style_code,
      s.po_no,
      s.color,
      s.size,
      s.customer,
      s.note,
      loc?.location_code,
      s.location_code,
    ]
      .join(" ")
      .toLowerCase();

    return s.status === "in_stock" && text.includes(q);
  });

  renderSearchResults(results);
}

function renderSearchResults(results) {
  const panel = $("searchResultPanel");
  const tbody = $("searchResultBody");

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
      const loc = getLocationById(s.location_id);

      const actions = canEdit()
        ? `
          <button class="link-btn" onclick="openDetailModal(${s.location_id})">Xem vị trí</button>
          <button class="link-btn" onclick="editStockFromAnyModal(${s.id})">Sửa</button>
          <button class="link-btn" onclick="openPartialExportModal(${s.id})">Xuất một phần</button>
          <button class="link-btn danger" onclick="markExported(${s.id})">Xuất hết</button>
        `
        : `<button class="link-btn" onclick="openDetailModal(${s.location_id})">Xem vị trí</button>`;

      return `
        <tr>
          <td><strong>${esc(loc?.location_code || s.location_code || "")}</strong></td>
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
  $("globalSearch").value = "";
  $("searchResultPanel").classList.add("hidden");
}

/* =========================
   STOCK MODAL
========================= */

async function openStockModal(stockId = null, locationId = null) {
  if (!canEdit()) return toast("Bạn không có quyền thêm/sửa hàng.");

  closeMoveModal(false);
  closePartialExportModal(false);

  $("stockModal").classList.remove("hidden");
  $("stockModalTitle").textContent = stockId ? "Sửa thông tin hàng" : "Thêm hàng vào vị trí";

  resetStockForm();

  await loadLocationsForSelect("stockArea", "stockLocation");

  if (locationId) {
    const loc = getLocationById(locationId);
    if (loc) {
      $("stockArea").value = loc.area_id;
      await loadLocationsForSelect("stockArea", "stockLocation");
      $("stockLocation").value = locationId;
    }
  }

  if (stockId) {
    const s = State.stocks.find((x) => Number(x.id) === Number(stockId));
    if (!s) return;

    const loc = getLocationById(s.location_id);

    $("stockId").value = s.id;
    $("stockArea").value = loc?.area_id || s.area_id || State.currentAreaId;

    await loadLocationsForSelect("stockArea", "stockLocation");

    $("stockLocation").value = s.location_id;
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
}

function resetStockForm() {
  $("stockId").value = "";
  $("stockArea").value = State.currentAreaId;
  $("stockLocation").value = "";
  $("styleCode").value = "";
  $("poNo").value = "";
  $("color").value = "";
  $("size").value = "";
  $("cartonQty").value = "";
  $("customer").value = "";
  $("note").value = "";
}

async function saveStock() {
  if (!canEdit()) return toast("Bạn không có quyền lưu hàng.");

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

  if (!payload.location_id) return toast("Vui lòng chọn vị trí.");
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

  const loc = getLocationById(s.location_id);

  $("moveModal").classList.remove("hidden");
  $("moveStockId").value = stockId;

  $("moveStockInfo").innerHTML = `
    <div class="info-box">
      <strong>${esc(s.po_no)} - ${esc(s.style_code)}</strong>
      <p>Đang ở: ${esc(loc?.location_code || s.location_code || "")}</p>
      <p>Số kiện: ${Number(s.carton_qty || 0)}</p>
    </div>
  `;

  await loadAllLocationsForMove();
}

function closeMoveModal(clear = true) {
  $("moveModal")?.classList.add("hidden");

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
  $("rowModal").classList.remove("hidden");
  $("rowArea").value = State.currentAreaId;
  $("newRowNo").value = "";
}

function closeRowModal() {
  $("rowModal")?.classList.add("hidden");
}

async function saveRow() {
  if (!isAdmin()) return toast("Chỉ admin được thêm dãy.");

  const areaId = Number($("rowArea").value);
  const rowNo = Number($("newRowNo").value);

  if (!areaId) return toast("Vui lòng chọn khu vực.");
  if (!rowNo || rowNo < 1) return toast("Số dãy không hợp lệ.");

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
    }
  } catch (err) {
    console.error(err);
    toast(err.message || "Không thêm được dãy. Có thể dãy đã tồn tại.");
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

  const loc = getLocationById(locationId);
  if (!loc) return;

  State.selectedLocationId = locationId;

  const stocks = getStocksByLocation(locationId);

  $("detailModal").classList.remove("hidden");
  $("detailTitle").textContent = loc.location_code;
  $("detailSubTitle").textContent =
    Number(loc.area_id) === 1
      ? `Dãy ${loc.row_no} - Kệ ${loc.level_no}`
      : `Lầu 6 - Dãy ${loc.row_no} - Ô ${String(loc.level_no).padStart(2, "0")}`;

  if (!stocks.length) {
    $("detailContent").innerHTML = `
      <div class="empty-state">Vị trí này đang trống.</div>
    `;
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

  const loc = getLocationById(s.location_id);

  $("partialExportModal").classList.remove("hidden");
  $("partialExportStockId").value = stockId;
  $("partialExportQty").value = "";
  $("partialExportNote").value = "";

  $("partialExportInfo").innerHTML = `
    <strong>${esc(s.po_no)} - ${esc(s.style_code)}</strong>
    <p>Vị trí: ${esc(loc?.location_code || s.location_code || "")}</p>
    <p>Số kiện hiện có: <b>${Number(s.carton_qty || 0)}</b></p>
  `;
}

function closePartialExportModal(clear = true) {
  $("partialExportModal")?.classList.add("hidden");

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
   LOGS
========================= */

async function openLogsModal() {
  if (!isAdmin()) return toast("Chỉ admin được xem nhật ký.");

  $("logsModal")?.classList.remove("hidden");
  await loadLogs();
}

function closeLogsModal() {
  $("logsModal")?.classList.add("hidden");
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

  $("btnViewGrid").classList.toggle("active", mode === "grid");
  $("btnViewTable").classList.toggle("active", mode === "table");

  $("warehouseGrid").classList.toggle("hidden", mode !== "grid");
  $("tablePanel").classList.toggle("hidden", mode !== "table");
}

/* =========================
   SELECT LOADERS
========================= */

async function loadLocationsForSelect(areaSelectId, locationSelectId) {
  const areaId = Number($(areaSelectId).value);
  const select = $(locationSelectId);

  const locations =
    areaId === State.currentAreaId
      ? State.locations
      : await apiGet(`/api/locations?areaId=${areaId}`);

  select.innerHTML = `<option value="">Chọn vị trí</option>`;

  locations
    .sort(
      (a, b) =>
        Number(a.row_no) - Number(b.row_no) ||
        Number(a.level_no) - Number(b.level_no)
    )
    .forEach((loc) => {
      const text =
        areaId === 1
          ? `${loc.location_code} - Dãy ${loc.row_no} - Kệ ${loc.level_no}`
          : `${loc.location_code} - Dãy ${loc.row_no} - Ô ${String(loc.level_no).padStart(2, "0")}`;

      select.insertAdjacentHTML(
        "beforeend",
        `<option value="${loc.id}">${esc(text)}</option>`
      );
    });
}

async function loadAllLocationsForMove() {
  const select = $("moveLocation");
  select.innerHTML = `<option value="">Chọn vị trí</option>`;

  const area1 = await apiGet("/api/locations?areaId=1");
  const area2 = await apiGet("/api/locations?areaId=2");
  const all = [...area1, ...area2];

  all.forEach((loc) => {
    const areaName = getAreaName(loc.area_id);

    const text =
      Number(loc.area_id) === 1
        ? `${areaName} - Dãy ${loc.row_no} - Kệ ${loc.level_no}`
        : `${areaName} - Dãy ${loc.row_no} - Ô ${String(loc.level_no).padStart(2, "0")}`;

    select.insertAdjacentHTML(
      "beforeend",
      `<option value="${loc.id}">${esc(text)}</option>`
    );
  });
}

/* =========================
   RELOAD
========================= */

async function reloadStocksAndLocations() {
  State.locations = await apiGet(`/api/locations?areaId=${State.currentAreaId}`);

  const area1Locations = await apiGet("/api/locations?areaId=1");
  const area2Locations = await apiGet("/api/locations?areaId=2");
  State.allLocations = [...area1Locations, ...area2Locations];

  State.stocks = await apiGet("/api/stocks");

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

    if (!State.stocks || !State.stocks.length) {
      State.stocks = await apiGet("/api/stocks");
    }

    const exportAreaId = exportAll ? 0 : Number(State.currentAreaId);

    const exportRows = State.stocks
      .filter((s) => String(s.status || "in_stock") === "in_stock")
      .filter((s) => {
        if (!exportAreaId) return true;
        return Number(s.area_id) === Number(exportAreaId);
      })
      .sort(sortStockByLocation);

    const data = exportRows.map((s) => {
      const areaId = Number(s.area_id || 0);
      const rowNo = Number(s.row_no || 0);
      const levelNo = Number(s.level_no || 0);
      const locationCode = s.location_code || "";

      const levelText =
        areaId === 1
          ? `Kệ ${levelNo}`
          : `Ô ${String(levelNo).padStart(2, "0")}`;

      return {
        "Khu vực": cleanExcelText(getAreaName(areaId)),
        "Mã vị trí": cleanExcelText(locationCode),
        "Dãy": rowNo,
        "Kệ/Ô": cleanExcelText(levelText),
        "Mã hàng": cleanExcelText(s.style_code),
        "PO": cleanExcelText(s.po_no),
        "Màu": cleanExcelText(s.color),
        "Size": cleanExcelText(s.size),
        "Số kiện": Number(s.carton_qty || 0),
        "Khách hàng": cleanExcelText(s.customer),
        "Ghi chú": cleanExcelText(s.note),
      };
    });

    if (!data.length) {
      toast("Không có dữ liệu để xuất.");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(data);

    ws["!cols"] = [
      { wch: 18 },
      { wch: 18 },
      { wch: 8 },
      { wch: 12 },
      { wch: 24 },
      { wch: 18 },
      { wch: 14 },
      { wch: 12 },
      { wch: 10 },
      { wch: 20 },
      { wch: 36 },
    ];

    ws["!autofilter"] = {
      ref: `A1:K${data.length + 1}`,
    };

    const wb = XLSX.utils.book_new();

    const sheetName =
      exportAreaId === 0
        ? "Toan bo kho"
        : exportAreaId === 1
        ? "Kho thanh pham"
        : "Lau 6";

    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const fileName =
      exportAreaId === 0
        ? `ton-kho-toan-bo-${todayText()}.xlsx`
        : exportAreaId === 1
        ? `ton-kho-thanh-pham-${todayText()}.xlsx`
        : `ton-kho-lau-6-${todayText()}.xlsx`;

    XLSX.writeFile(wb, fileName);
    toast("Đã xuất Excel.");
  } catch (err) {
    console.error(err);
    toast(err.message || "Xuất Excel không thành công.");
  } finally {
    showLoading(false);
  }
}

/* =========================
   MODAL HELPERS
========================= */

function closeAllModals() {
  $("detailModal")?.classList.add("hidden");
  $("stockModal")?.classList.add("hidden");
  $("moveModal")?.classList.add("hidden");
  $("rowModal")?.classList.add("hidden");
  $("partialExportModal")?.classList.add("hidden");
  $("logsModal")?.classList.add("hidden");

  State.selectedLocationId = null;
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

function getStocksByLocation(locationId) {
  return State.stocks.filter(
    (s) =>
      Number(s.location_id) === Number(locationId) &&
      String(s.status || "in_stock") === "in_stock"
  );
}

function getLocationById(id) {
  return (
    State.allLocations?.find((x) => Number(x.id) === Number(id)) ||
    State.locations.find((x) => Number(x.id) === Number(id)) ||
    null
  );
}

function getAreaName(areaId) {
  const id = Number(areaId);
  if (id === 1) return "Kho thành phẩm";
  if (id === 2) return "Lầu 6";

  const area = State.areas.find((x) => Number(x.id) === id);
  return area?.name || "";
}

function sortStockByLocation(a, b) {
  const areaA = Number(a.area_id || 0);
  const areaB = Number(b.area_id || 0);

  const rowA = Number(a.row_no || 0);
  const rowB = Number(b.row_no || 0);

  const levelA = Number(a.level_no || 0);
  const levelB = Number(b.level_no || 0);

  if (areaA !== areaB) return areaA - areaB;
  if (rowA !== rowB) return rowA - rowB;
  return levelA - levelB;
}

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const value = item[key];
    acc[value] = acc[value] || [];
    acc[value].push(item);
    return acc;
  }, {});
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
