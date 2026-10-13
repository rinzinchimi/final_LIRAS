/* =====================================
   LIRAS Inspection Management
   inspection.js
===================================== */

let _allInspections = [];
let _currentFilter = "all";
let _editingInspectionId = null;

function openModal(){
    document.getElementById("inspectionModal").style.display = "flex";
}

function closeModal(){
    document.getElementById("inspectionModal").style.display = "none";
}

function openEditModal(){
    document.getElementById("editInspectionModal").style.display = "flex";
}

function closeEditModal(){
    document.getElementById("editInspectionModal").style.display = "none";
    _editingInspectionId = null;
}

async function addInspection(){
    let employer = document.getElementById("employer").value.trim();
    let inspector = document.getElementById("inspector").value.trim();
    let date = document.getElementById("date").value;

    if (employer === "" || inspector === "") {
        alert("Please fill all fields");
        return;
    }

    try {
        const created = await apiPost("/inspections", {
            employer_name: employer,
            inspector: inspector,
            inspection_date: date || null,
        });

        _allInspections.unshift({
            id: created.id,
            employer_id: created.employer_id,
            employer_name: created.employer_name,
            sector: created.sector,
            dzongkhag: null,
            inspection_type: "Scheduled Inspection",
            inspection_date: created.inspection_date,
            inspector: created.inspector,
            source: "scheduled",
            status: created.status,
            risk_category: created.risk_category,
            recommendation: null,
        });

        closeModal();
        document.getElementById("employer").value = "";
        document.getElementById("inspector").value = "";
        document.getElementById("date").value = "";
        applyFilterAndRender();
        refreshSummaryCards();
        alert("Inspection scheduled successfully for " + created.employer_name);
    } catch (err) {
        console.error("Failed to schedule inspection:", err);
        alert("Could not schedule inspection: " + (err.message || "employer not found. Please check the employer name matches an existing employer record."));
    }
}

function riskLevelClass(category){
    const c = (category || "low").toLowerCase();
    if (c === "high" || c === "critical") return "high";
    if (c === "medium") return "medium";
    return "low";
}

function statusClass(status){
    return status === "Completed" ? "completed" : "pending";
}

function formatInspectionId(id){
    return "#INS-" + String(id).padStart(3, "0");
}

