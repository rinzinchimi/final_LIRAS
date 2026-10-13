/* =====================================
   LIRAS Reports
   reports.js
===================================== */

let _allReports = [];
let _currentReportFilter = "all";

function formatReportDate(iso){
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function reportStatusClass(status){
    return status === "Completed" ? "completed" : "pending";
}

function renderReportTable(list){
    const tbody = document.getElementById("reportTableBody");
    tbody.innerHTML = "";

    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:#64748b;">No reports match this view. Use "Generate Report" above to create one.</td></tr>`;
        return;
    }

    list.forEach(r => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${r.report_code}</td>
            <td>${r.employer_name || "-"}</td>
            <td>${r.report_type}</td>
            <td>${formatReportDate(r.created_at)}</td>
            <td><span class="${reportStatusClass(r.status)}">${r.status}</span></td>
            <td>
                <button class="view" onclick="viewReport(${r.id})"><i class="fa fa-eye"></i></button>
                <button class="download" onclick="downloadReport(${r.id})"><i class="fa fa-download"></i></button>
                <button class="print" onclick="printReport(${r.id})"><i class="fa fa-print"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function applyFilterAndRender(){
    let list = _allReports;

    if (_currentReportFilter === "pending") {
        list = list.filter(r => r.status === "Pending");
    } else if (_currentReportFilter === "completed") {
        list = list.filter(r => r.status === "Completed");
    } else if (_currentReportFilter === "this_month") {
        const now = new Date();
        list = list.filter(r => {
            const d = new Date(r.created_at);
            return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        });
    }

    const month = document.getElementById("month").value;
    const year = document.getElementById("year").value;
    if (month) {
        list = list.filter(r => (new Date(r.created_at).getMonth() + 1) === Number(month));
    }
    if (year) {
        list = list.filter(r => new Date(r.created_at).getFullYear() === Number(year));
    }

    const search = (document.getElementById("search").value || "").toLowerCase();
    if (search) {
        list = list.filter(r => JSON.stringify(r).toLowerCase().includes(search));
    }

    renderReportTable(list);
    highlightActiveReportCard();
}

function highlightActiveReportCard(){
    ["cardTotalReports", "cardThisMonth", "cardPendingReports", "cardCompletedReports"].forEach(id => {
        document.getElementById(id).style.outline = "";
    });
    const map = {
        all: "cardTotalReports",
        this_month: "cardThisMonth",
        pending: "cardPendingReports",
        completed: "cardCompletedReports",
    };
    const activeId = map[_currentReportFilter];
    if (activeId) document.getElementById(activeId).style.outline = "3px solid #2563eb";
}

function filterReports(filter){
    _currentReportFilter = filter;
    applyFilterAndRender();
}

async function refreshReportSummary(){
    try {
        const s = await apiGet("/reports/summary");
        document.getElementById("statTotalReports").innerText = s.total_reports;
        document.getElementById("statThisMonth").innerText = s.reports_this_month;
        document.getElementById("statPendingReports").innerText = s.pending_reports;
        document.getElementById("statCompletedReports").innerText = s.completed_reports;
    } catch (err) {
        console.error("Failed to load reports summary:", err);
        const ids = ["statTotalReports", "statThisMonth", "statPendingReports", "statCompletedReports"];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = "—"; });
    }
}

async function loadReports(){
    try {
        _allReports = await apiGet("/reports?limit=1000");
        applyFilterAndRender();
        await refreshReportSummary();
    } catch (err) {
        console.error("Failed to load reports:", err);
        const tbody = document.getElementById("reportTableBody");
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#b91c1c;">Unable to load reports. Check your connection and try again.</td></tr>';
    }
}

async function populateEmployerSelect(){
    try {
        const employers = await apiGet("/employers?limit=1000");
        const select = document.getElementById("generateEmployerSelect");
        const list = Array.isArray(employers) ? employers : (employers.items || employers.results || []);
        list.forEach(e => {
            const opt = document.createElement("option");
            opt.value = e.id;
            opt.textContent = `${e.name} (${e.risk_category || "Low"} risk)`;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error("Failed to load employers for report generation:", err);
    }
}

async function generateReport(){
    const employerId = document.getElementById("generateEmployerSelect").value;
    const format = document.getElementById("generateFormatSelect").value;

    if (!employerId) {
        alert("Please select an employer to generate a report for.");
        return;
    }

    try {
        const report = await apiPost("/reports/generate", {
            employer_id: employerId,
            report_type: "Inspection Report",
            file_format: format,
        });
        _allReports.unshift(report);
        applyFilterAndRender();
        await refreshReportSummary();
        // auto-download the freshly generated report
        const link = document.createElement("a");
        link.href = report.download_url;
        link.download = `${report.report_code}.${report.file_format || format || "pdf"}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch (err) {
        console.error("Failed to generate report:", err);
        alert("Could not generate report: " + (err.message || "please try again."));
    }
}

function downloadReport(id){
    window.open(`/api/reports/${id}/download`, "_blank");
}

function printReport(id){
    // open the file in a new tab; PDFs show the browser's native print-ready viewer
    window.open(`/api/reports/${id}/download`, "_blank");
}

async function viewReport(id){
    try {
        const r = await apiGet(`/reports/${id}`);
        alert(
            `Report ${r.report_code}\n` +
            `Employer: ${r.employer_name}\n` +
            `Type: ${r.report_type}\n` +
            `Status: ${r.status}\n` +
            `Format: ${r.file_format.toUpperCase()}\n` +
            `Generated: ${formatReportDate(r.created_at)}`
        );
    } catch (err) {
        console.error("Failed to load report:", err);
        alert("Could not load report details.");
    }
}

function exportReportsPdf(){
    window.print();
}

function exportReportsExcel(){
    const rows = [["Report ID", "Employer", "Type", "Date", "Status", "Format"]];
    _allReports.forEach(r => {
        rows.push([r.report_code, r.employer_name || "-", r.report_type, formatReportDate(r.created_at), r.status, r.file_format]);
    });
    const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "liras_reports_export.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

let _reportsRefreshTimer = null;
document.addEventListener("DOMContentLoaded", () => {
    loadReports();
    populateEmployerSelect();
    // Keep report status and summary in sync with inspections completed elsewhere.
    _reportsRefreshTimer = window.setInterval(() => {
        if (!document.hidden) loadReports();
    }, 15000);
});
window.addEventListener("focus", () => loadReports());
window.addEventListener("liras:inspection-updated", () => loadReports());
