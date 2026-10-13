/* =====================================
   LIRAS Global Profile / Settings Store
   Single source of truth for the logged-in
   user's profile, settings, notifications,
   activity log and sessions.

   Persisted in localStorage so it survives
   reloads and stays identical on every page
   (Dashboard, Employers, Inspections, Reports,
   Risk Assessment, Profile, Settings).

   NOTE: There is no backend user/auth service in
   this project yet, so this store is the "real"
   data source for now. Swapping localStorage for
   real /api/profile + /api/settings calls later
   only requires editing the functions below.
===================================== */

const LIRAS_PROFILE_KEY = "liras_profile_v1";
const LIRAS_SETTINGS_KEY = "liras_settings_v1";
const LIRAS_ACTIVITY_KEY = "liras_activity_v1";
const LIRAS_NOTIFS_KEY = "liras_notifications_v1";
const LIRAS_SESSIONS_KEY = "liras_sessions_v1";

const LIRAS_DEFAULT_PROFILE = {
    fullName: "Sonam Dorji",
    username: "sonam.dorji",
    email: "sonam.dorji@liras.gov.bt",
    phone: "+975 17 123456",
    role: "System Administrator",
    department: "Labour Protection Division",
    office: "Thimphu, Bhutan",
    address: "",
    avatar: "https://i.pravatar.cc/160?img=12",
    memberSince: "2024-03-15",
    status: "Active",
};

const LIRAS_DEFAULT_SETTINGS = {
    theme: "dark",
    language: "English (US)",
    dateFormat: "DD MMMM YYYY",
    timeFormat: "12-hour",
    timezone: "(GMT+06:00) Thimphu",
    currency: "BTN (Nu.)",
    defaultDashboard: "Overview",
    itemsPerPage: 10,
    autoRefresh: true,
    rememberMe: true,
    notifications: {
        email: true,
        system: true,
        inspectionAlerts: true,
        riskAlerts: true,
        reportNotifications: true,
    },
    emailPrefs: {
        weeklySummary: true,
        inspectionReminder: true,
        monthlyReport: false,
        systemUpdates: false,
        marketingEmails: false,
    },
    twoFactorEnabled: true,
    dataRetentionDays: 365,
};

const LIRAS_DEFAULT_SESSIONS = [
    { id: "s1", device: "This Device", browser: "Chrome 126", os: "Windows 11", ip: "202.144.12.5", loginTime: new Date().toISOString(), current: true },
    { id: "s2", device: "iPhone 15", browser: "Safari Mobile", os: "iOS 18", ip: "202.144.12.19", loginTime: new Date(Date.now() - 86400000).toISOString(), current: false },
];

const LIRAS_DEFAULT_NOTIFICATIONS = [
    { id: "n1", type: "inspection", title: "Inspection Assigned", body: "You have been assigned a new inspection for Druk Construction Ltd.", time: new Date(Date.now() - 1800000).toISOString(), read: false },
    { id: "n2", type: "risk", title: "Risk Alert", body: "5 employers moved into High Risk category this week.", time: new Date(Date.now() - 5400000).toISOString(), read: false },
    { id: "n3", type: "report", title: "Report Generated", body: "Monthly compliance report is ready to download.", time: new Date(Date.now() - 9000000).toISOString(), read: false },
    { id: "n4", type: "system", title: "System Alert", body: "Scheduled maintenance completed successfully.", time: new Date(Date.now() - 86400000).toISOString(), read: true },
    { id: "n5", type: "profile", title: "Profile Updated", body: "Your contact information was updated.", time: new Date(Date.now() - 172800000).toISOString(), read: true },
];

function _lirasRead(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return { ...fallback, ...parsed };
    } catch (e) {
        return fallback;
    }
}

function _lirasReadArray(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
}

function _lirasWrite(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("liras:store-changed", { detail: { key } }));
}

/* ---------------- Profile ---------------- */

function lirasGetProfile() {
    return _lirasRead(LIRAS_PROFILE_KEY, LIRAS_DEFAULT_PROFILE);
}

function lirasSaveProfile(patch, activityLabel) {
    const next = { ...lirasGetProfile(), ...patch };
    _lirasWrite(LIRAS_PROFILE_KEY, next);
    lirasLogActivity(activityLabel || "Profile Updated", "profile");
    lirasSyncTopbar();
    return next;
}

function lirasProfileCompletion(profile) {
    profile = profile || lirasGetProfile();
    const checks = [
        { label: "Basic Information", done: !!(profile.fullName && profile.username && profile.email) },
        { label: "Profile Picture", done: !!profile.avatar },
        { label: "Contact Information", done: !!(profile.phone && profile.office) },
        { label: "Security Settings", done: !!lirasGetSettings().twoFactorEnabled },
        { label: "Notification Preferences", done: !!localStorage.getItem("liras_notif_prefs_touched") },
    ];
    const done = checks.filter(c => c.done).length;
    return { percent: Math.round((done / checks.length) * 100), checks };
}

