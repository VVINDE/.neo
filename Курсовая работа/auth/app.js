(function () {
  var tabLogin = document.getElementById("tab-login");
  var tabRegister = document.getElementById("tab-register");
  var panelLogin = document.getElementById("panel-login");
  var panelRegister = document.getElementById("panel-register");
  var tabs = document.querySelectorAll(".tabs__btn");

  function api(path, options) {
    return fetch(path, Object.assign({}, options || {}, { credentials: "include" }));
  }

  function showPanel(name) {
    var isLogin = name === "login";
    panelLogin.classList.toggle("is-visible", isLogin);
    panelLogin.hidden = !isLogin;
    panelRegister.classList.toggle("is-visible", !isLogin);
    panelRegister.hidden = isLogin;

    tabLogin.classList.toggle("is-active", isLogin);
    tabRegister.classList.toggle("is-active", !isLogin);
    tabLogin.setAttribute("aria-selected", String(isLogin));
    tabRegister.setAttribute("aria-selected", String(!isLogin));
  }

  tabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      showPanel(btn.getAttribute("data-panel"));
    });
  });

  document.getElementById("form-login").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target;
    var email = (form.email.value || "").trim();
    var password = form.password.value || "";

    api("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error(data && data.error ? data.error : "Login failed");
          return data;
        });
      })
      .then(function () {
        window.location.href = "/app/index.html";
      })
      .catch(function (err) {
        alert(err.message || String(err));
      });
  });

  document.getElementById("form-register").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target;
    var p1 = form.password.value;
    var p2 = form.password2.value;
    if (p1 !== p2) {
      alert("Пароли не совпадают.");
      return;
    }
    var email = (form.email.value || "").trim();
    var name = (form.name.value || "").trim();
    var birthDate = form.birth_date.value || "";

    api("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: p1, name: name, birth_date: birthDate }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error(data && data.error ? data.error : "Register failed");
          return data;
        });
      })
      .then(function () {
        window.location.href = "/app/index.html";
      })
      .catch(function (err) {
        alert(err.message || String(err));
      });
  });
})();
