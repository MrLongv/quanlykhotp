/* =========================================================
   Warehouse Location Manager V1
   app.js
   ========================================================= */

const API_BASE =
"https://warehouse-api.longvanasb.workers.dev";

const $ = (id) => document.getElementById(id);

const State = {
  currentAreaId: 1,
  currentAreaCode: "KTP",
  currentAreaName: "Kho thành phẩm",
  viewMode: "grid",
  filterMode: "all",
  areas: [],
  locations: [],
  stocks: [],
  selectedLocationId: null,
};

/* =========================
   API HELPER
========================= */

async function apiGet(url) {
  const res = await fetch(API_BASE + url);
  if (!res.ok) throw new Error("API GET lỗi: " + url);
  return await res.json();
}

async function apiPost(url, data) {
  const res = await fetch(API_BASE + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data || {}),
  });
  if (!res.ok) throw new Error("API POST lỗi: " + url);
  return await res.json();
}

async function apiPut(url, data) {
  const res = await fetch(API_BASE + url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data || {}),
  });
  if (!res.ok) throw new Error("API PUT lỗi: " + url);
  return await res.json();
}

/* =========================
   INIT
========================= */

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  await loadInitialData();
});

async function loadInitialData() {
  try {
    showLoading(true);

    State.areas = await apiGet("/api/areas");
    State.locations = await apiGet(`/api/locations?areaId=${State.currentAreaId}`);
    State.stocks = await apiGet("/api/stocks");

    renderAll();
  } catch (err) {
    console.error(err);
    toast("Không tải được dữ liệu. Kiểm tra Worker/API.");
  } finally {
    showLoading(false);
  }
}

/* =========================
   EVENTS
========================= */

