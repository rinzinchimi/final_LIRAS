/* LIRAS shared account modals (Edit Profile, Change Picture, Change Password,
   Activity Log, Sessions, Logout) - used by both profile.html and settings.html */

function lirasRefreshPage() {
    if (typeof renderProfilePage === "function") renderProfilePage();
    if (typeof renderSettingsPage === "function") renderSettingsPage();
}

/* ---------------- Edit Profile ---------------- */

function openEditProfileModal() {
    const p = lirasGetProfile();
    _ensureModalRoot();
    document.getElementById("lirasModalRoot").innerHTML = `
    <div class="liras-modal-overlay" onclick="if(event.target===this) closeLirasModal()">
      <div class="liras-modal-box dark">
        <div class="liras-modal-header"><h3>Edit Profile</h3><button class="liras-modal-close" onclick="closeLirasModal()"><i class="fa fa-xmark"></i></button></div>
        <div id="editProfileMsg" class="form-msg"></div>
        <div class="liras-form-row"><label>Full Name</label><input id="epName" value="${p.fullName}"></div>
        <div class="liras-form-row"><label>Username</label><input id="epUsername" value="${p.username}"></div>
        <div class="liras-form-row"><label>Email</label><input id="epEmail" value="${p.email}"></div>
        <div class="liras-form-row"><label>Phone</label><input id="epPhone" value="${p.phone}"></div>
        <div class="liras-form-row"><label>Department</label><input id="epDept" value="${p.department}"></div>
        <div class="liras-form-row"><label>Office</label><input id="epOffice" value="${p.office}"></div>
        <div class="liras-form-row"><label>Address</label><input id="epAddress" value="${p.address || ""}"></div>
        <div class="modal-actions">
          <button class="btn btn-outline" onclick="closeLirasModal()">Cancel</button>
          <button class="btn btn-accent" style="width:auto;padding:11px 22px;" onclick="submitEditProfile()">Save Changes</button>
        </div>
      </div>
    </div>`;
}

function submitEditProfile() {
    const name = document.getElementById("epName").value.trim();
    const username = document.getElementById("epUsername").value.trim();
    const email = document.getElementById("epEmail").value.trim();
    const phone = document.getElementById("epPhone").value.trim();
    const msg = document.getElementById("editProfileMsg");

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const phoneOk = phone === "" || /^[+\d][\d\s-]{6,}$/.test(phone);

    if (!name || !username) {
        msg.className = "form-msg err"; msg.textContent = "Full name and username are required.";
        return;
    }
    if (!emailOk) {
        msg.className = "form-msg err"; msg.textContent = "Please enter a valid email address.";
        return;
    }
    if (!phoneOk) {
        msg.className = "form-msg err"; msg.textContent = "Please enter a valid phone number.";
        return;
    }

    lirasSaveProfile({
        fullName: name, username, email, phone,
        department: document.getElementById("epDept").value.trim(),
        office: document.getElementById("epOffice").value.trim(),
        address: document.getElementById("epAddress").value.trim(),
    }, "Profile Updated");

    msg.className = "form-msg ok"; msg.textContent = "Profile updated successfully.";
    lirasRefreshPage();
    setTimeout(closeLirasModal, 700);
}

/* ---------------- Change Picture ---------------- */

function openChangePictureModal() {
    const avatars = [12, 20, 33, 45, 51, 60, 65, 68];
    _ensureModalRoot();
    document.getElementById("lirasModalRoot").innerHTML = `
    <div class="liras-modal-overlay" onclick="if(event.target===this) closeLirasModal()">
      <div class="liras-modal-box dark">
        <div class="liras-modal-header"><h3>Change Profile Picture</h3><button class="liras-modal-close" onclick="closeLirasModal()"><i class="fa fa-xmark"></i></button></div>
        <p style="font-size:12.5px;color:var(--muted);margin-bottom:14px;">Choose a new avatar.</p>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
          ${avatars.map(n => `<img src="https://i.pravatar.cc/160?img=${n}" style="width:100%;aspect-ratio:1;border-radius:50%;cursor:pointer;border:2px solid transparent;" onclick="selectAvatar(${n})">`).join("")}
        </div>
        <div class="modal-actions"><button class="btn btn-outline" onclick="closeLirasModal()">Close</button></div>
      </div>
    </div>`;
}

function selectAvatar(n) {
    lirasSaveProfile({ avatar: `https://i.pravatar.cc/160?img=${n}` }, "Changed profile picture");
    lirasRefreshPage();
    closeLirasModal();
}

/* ---------------- Change Password ---------------- */

