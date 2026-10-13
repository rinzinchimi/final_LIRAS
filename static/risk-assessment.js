let chart;

async function calculateRisk(){

    let employerName = document.getElementById("employerName").value || "New Employer";
    let industry = document.getElementById("industry").value;
    let employees = Number(document.getElementById("employees").value) || 0;
    let violations = Number(document.getElementById("violations").value) || 0;
    let complaints = Number(document.getElementById("complaints").value) || 0;
    let accidents = Number(document.getElementById("accidents").value) || 0;
    let osh = Number(document.getElementById("osh").value) || 0;

    let result;
    try {
        result = await apiPost("/predict", {
            employer_name: employerName,
            industry: industry,
            employees: employees,
            previous_violations: violations,
            worker_complaints: complaints,
            workplace_accidents: accidents,
            osh_violations: osh,
        });
    } catch (err) {
        console.error("Prediction request failed, falling back to local estimate:", err);
        result = localFallback(violations, complaints, accidents, osh, industry, employees);
    }

    document.getElementById("score").innerHTML = Math.round(result.risk_score);
    document.getElementById("level").innerHTML = result.risk_category.toUpperCase() + " RISK";
    document.getElementById("recommendation").innerHTML = result.recommendation;

    renderExplanation(result.explanation);
    createChart(violations, complaints, accidents, osh);
}

function localFallback(violations, complaints, accidents, osh, industry, employees){
    let score = violations*10 + complaints*8 + accidents*15 + osh*10;
    if (industry === "construction") score += 20;
    if (employees > 200) score += 10;
    score = Math.min(100, score);
    const category = score >= 70 ? "High" : (score >= 40 ? "Medium" : "Low");
    const recommendation = category === "High"
        ? "Immediate inspection required within 7 days."
        : category === "Medium"
            ? "Schedule inspection within 30 days."
            : "Continue monitoring compliance.";
    return { risk_score: score, risk_category: category, recommendation, explanation: [] };
}

function renderExplanation(explanationList){
    let list = document.getElementById("explanation");
    list.innerHTML = "";

    let reasons = explanationList && explanationList.length
        ? explanationList
        : ["No significant risk indicators detected."];

    reasons.forEach(item => {
        let li = document.createElement("li");
        li.innerHTML = item;
        list.appendChild(li);
    });
}

function createChart(violations, complaints, accidents, osh){
    let ctx = document.getElementById("riskChart").getContext("2d");

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: ["Violations", "Complaints", "Accidents", "OSH"],
            datasets: [{
                label: "Risk Factors",
                data: [violations, complaints, accidents, osh],
            }],
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
        },
    });
}
