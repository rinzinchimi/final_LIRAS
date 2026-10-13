/* =====================================
   LIRAS shared UI components
   - Drill-down list modal (employers or inspections)
   - Employer detail modal
   Used by dashboard, employers, inspection and
   reports pages so every clickable card/chart/eye-icon
   opens the same consistent, real-data view.
===================================== */

const LIRAS_PAGE_SIZE = 10;

let _listState = { rows: [], filtered: [], page: 1, columns: [], type: "employer", title: "" };

function _ensureModalRoot() {
    if (document.getElementById("lirasModalRoot")) return;
    const root = document.createElement("div");
    root.id = "lirasModalRoot";
    document.body.appendChild(root);
}

function _escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[&<>"']/g, s => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[s]));
}

function closeLirasModal() {
    const el = document.getElementById("lirasModalRoot");
    if (el) el.innerHTML = "";
}

/* ---------- Employer / Inspection list drill-down ---------- */

function openEmployerListModal(title, employers) {
    _listState = {
        rows: employers || [],
        filtered: employers || [],
        page: 1,
        type: "employer",
        title,
    };
    _renderListModal();
}

function openInspectionListModal(title, inspections) {
    _listState = {
        rows: inspections || [],
        filtered: inspections || [],
        page: 1,
        type: "inspection",
        title,
    };
    _renderListModal();
}

function _listSearch(value) {
    const q = (value || "").toLowerCase().trim();
    _listState.filtered = !q ? _listState.rows : _listState.rows.filter(r => {
        if (_listState.type === "employer") {
            return [r.name, r.sector, r.dzongkhag, r.risk_category].filter(Boolean)
                .some(v => String(v).toLowerCase().includes(q));
        }
        return [r.employer_name, r.sector, r.inspector, r.inspection_type, r.risk_category].filter(Boolean)
            .some(v => String(v).toLowerCase().includes(q));
    });
    _listState.page = 1;
    _renderListBody();
}

function _listSort(field) {
    _listState.filtered.sort((a, b) => {
        const av = a[field], bv = b[field];
        if (typeof av === "number") return bv - av;
        return String(av || "").localeCompare(String(bv || ""));
    });
    _renderListBody();
}

function _listPage(delta) {
    const totalPages = Math.max(1, Math.ceil(_listState.filtered.length / LIRAS_PAGE_SIZE));
    _listState.page = Math.min(totalPages, Math.max(1, _listState.page + delta));
    _renderListBody();
}

