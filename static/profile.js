/* LIRAS Profile page logic */

const ACTIVITY_ICONS = {
    "Report": { icon: "fa-file-lines", cls: "tag-blue", bg: "rgba(96,165,250,.14)", color: "#60a5fa" },
    "Update": { icon: "fa-pen", cls: "tag-purple", bg: "rgba(167,139,250,.14)", color: "#a78bfa" },
    "Security": { icon: "fa-shield-halved", cls: "tag-amber", bg: "rgba(245,158,11,.14)", color: "#fbbf24" },
    "This Device": { icon: "fa-right-to-bracket", cls: "tag-green", bg: "rgba(34,197,94,.14)", color: "#4ade80" },
    "profile": { icon: "fa-user", cls: "tag-green", bg: "rgba(34,197,94,.14)", color: "#4ade80" },
    "settings": { icon: "fa-gear", cls: "tag-purple", bg: "rgba(167,139,250,.14)", color: "#a78bfa" },
};

function renderProfilePage() {
    const profile = lirasGetProfile();
    const settings = lirasGetSettings();

    document.getElementById("pfAvatar").src = profile.avatar;
    document.getElementById("pfName").textContent = profile.fullName;
    document.getElementById("pfEmail").textContent = profile.email;
    document.getElementById("pfRolePill").textContent = profile.role;
    document.getElementById("topRole").textContent = profile.role.includes("Admin") ? "Admin" : profile.role;

    document.getElementById("pfDetailRows").innerHTML = `
        <div class="info-row"><span>Full Name</span><span>${profile.fullName}</span></div>
        <div class="info-row"><span>Username</span><span>${profile.username}</span></div>
        <div class="info-row"><span>Email</span><span>${profile.email}</span></div>
        <div class="info-row"><span>Phone</span><span>${profile.phone || "—"}</span></div>
        <div class="info-row"><span>Role</span><span>${profile.role}</span></div>
        <div class="info-row"><span>Department</span><span>${profile.department || "—"}</span></div>
        <div class="info-row"><span>Location</span><span>${profile.office || "—"}</span></div>
        <div class="info-row"><span>Member Since</span><span>${new Date(profile.memberSince).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</span></div>
        <div class="info-row"><span>Last Login</span><span><span class="status-dot"></span>${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}, ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
    `;

    const completion = lirasProfileCompletion(profile);
    const circumference = 2 * Math.PI * 52;
    document.getElementById("ringProgress").setAttribute("stroke-dasharray", circumference.toFixed(0));
    document.getElementById("ringProgress").setAttribute("stroke-dashoffset", (circumference * (1 - completion.percent / 100)).toFixed(0));
    document.getElementById("ringPct").textContent = completion.percent + "%";
    document.getElementById("pfChecklist").innerHTML = completion.checks.map(c => `
        <div class="check-item ${c.done ? "done" : ""}">
            <i class="fa-solid ${c.done ? "fa-circle-check" : "fa-circle"}"></i>${c.label}
        </div>
    `).join("");

    const activity = lirasGetActivity().slice(0, 5);
    document.getElementById("pfActivityList").innerHTML = activity.map(a => {
        const meta = ACTIVITY_ICONS[a.tag] || ACTIVITY_ICONS["Update"];
        return `
        <div class="activity-row">
            <div class="activity-icon" style="background:${meta.bg};color:${meta.color};"><i class="fa-solid ${meta.icon}"></i></div>
            <div class="activity-txt">${a.label}<small>${new Date(a.time).toLocaleString("en-GB", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</small></div>
            <span class="tag ${meta.cls}">${a.tag}</span>
        </div>`;
    }).join("") || `<p style="color:var(--muted);font-size:13px;">No activity yet.</p>`;

    const stats = [
        { icon: "fa-clipboard-check", bg: "rgba(96,165,250,.14)", color: "#60a5fa", label: "Total Inspections", value: 248 },
        { icon: "fa-building", bg: "rgba(245,158,11,.14)", color: "#fbbf24", label: "Employers Assessed", value: 532 },
        { icon: "fa-file-lines", bg: "rgba(167,139,250,.14)", color: "#a78bfa", label: "Reports Generated", value: 128 },
        { icon: "fa-display", bg: "rgba(34,197,94,.14)", color: "#4ade80", label: "Active Sessions", value: lirasGetSessions().length },
        { icon: "fa-bell", bg: "rgba(239,68,68,.14)", color: "#f87171", label: "Unread Notifications", value: lirasUnreadCount() },
    ];
    document.getElementById("pfStatsList").innerHTML = stats.map(s => `
        <div class="stat-row">
            <div class="stat-icon" style="background:${s.bg};color:${s.color};"><i class="fa-solid ${s.icon}"></i></div>
            <span class="lbl">${s.label}</span><span class="val">${s.value}</span>
        </div>
    `).join("");

    document.getElementById("sideNotifBadge").textContent = lirasUnreadCount();
}

document.addEventListener("DOMContentLoaded", () => {
    lirasApplyTheme(lirasGetSettings().theme);
    renderProfilePage();
});
window.addEventListener("liras:store-changed", renderProfilePage);