function openChangePasswordModal() {
    _ensureModalRoot();
    document.getElementById("lirasModalRoot").innerHTML = `
    <div class="liras-modal-overlay" onclick="if(event.target===this) closeLirasModal()">
      <div class="liras-modal-box dark">
        <div class="liras-modal-header"><h3>Change Password</h3><button class="liras-modal-close" onclick="closeLirasModal()"><i class="fa fa-xmark"></i></button></div>
        <div id="pwMsg" class="form-msg"></div>
        <div class="liras-form-row"><label>Current Password</label>
          <div class="pw-wrap"><input type="password" id="pwCurrent"><i class="fa-solid fa-eye" onclick="_togglePw('pwCurrent', this)"></i></div>
        </div>
        <div class="liras-form-row"><label>New Password</label>
          <div class="pw-wrap"><input type="password" id="pwNew"><i class="fa-solid fa-eye" onclick="_togglePw('pwNew', this)"></i></div>
        </div>
        <div class="liras-form-row"><label>Confirm New Password</label>
          <div class="pw-wrap"><input type="password" id="pwConfirm"><i class="fa-solid fa-eye" onclick="_togglePw('pwConfirm', this)"></i></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" onclick="closeLirasModal()">Cancel</button>
          <button class="btn btn-accent" style="width:auto;padding:11px 22px;" onclick="submitChangePassword()">Update Password</button>
        </div>
      </div>
    </div>`;
}

function _togglePw(id, icon) {
    const input = document.getElementById(id);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    icon.className = show ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
}

function submitChangePassword() {
    const cur = document.getElementById("pwCurrent").value;
    const next = document.getElementById("pwNew").value;
    const confirm = document.getElementById("pwConfirm").value;
    const msg = document.getElementById("pwMsg");

    if (!cur) { msg.className = "form-msg err"; msg.textContent = "Enter your current password."; return; }
    if (next.length < 8) { msg.className = "form-msg err"; msg.textContent = "New password must be at least 8 characters."; return; }
    if (!/[A-Z]/.test(next) || !/[0-9]/.test(next)) { msg.className = "form-msg err"; msg.textContent = "Password needs at least one uppercase letter and one number."; return; }
    if (next !== confirm) { msg.className = "form-msg err"; msg.textContent = "New password and confirmation do not match."; return; }

    lirasLogActivity("Changed password", "Security");
    msg.className = "form-msg ok"; msg.textContent = "Password updated successfully.";
    lirasRefreshPage();
    setTimeout(closeLirasModal, 800);
}

/* ---------------- Activity Log ---------------- */

function openActivityLogModal() {
    const list = lirasGetActivity();
    _ensureModalRoot();
    document.getElementById("lirasModalRoot").innerHTML = `
    <div class="liras-modal-overlay" onclick="if(event.target===this) closeLirasModal()">
      <div class="liras-modal-box dark liras-modal-wide">
        <div class="liras-modal-header"><h3>Activity Log</h3><button class="liras-modal-close" onclick="closeLirasModal()"><i class="fa fa-xmark"></i></button></div>
        <div style="max-height:60vh;overflow-y:auto;">
        ${list.map(a => {
            const meta = ACTIVITY_ICONS[a.tag] || ACTIVITY_ICONS["Update"];
            return `<div class="activity-row">
                <div class="activity-icon" style="background:${meta.bg};color:${meta.color};"><i class="fa-solid ${meta.icon}"></i></div>
                <div class="activity-txt">${a.label}<small>${new Date(a.time).toLocaleString()}</small></div>
                <span class="tag ${meta.cls}">${a.tag}</span>
            </div>`;
        }).join("")}
        </div>
      </div>
    </div>`;
}

/* ---------------- Sessions ---------------- */

function openSessionsModal() {
    const sessions = lirasGetSessions();
    _ensureModalRoot();
    document.getElementById("lirasModalRoot").innerHTML = `
    <div class="liras-modal-overlay" onclick="if(event.target===this) closeLirasModal()">
      <div class="liras-modal-box dark">
        <div class="liras-modal-header"><h3>Active Sessions</h3><button class="liras-modal-close" onclick="closeLirasModal()"><i class="fa fa-xmark"></i></button></div>
        <div id="sessionsList">
        ${sessions.map(s => `
            <div class="session-row">
                <i class="fa-solid ${s.device.toLowerCase().includes("iphone") || s.device.toLowerCase().includes("phone") ? "fa-mobile-screen" : "fa-desktop"}"></i>
                <div class="meta">
                    <b>${s.device} ${s.current ? '<span class="tag tag-green">Current</span>' : ""}</b>
                    <small>${s.browser} · ${s.os} · ${s.ip}</small>
                    <small>Logged in ${new Date(s.loginTime).toLocaleString()}</small>
                </div>
                ${s.current ? "" : `<button class="btn btn-danger" style="width:auto;padding:8px 14px;" onclick="lirasRevokeSession('${s.id}'); openSessionsModal(); lirasRefreshPage();">Logout</button>`}
            </div>`).join("")}
        </div>
        <div class="modal-actions">
          <button class="btn btn-danger" style="width:auto;padding:10px 16px;" onclick="lirasRevokeAllOtherSessions(); openSessionsModal(); lirasRefreshPage();">Logout all other devices</button>
        </div>
      </div>
    </div>`;
}