/* ---------------- Settings ---------------- */

function lirasGetSettings() {
    const s = _lirasRead(LIRAS_SETTINGS_KEY, LIRAS_DEFAULT_SETTINGS);
    s.notifications = { ...LIRAS_DEFAULT_SETTINGS.notifications, ...(s.notifications || {}) };
    s.emailPrefs = { ...LIRAS_DEFAULT_SETTINGS.emailPrefs, ...(s.emailPrefs || {}) };
    return s;
}

function lirasSaveSettings(patch, activityLabel) {
    const next = { ...lirasGetSettings(), ...patch };
    if (patch.notifications) next.notifications = { ...lirasGetSettings().notifications, ...patch.notifications };
    if (patch.emailPrefs) next.emailPrefs = { ...lirasGetSettings().emailPrefs, ...patch.emailPrefs };
    _lirasWrite(LIRAS_SETTINGS_KEY, next);
    if (activityLabel) lirasLogActivity(activityLabel, "settings");
    lirasApplyTheme(next.theme);
    return next;
}

function lirasApplyTheme(theme) {
    document.documentElement.setAttribute("data-liras-theme", theme || "dark");
}

/* ---------------- Activity Log ---------------- */

function lirasGetActivity() {
    return _lirasReadArray(LIRAS_ACTIVITY_KEY, [
        { id: "a1", label: "Logged in to the system", tag: "This Device", time: new Date().toISOString() },
        { id: "a2", label: "Generated Inspection Report", tag: "Report", time: new Date(Date.now() - 3600000).toISOString() },
        { id: "a3", label: "Updated employer risk assessment", tag: "Update", time: new Date(Date.now() - 90000000).toISOString() },
        { id: "a4", label: "Downloaded Risk Summary Report", tag: "Report", time: new Date(Date.now() - 176000000).toISOString() },
        { id: "a5", label: "Changed password", tag: "Security", time: new Date(Date.now() - 262000000).toISOString() },
    ]);
}

function lirasLogActivity(label, tag) {
    const list = lirasGetActivity();
    list.unshift({ id: "a" + Date.now(), label, tag: tag || "Update", time: new Date().toISOString() });
    _lirasWrite(LIRAS_ACTIVITY_KEY, list.slice(0, 50));
}

/* ---------------- Sessions ---------------- */

function lirasGetSessions() {
    return _lirasReadArray(LIRAS_SESSIONS_KEY, LIRAS_DEFAULT_SESSIONS);
}

function lirasRevokeSession(id) {
    const list = lirasGetSessions().filter(s => s.id !== id || s.current);
    _lirasWrite(LIRAS_SESSIONS_KEY, list);
    lirasLogActivity("Logged out a session", "Security");
}

function lirasRevokeAllOtherSessions() {
    const list = lirasGetSessions().filter(s => s.current);
    _lirasWrite(LIRAS_SESSIONS_KEY, list);
    lirasLogActivity("Logged out all other sessions", "Security");
}

/* ---------------- Notifications ---------------- */

function lirasGetNotifications() {
    return _lirasReadArray(LIRAS_NOTIFS_KEY, LIRAS_DEFAULT_NOTIFICATIONS);
}

function lirasUnreadCount() {
    return lirasGetNotifications().filter(n => !n.read).length;
}

function lirasMarkNotificationRead(id) {
    const list = lirasGetNotifications().map(n => n.id === id ? { ...n, read: true } : n);
    _lirasWrite(LIRAS_NOTIFS_KEY, list);
}

function lirasMarkAllNotificationsRead() {
    const list = lirasGetNotifications().map(n => ({ ...n, read: true }));
    _lirasWrite(LIRAS_NOTIFS_KEY, list);
}

function lirasDeleteNotification(id) {
    const list = lirasGetNotifications().filter(n => n.id !== id);
    _lirasWrite(LIRAS_NOTIFS_KEY, list);
}

/* ---------------- Topbar sync (runs on every page) ---------------- */

function lirasTimeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    return Math.floor(hrs / 24) + "d ago";
}

function _lirasNotifIcon(type) {
    return {
        inspection: "fa-clipboard-check",
        risk: "fa-triangle-exclamation",
        report: "fa-file-lines",
        system: "fa-gear",
        profile: "fa-user",
    }[type] || "fa-bell";
}

