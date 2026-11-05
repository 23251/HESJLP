/*
 * quiz.js: the "Am I exempt?" checklist on am-i-exempt.html.
 *
 * Runs only in the browser. Nothing is saved (no cookies, no localStorage)
 * and nothing is sent anywhere. Without JavaScript, the page simply shows
 * every result as a reference list.
 */
(function () {
  "use strict";

  var form = document.getElementById("quiz");
  var results = document.getElementById("results");
  if (!form || !results) return;

  var title = document.getElementById("results-title");
  var summary = document.getElementById("results-summary");
  var actions = form.querySelector(".quiz-actions");
  var cards = [].slice.call(results.querySelectorAll("[data-result]"));
  var unsureNotes = [].slice.call(results.querySelectorAll("[data-show-if]"));

  // With JavaScript: show the buttons, hide results until asked.
  if (actions) actions.hidden = false;
  results.hidden = true;

  function checkedValues() {
    var vals = {};
    [].forEach.call(form.querySelectorAll("input[type=checkbox]:checked"), function (box) {
      vals[box.value] = true;
    });
    // "Not sure if it counts" shows the health result too.
    if (vals["health-unsure"]) vals.health = true;
    return vals;
  }

  function show() {
    var vals = checkedValues();
    var shownExemptions = 0;
    var anyStep1 = vals["not-aca"] || vals["group-unsure"];

    cards.forEach(function (card) {
      var key = card.getAttribute("data-result");
      var on = !!vals[key];
      if (key === "none") on = false;
      card.hidden = !on;
      if (on && key !== "not-aca" && key !== "group-unsure") shownExemptions++;
    });

    // Nothing in step 2 checked: show "work rules may apply".
    var none = results.querySelector('[data-result="none"]');
    if (none && shownExemptions === 0 && !vals["not-aca"]) none.hidden = false;

    unsureNotes.forEach(function (el) {
      el.hidden = !vals[el.getAttribute("data-show-if")];
    });

    title.textContent = "Your results";
    if (vals["not-aca"]) {
      summary.textContent = "The work rules may not apply to you. See below, and check your Medicaid group to be sure.";
    } else if (shownExemptions === 1) {
      summary.textContent = "1 exemption may fit you. Only HFS can decide. Here's what to do and who to call.";
    } else if (shownExemptions > 1) {
      summary.textContent = shownExemptions + " exemptions may fit you. You only need one. Only HFS can decide. Here's what to do and who to call.";
    } else if (anyStep1) {
      summary.textContent = "Check your Medicaid group first. If you're an ACA Adult, you may need to meet the work rules.";
    } else {
      summary.textContent = "None of the exemptions were checked. If you're an ACA Adult, you may need to meet the work rules.";
    }

    results.hidden = false;
    title.focus();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    show();
  });

  form.addEventListener("reset", function () {
    results.hidden = true;
    var first = form.querySelector("input[type=checkbox]");
    // Let the reset finish before moving focus.
    setTimeout(function () { if (first) first.focus(); }, 0);
  });
})();
