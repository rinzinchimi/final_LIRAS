/* LIRAS Settings page logic */

function renderSettingsPage() {
    const p = lirasGetProfile();
    const s = lirasGetSettings();

    document.getElementById("stFullName").textContent = p.fullName;
    document.getElementById("stEmail").innerHTML = `${p.email} <span class="pill pill-green">Verified</span>`;
    document.getElementById("stPhone").textContent = p.phone || "—";
    document.getElementById("stAvatar").src = p.avatar;
    document.getElementById("stDept").textContent = p.department || "—";
    document.getElementById("stRole").textContent = p.role;
    document.getElementById("stUsername").textContent = p.username;
    document.getElementById("stSessionCount").textContent = `${lirasGetSessions().length} active session(s)`;

    document.getElementById("tfaPill").textContent = s.twoFactorEnabled ? "Enabled" : "Disabled";
    document.getElementById("tfaPill").className = "pill " + (s.twoFactorEnabled ? "pill-green" : "pill-red");

    document.getElementById("prefTheme").value = s.theme;
    document.getElementById("prefLanguage").value = s.language;
    document.getElementById("prefDateFormat").value = s.dateFormat;
    document.getElementById("prefTimeFormat").value = s.timeFormat;
    document.getElementById("prefTimezone").value = s.timezone;
    document.getElementById("prefCurrency").value = s.currency;
    document.getElementById("prefDefaultDashboard").value = s.defaultDashboard;
    document.getElementById("prefItemsPerPage").value = String(s.itemsPerPage);
    document.getElementById("prefAutoRefresh").checked = !!s.autoRefresh;
    document.getElementById("prefRememberMe").checked = !!s.rememberMe;
    document.getElementById("prefRetention").value = String(s.dataRetentionDays);

    document.getElementById("nEmail").checked = !!s.notifications.email;
    document.getElementById("nSystem").checked = !!s.notifications.system;
    document.getElementById("nInspection").checked = !!s.notifications.inspectionAlerts;
    document.getElementById("nRisk").checked = !!s.notifications.riskAlerts;
    document.getElementById("nReport").checked = !!s.notifications.reportNotifications;

    document.getElementById("eWeekly").checked = !!s.emailPrefs.weeklySummary;
    document.getElementById("eReminder").checked = !!s.emailPrefs.inspectionReminder;
    document.getElementById("eSystem").checked = !!s.emailPrefs.systemUpdates;
    document.getElementById("eMarketing").checked = !!s.emailPrefs.marketingEmails;

    document.getElementById("sideNotifBadge").textContent = lirasUnreadCount();
}

function quickSaveSetting(key, value) {
    localStorage.setItem("liras_notif_prefs_touched", "1");
    lirasSaveSettings({ [key]: value }, `Settings changed: ${key}`);
    showSavedToast("Preference saved.");
}

function resetSettingsToDefault() {
    if (!confirm("Reset all system preferences to their default values?")) return;
    localStorage.removeItem(LIRAS_SETTINGS_KEY);
    window.dispatchEvent(new CustomEvent("liras:store-changed", { detail: { key: LIRAS_SETTINGS_KEY } }));
    lirasApplyTheme(lirasGetSettings().theme);
    renderSettingsPage();
    lirasLogActivity("Reset settings to defaults", "settings");
    showSavedToast("Settings reset to defaults.");
}

/* Left nav: smooth scroll + active-state highlighting */
function initSettingsNav() {
    const links = Array.from(document.querySelectorAll("#settingsNav a"));
    links.forEach(link => {
        link.addEventListener("click", () => {
            const target = document.getElementById(link.dataset.target);
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    });

    const sections = links.map(l => document.getElementById(l.dataset.target)).filter(Boolean);
    const onScroll = () => {
        let current = sections[0];
        for (const sec of sections) {
            if (sec.getBoundingClientRect().top - 120 <= 0) current = sec;
        }
        links.forEach(l => l.classList.toggle("active", l.dataset.target === current.id));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    if (location.hash) {
        const target = document.getElementById("sec-" + location.hash.slice(1));
        if (target) setTimeout(() => target.scrollIntoView({ behavior: "smooth" }), 200);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    lirasApplyTheme(lirasGetSettings().theme);
    renderSettingsPage();
    initSettingsNav();
});
window.addEventListener("liras:store-changed", renderSettingsPage);
