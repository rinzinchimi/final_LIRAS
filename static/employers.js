/* =====================================
   LIRAS Employer Management
   employers.js
===================================== */

let employers = [];

function openModal(){
    document.getElementById("modal").style.display="flex";
}

function closeModal(){
    document.getElementById("modal").style.display="none";
}

function badgeClassFor(risk){
    return risk.toLowerCase() + "-risk";
}

function renderEmployerTable(list){
    const table = document.getElementById("employerTable");
    table.innerHTML = "";

    list.forEach(e => {
        const row = document.createElement("tr");
        row.dataset.employerId = e.id;
        row.innerHTML = `
            <td>${e.id}</td>
            <td>${e.name}</td>
            <td>${e.sector}</td>
            <td>${e.dzongkhag}</td>
            <td>${e.total_inspections}</td>
            <td><span class="badge ${badgeClassFor(e.risk_category)}">${e.risk_category}</span></td>
            <td>${formatScore(e.final_risk_score)}</td>
            <td>
                <button class="view" onclick="viewEmployer('${e.id}')"><i class="fa fa-eye"></i></button>
                <button class="edit"><i class="fa fa-pen"></i></button>
                <button class="delete" onclick="this.closest('tr').remove()"><i class="fa fa-trash"></i></button>
            </td>
        `;
        table.appendChild(row);
    });
}

function viewEmployer(id){
    openEmployerDetailModal(id);
}

function drillAllEmployers(){
    openEmployerListModal("Total Employers", employers);
}

function drillRisk(category){
    const list = employers.filter(e => e.risk_category === category);
    openEmployerListModal(`${category} Risk Employers`, list);
}

async function loadEmployers(){
    try {
        employers = await apiGet("/employers?limit=500");
        renderEmployerTable(employers);

        document.getElementById("totalEmployers").innerText = employers.length;
        document.getElementById("statHighRisk").innerText = employers.filter(e => e.risk_category === "High").length;
        document.getElementById("statMediumRisk").innerText = employers.filter(e => e.risk_category === "Medium").length;
        document.getElementById("statLowRisk").innerText = employers.filter(e => e.risk_category === "Low").length;
    } catch (err) {
        console.error("Failed to load employers:", err);
    }
}

function addEmployer(){
    let name=document.getElementById("name").value;
    let industry=document.getElementById("industry").value;
    let location=document.getElementById("location").value;
    let employeesCount=document.getElementById("employees").value;
    let risk=document.getElementById("risk").value;

    let table=document.getElementById("employerTable");

    let row=document.createElement("tr");
    row.innerHTML = `
        <td>NEW${String(table.rows.length+1).padStart(3,"0")}</td>
        <td>${name}</td>
        <td>${industry}</td>
        <td>${location}</td>
        <td>${employeesCount}</td>
        <td><span class="badge ${risk.toLowerCase()}-risk">${risk}</span></td>
        <td>-</td>
        <td>
            <button class="view"><i class="fa fa-eye"></i></button>
            <button class="edit"><i class="fa fa-pen"></i></button>
            <button class="delete" onclick="this.closest('tr').remove()"><i class="fa fa-trash"></i></button>
        </td>
    `;
    table.appendChild(row);
    closeModal();
}

function searchEmployer(){
    let input=document.getElementById("search").value.toLowerCase();
    let rows=document.querySelectorAll("#employerTable tr");
    let filter=document.getElementById("filter").value;

    rows.forEach(row=>{
        let text=row.innerText.toLowerCase();
        const matchesText = text.includes(input);
        const matchesFilter = filter === "all" || text.includes(filter.toLowerCase());
        row.style.display = (matchesText && matchesFilter) ? "" : "none";
    });
}

document.addEventListener("DOMContentLoaded", () => {
    loadEmployers();
    document.getElementById("filter").addEventListener("change", searchEmployer);
});