function lirasToggleNotifPanel(anchorEl) {
    let panel = document.getElementById("lirasNotifPanel");
    if (panel) { panel.remove(); return; }

    const notifs = lirasGetNotifications();
    panel = document.createElement("div");
    panel.id = "lirasNotifPanel";
    panel.className = "liras-notif-panel";
    panel.innerHTML = `
        <div class="liras-notif-head">
            <b>Notifications</b>
            <button onclick="lirasMarkAllNotificationsRead(); lirasSyncTopbar(); document.getElementById('lirasNotifPanel')?.remove(); document.querySelector('.liras-bell-wrap')?.click?.();">Mark all read</button>
        </div>
        <div class="liras-notif-list">
        ${notifs.length ? notifs.map(n => `
            <div class="liras-notif-item ${n.read ? "" : "unread"}">
                <i class="fa-solid ${_lirasNotifIcon(n.type)}"></i>
                <div class="liras-notif-body">
                    <div class="liras-notif-title">${n.title}</div>
                    <div class="liras-notif-text">${n.body}</div>
                    <div class="liras-notif-time">${lirasTimeAgo(n.time)}</div>
                </div>
                <div class="liras-notif-actions">
                    ${n.read ? "" : `<button title="Mark read" onclick="lirasMarkNotificationRead('${n.id}'); lirasSyncTopbar(); lirasRefreshNotifPanel();">
                        <i class="fa-solid fa-check"></i></button>`}
                    <button title="Delete" onclick="lirasDeleteNotification('${n.id}'); lirasSyncTopbar(); lirasRefreshNotifPanel();">
                        <i class="fa-solid fa-trash"></i></button>
                </div>
            </div>`).join("") : `<div class="liras-notif-empty">You're all caught up.</div>`}
        </div>
        <a href="settings.html" class="liras-notif-footer">Manage notification settings</a>
    `;
    document.body.appendChild(panel);

    const rect = anchorEl.getBoundingClientRect();
    panel.style.top = (rect.bottom + 10) + "px";
    panel.style.right = Math.max(16, window.innerWidth - rect.right - 10) + "px";

    setTimeout(() => {
        document.addEventListener("click", function _close(ev) {
            if (!panel.contains(ev.target) && ev.target !== anchorEl) {
                panel.remove();
                document.removeEventListener("click", _close);
            }
        });
    }, 0);
}

function lirasRefreshNotifPanel() {
    const panel = document.getElementById("lirasNotifPanel");
    if (!panel) return;
    panel.remove();
    const anchor = document.querySelector(".liras-bell-wrap");
    if (anchor) lirasToggleNotifPanel(anchor);
}

function lirasSyncTopbar() {
    const profile = lirasGetProfile();
    const count = lirasUnreadCount();

    document.querySelectorAll(".profile img, .user img").forEach(img => {
        img.src = profile.avatar;
        img.alt = profile.fullName;
    });

    document.querySelectorAll(".profile b, .user span, .profile span:not(.liras-role)").forEach(el => {
        if (el.closest(".liras-bell-wrap")) return;
        if (el.tagName === "B" || el.classList.contains("liras-name")) el.textContent = profile.fullName;
    });

    document.querySelectorAll(".profile, .user").forEach(el => {
        if (el.dataset.lirasBound) return;
        el.dataset.lirasBound = "1";
        el.style.cursor = "pointer";
        el.addEventListener("click", (e) => {
            if (e.target.closest(".liras-bell-wrap")) return;
            window.location.href = "profile.html";
        });
    });

    document.querySelectorAll(".fa-bell, .fa-solid.fa-bell").forEach(bell => {
        if (bell.closest(".menu")) return; // sidebar bell (Profile/Settings pages) already has its own handler
        if (bell.dataset.lirasBound) return;
        bell.dataset.lirasBound = "1";
        const wrap = document.createElement("span");
        wrap.className = "liras-bell-wrap";
        bell.parentNode.insertBefore(wrap, bell);
        wrap.appendChild(bell);
        const badge = document.createElement("span");
        badge.className = "liras-bell-badge";
        wrap.appendChild(badge);
        wrap.addEventListener("click", (e) => {
            e.stopPropagation();
            lirasToggleNotifPanel(wrap);
        });
    });

    document.querySelectorAll(".liras-bell-badge").forEach(b => {
        b.textContent = count > 9 ? "9+" : String(count);
        b.style.display = count > 0 ? "flex" : "none";
    });

    lirasApplyTheme(lirasGetSettings().theme);
}

document.addEventListener("DOMContentLoaded", lirasSyncTopbar);
window.addEventListener("liras:store-changed", lirasSyncTopbar);

/* ---------------- Logout (global, usable from any page) ---------------- */

function lirasLogout() {
    if (!confirm("Are you sure you want to logout?")) return;
    lirasLogActivity("Logged out", "Security");
    localStorage.removeItem("isLoggedIn");
    window.location.href = "login.html";
}