function _listExportCsv() {
    const rows = _listState.filtered;
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const csv = [cols.join(",")].concat(
        rows.map(r => cols.map(c => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${_listState.title.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
}

function _renderListModal() {
    _ensureModalRoot();
    const isEmployer = _listState.type === "employer";
    document.getElementById("lirasModalRoot").innerHTML = `
    <div class="liras-modal-overlay" onclick="if(event.target===this) closeLirasModal()">
      <div class="liras-modal-box liras-modal-wide">
        <div class="liras-modal-header">
          <h3>${_escapeHtml(_listState.title)} <span class="liras-count-badge" id="lirasListCount"></span></h3>
          <button class="liras-modal-close" onclick="closeLirasModal()"><i class="fa fa-xmark"></i></button>
        </div>
        <div class="liras-modal-toolbar">
          <input type="text" placeholder="Search..." oninput="_listSearch(this.value)" class="liras-search-input">
          <select onchange="_listSort(this.value)" class="liras-sort-select">
            ${isEmployer
                ? `<option value="final_risk_score">Sort: Risk score</option>
                   <option value="name">Sort: Name</option>
                   <option value="sector">Sort: Sector</option>`
                : `<option value="inspection_date">Sort: Date</option>
                   <option value="employer_name">Sort: Employer</option>
                   <option value="inspector">Sort: Inspector</option>`}
          </select>
          <button class="liras-export-btn" onclick="_listExportCsv()"><i class="fa fa-file-export"></i> Export CSV</button>
        </div>
        <div class="liras-modal-table-wrap">
          <table class="liras-modal-table" id="lirasListTable"></table>
        </div>
        <div class="liras-modal-pagination" id="lirasListPagination"></div>
      </div>
    </div>`;
    _renderListBody();
}

function _renderListBody() {
    const isEmployer = _listState.type === "employer";
    const total = _listState.filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / LIRAS_PAGE_SIZE));
    const start = (_listState.page - 1) * LIRAS_PAGE_SIZE;
    const pageRows = _listState.filtered.slice(start, start + LIRAS_PAGE_SIZE);

    document.getElementById("lirasListCount").innerText = `(${total})`;

    const table = document.getElementById("lirasListTable");
    if (!total) {
        table.innerHTML = `<tr><td class="liras-empty">No records found.</td></tr>`;
    } else if (isEmployer) {
        table.innerHTML = `
        <thead><tr>
            <th>Company</th><th>Industry</th><th>Location</th>
            <th>Inspections</th><th>Risk Level</th><th>Score</th>
        </tr></thead>
        <tbody>
        ${pageRows.map(e => `
            <tr class="liras-row-click" onclick="openEmployerDetailModal('${e.id}')">
                <td>${_escapeHtml(e.name)}</td>
                <td>${_escapeHtml(e.sector)}</td>
                <td>${_escapeHtml(e.dzongkhag || e.location || "")}</td>
                <td>${e.total_inspections ?? "-"}</td>
                <td><span class="liras-badge liras-${(e.risk_category || "low").toLowerCase()}">${_escapeHtml(e.risk_category)}</span></td>
                <td>${formatScore(e.final_risk_score)}</td>
            </tr>`).join("")}
        </tbody>`;
    } else {
        table.innerHTML = `
        <thead><tr>
            <th>Employer</th><th>Type</th><th>Date</th><th>Inspector</th><th>Risk</th>
        </tr></thead>
        <tbody>
        ${pageRows.map(i => `
            <tr class="liras-row-click" onclick="openEmployerDetailModal('${i.employer_id}')">
                <td>${_escapeHtml(i.employer_name)}</td>
                <td>${_escapeHtml(i.inspection_type || "-")}</td>
                <td>${i.inspection_date ? _escapeHtml(i.inspection_date) : "-"}</td>
                <td>${_escapeHtml(i.inspector || "-")}</td>
                <td><span class="liras-badge liras-${(i.risk_category || "low").toLowerCase()}">${_escapeHtml(i.risk_category || "-")}</span></td>
            </tr>`).join("")}
        </tbody>`;
    }

    document.getElementById("lirasListPagination").innerHTML = total ? `
        <button ${_listState.page <= 1 ? "disabled" : ""} onclick="_listPage(-1)"><i class="fa fa-chevron-left"></i></button>
        <span>Page ${_listState.page} of ${totalPages}</span>
        <button ${_listState.page >= totalPages ? "disabled" : ""} onclick="_listPage(1)"><i class="fa fa-chevron-right"></i></button>
    ` : "";
}

/* ---------- Employer detail modal (Eye icon) ---------- */

async function openEmployerDetailModal(id) {
    _ensureModalRoot();
    document.getElementById("lirasModalRoot").innerHTML = `
    <div class="liras-modal-overlay" onclick="if(event.target===this) closeLirasModal()">
      <div class="liras-modal-box liras-modal-wide">
        <div class="liras-modal-header">
          <h3>Employer Profile</h3>
          <button class="liras-modal-close" onclick="closeLirasModal()"><i class="fa fa-xmark"></i></button>
        </div>
        <div class="liras-modal-loading"><i class="fa fa-spinner fa-spin"></i> Loading employer profile...</div>
      </div>
    </div>`;

    try {
        const e = await apiGet(`/employer/${id}`);
        const badge = (cat) => `<span class="liras-badge liras-${(cat || "low").toLowerCase()}">${_escapeHtml(cat)}</span>`;

        document.querySelector("#lirasModalRoot .liras-modal-box").innerHTML = `
        <div class="liras-modal-header">
          <h3>${_escapeHtml(e.name)}</h3>
          <button class="liras-modal-close" onclick="closeLirasModal()"><i class="fa fa-xmark"></i></button>
        </div>
        <div class="liras-profile-grid">
          <div><strong>ID</strong><span>${_escapeHtml(e.id)}</span></div>
          <div><strong>Industry</strong><span>${_escapeHtml(e.sector)}</span></div>
          <div><strong>Location</strong><span>${_escapeHtml(e.dzongkhag)}${e.location ? " — " + _escapeHtml(e.location) : ""}</span></div>
          <div><strong>Email</strong><span>${_escapeHtml(e.email || "-")}</span></div>
          <div><strong>Mobile</strong><span>${_escapeHtml(e.mobile || "-")}</span></div>
          <div><strong>Risk Level</strong><span>${badge(e.risk_category)}</span></div>
          <div><strong>Risk Score</strong><span>${formatScore(e.final_risk_score)}</span></div>
          <div><strong>Last Inspection</strong><span>${e.last_inspection_date ? _escapeHtml(e.last_inspection_date) : "-"}</span></div>
          <div><strong>Total Inspections</strong><span>${e.total_inspections}</span></div>
          <div><strong>Improvement Notices</strong><span>${e.improvement_notices}</span></div>
          <div><strong>Penalty Memos</strong><span>${e.penalty_memos}</span></div>
          <div><strong>Total Penalty Amount</strong><span>Nu. ${Number(e.total_penalty_amount || 0).toLocaleString()}</span></div>
        </div>

        <div class="liras-recommendation">
          <strong><i class="fa fa-lightbulb"></i> Recommendation:</strong> ${_escapeHtml(e.recommendation || "None")}
        </div>

        ${e.ai_explanation && e.ai_explanation.length ? `
        <div class="liras-explanation">
          <strong>AI Risk Explanation</strong>
          <ul>${e.ai_explanation.map(x => `<li>${_escapeHtml(x)}</li>`).join("")}</ul>
        </div>` : ""}

        <div class="liras-modal-subsection">
          <strong>Inspection History (${e.inspections.length})</strong>
          ${e.inspections.length ? `
          <table class="liras-modal-table liras-sub-table">
            <thead><tr><th>Date</th><th>Type</th><th>Inspector</th><th>Source</th></tr></thead>
            <tbody>
              ${e.inspections.map(i => `<tr>
                <td>${i.inspection_date ? _escapeHtml(i.inspection_date) : "-"}</td>
                <td>${_escapeHtml(i.inspection_type || "-")}</td>
                <td>${_escapeHtml(i.inspector || "-")}</td>
                <td>${_escapeHtml(i.source || "-")}</td>
              </tr>`).join("")}
            </tbody>
          </table>` : `<p class="liras-empty">No inspection records.</p>`}
        </div>

        <div class="liras-modal-subsection">
          <strong>Violations & Notices (${e.violations.length})</strong>
          ${e.violations.length ? `
          <table class="liras-modal-table liras-sub-table">
            <thead><tr><th>Date</th><th>Type</th><th>Contravention</th><th>Amount</th></tr></thead>
            <tbody>
              ${e.violations.map(v => `<tr>
                <td>${v.inspection_date ? _escapeHtml(v.inspection_date) : "-"}</td>
                <td>${_escapeHtml(v.notice_type || "-")}</td>
                <td>${_escapeHtml(v.contravention || v.particulars || "-")}</td>
                <td>${v.amount ? "Nu. " + Number(v.amount).toLocaleString() : "-"}</td>
              </tr>`).join("")}
            </tbody>
          </table>` : `<p class="liras-empty">No violations on record.</p>`}
        </div>
        `;
    } catch (err) {
        console.error(err);
        document.querySelector("#lirasModalRoot .liras-modal-box").innerHTML = `
        <div class="liras-modal-header">
          <h3>Employer Profile</h3>
          <button class="liras-modal-close" onclick="closeLirasModal()"><i class="fa fa-xmark"></i></button>
        </div>
        <div class="liras-empty">Could not load employer details. Please try again.</div>`;
    }
}

/* Keyboard: close modal on Escape */
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLirasModal();
});
