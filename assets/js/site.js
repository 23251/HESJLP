/* site.js — small progressive enhancements only. No content lives here.
   1. Skip link: move focus to <main> reliably (some browsers keep focus on the link).
   2. Mobile nav: "Menu" disclosure button with aria-expanded.
   3. Theme preview: ?theme=green|civic|warm (or localStorage "hesjlp-theme")
      swaps the #theme-css stylesheet and html[data-theme]. Preview only. */
(function () {
  "use strict";
  var doc = document.documentElement;
  doc.classList.add("js");

  /* ---- 1. Skip link focus fix ---- */
  var skip = document.querySelector(".skip-link");
  var main = document.getElementById("main");
  if (skip && main) {
    skip.addEventListener("click", function () {
      if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
      main.focus();
    });
  }

  /* ---- 2. Mobile nav toggle ---- */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    var setOpen = function (open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      nav.classList.toggle("is-collapsed", !open);
    };
    toggle.hidden = false;
    setOpen(false);
    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    document.addEventListener("keydown", function (e) {
      if ((e.key === "Escape" || e.key === "Esc") && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  /* ---- 3. Theme preview switch ---- */
  var THEMES = ["green", "civic", "warm"];
  var KEY = "hesjlp-theme";
  var link = document.getElementById("theme-css");
  var chosen = null;
  try {
    var q = new URLSearchParams(window.location.search).get("theme");
    if (q && THEMES.indexOf(q) !== -1) {
      chosen = q;
      try { localStorage.setItem(KEY, q); } catch (e1) { /* storage blocked */ }
    } else {
      var saved = null;
      try { saved = localStorage.getItem(KEY); } catch (e2) { /* storage blocked */ }
      if (saved && THEMES.indexOf(saved) !== -1) chosen = saved;
    }
  } catch (e) { /* URLSearchParams unsupported */ }
  if (link && chosen && chosen !== doc.getAttribute("data-theme")) {
    link.setAttribute("href", "assets/css/theme-" + chosen + ".css");
    doc.setAttribute("data-theme", chosen);
  }
})();
