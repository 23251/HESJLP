/*
 * visitor-count.js — the one-time "Who is visiting today?" prompt.
 *
 * WHAT IT DOES
 *   The first time someone opens the site in a browser, a small window asks
 *   whether they are a patient/family member or a provider/staff (or Skip).
 *   The answer is remembered in that browser (localStorage key
 *   "hesjlp-visitor") so the prompt never shows there again. A patient or
 *   provider answer is sent to Supabase as ONE row: {"role": "..."}.
 *   Nothing else is sent: no names, no IP logging by us, no cookies.
 *   If Supabase is down, paused, or unreachable, the site works normally and
 *   the answer is simply not counted (errors go to console.debug only).
 *
 * HOW TO TURN IT OFF
 *   In config.js set  supabaseUrl: ""  (empty quotes). The prompt will not
 *   appear at all. (Or remove the <script> tag for this file from the pages.)
 *
 * HOW TO SEE THE PROMPT AGAIN (for testing)
 *   - Add ?resetvisitor=1 to the page address, e.g. index.html?resetvisitor=1
 *   - or open the browser console and run:
 *       localStorage.removeItem('hesjlp-visitor')
 *     then reload the page.
 *   - or in the console: window.__hesjlpVisitorPrompt.reset()
 *
 * Requires config.js to be loaded BEFORE this file. No other dependencies.
 * Works from file:// and http(s)://.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "hesjlp-visitor";
  var TIMEOUT_MS = 5000;

  function debug() {
    try {
      if (window.console && console.debug) {
        console.debug.apply(console, ["[visitor-count]"].concat([].slice.call(arguments)));
      }
    } catch (e) { /* ignore */ }
  }

  // ---- storage helpers (every access wrapped; storage can throw) ----
  function storageGet() {
    try { return window.localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function storageSet(value) {
    try { window.localStorage.setItem(STORAGE_KEY, value); return true; } catch (e) { return false; }
  }
  function storageRemove() {
    try { window.localStorage.removeItem(STORAGE_KEY); return true; } catch (e) { return false; }
  }
  // True only if we can both write and read back. If not, we never show the
  // prompt (we could not remember the answer and would count people twice).
  function storageWorks() {
    try {
      var probe = STORAGE_KEY + "-probe";
      window.localStorage.setItem(probe, "1");
      var ok = window.localStorage.getItem(probe) === "1";
      window.localStorage.removeItem(probe);
      return ok;
    } catch (e) {
      return false;
    }
  }

  // Testing hook (the only global this file creates).
  window.__hesjlpVisitorPrompt = {
    reset: function () { return storageRemove(); }
  };

  function getConfig() {
    var c = window.SITE_CONFIG;
    if (!c || typeof c !== "object") return null;
    var url = typeof c.supabaseUrl === "string" ? c.supabaseUrl.trim() : "";
    if (!url) return null;
    return {
      url: url.replace(/\/+$/, ""),
      key: typeof c.supabaseKey === "string" ? c.supabaseKey : "",
      table: (typeof c.table === "string" && c.table) ? c.table : "visitor_responses"
    };
  }

  // ---- send one answer; every failure is silent ----
  function send(cfg, role) {
    try {
      if (typeof window.fetch !== "function") { debug("fetch unavailable; not sent"); return; }
      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;
      var opts = {
        method: "POST",
        headers: {
          "apikey": cfg.key,
          "Authorization": "Bearer " + cfg.key,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({ role: role }),
        credentials: "omit"
      };
      if (controller) opts.signal = controller.signal;
      window.fetch(cfg.url + "/rest/v1/" + encodeURIComponent(cfg.table), opts)
        .then(function (res) {
          if (!res.ok) debug("insert failed: HTTP " + res.status);
          else debug("counted:", role);
        })
        .catch(function (err) { debug("insert failed:", err && err.name, err && err.message); })
        .then(function () { if (timer) clearTimeout(timer); });
    } catch (e) {
      debug("insert failed:", e && e.message);
    }
  }

  var MARKUP =
    '<div class="vp-card">' +
      '<h2 id="vp-title">Welcome. Who is visiting today?</h2>' +
      '<button type="button" class="vp-btn" data-role="patient">I am a patient or family member</button>' +
      '<button type="button" class="vp-btn" data-role="provider">I am a health care provider or staff</button>' +
      '<button type="button" class="vp-skip" data-role="skip">Skip</button>' +
    '</div>';

  function init() {
    var params = "";
    try { params = window.location.search || ""; } catch (e) { /* ignore */ }
    if (/[?&]resetvisitor=1(&|$)/.test(params)) storageRemove();

    var cfg = getConfig();
    if (!cfg) { debug("no supabaseUrl in SITE_CONFIG; prompt disabled"); return; }
    if (!storageWorks()) { debug("localStorage unavailable; prompt disabled"); return; }
    if (storageGet() !== null) return; // already answered in this browser
    if (document.getElementById("visitor-prompt")) return; // already on page

    var body = document.body;
    var dialog = document.createElement("div");
    dialog.id = "visitor-prompt";
    dialog.className = "vp";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "vp-title");
    dialog.hidden = true;
    dialog.innerHTML = MARKUP;

    var buttons = [].slice.call(dialog.querySelectorAll("button[data-role]"));
    var useInert = "inert" in HTMLElement.prototype;
    var hiddenSiblings = []; // elements we made inert/aria-hidden, to undo later

    function hideBackground() {
      [].forEach.call(body.children, function (el) {
        if (el === dialog || el.tagName === "SCRIPT") return;
        if (useInert) {
          if (!el.inert) { el.inert = true; hiddenSiblings.push(el); }
        } else if (el.getAttribute("aria-hidden") !== "true") {
          el.setAttribute("aria-hidden", "true");
          hiddenSiblings.push(el);
        }
      });
    }
    function restoreBackground() {
      hiddenSiblings.forEach(function (el) {
        if (useInert) el.inert = false; else el.removeAttribute("aria-hidden");
      });
      hiddenSiblings = [];
    }

    function onKeydown(e) {
      if (e.key === "Escape" || e.key === "Esc") {
        e.preventDefault();
        choose("skip");
        return;
      }
      if (e.key === "Tab") {
        var i = buttons.indexOf(document.activeElement);
        var next;
        if (e.shiftKey) next = i <= 0 ? buttons.length - 1 : i - 1;
        else next = (i === -1 || i === buttons.length - 1) ? 0 : i + 1;
        e.preventDefault();
        buttons[next].focus();
      }
    }

    var done = false;
    function choose(role) {
      if (done) return;
      done = true;
      // 1. Remember first, so a failed request is never retried later.
      storageSet(JSON.stringify({ role: role, at: new Date().toISOString() }));
      // 2. Close and clean up.
      document.removeEventListener("keydown", onKeydown, true);
      dialog.hidden = true;
      restoreBackground();
      if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
      // Return focus to the page body so the next Tab starts at the skip link.
      try {
        var hadTabindex = body.hasAttribute("tabindex");
        if (!hadTabindex) body.setAttribute("tabindex", "-1");
        body.focus({ preventScroll: true });
        if (!hadTabindex) {
          body.addEventListener("blur", function rm() {
            body.removeAttribute("tabindex");
            body.removeEventListener("blur", rm);
          });
        }
      } catch (e) { /* ignore */ }
      // 3. Count it (patient/provider only).
      if (role === "patient" || role === "provider") send(cfg, role);
    }

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () { choose(btn.getAttribute("data-role")); });
    });

    body.appendChild(dialog);
    hideBackground();
    dialog.hidden = false;
    document.addEventListener("keydown", onKeydown, true);
    buttons[0].focus();
  }

  function safeInit() {
    try { init(); } catch (e) { debug("prompt error:", e && e.message); }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", safeInit);
  } else {
    safeInit();
  }
})();
