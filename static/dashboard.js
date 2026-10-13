/* =====================================
   LIRAS Dashboard
   dashboard.js
===================================== */

let riskChart;

async function loadDashboard() {
    try {
        const data = await apiGet("/dashboard");

        document.getElementById("statTotalEmployers").innerText = data.total_employers.toLocaleString();
        document.getElementById("statHighRisk").innerText = data.high_risk_count.toLocaleString();
        document.getElementById("statCompleted").innerText = data.total_inspections.toLocaleString();
        const pendingHighMedium = data.high_risk_count + data.medium_risk_count;
        document.getElementById("statPending").innerText = pendingHighMedium.toLocaleString();

        renderRiskChart(data.risk_distribution);
        renderAiBox(data);
        renderPriorityTable(data.priority_inspection_list);
    } catch (err) {
        console.error("Failed to load dashboard data:", err);
    }
}

function renderRiskChart(dist) {
    const ctx = document.getElementById("riskChart");
    if (riskChart) riskChart.destroy();
    const categories = ["High", "Medium", "Low"];
    riskChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["High Risk", "Medium Risk", "Low Risk"],
            datasets: [{
                data: [dist.high, dist.medium, dist.low],
                backgroundColor: ["#dc2626", "#f59e0b", "#16a34a"],
            }],
        },
        options: {
            responsive: true,
            onClick: (evt, elements) => {
                if (!elements.length) return;
                drillByRiskCategory(categories[elements[0].index]);
            },
        },
    });
}

function renderAiBox(data) {
    const top = data.top_high_risk_employers || [];
    const summaryEl = document.getElementById("aiSummaryText");
    const sectorLabelEl = document.getElementById("aiTopSectorLabel");
    const sectorCountEl = document.getElementById("aiTopSectorCount");
    const actionEl = document.getElementById("aiRecommendedAction");

    if (top.length === 0) {
        summaryEl.innerText = "No high-risk workplaces detected in the current dataset.";
        sectorLabelEl.innerText = "-";
        sectorCountEl.innerText = "0 High Risk Employers";
        actionEl.innerText = "Routine monitoring is sufficient.";
        return;
    }

    const bySector = {};
    top.forEach(e => { bySector[e.sector] = (bySector[e.sector] || 0) + 1; });
    const topSector = Object.entries(bySector).sort((a, b) => b[1] - a[1])[0];

    summaryEl.innerText = `System detected ${data.high_risk_count} high-risk workplace(s) requiring immediate attention.`;
    sectorLabelEl.innerText = `${topSector[0]} Sector`;
    sectorCountEl.innerText = `${topSector[1]} High Risk Employer(s)`;
    actionEl.innerText = top[0].recommendation || "Inspect within 7 days";
}

function renderPriorityTable(list) {
    const tbody = document.getElementById("priorityTableBody");
    tbody.innerHTML = "";

    (list || []).slice(0, 8).forEach(e => {
        const badgeClass = riskBadgeClass(e.risk_category);
        const badgeLabel = e.risk_category === "High" ? "High Risk" : e.risk_category;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${e.name}</td>
            <td>${e.sector}</td>
            <td>${formatScore(e.risk_score)}</td>
            <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

/* ---------- Card / chart drill-downs ---------- */

async function drillTotalEmployers() {
    try {
        const employers = await apiGet("/employers?limit=1000");
        openEmployerListModal("Total Employers", employers);
    } catch (err) {
        console.error(err);
    }
}

async function drillHighRisk() {
    try {
        const employers = await apiGet("/high-risk");
        openEmployerListModal("High Risk Employers", employers);
    } catch (err) {
        console.error(err);
    }
}

async function drillPending() {
    // "Pending Inspection" = employers whose risk level means they are
    // due for a follow-up inspection (High + Medium risk).
    try {
        const [high, medium] = await Promise.all([apiGet("/high-risk"), apiGet("/medium-risk")]);
        openEmployerListModal("Pending Inspection (High + Medium Risk)", [...high, ...medium]);
    } catch (err) {
        console.error(err);
    }
}

async function drillCompleted() {
    // "Completed" = actual inspection records already conducted.
    try {
        const inspections = await apiGet("/inspections?limit=1000");
        openInspectionListModal("Completed Inspections", inspections);
    } catch (err) {
        console.error(err);
    }
}

async function drillByRiskCategory(category) {
    try {
        const path = category === "High" ? "/high-risk" : category === "Medium" ? "/medium-risk" : "/low-risk";
        const employers = await apiGet(path);
        openEmployerListModal(`${category} Risk Employers`, employers);
    } catch (err) {
        console.error(err);
    }
}

document.addEventListener("DOMContentLoaded", loadDashboard);