/* ---------------- Username (used on Settings page) ---------------- */

function openEditUsernameModal() {
    const p = lirasGetProfile();
    _ensureModalRoot();
    document.getElementById("lirasModalRoot").innerHTML = `
    <div class="liras-modal-overlay" onclick="if(event.target===this) closeLirasModal()">
      <div class="liras-modal-box dark">
        <div class="liras-modal-header"><h3>Edit Username</h3><button class="liras-modal-close" onclick="closeLirasModal()"><i class="fa fa-xmark"></i></button></div>
        <div id="unameMsg" class="form-msg"></div>
        <div class="liras-form-row"><label>Username</label><input id="unameInput" value="${p.username}"></div>
        <div class="modal-actions">
          <button class="btn btn-outline" onclick="closeLirasModal()">Cancel</button>
          <button class="btn btn-accent" style="width:auto;padding:11px 22px;" onclick="submitEditUsername()">Save</button>
        </div>
      </div>
    </div>`;
}

function submitEditUsername() {
    const val = document.getElementById("unameInput").value.trim();
    const msg = document.getElementById("unameMsg");
    if (!/^[a-z0-9._-]{3,}$/i.test(val)) {
        msg.className = "form-msg err"; msg.textContent = "Username must be at least 3 characters (letters, numbers, dots, dashes).";
        return;
    }
    lirasSaveProfile({ username: val }, "Updated username");
    msg.className = "form-msg ok"; msg.textContent = "Username updated.";
    lirasRefreshPage();
    setTimeout(closeLirasModal, 600);
}

/* ---------------- Two-Factor ---------------- */

function toggleTwoFactor() {
    const s = lirasGetSettings();
    const enabling = !s.twoFactorEnabled;
    if (!confirm(enabling ? "Enable Two-Factor Authentication?" : "Disable Two-Factor Authentication? This reduces your account security.")) return;
    lirasSaveSettings({ twoFactorEnabled: enabling }, enabling ? "Enabled Two-Factor Authentication" : "Disabled Two-Factor Authentication");
    lirasRefreshPage();
    showSavedToast(enabling ? "Two-factor authentication enabled." : "Two-factor authentication disabled.");
}

/* ---------------- Privacy / Data / Delete Account ---------------- */

function openPrivacySettingsModal() {
    const s = lirasGetSettings();
    _ensureModalRoot();
    document.getElementById("lirasModalRoot").innerHTML = `
    <div class="liras-modal-overlay" onclick="if(event.target===this) closeLirasModal()">
      <div class="liras-modal-box dark">
        <div class="liras-modal-header"><h3>Privacy Settings</h3><button class="liras-modal-close" onclick="closeLirasModal()"><i class="fa fa-xmark"></i></button></div>
        <div class="field-row"><div class="flabel">Data Retention</div><div class="fval">${s.dataRetentionDays} days</div></div>
        <p style="font-size:12.5px;color:var(--muted);margin-top:10px;line-height:1.6;">
          Your profile and activity data is stored locally for this demo environment. Use Export Data to download a copy,
          or Delete Account to permanently remove it from this device.
        </p>
        <div class="modal-actions"><button class="btn btn-outline" onclick="closeLirasModal()">Close</button></div>
      </div>
    </div>`;
}

function exportData() {
    const payload = {
        profile: lirasGetProfile(),
        settings: lirasGetSettings(),
        activity: lirasGetActivity(),
        sessions: lirasGetSessions(),
        notifications: lirasGetNotifications(),
        exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `liras_account_data_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    lirasLogActivity("Exported account data", "Update");
    showSavedToast("Your data export has started downloading.");
}

function confirmDeleteAccount() {
    const step1 = prompt('This will permanently delete your account and all locally stored data.\nType "DELETE" to confirm.');
    if (step1 !== "DELETE") {
        if (step1 !== null) showSavedToast("Account deletion cancelled — confirmation text did not match.");
        return;
    }
    localStorage.removeItem(LIRAS_PROFILE_KEY);
    localStorage.removeItem(LIRAS_SETTINGS_KEY);
    localStorage.removeItem(LIRAS_ACTIVITY_KEY);
    localStorage.removeItem(LIRAS_NOTIFS_KEY);
    localStorage.removeItem(LIRAS_SESSIONS_KEY);
    localStorage.removeItem("isLoggedIn");
    alert("Your account data has been deleted from this device.");
    window.location.href = "login.html";
}

/* ---------------- Toast ---------------- */

function showSavedToast(message) {
    const existing = document.getElementById("lirasToast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "lirasToast";
    toast.className = "toast";
    toast.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>${message || "Changes saved."}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
}
