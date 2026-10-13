/* =====================================
   LIRAS API client
   Talks to the FastAPI backend mounted
   under /api on the same origin.
===================================== */

const API_BASE = "/api";

async function apiGet(path) {
    const res = await fetch(API_BASE + path);
    if (!res.ok) {
        throw new Error(`GET ${path} failed: ${res.status}`);
    }
    return res.json();
}

async function apiPost(path, body) {
    const res = await fetch(API_BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error((detail && detail.detail) || `POST ${path} failed: ${res.status}`);
    }
    return res.json();
}

async function apiPatch(path, body) {
    const res = await fetch(API_BASE + path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error((detail && detail.detail) || `PATCH ${path} failed: ${res.status}`);
    }
    return res.json();
}

function riskBadgeClass(category) {
    if (!category) return "low";
    const c = category.toLowerCase();
    if (c === "high") return "high";
    if (c === "medium") return "medium";
    return "low";
}

function formatScore(score) {
    if (score === null || score === undefined) return "0%";
    return Math.round(score) + "%";
}