function bindEvents() {
  $("btnRefresh")?.addEventListener("click", loadInitialData);
  $("btnExportExcel")?.addEventListener("click", exportExcelLikeCsv);

  $("btnSearch")?.addEventListener("click", handleSearch);
  $("globalSearch")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
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
    const locationId = State.selectedLocationId;
    closeDetailModal();
    openStockModal(null, locationId);
  });
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
      : "Sơ đồ Lầu 6: quản lý theo từng dãy";
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
  $("totalCartons").textContent = activeStocks.reduce((sum, s) => sum + Number(s.carton_qty || 0), 0);
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
      const rowLocations = grouped[rowNo].sort((a, b) => Number(a.level_no) - Number(b.level_no));

      return `
        <div class="row-block">
          <div class="row-title">
            <h3>Dãy ${rowNo}</h3>
            <span>${rowLocations.length} vị trí</span>
          </div>

          <div class="location-cards">
            ${rowLocations.map(renderLocationCard).join("")}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderLocationCard(loc) {
  const stocks = getStocksByLocation(loc.id);
  const totalCarton = stocks.reduce((sum, s) => sum + Number(s.carton_qty || 0), 0);

  const isEmpty = stocks.length === 0;
  const statusClass = isEmpty ? "empty" : totalCarton >= 50 ? "full" : "used";

  const title =
    State.currentAreaId === 1
      ? `Dãy ${loc.row_no} - Kệ ${loc.level_no}`
      : `Dãy ${loc.row_no}`;

  const stockHtml = isEmpty
    ? `<div class="empty-text">Trống</div>`
    : stocks
        .slice(0, 2)
        .map(
          (s) => `
            <div class="stock-line">
              <strong>${esc(s.po_no)}</strong>
              <span>${esc(s.style_code)} · ${Number(s.carton_qty || 0)} kiện</span>
            </div>
          `
        )
        .join("");

  const moreHtml =
    stocks.length > 2 ? `<div class="more-line">+${stocks.length - 2} mã khác</div>` : "";

  return `
    <div class="location-card ${statusClass}">
      <div class="location-head">
        <strong>${esc(loc.location_code)}</strong>
        <span>${title}</span>
      </div>

      <div class="location-body">
        ${stockHtml}
        ${moreHtml}
      </div>

      <div class="location-footer">
        <button onclick="openDetailModal(${loc.id})">Chi tiết</button>
        <button onclick="openStockModal(null, ${loc.id})">+ Thêm</button>
      </div>
    </div>
  `;
}

function renderTable() {
  const tbody = $("stockTableBody");
  if (!tbody) return;

  const activeStocks = State.stocks.filter((s) => s.status === "in_stock");

  if (!activeStocks.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center">Chưa có dữ liệu hàng tồn.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = activeStocks
    .map((s) => {
      const loc = getLocationById(s.location_id);

      return `
        <tr>
          <td>${esc(loc?.location_code || "")}</td>
          <td>${esc(getAreaName(loc?.area_id))}</td>
          <td>${esc(loc?.row_no || "")}</td>
          <td>${esc(loc?.level_no || "")}</td>
          <td>${esc(s.style_code)}</td>
          <td>${esc(s.po_no)}</td>
          <td>${Number(s.carton_qty || 0)}</td>
          <td>${esc(s.note || "")}</td>
          <td>
            <button class="link-btn" onclick="openStockModal(${s.id})">Sửa</button>
            <button class="link-btn" onclick="openMoveModal(${s.id})">Chuyển</button>
            <button class="link-btn danger" onclick="markExported(${s.id})">Xuất hết</button>
          </td>
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
    .map((s) => {
      const loc = getLocationById(s.location_id);

      return `
        <tr>
          <td><strong>${esc(loc?.location_code || "")}</strong></td>
          <td>${esc(s.style_code)}</td>
          <td>${esc(s.po_no)}</td>
          <td>${esc(s.color || "")}</td>
          <td>${esc(s.size || "")}</td>
          <td>${Number(s.carton_qty || 0)}</td>
          <td>${esc(s.customer || "")}</td>
          <td>
            <button class="link-btn" onclick="openDetailModal(${s.location_id})">Xem vị trí</button>
            <button class="link-btn" onclick="openStockModal(${s.id})">Sửa</button>
          </td>
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
    $("stockArea").value = loc?.area_id || State.currentAreaId;

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
  $("stockModal").classList.add("hidden");
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

    closeStockModal();
    await reloadStocksAndLocations();
  } catch (err) {
    console.error(err);
    toast("Lưu không thành công.");
  } finally {
    showLoading(false);
  }
}

/* =========================
   MOVE STOCK
========================= */

async function openMoveModal(stockId) {
  const s = State.stocks.find((x) => Number(x.id) === Number(stockId));
  if (!s) return;

  const loc = getLocationById(s.location_id);

  $("moveModal").classList.remove("hidden");
  $("moveStockId").value = stockId;

  $("moveStockInfo").innerHTML = `
    <div class="info-box">
      <strong>${esc(s.po_no)} - ${esc(s.style_code)}</strong>
      <p>Đang ở: ${esc(loc?.location_code || "")}</p>
      <p>Số kiện: ${Number(s.carton_qty || 0)}</p>
    </div>
  `;

  await loadAllLocationsForMove();
}

function closeMoveModal() {
  $("moveModal").classList.add("hidden");
  $("moveStockId").value = "";
  $("moveReason").value = "";
}

async function confirmMove() {
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

    closeMoveModal();
    toast("Đã chuyển vị trí.");
    await reloadStocksAndLocations();
  } catch (err) {
    console.error(err);
    toast("Chuyển vị trí không thành công.");
  } finally {
    showLoading(false);
  }
}

/* =========================
   ADD ROW
========================= */

function openRowModal() {
  $("rowModal").classList.remove("hidden");
  $("rowArea").value = State.currentAreaId;
  $("newRowNo").value = "";
}

function closeRowModal() {
  $("rowModal").classList.add("hidden");
}

async function saveRow() {
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

    closeRowModal();
    toast("Đã thêm dãy mới.");

    if (areaId === State.currentAreaId) {
      await reloadStocksAndLocations();
    }
  } catch (err) {
    console.error(err);
    toast("Không thêm được dãy. Có thể dãy đã tồn tại.");
  } finally {
    showLoading(false);
  }
}

/* =========================
   DETAIL MODAL
========================= */

function openDetailModal(locationId) {
  const loc = getLocationById(locationId);
  if (!loc) return;

  State.selectedLocationId = locationId;

  const stocks = getStocksByLocation(locationId);

  $("detailModal").classList.remove("hidden");
  $("detailTitle").textContent = loc.location_code;
  $("detailSubTitle").textContent =
    State.currentAreaId === 1
      ? `Dãy ${loc.row_no} - Kệ ${loc.level_no}`
      : `Lầu 6 - Dãy ${loc.row_no}`;

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
            .map(
              (s) => `
                <tr>
                  <td>${esc(s.style_code)}</td>
                  <td>${esc(s.po_no)}</td>
                  <td>${esc(s.color || "")}</td>
                  <td>${esc(s.size || "")}</td>
                  <td>${Number(s.carton_qty || 0)}</td>
                  <td>${esc(s.customer || "")}</td>
                  <td>${esc(s.note || "")}</td>
                  <td>
                    <button class="link-btn" onclick="openStockModal(${s.id})">Sửa</button>
                    <button class="link-btn" onclick="openMoveModal(${s.id})">Chuyển</button>
                    <button class="link-btn danger" onclick="markExported(${s.id})">Xuất hết</button>
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

function closeDetailModal() {
  $("detailModal").classList.add("hidden");
  State.selectedLocationId = null;
}

/* =========================
   EXPORTED
========================= */

async function markExported(stockId) {
  const ok = confirm("Đánh dấu lô hàng này đã xuất hết khỏi kho?");
  if (!ok) return;

  try {
    showLoading(true);

    await apiPost(`/api/stocks/${stockId}/exported`, {});
    toast("Đã đánh dấu xuất hết.");

    closeDetailModal();
    await reloadStocksAndLocations();
  } catch (err) {
    console.error(err);
    toast("Không cập nhật được trạng thái xuất.");
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
    .sort((a, b) => Number(a.row_no) - Number(b.row_no) || Number(a.level_no) - Number(b.level_no))
    .forEach((loc) => {
      const text =
        areaId === 1
          ? `${loc.location_code} - Dãy ${loc.row_no} - Kệ ${loc.level_no}`
          : `${loc.location_code} - Dãy ${loc.row_no}`;

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
        : `${areaName} - Dãy ${loc.row_no}`;

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
  State.stocks = await apiGet("/api/stocks");
  renderAll();
}

/* =========================
   EXPORT CSV
========================= */

function exportExcelLikeCsv() {
  const rows = [
    [
      "Khu vực",
      "Mã vị trí",
      "Dãy",
      "Kệ/Tầng",
      "Mã hàng",
      "PO",
      "Màu",
      "Size",
      "Số kiện",
      "Khách hàng",
      "Ghi chú",
    ],
  ];

  State.stocks
    .filter((s) => s.status === "in_stock")
    .forEach((s) => {
      const loc = getLocationById(s.location_id);

      rows.push([
        getAreaName(loc?.area_id),
        loc?.location_code || "",
        loc?.row_no || "",
        loc?.level_no || "",
        s.style_code || "",
        s.po_no || "",
        s.color || "",
        s.size || "",
        s.carton_qty || 0,
        s.customer || "",
        s.note || "",
      ]);
    });

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\ufeff" + csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = `ton-kho-thanh-pham-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();

  URL.revokeObjectURL(url);
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
  return State.locations.find((x) => Number(x.id) === Number(id));
}

function getAreaName(areaId) {
  const id = Number(areaId);
  if (id === 1) return "Kho thành phẩm";
  if (id === 2) return "Lầu 6";

  const area = State.areas.find((x) => Number(x.id) === id);
  return area?.name || "";
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

function toast(message) {
  const box = $("toast");
  const text = $("toastText");

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
window.markExported = markExported;