function renderInspectionTable(list){
    const tbody = document.getElementById("inspectionTableBody");
    tbody.innerHTML = "";

    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:#64748b;">No inspection records match this view.</td></tr>`;
        return;
    }

    list.forEach(i => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${formatInspectionId(i.id)}</td>
            <td>${i.employer_name}</td>
            <td>${i.sector || "-"}</td>
            <td>${i.inspector || "Not Assigned"}</td>
            <td>${i.inspection_date || "Not scheduled"}</td>
            <td><span class="${riskLevelClass(i.risk_category)}">${i.risk_category || "-"}</span></td>
            <td><span class="${statusClass(i.status)}">${i.status || "Pending"}</span></td>
            <td>
                <button class="view" onclick="openInspectionDetailModal(${i.id})">View</button>
                <button class="edit" onclick="openEditForInspection(${i.id})">Edit</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function applyFilterAndRender(){
    let list = _allInspections;

    if (_currentFilter === "pending") {
        list = list.filter(i => i.status === "Pending");
    } else if (_currentFilter === "completed") {
        list = list.filter(i => i.status === "Completed");
    }

    const searchValue = (document.getElementById("searchInput").value || "").toLowerCase();
    if (searchValue) {
        list = list.filter(i => JSON.stringify(i).toLowerCase().includes(searchValue));
    }

    renderInspectionTable(list);
    highlightActiveCard();
}

function highlightActiveCard(){
    ["cardTotalInspections", "cardPending", "cardCompleted"].forEach(id => {
        document.getElementById(id).style.outline = "";
    });
    const map = { all: "cardTotalInspections", pending: "cardPending", completed: "cardCompleted" };
    const activeId = map[_currentFilter];
    if (activeId) document.getElementById(activeId).style.outline = "3px solid #2563eb";
}

function filterInspections(filter){
    _currentFilter = filter;
    applyFilterAndRender();
}

async function showHighRiskEmployers(){
    try {
        const employers = await apiGet("/high-risk");
        openEmployerListModal("High Risk Employers", employers);
    } catch (err) {
        console.error("Failed to load high risk employers:", err);
    }
}

function openEditForInspection(id){
    const insp = _allInspections.find(i => i.id === id);
    if (!insp) return;
    _editingInspectionId = id;
    document.getElementById("editInspectionEmployerLabel").innerText =
        `${insp.employer_name} — ${insp.inspection_date || "no date"}`;
    document.getElementById("editInspectionStatus").value = insp.status || "Pending";
    openEditModal();
}

async function saveInspectionStatus(){
    if (!_editingInspectionId) return;
    const newStatus = document.getElementById("editInspectionStatus").value;

    try {
        const updated = await apiPatch(`/inspections/${_editingInspectionId}`, { status: newStatus });

        const insp = _allInspections.find(i => i.id === updated.id);
        if (insp) insp.status = updated.status;

        closeEditModal();
        applyFilterAndRender();
        refreshSummaryCards();
    } catch (err) {
        console.error("Failed to update inspection status:", err);
        alert("Could not update inspection status. Please try again.");
    }
}

/* ---------- View detail modal (full employer + AI recommendation) ---------- */

async function openInspectionDetailModal(id){
    _ensureModalRoot();
    document.getElementById("lirasModalRoot").innerHTML = `
    <div class="liras-modal-overlay" onclick="if(event.target===this) closeLirasModal()">
      <div class="liras-modal-box liras-modal-wide">
        <div class="liras-modal-header">
          <h3>Inspection Detail</h3>
          <button class="liras-modal-close" onclick="closeLirasModal()"><i class="fa fa-xmark"></i></button>
        </div>
        <div class="liras-modal-loading"><i class="fa fa-spinner fa-spin"></i> Loading inspection detail...</div>
      </div>
    </div>`;

    try {
        const d = await apiGet(`/inspections/${id}`);
        const badge = (cat) => `<span class="liras-badge liras-${(cat || "low").toLowerCase()}">${_escapeHtml(cat || "-")}</span>`;
        const rec = d.ai_recommendation || {};
        const list = (arr) => (arr && arr.length) ? `<ul>${arr.map(x => `<li>${_escapeHtml(x)}</li>`).join("")}</ul>` : "<p class=\"liras-empty\">None.</p>";

        document.querySelector("#lirasModalRoot .liras-modal-box").innerHTML = `
        <div class="liras-modal-header">
          <h3>${_escapeHtml(d.employer_name)} — ${formatInspectionId(d.id)}</h3>
          <button class="liras-modal-close" onclick="closeLirasModal()"><i class="fa fa-xmark"></i></button>
        </div>

        <div class="liras-profile-grid">
          <div><strong>Employer Name</strong><span>${_escapeHtml(d.employer_name)}</span></div>
          <div><strong>Company Name</strong><span>${_escapeHtml(d.company_name)}</span></div>
          <div><strong>Industry</strong><span>${_escapeHtml(d.sector || "-")}</span></div>
          <div><strong>Location</strong><span>${_escapeHtml(d.dzongkhag || "-")}${d.location ? " — " + _escapeHtml(d.location) : ""}</span></div>
          <div><strong>Inspection Date</strong><span>${_escapeHtml(d.inspection_date || "Not scheduled")}</span></div>
          <div><strong>Inspector</strong><span>${_escapeHtml(d.inspector || "Not Assigned")}</span></div>
          <div><strong>Status</strong><span>${_escapeHtml(d.status)}</span></div>
          <div><strong>Risk Level</strong><span>${badge(d.risk_category)}</span></div>
          <div><strong>Improvement Notices</strong><span>${d.improvement_notices}</span></div>
          <div><strong>Penalty Memos</strong><span>${d.penalty_memos}</span></div>
          <div><strong>Total Penalty Amount</strong><span>Nu. ${Number(d.total_penalty_amount || 0).toLocaleString()}</span></div>
        </div>

        <div class="liras-modal-subsection">
          <strong>Violations (${d.violations.length})</strong>
          ${d.violations.length ? `
          <table class="liras-modal-table liras-sub-table">
            <thead><tr><th>Date</th><th>Type</th><th>Contravention</th><th>Amount</th></tr></thead>
            <tbody>
              ${d.violations.map(v => `<tr>
                <td>${v.inspection_date ? _escapeHtml(v.inspection_date) : "-"}</td>
                <td>${_escapeHtml(v.notice_type || "-")}</td>
                <td>${_escapeHtml(v.contravention || v.particulars || "-")}</td>
                <td>${v.amount ? "Nu. " + Number(v.amount).toLocaleString() : "-"}</td>
              </tr>`).join("")}
            </tbody>
          </table>` : `<p class="liras-empty">No violations on record.</p>`}
        </div>

        <div class="liras-modal-subsection">
          <strong>PPE / OSH Findings (${d.osh_findings.length})</strong>
          ${d.osh_findings.length ? list(d.osh_findings.map(v => v.particulars || v.contravention)) : `<p class="liras-empty">No OSH findings on record.</p>`}
        </div>

        <div class="liras-modal-subsection">
          <strong>Previous Inspection History (${d.previous_inspection_history.length})</strong>
          ${d.previous_inspection_history.length ? `
          <table class="liras-modal-table liras-sub-table">
            <thead><tr><th>Date</th><th>Type</th><th>Inspector</th><th>Status</th></tr></thead>
            <tbody>
              ${d.previous_inspection_history.map(i => `<tr>
                <td>${i.inspection_date ? _escapeHtml(i.inspection_date) : "-"}</td>
                <td>${_escapeHtml(i.inspection_type || "-")}</td>
                <td>${_escapeHtml(i.inspector || "-")}</td>
                <td>${_escapeHtml(i.status || "-")}</td>
              </tr>`).join("")}
            </tbody>
          </table>` : `<p class="liras-empty">No previous inspections on record.</p>`}
        </div>

        <div class="liras-recommendation">
          <strong><i class="fa fa-lightbulb"></i> AI Recommendation (${_escapeHtml(rec.inspection_priority || "-")} priority):</strong>
          ${_escapeHtml(rec.summary || "-")}
          <br><strong>Recommended follow-up date:</strong> ${_escapeHtml(rec.recommended_follow_up_date || "-")}
        </div>

        <div class="liras-explanation">
          <strong>Risk Explanation</strong>
          ${list(rec.risk_explanation)}
        </div>

        <div class="liras-explanation">
          <strong>Required Corrective Actions</strong>
          ${list(rec.required_corrective_actions)}
        </div>

        <div class="liras-explanation">
          <strong>Suggested Enforcement Actions</strong>
          ${list(rec.suggested_enforcement_actions)}
        </div>

        <div class="liras-explanation">
          <strong>Compliance Improvement Recommendations</strong>
          ${list(rec.compliance_improvement_recommendations)}
        </div>
        `;
    } catch (err) {
        console.error(err);
        document.querySelector("#lirasModalRoot .liras-modal-box").innerHTML = `
        <div class="liras-modal-header">
          <h3>Inspection Detail</h3>
          <button class="liras-modal-close" onclick="closeLirasModal()"><i class="fa fa-xmark"></i></button>
        </div>
        <div class="liras-empty">Could not load inspection details. Please try again.</div>`;
    }
}

/* ---------- Loading & summary ---------- */

async function refreshSummaryCards(){
    try {
        const summary = await apiGet("/inspections/summary");
        document.getElementById("statTotalInspections").innerText = summary.total_inspections.toLocaleString();
        document.getElementById("statPending").innerText = summary.pending.toLocaleString();
        document.getElementById("statCompleted").innerText = summary.completed.toLocaleString();
        document.getElementById("statHighRiskCases").innerText = summary.high_risk_cases.toLocaleString();
    } catch (err) {
        console.error("Failed to load inspection summary:", err);
    }
}

async function loadInspections(){
    try {
        _allInspections = await apiGet("/inspections?limit=1000");
        applyFilterAndRender();
        await refreshSummaryCards();
    } catch (err) {
        console.error("Failed to load inspections:", err);
    }
}

// Search
document.getElementById("searchInput").addEventListener("keyup", function(){
    applyFilterAndRender();
});

document.addEventListener("DOMContentLoaded", loadInspections);
