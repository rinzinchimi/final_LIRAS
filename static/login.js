const form = document.getElementById("loginForm");

form.addEventListener("submit", function (e) {

    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (email === "admin@liras.gov.bt" && password === "admin123") {

        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("userEmail", email);

        window.location.replace("dashboard.html");

    } else {

        alert("Invalid email or password.");

    }

});
