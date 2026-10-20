/* Dot to Deal — static, client-side only. Nothing leaves the browser. */

const GATE_HASH = "9106ee3b532a7797ad4962ea7db321d450d3004d5837c8f05e8f8c414a4decce";
const APPKEY = "dtd";

/* ---------- utilities ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const n = (v, d = 0) => { if (v === "" || v === null || v === undefined) return d; const x = Number(v); return Number.isFinite(x) ? x : d; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const money = (v) => "$" + Math.round(v).toLocaleString("en-US");
const plural = (c, w) => `${c} ${w}${c === 1 ? "" : "s"}`;
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str == null ? "" : str);
  return div.innerHTML;
}

const pad2 = (x) => String(x).padStart(2, "0");
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function addDays(iso, d) {
  const t = new Date(iso + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}
function bizDay(iso) {
  const w = new Date(iso + "T00:00:00Z").getUTCDay();
  if (w === 6) return addDays(iso, 2);
  if (w === 0) return addDays(iso, 1);
  return iso;
}
function fmtDate(iso) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

let toastTimer = null;
function showToast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 1800);
}

/* ---------- gate / theme / tabs ---------- */
async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function initGate() {
  const gate = $("#gate");
  const form = $("#gateForm");
  const input = $("#gatePassword");
  const error = $("#gateError");
  if (gate.classList.contains("is-unlocked")) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const hash = await sha256Hex(input.value.trim());
    if (hash === GATE_HASH) {
      try { localStorage.setItem(APPKEY + "_access", "granted"); } catch { /* ignore */ }
      gate.classList.add("is-unlocked");
      error.classList.remove("is-visible");
    } else {
      error.classList.add("is-visible");
      input.value = "";
      input.focus();
    }
  });
}

function initTheme() {
  const toggle = $("#themeToggle");
  const root = document.documentElement;
  function effectiveTheme() {
    const attr = root.getAttribute("data-theme");
    if (attr === "dark" || attr === "light") return attr;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  toggle.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem(APPKEY + "_theme", next); } catch { /* ignore */ }
  });
}

function initTabs() {
  const btns = $$(".tab-btn");
  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      btns.forEach((b) => { b.classList.remove("is-active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      $$(".panel").forEach((p) => p.classList.remove("is-active"));
      $("#panel-" + btn.dataset.tab).classList.add("is-active");
      window.scrollTo({ top: 0 });
    });
  });
}

function initSubtabs() {
  $$(".subtabs").forEach((bar) => {
    const panel = bar.closest(".panel");
    $$(".subtab-btn", bar).forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".subtab-btn", bar).forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        $$(".tool", panel).forEach((t) => t.classList.remove("is-active"));
        $("#tool-" + btn.dataset.tool).classList.add("is-active");
        if (btn.dataset.tool === "queue") refreshQueueNote();
        if (btn.dataset.tool === "cadence") refreshDue();
        if (TOOLS[btn.dataset.tool]) TOOLS[btn.dataset.tool].prefill();
      });
    });
  });
}

/* ---------- save / reopen ---------- */
function formatSavedAt(iso) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function initSaveable({ toolId, listEl, getEntry, applyEntry, max = 50, onChange }) {
  const key = `${APPKEY}_saved_${toolId}`;
  const read = () => lsGet(key, []);
  const write = (entries) => { lsSet(key, entries.slice(0, max)); render(); if (onChange) onChange(); };

  function render() {
    const entries = read();
    if (!entries.length) {
      listEl.innerHTML = `<p class="saved-empty">Nothing saved yet — generate something, then press Save.</p>`;
      return;
    }
    listEl.innerHTML = entries.map((e) => `
      <div class="saved-item" data-id="${escapeHtml(e.id)}">
        <div class="saved-item-main">
          <div class="saved-item-name">${escapeHtml(e.name)}</div>
          <div class="saved-item-meta">${escapeHtml(e.meta)} · ${formatSavedAt(e.savedAt)}</div>
        </div>
        <div class="saved-actions">
          <button class="ghost-btn" data-act="open">Open</button>
          <button class="ghost-btn" data-act="delete">Delete</button>
        </div>
      </div>`).join("");
  }

  listEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.closest(".saved-item").dataset.id;
    const entry = read().find((e) => e.id === id);
    if (!entry) return;
    if (btn.dataset.act === "open") {
      applyEntry(entry.payload);
      showToast("Opened");
    } else {
      write(read().filter((e) => e.id !== id));
      showToast("Deleted");
    }
  });

  render();

  return {
    save() {
      const entry = getEntry();
      if (!entry) { showToast("Nothing to save yet"); return; }
      write([{ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), savedAt: new Date().toISOString(), ...entry }, ...read()]);
      showToast("Saved");
    },
  };
}

/* ---------- tool framework ---------- */
function collect(root) {
  const o = {};
  $$("[data-f]", root).forEach((el) => {
    const k = el.dataset.f;
    if (el.type === "checkbox") o[k] = el.checked;
    else if (el.type === "number") o[k] = el.value === "" ? "" : Number(el.value);
    else o[k] = el.value;
  });
  return o;
}
function restore(root, o) {
  if (!o) return;
  $$("[data-f]", root).forEach((el) => {
    const k = el.dataset.f;
    if (!(k in o)) return;
    if (el.type === "checkbox") el.checked = !!o[k];
    else el.value = o[k] === null || o[k] === undefined ? "" : o[k];
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch { /* ignore */ }
    ta.remove();
  }
}

const TOOLS = {};

function initTool(def) {
  const root = $("#tool-" + def.id);
  const form = $(".form-card", root);
  const right = $(".right", root);
  const factsEl = def.facts ? $("#" + def.facts) : null;
  const extra = (def.extraBtns || []).map((b) => `<button class="ghost-btn" id="${b.id}-${def.id}">${b.label}</button>`).join("");
  right.innerHTML = `
    <div class="output-card">
      <div class="output-head">
        <span class="output-label">${def.outTitle}</span>
        <div class="output-actions">${extra}<button class="ghost-btn" id="save-${def.id}">Save</button><button class="ghost-btn" id="copy-${def.id}">Copy</button></div>
      </div>
      <div class="out-body"><p class="output-placeholder">${def.placeholder}</p></div>
    </div>
    <div class="output-card saved-card">
      <div class="output-head"><span class="output-label">${def.savedTitle}</span></div>
      <div class="saved-list"></div>
    </div>`;
  const out = $(".out-body", right);
  let current = null;

  const getInputs = () => ({ ...collect(form), ...(factsEl ? { __facts: collect(factsEl) } : {}) });
  const setInputs = (i) => {
    restore(form, i);
    if (factsEl && i.__facts) { restore(factsEl, i.__facts); lsSet("dtd_facts", i.__facts); }
  };
  const persistAuto = () => lsSet(`${APPKEY}_auto_${def.id}`, { inputs: collect(form), generated: !!current });

  function show(c) {
    current = c;
    out.innerHTML = c ? def.render(c.data, c.inputs) : `<p class="output-placeholder">${def.placeholder}</p>`;
  }

  function run(silent) {
    const inputs = getInputs();
    let data;
    try { data = def.compute(inputs); } catch (e) { console.error(e); if (!silent) showToast("Something went wrong — check your inputs"); return; }
    if (data && data.error) { if (!silent) showToast(data.error); return; }
    show({ inputs, data });
    if (def.after) def.after(data, inputs);
    persistAuto();
  }

  $(`[data-act="generate"]`, form).addEventListener("click", () => run(false));
  form.addEventListener("input", persistAuto);
  form.addEventListener("change", persistAuto);

  const saveable = initSaveable({
    toolId: def.id,
    listEl: $(".saved-list", right),
    getEntry: () => (current ? { ...def.entry(current.data, current.inputs), payload: current } : null),
    applyEntry: (payload) => { setInputs(payload.inputs); show(payload); persistAuto(); },
    onChange: def.onSavedChange,
  });
  $("#save-" + def.id).addEventListener("click", saveable.save);
  $("#copy-" + def.id).addEventListener("click", async () => {
    if (!current) { showToast("Nothing to copy yet"); return; }
    await copyText(def.text(current.data, current.inputs));
    showToast("Copied");
  });
  (def.extraBtns || []).forEach((b) => {
    $(`#${b.id}-${def.id}`).addEventListener("click", () => { if (!current) { showToast("Generate something first"); return; } b.fn(current); });
  });

  // restore last session's inputs, regenerate the last output
  const auto = lsGet(`${APPKEY}_auto_${def.id}`, null);
  if (auto) restore(form, auto.inputs);
  const todayEl = $('[data-f="today"]', form);
  if (todayEl) todayEl.value = todayISO();
  const prefill = () => { if (def.prefill) def.prefill(form); };
  prefill();
  if (auto && auto.generated) run(true);
  TOOLS[def.id] = { run, getInputs, setInputs, prefill, show: () => current };
}

/* ---------- niche data ---------- */
// value = how valuable one customer is (1-10); crowd = how competitive local search is (1-10)
// ticket = rough value of one new customer in dollars (editable in the tools); fixBase/retainerBase = pricing starting points
const NICHES = {
  plumber:     { label: "Plumber",              noun: "plumber",          value: 6,  crowd: 8, urgent: true,  ticket: 450,  fixBase: 700,  retainerBase: 400, extras: [["drain cleaning", false], ["water heater repair", true], ["sewer line repair", true]] },
  hvac:        { label: "HVAC",                 noun: "hvac company",     value: 8,  crowd: 8, urgent: true,  ticket: 1500, fixBase: 900,  retainerBase: 450, extras: [["ac repair", false], ["furnace replacement", true], ["ac installation", true]] },
  roofer:      { label: "Roofer",               noun: "roofer",           value: 9,  crowd: 7, urgent: true,  ticket: 6000, fixBase: 900,  retainerBase: 450, extras: [["roof repair", false], ["roof replacement", true], ["storm damage roof repair", false]] },
  electrician: { label: "Electrician",          noun: "electrician",      value: 6,  crowd: 6, urgent: true,  ticket: 400,  fixBase: 600,  retainerBase: 350, extras: [["panel upgrade", true], ["ev charger installation", true], ["electrical repair", false]] },
  locksmith:   { label: "Locksmith",            noun: "locksmith",        value: 3,  crowd: 7, urgent: true,  ticket: 180,  fixBase: 450,  retainerBase: 300, extras: [["car key replacement", false], ["lock change", false]] },
  pest:        { label: "Pest control",         noun: "pest control",     value: 4,  crowd: 6, urgent: true,  ticket: 250,  fixBase: 500,  retainerBase: 300, extras: [["termite treatment", true], ["bed bug removal", false], ["rodent control", false]] },
  dentist:     { label: "Dentist",              noun: "dentist",          value: 9,  crowd: 8, urgent: false, ticket: 900,  fixBase: 1000, retainerBase: 500, extras: [["emergency dentist", false], ["dental implants", true], ["teeth whitening", false]] },
  chiro:       { label: "Chiropractor",         noun: "chiropractor",     value: 5,  crowd: 7, urgent: false, ticket: 600,  fixBase: 700,  retainerBase: 400, extras: [["back pain relief", false], ["sciatica treatment", false]] },
  medspa:      { label: "Med spa",              noun: "med spa",          value: 8,  crowd: 6, urgent: false, ticket: 700,  fixBase: 900,  retainerBase: 500, extras: [["botox", true], ["laser hair removal", true]] },
  lawyer:      { label: "Lawyer",               noun: "lawyer",           value: 10, crowd: 9, urgent: false, ticket: 4000, fixBase: 1200, retainerBase: 600, extras: [["car accident lawyer", true], ["dui lawyer", true]] },
  landscaper:  { label: "Landscaper",           noun: "landscaper",       value: 5,  crowd: 6, urgent: false, ticket: 800,  fixBase: 600,  retainerBase: 350, extras: [["lawn care", false], ["landscape design", true]] },
  vet:         { label: "Veterinarian",         noun: "vet",              value: 5,  crowd: 5, urgent: false, ticket: 300,  fixBase: 600,  retainerBase: 350, extras: [["emergency vet", false], ["dog grooming", false]] },
  gym:         { label: "Gym or studio",        noun: "gym",              value: 3,  crowd: 7, urgent: false, ticket: 600,  fixBase: 450,  retainerBase: 300, extras: [["personal trainer", true], ["yoga classes", false]] },
  salon:       { label: "Salon",                noun: "hair salon",       value: 3,  crowd: 8, urgent: false, ticket: 120,  fixBase: 450,  retainerBase: 300, extras: [["balayage", true], ["haircut", false]] },
  restaurant:  { label: "Restaurant or cafe",   noun: "restaurant",       value: 3,  crowd: 9, urgent: false, ticket: 40,   fixBase: 450,  retainerBase: 300, extras: [["brunch", false], ["catering", true]] },
  auto:        { label: "Auto repair",          noun: "auto repair",      value: 5,  crowd: 7, urgent: true,  ticket: 450,  fixBase: 600,  retainerBase: 350, extras: [["brake repair", false], ["transmission repair", true]] },
  cleaning:    { label: "Cleaning service",     noun: "cleaning service", value: 4,  crowd: 7, urgent: false, ticket: 200,  fixBase: 500,  retainerBase: 300, extras: [["house cleaning", false], ["deep cleaning", false]] },
  other:       { label: "Other local business", noun: "local business",   value: 5,  crowd: 6, urgent: false, ticket: 300,  fixBase: 600,  retainerBase: 350, extras: [] },
};
const nicheOf = (k) => NICHES[k] || NICHES.other;

function fillNicheSelects() {
  const opts = Object.entries(NICHES).map(([k, v]) => `<option value="${k}">${escapeHtml(v.label)}</option>`).join("");
  $$(".niche-select").forEach((s) => { s.innerHTML = opts; });
}

/* ---------- shared scan facts (Replies tab) ---------- */
function factsOf(f) {
  f = f || {};
  const total = Math.max(1, n(f.total, 25));
  const top3 = clamp(n(f.top3, 0), 0, total);
  return {
    biz: (f.biz || "").trim() || "your business",
    owner: (f.owner || "").trim(),
    service: (f.service || "").trim() || "what you do",
    town: (f.town || "").trim() || "town",
    competitor: (f.competitor || "").trim() || "a competitor",
    total, top3,
    hard: n(f.hard, 0), buried: n(f.buried, 0), notfound: n(f.notfound, 0),
    red: total - top3,
    redPct: Math.round(((total - top3) / total) * 100),
    topPct: Math.round((top3 / total) * 100),
  };
}
const upFirst = (t) => t.charAt(0).toUpperCase() + t.slice(1);
// A business name that already ends in a full stop ("Summit Plumbing Co.") must not produce ".." when a template adds its own.
const tidy = (t) => t.replace(/(?<!\.)\.\.(?!\.)/g, ".");
// address forms that read naturally whether or not the owner's name was entered
function addr(f) {
  return {
    ...f,
    to: f.owner ? `, ${f.owner}` : "",
    hi: f.owner ? `Hi ${f.owner}` : "Hi there",
    callee: f.owner || "the owner",
    Biz: upFirst(f.biz),
    Competitor: upFirst(f.competitor),
    search: f.service === "what you do" ? "that search" : `"${f.service}"`,
  };
}

function initFacts() {
  const el = $("#repliesFacts");
  restore(el, lsGet("dtd_facts", null));
  const save = () => lsSet("dtd_facts", collect(el));
  el.addEventListener("input", save);
  el.addEventListener("change", save);
}

/* ======================================================================
   1. PROSPECT SCORECARD
   ====================================================================== */
const TIERS = [
  { min: 75, key: "t-scan", label: "Scan first", advice: "Strong signs of a red map and money to fix it. Spend credits here first." },
  { min: 55, key: "t-second", label: "Good second wave", advice: "Worth scanning once your top-tier businesses are done." },
  { min: 35, key: "t-maybe", label: "Only if credits are spare", advice: "Some signals, but not a sure thing. Scan if you have credits left over." },
  { min: 0, key: "t-skip", label: "Skip for now", advice: "Weak signals. Your credits will go further elsewhere." },
];

function computeScore(i) {
  const niche = nicheOf(i.niche);
  const reviews = n(i.reviews, 0);
  const rating = n(i.rating, 0);
  const reviewPts = reviews < 10 ? 20 : reviews < 30 ? 16 : reviews < 75 ? 11 : reviews < 150 ? 6 : 2;
  const sitePts = ({ none: 12, weak: 8, good: 2 })[i.website] ?? 6;
  const activePts = ({ no: 8, some: 4, yes: 0 })[i.activity] ?? 4;
  const compPts = ({ few: 2, some: 6, many: 10 })[i.comp] ?? 6;
  const crowdPts = niche.crowd + compPts;
  const valuePts = Math.round(niche.value * 2.5);
  const operatingPts = reviews >= 30 ? 5 : reviews >= 10 ? 3 : 0;
  const reachPts = ({ inperson: 5, phone: 4, email: 3, none: 0 })[i.reach] ?? 2;
  const roomPts = rating > 0 && rating < 4.5 ? 5 : 0;
  const gap = reviewPts + sitePts + activePts;
  const crowd = crowdPts;
  const pay = valuePts + operatingPts + reachPts + roomPts;
  const score = gap + crowd + pay;
  const tier = TIERS.find((t) => score >= t.min);
  return {
    name: (i.name || "").trim() || "This business",
    niche: niche.label, town: (i.town || "").trim(),
    score, tier: tier.label, tierKey: tier.key, advice: tier.advice,
    factors: [
      { label: "Likely to be invisible", pts: gap, max: 40, note: `${plural(reviews, "review")}, ${({ none: "no website", weak: "a weak website", good: "a solid website" })[i.website] || "unknown website"}, ${({ no: "no recent activity", some: "some activity", yes: "an active profile" })[i.activity] || "unknown activity"}.` },
      { label: "Crowded search", pts: crowd, max: 20, note: `${niche.label} is a ${niche.crowd >= 8 ? "very" : niche.crowd >= 6 ? "fairly" : "less"} competitive niche, with ${i.comp || "some"} strong competitors nearby.` },
      { label: "Can pay and can be reached", pts: pay, max: 40, note: `One ${niche.noun} customer is worth ${niche.value >= 8 ? "a lot" : niche.value >= 5 ? "a fair amount" : "a modest amount"}; ${reviews >= 10 ? "they look like a real, operating business" : "few reviews make that harder to judge"}; reach: ${({ inperson: "in person", phone: "by phone", email: "by email", none: "no route yet" })[i.reach] || "unknown"}${roomPts ? "; their rating leaves room for a story" : ""}.` },
    ],
  };
}

function scoreText(d) {
  return [`${d.name}${d.town ? " — " + d.town : ""} (${d.niche})`, `Score: ${d.score}/100 — ${d.tier}`, d.advice, "", ...d.factors.map((f) => `- ${f.label}: ${f.pts}/${f.max}. ${f.note}`)].join("\n");
}

const DEFS = [];

DEFS.push({
  id: "scorecard",
  outTitle: "Scorecard",
  savedTitle: "Saved scorecards (your shortlist)",
  placeholder: "Fill in what you can see on Google Maps, then press Score this business.",
  compute: computeScore,
  render: (d) => `
    <div class="headline-row"><div class="big-num">${d.score}<small>/100</small></div><span class="tier-chip ${d.tierKey}">${escapeHtml(d.tier)}</span></div>
    <div class="meter" aria-hidden="true"><i style="width:${d.score}%"></i></div>
    <p class="out-p" style="margin-top:12px"><strong>${escapeHtml(d.name)}</strong>${d.town ? " · " + escapeHtml(d.town) : ""} · ${escapeHtml(d.niche)}. ${escapeHtml(d.advice)}</p>
    <div class="out-sub">Where the points come from</div>
    ${d.factors.map((f) => `<div class="factor"><b>${escapeHtml(f.label)}</b><span class="pts">${f.pts} / ${f.max}</span><span class="why">${escapeHtml(f.note)}</span></div>`).join("")}`,
  text: scoreText,
  entry: (d) => ({ name: d.name, meta: `${d.score}/100 · ${d.tier}` }),
  onSavedChange: () => refreshQueueNote(),
});

/* ======================================================================
   2. KEYWORD PAIR PICKER
   ====================================================================== */
function pickKeywords(i) {
  const niche = nicheOf(i.niche);
  const noun = niche.noun;
  const town = (i.town || "").trim();
  const service = (i.service || "").trim().toLowerCase();
  const goal = i.goal || "calls";
  const count = clamp(n(i.count, 2), 1, 5);
  const emergency = i.emergency === "yes";
  const withTown = (t) => (town ? `${t} ${town}` : t);
  const c = [];
  const add = (type, phrase, weight, why) => {
    const dup = c.find((x) => x.phrase === phrase);
    if (dup) { if (weight > dup.weight) Object.assign(dup, { type, weight, why }); return; }
    c.push({ type, phrase, weight, why });
  };

  add("nearme", `${noun} near me`, 70, "How most customers search on a phone, standing somewhere specific.");
  if (town) add("town", `${noun} ${town}`, 65, "The plain version of the search, tied to the town they serve.");
  if (niche.urgent) {
    add("urgent", `emergency ${noun}`, emergency ? 88 + (goal === "calls" ? 6 : 0) : 35,
      emergency ? "They take urgent calls, and these searches turn into phone calls fastest." : "Weak fit — they don't take urgent calls, so winning this would bring calls they can't answer.");
  }
  if (service) add("service", withTown(service), 80 + (goal === "jobs" ? 10 : 0), "A specific service they actually sell, so the customer is already close to buying.");
  add("best", `best ${noun}${town ? " " + town : ""}`, 55 + (goal === "new" ? 15 : 0), "Comparison shoppers; useful when the goal is new customers.");
  niche.extras.forEach(([t, hi]) => {
    add("extra", withTown(t), 58 + (hi && goal === "jobs" ? 22 : 0) + (!hi && goal === "calls" ? 6 : 0), hi ? "A higher-ticket search." : "An everyday search that brings steady work.");
  });

  const sorted = c.map((x, idx) => ({ ...x, idx })).sort((a, b) => b.weight - a.weight || a.idx - b.idx);
  const unique = new Set(["nearme", "town", "urgent", "best"]);
  const used = new Set();
  const chosen = [];
  const skipped = [];
  sorted.forEach((x) => {
    if (chosen.length >= count) { skipped.push({ ...x, reason: "Lower priority than the ones picked." }); return; }
    if (unique.has(x.type) && used.has(x.type)) { skipped.push({ ...x, reason: "Same kind of search as one already picked." }); return; }
    used.add(x.type);
    chosen.push(x);
  });
  return { business: (i.biz || "").trim(), niche: niche.label, town, count, chosen, skipped: skipped.slice(0, 4) };
}

DEFS.push({
  id: "keywords",
  outTitle: "Your keywords",
  savedTitle: "Saved keyword picks",
  placeholder: "Pick a niche and town, then press Pick my keywords.",
  compute: pickKeywords,
  render: (d) => `
    <p class="out-p">Scan these ${d.chosen.length} for ${escapeHtml(d.business || "this business")} (${escapeHtml(d.niche)}${d.town ? ", " + escapeHtml(d.town) : ""}):</p>
    ${d.chosen.map((k, idx) => `<div class="factor"><b>${idx + 1}. “${escapeHtml(k.phrase)}”</b><span class="pts">${k.weight}</span><span class="why">${escapeHtml(k.why)}</span></div>`).join("")}
    ${d.skipped.length ? `<div class="out-sub">Left out</div><ul class="skip-list">${d.skipped.map((k) => `<li>“${escapeHtml(k.phrase)}” — ${escapeHtml(k.reason)}</li>`).join("")}</ul>` : ""}`,
  text: (d) => [`Keywords for ${d.business || "this business"} (${d.niche}${d.town ? ", " + d.town : ""}):`, ...d.chosen.map((k, idx) => `${idx + 1}. ${k.phrase} — ${k.why}`)].join("\n"),
  entry: (d) => ({ name: d.business || `${d.niche} keywords`, meta: d.chosen.map((k) => k.phrase).join(" · ") }),
});

/* ======================================================================
   3. CREDIT-SAFE SCAN QUEUE
   ====================================================================== */
function loadShortlist() {
  const seen = new Set();
  const list = [];
  lsGet("dtd_saved_scorecard", []).forEach((e) => { // newest first
    const d = e.payload && e.payload.data;
    if (!d) return;
    const k = d.name.trim().toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    list.push({ name: d.name, score: d.score, tier: d.tier });
  });
  return list;
}
function loadKeywordPicks() {
  const map = {};
  lsGet("dtd_saved_keywords", []).forEach((e) => {
    const d = e.payload && e.payload.data;
    if (!d || !d.business) return;
    const k = d.business.trim().toLowerCase();
    if (!map[k]) map[k] = d.chosen.map((x) => x.phrase);
  });
  return map;
}

function buildQueue(i, shortlist, picks) {
  const points = n(i.grid, 25);
  const kw = clamp(n(i.kw, 2), 1, 10);
  const balance = Math.max(0, n(i.balance, 0));
  const cap = i.cap === "unlimited" ? Infinity : n(i.cap, 10);
  const minScore = n(i.minScore, 35);
  const recurClients = Math.max(0, n(i.recurClients, 0));
  const runs = ({ weekly: 4, fortnightly: 2, monthly: 1 })[i.cadence] || 1;
  const reserve = recurClients * runs * points; // one keyword per recurring client
  const spendable = Math.max(0, balance - reserve);
  const costPer = points * kw;

  const eligible = shortlist.filter((s) => s.score >= minScore).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const belowMin = shortlist.length - eligible.length;
  let used = 0;
  const rows = [];
  const skipped = [];
  eligible.forEach((s) => {
    if (rows.length >= cap) { skipped.push({ ...s, reason: "Over your plan's business cap" }); return; }
    if (used + costPer > spendable) { skipped.push({ ...s, reason: "Not enough credits left" }); return; }
    used += costPer;
    const p = picks[s.name.trim().toLowerCase()];
    rows.push({ rank: rows.length + 1, name: s.name, score: s.score, cost: costPer, left: spendable - used, keywords: p ? p.slice(0, kw) : null });
  });
  const shortBy = Math.max(0, eligible.length * costPer - spendable);
  const alts = [25, 49, 81].map((g) => ({
    grid: g,
    count: Math.min(cap === Infinity ? Infinity : cap, Math.floor(spendable / (g * kw))),
  }));
  return {
    points, kw, balance, cap: cap === Infinity ? "unlimited" : cap, reserve, spendable, costPer, runs, recurClients,
    shortlistCount: shortlist.length, eligibleCount: eligible.length, belowMin, rows, skipped, used, leftover: spendable - used, shortBy, alts,
  };
}

function refreshQueueNote() {
  const el = $("#queueNote");
  if (!el) return;
  const list = loadShortlist();
  el.textContent = list.length
    ? `${plural(list.length, "saved scorecard")} will be queued, best score first.`
    : "No saved scorecards yet. Score a business in Prospect Scorecard and press Save — it will appear here.";
}

DEFS.push({
  id: "queue",
  outTitle: "Your scan queue",
  savedTitle: "Saved queues",
  placeholder: "Enter your credit balance, then press Build my scan queue. Your saved scorecards are queued automatically.",
  compute: (i) => {
    if (!(n(i.balance, 0) > 0)) return { error: "Enter your credit balance first" };
    const sl = loadShortlist();
    if (!sl.length) return { error: "Save at least one scorecard first (Prospect Scorecard → Save)" };
    return buildQueue(i, sl, loadKeywordPicks());
  },
  render: (d) => `
    <div class="headline-row"><div class="big-num">${d.rows.length}<small> to scan</small></div><span class="tier-chip">${d.used} of ${d.spendable} credits used</span></div>
    <p class="out-p">${d.reserve ? `${d.reserve} credits are held back for ${plural(d.recurClients, "recurring client")} (${d.runs} run${d.runs === 1 ? "" : "s"} a month each). ` : ""}Each business costs ${d.costPer} credits (${d.points} spots × ${plural(d.kw, "keyword")}). ${d.leftover} credits left over.</p>
    ${d.rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Business</th><th>Score</th><th>Keywords</th><th>Cost</th><th>Left</th></tr></thead><tbody>
      ${d.rows.map((r) => `<tr><td>${r.rank}</td><td>${escapeHtml(r.name)}</td><td>${r.score}</td><td>${r.keywords ? escapeHtml(r.keywords.join(", ")) : "<span style='color:var(--ink-soft)'>your picks</span>"}</td><td>${r.cost}</td><td>${r.left}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="out-p">Nothing fits your spendable credits yet.</p>`}
    ${d.skipped.length ? `<div class="out-sub">Not yet</div><ul class="skip-list">${d.skipped.map((s) => `<li>${escapeHtml(s.name)} (${s.score}) — ${escapeHtml(s.reason)}</li>`).join("")}</ul>` : ""}
    ${d.belowMin ? `<p class="out-p" style="margin-top:10px">${plural(d.belowMin, "business")} below your minimum score ${d.belowMin === 1 ? "was" : "were"} left out.</p>` : ""}
    ${d.shortBy ? `<div class="tip"><b>To scan every eligible business</b> you need ${d.shortBy} more credits.</div>` : ""}
    <div class="out-sub">What your credits buy at each grid size (${plural(d.kw, "keyword")} each)</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Grid</th><th>Credits per business</th><th>Businesses you can afford</th></tr></thead><tbody>
      ${d.alts.map((a) => `<tr><td>${Math.sqrt(a.grid)}×${Math.sqrt(a.grid)}</td><td>${a.grid * d.kw}</td><td>${a.count}</td></tr>`).join("")}
    </tbody></table></div>`,
  text: (d) => [`Scan queue — ${d.used} of ${d.spendable} spendable credits (${d.points} spots × ${d.kw} keywords = ${d.costPer} per business)`, ...d.rows.map((r) => `${r.rank}. ${r.name} (score ${r.score})${r.keywords ? " — " + r.keywords.join(", ") : ""} — ${r.cost} credits`), ...(d.skipped.length ? ["", "Not yet:", ...d.skipped.map((s) => `- ${s.name}: ${s.reason}`)] : [])].join("\n"),
  entry: (d) => ({ name: `Queue of ${d.rows.length}`, meta: `${d.used}/${d.spendable} credits · ${d.points}-spot grid` }),
});

/* ======================================================================
   4. OBJECTION RESPONDER
   ====================================================================== */
const OBJ_PRIORITY = ["optout", "guarantee", "price", "has_seo", "looks_fine", "how_works", "send_info", "not_now"];
const OBJ_PHRASES = {
  optout: ["not interested", "no thanks", "no thank you", "remove me", "unsubscribe", "stop emailing", "stop contacting", "stop messaging", "stop texting", "don't contact", "do not contact", "leave me alone", "take me off"],
  guarantee: ["guarantee", "guaranteed", "promise", "#1", "number one", "number 1", "first page", "top spot", "proof", "prove", "results", "case study", "case studies", "work for me"],
  price: ["how much", "cost", "costly", "price", "pricing", "expensive", "afford", "budget", "fee", "fees", "charge", "quote"],
  has_seo: ["seo guy", "seo company", "seo person", "seo agency", "marketing company", "marketing agency", "my agency", "already have", "already work", "someone handles", "someone does", "webmaster", "web guy", "my guy", "nephew"],
  looks_fine: ["i look fine", "looks fine", "i'm fine", "im fine", "i show up", "i rank", "i'm first", "im first", "first on google", "top of google", "i see myself", "i google myself", "doing fine", "doing great", "don't need", "do not need", "we're good", "we are good", "no need"],
  how_works: ["how does", "how do", "what is this", "what's this", "whats this", "what do you mean", "don't understand", "do not understand", "explain", "what exactly", "what are the dots", "what does this mean", "confused"],
  send_info: ["send info", "send me info", "send me more", "more info", "more information", "email me", "details", "brochure", "send details", "send it over", "send over"],
  not_now: ["not now", "busy", "later", "next month", "next week", "bad time", "not a good time", "slow season", "busy season", "call me back", "circle back", "after the holidays", "maybe later"],
};
const OBJ_LABELS = {
  optout: "They want you to stop", guarantee: "Asking for a guarantee or proof", price: "Asking about price",
  has_seo: "“I already have an SEO person”", looks_fine: "“I look fine on Google”", how_works: "Doesn't understand the map",
  send_info: "“Send me info”", not_now: "“Not now”", fallback: "Unclear — a friendly open question",
};

function phraseHit(text, phrase) {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pre = /^[a-z0-9]/.test(phrase) ? "(?<![a-z0-9])" : "";
  const post = /[a-z0-9]$/.test(phrase) ? "(?![a-z0-9])" : "";
  return new RegExp(pre + esc + post).test(text);
}

function classifyReply(raw) {
  const text = String(raw || "").toLowerCase().replace(/[’‘]/g, "'");
  const found = {};
  Object.entries(OBJ_PHRASES).forEach(([cat, list]) => {
    const hits = list.filter((p) => phraseHit(text, p));
    if (hits.length) found[cat] = hits;
  });
  const cats = OBJ_PRIORITY.filter((c) => found[c]);
  if (!cats.length) return { top: "fallback", hits: [], also: [] };
  if (found.optout) return { top: "optout", hits: found.optout, also: [] };
  let best = cats[0];
  cats.forEach((c) => { if (found[c].length > found[best].length) best = c; });
  return { top: best, hits: found[best], also: cats.filter((c) => c !== best).map((c) => ({ cat: c, hits: found[c] })) };
}

const REPLIES = {
  optout: {
    friendly: (f) => `No problem at all${f.to} — I won't contact you again. Wishing ${f.biz} a great season.`,
    direct: (f) => `Understood${f.to}. I won't contact you again. All the best with ${f.biz}.`,
    tip: "Stop here. Note them as do-not-contact and don't schedule any more follow-ups.",
  },
  guarantee: {
    friendly: (f) => `Fair question${f.to} — and I'd rather be honest than promise something nobody can. Nobody can guarantee a #1 spot; rankings depend on a lot of things.\n\nWhat I can promise is the process: ${f.biz} is in the top 3 at ${f.top3} of ${f.total} spots today. I'll do the specific fixes in the plan, then rescan next month so you can see on the same map exactly what changed.`,
    direct: (f) => `I can't guarantee a ranking and neither can anyone honest. What I can do: fix what the scan shows (top 3 at ${f.top3} of ${f.total} spots today), then rescan next month so you can see the change on the same map.`,
    tip: "Never promise a position. Offer the rescan as the proof, because that's what the product supports.",
  },
  price: {
    friendly: (f, q) => `Happy to give you a straight number${f.to}. For ${f.biz} the first step is fixing the red areas the map shows (${f.red} of ${f.total} spots). That's ${q.price}.\n\nWant me to start this week?`,
    direct: (f, q) => `${q.price}. That covers fixing the ${f.red} red spots around ${f.town} and a rescan to show the change. Want me to start this week?`,
    tip: "Say the price once, then stop talking. If you don't have a number yet, use the Fix Price Calculator in Rate Card.",
  },
  has_seo: {
    friendly: (f) => `That's great${f.to} — then this is easy to use as a second opinion. Forward the map to them and ask why ${f.biz} isn't in the top 3 at ${f.red} of ${f.total} spots around ${f.town}.\n\nIf they have a good answer, you've lost nothing. If they don't, I'm happy to help.`,
    direct: (f) => `Good. Send them the map and ask why ${f.biz} is missing from the top 3 at ${f.red} of ${f.total} spots. A good answer costs you nothing; if they don't have one, call me.`,
    tip: "Don't criticise their current provider. Position the map as a question for them to answer.",
  },
  looks_fine: {
    friendly: (f) => `That's actually why I made it${f.to}. When you search for ${f.biz} yourself, Google knows it's you, so you see the flattering version.\n\nThis map checks from ${f.total} spots around ${f.town}, the way a stranger would. ${f.Biz} is in the top 3 at ${f.top3} of them. In the other ${f.red}, ${f.competitor} and others show up first.\n\nCan I walk you through it in five minutes?`,
    direct: (f) => `Fair — but you're searching from your own shop, where Google knows exactly who you are. The map checks from ${f.total} spots across ${f.town}: top 3 at ${f.top3}, buried or missing at ${f.buried + f.notfound}. Want the five-minute walk-through?`,
    tip: "Don't say they're wrong. Explain why what they see differs from what a stranger sees.",
  },
  how_works: {
    friendly: (f) => `Sure${f.to}. Quick version: each dot is a spot around ${f.town}. I searched ${f.search} as if I were standing at that spot. Green means ${f.biz} showed up in the top 3; red means it didn't show up at all.\n\nYou're green at ${f.top3} and not green at ${f.red}. I can show you in five minutes if that's easier.`,
    direct: (f) => `Each dot is a spot in ${f.town}. Green: ${f.biz} is in the top 3 for ${f.search} from there. Red: it isn't. You're green at ${f.top3} of ${f.total}. Five minutes on a call and I'll show you where.`,
    tip: "Keep it to the dot metaphor. No SEO jargon.",
  },
  send_info: {
    friendly: (f) => `Of course${f.to}. The map is the information — here it is again: [your report link]. It shows ${f.biz} in the top 3 at ${f.top3} of ${f.total} spots around ${f.town}, and it has a plain-English plan on the last page.\n\nIf anything in it isn't clear, I'm glad to explain it.`,
    direct: (f) => `The map is the info: [your report link]. Top 3 at ${f.top3} of ${f.total} spots, with the plan on the last page. Tell me what's unclear.`,
    tip: "Resist sending a brochure. Send the report link again and ask for one question.",
  },
  not_now: {
    friendly: (f, q) => `Totally understand${f.to}. I'll leave it with you. The map isn't going anywhere: [your report link]. I'll check back on ${q.followDate}, and if the timing is still off, just say so and I'll leave you be.`,
    direct: (f, q) => `No problem. I'll check back ${q.followDate}. Link stays live: [your report link].`,
    tip: "Agree to a date and put it in the Follow-Up Cadence Builder. Don't push twice.",
  },
  fallback: {
    friendly: (f) => `Thanks for getting back to me${f.to}. What's the most useful thing I can clear up about the map for ${f.biz}? It shows the top 3 at ${f.top3} of ${f.total} spots around ${f.town}, and I'm happy to go through any part of it.`,
    direct: (f) => `Thanks${f.to}. What would be most useful to clear up about the map? Top 3 at ${f.top3} of ${f.total} spots.`,
    tip: "When it's unclear, ask one open question instead of pitching.",
  },
};

function buildReply(i) {
  const text = (i.text || "").trim();
  if (!text) return { error: "Paste what the owner said first" };
  const f = addr(factsOf(i.__facts));
  const cls = classifyReply(text);
  const tone = i.tone === "direct" ? "direct" : "friendly";
  const today = i.today || todayISO();
  const q = { price: (i.quote || "").trim() || "[your price]", followDate: fmtDate(addDays(today, 14)) };
  const tpl = REPLIES[cls.top];
  return {
    category: cls.top, label: OBJ_LABELS[cls.top], hits: cls.hits,
    also: cls.also.map((a) => OBJ_LABELS[a.cat]),
    reply: tidy(tpl[tone](f, q)), tip: tpl.tip, owner: f.owner, biz: f.biz,
  };
}

DEFS.push({
  id: "objection",
  facts: "repliesFacts",
  outTitle: "Your reply",
  savedTitle: "Saved replies",
  placeholder: "Paste the owner's reply, then press Write my reply.",
  compute: buildReply,
  render: (d) => `
    <div class="headline-row"><span class="tier-chip">${escapeHtml(d.label)}</span></div>
    ${d.hits.length ? `<p class="out-p" style="color:var(--ink-soft);font-size:12.5px">Matched: ${d.hits.map((h) => "“" + escapeHtml(h) + "”").join(", ")}${d.also.length ? " · Also touched on: " + d.also.map(escapeHtml).join(", ") : ""}</p>` : ""}
    <div class="msg-box">${escapeHtml(d.reply)}</div>
    <div class="tip"><b>Before you send:</b> ${escapeHtml(d.tip)}</div>`,
  text: (d) => d.reply,
  entry: (d) => ({ name: `${d.owner || d.biz} — ${d.label}`, meta: d.biz }),
});

/* ======================================================================
   5. FOLLOW-UP CADENCE BUILDER
   ====================================================================== */
const OFFSETS = { busy: [0, 4, 9, 15, 25], skeptic: [0, 3, 7, 14, 28], curious: [0, 2, 5, 10, 18] };
const CHANNEL_LABEL = { email: "Email", dm: "Social DM", text: "Text message", phone: "Phone call" };
const ALT_CHANNEL = { email: "phone", dm: "email", text: "phone", phone: "email" };

function buildCadence(i) {
  const f = addr(factsOf(i.__facts));
  const start = i.start || todayISO();
  const today = i.today || todayISO();
  const ch = CHANNEL_LABEL[i.channel] ? i.channel : "email";
  const temp = OFFSETS[i.temp] ? i.temp : "busy";
  const alt = ALT_CHANNEL[ch];
  const off = OFFSETS[temp];
  const extra1 = temp === "busy" ? " It takes 30 seconds to look at." : "";
  const extra2 = temp === "skeptic" ? "\nYou can check any dot yourself — happy to share the exact search and spot." : temp === "curious" ? "\nThe map updates every time we rescan, so you can watch it change." : "";
  const drafts = [
    `${f.hi}, I ran a quick Google Maps check on ${f.biz}. In ${f.red} of ${f.total} spots around ${f.town}, people searching for ${f.service} can't find you in the top 3. Here's the map: [your report link].${extra1} Happy to walk you through it if it's useful.`,
    `${f.hi}, just checking you saw the map I sent for ${f.biz}. The red areas are where customers searching for ${f.service} aren't finding you. Happy to explain in five minutes if that helps.${extra2}`,
    alt === "phone"
      ? `Call ${f.callee}: "${f.hi}, it's [your name]. I sent a map showing where ${f.biz} appears around ${f.town}. Do you have two minutes for me to point out the red spots?" If voicemail: leave your number and the one sentence above.`
      : `Subject: The map for ${f.biz}\n\n${f.hi}, I tried a different route in case my earlier note got buried. Here's the map: [your report link]. It's in the top 3 at ${f.top3} of ${f.total} spots — happy to explain the rest.`,
    `${f.hi}, one thing I noticed: ${f.competitor} shows up first at spots where ${f.biz} doesn't. That's the gap I'd close first. Want the one-page version of the plan?`,
    `${f.hi}, I don't want to crowd your inbox, so this is my last note about this map. If it ever becomes a priority, the link still works: [your report link]. Wishing you a busy season.`,
  ];
  const meta = [
    ["First message", ch], ["Friendly nudge", ch], ["Change channel", alt], ["New angle", ch], ["Graceful close", ch],
  ];
  const touches = off.map((o, idx) => {
    const date = idx === 0 ? start : bizDay(addDays(start, o));
    const status = date < today ? "overdue" : date === today ? "today" : "upcoming";
    return { n: idx + 1, date, channel: CHANNEL_LABEL[meta[idx][1]], purpose: meta[idx][0], draft: tidy(drafts[idx]), status };
  });
  return { biz: f.biz, owner: f.owner, start, temp, touches };
}

function dueTouches(saved, today) {
  const rows = [];
  saved.forEach((e) => {
    const d = e.payload && e.payload.data;
    if (!d) return;
    d.touches.forEach((t) => { if (t.date === today && t.n > 1) rows.push({ biz: d.biz, owner: d.owner, purpose: t.purpose, channel: t.channel, date: t.date }); });
  });
  return rows;
}

function refreshDue() {
  const list = $("#dueList");
  if (!list) return;
  const due = dueTouches(lsGet("dtd_saved_cadence", []), todayISO());
  list.innerHTML = due.length
    ? due.map((d) => `<div class="saved-item"><div class="saved-item-main"><div class="saved-item-name">${escapeHtml(d.biz)} — ${escapeHtml(d.purpose)}</div><div class="saved-item-meta">${escapeHtml(d.channel)} · ${escapeHtml(fmtDate(d.date))}</div></div></div>`).join("")
    : `<p class="saved-empty">Nothing due today across your saved plans.</p>`;
}

DEFS.push({
  id: "cadence",
  facts: "repliesFacts",
  outTitle: "Your follow-up plan",
  savedTitle: "Saved follow-up plans",
  placeholder: "Set the date you sent your first message, then press Build my follow-up plan.",
  compute: buildCadence,
  render: (d) => `
    <p class="out-p">Five touches for <strong>${escapeHtml(d.biz)}</strong>, spaced for a ${({ busy: "busy owner", skeptic: "skeptical owner", curious: "curious owner" })[d.temp]}. Weekends are skipped.</p>
    ${d.touches.map((t) => `<div class="touch"><div class="when">${escapeHtml(fmtDate(t.date))}<small>Touch ${t.n}</small></div><div><h4>${escapeHtml(t.purpose)} · ${escapeHtml(t.channel)}${t.status === "today" ? '<span class="badge due">Due today</span>' : t.status === "overdue" ? '<span class="badge">Past</span>' : ""}</h4><p>${escapeHtml(t.draft)}</p></div></div>`).join("")}`,
  text: (d) => d.touches.map((t) => `Touch ${t.n} — ${fmtDate(t.date)} — ${t.purpose} (${t.channel})\n${t.draft}`).join("\n\n"),
  entry: (d) => ({ name: d.biz, meta: `Starts ${fmtDate(d.start)}` }),
  onSavedChange: () => refreshDue(),
});

/* ======================================================================
   6. FIVE-MINUTE MAP WALK
   ====================================================================== */
function buildWalk(i) {
  const f = addr(factsOf(i.__facts));
  const niche = nicheOf(i.niche);
  const ticket = n(i.ticket, 0) > 0 ? n(i.ticket, 0) : niche.ticket;
  const worry = i.worry || "unsure";
  const rv = i.reviews || "some";
  const redShare = f.red / f.total;
  const lowShare = (f.buried + f.notfound) / f.total;
  const hardShare = f.hard / f.total;

  const opener = f.top3 > 0
    ? { key: "opener", title: "Start where they already win", weight: 100, talk: `Point to the ${plural(f.top3, "green spot")} near their shop. "This is where you see yourself, and you're right — you're found here."` }
    : { key: "opener", title: "Start at the dot nearest their shop", weight: 100, talk: `Be honest that even the closest dot isn't green. "Even right next to your shop, a stranger searching ${f.service} doesn't see ${f.biz} in the top 3."` };
  const cluster = {
    key: "cluster", title: "Show the biggest red area", weight: Math.round(redShare * 100),
    talk: `${f.Biz} is missing from the first page at ${plural(f.notfound, "spot")} and buried at 11–20 at ${plural(f.buried, "spot")}. "Customers standing here searching for ${f.service} don't see you."`,
  };
  const competitor = {
    key: "competitor", title: "Name who is winning instead", weight: 60 + (f.competitor !== "a competitor" ? 20 : 0) + (rv === "far" ? 10 : 0) + (worry === "competitors" ? 25 : 0),
    talk: `${f.Competitor} is the name that keeps showing up where ${f.biz} doesn't. "Same town, same search — they get the call."`,
  };
  const moneyStep = {
    key: "money", title: "Put a number on it", weight: 40 + niche.value * 4 + (worry === "calls" ? 20 : 0),
    talk: `One new customer is worth about ${money(ticket)}. "If those ${f.red} red spots cost you even one customer a month, that's roughly ${money(ticket * 12)} a year."`,
  };
  const fixes = [
    { key: "profile", title: "List every service on the Google profile", weight: Math.round(40 + hardShare * 50), talk: f.hard > 0 ? `${upFirst(plural(f.hard, "spot"))} at 4–10 ${f.hard === 1 ? "is" : "are"} close to the top 3. "A fuller profile is the quickest thing to fix."` : `"A complete profile is the cheapest thing to fix, and it's where Google starts."` },
    { key: "pages", title: "Add a page for each town they serve", weight: Math.round(40 + lowShare * 50), talk: `The buried and missing spots are places Google doesn't connect them to. "A page for each town tells Google where you work."` },
    { key: "posts", title: "Post a short update every week", weight: 35 + (rv === "ahead" ? 10 : 0), talk: `"Fresh weekly posts show Google the business is active."` },
    { key: "reviews", title: "Ask recent customers for reviews", weight: 30 + ({ far: 40, some: 20, even: 5, ahead: 0 })[rv], talk: `${rv === "far" || rv === "some" ? `Their reviews are behind ${f.competitor}'s. ` : ""}"Reviews are the easiest thing a customer can do for you."` },
  ].sort((a, b) => b.weight - a.weight);
  const lead = fixes.slice(0, 2).map((x, idx) => ({ ...x, key: "fix" + (idx + 1), title: `Lead fix ${idx + 1}: ${x.title}` }));
  const close = {
    key: "close", title: "Close with one question", weight: 100,
    talk: `"Want me to start this week?" Say your price once, then be quiet. Mention you'll rescan next month so they can see the change on the same map. Never promise a ranking.`,
  };

  const steps = [opener, cluster, competitor, moneyStep, lead[0], lead[1], close];
  const secs = [30, 45, 45, 45, 45, 45, 45];
  let t = 0;
  const agenda = steps.map((s, idx) => {
    const start = `${Math.floor(t / 60)}:${pad2(t % 60)}`;
    t += secs[idx];
    return { ...s, talk: tidy(s.talk), start, secs: secs[idx] };
  });
  const middle = [cluster, competitor, moneyStep, lead[0]].sort((a, b) => b.weight - a.weight);
  const short = [opener.key, middle[0].key, middle[1].key, close.key];
  return { biz: f.biz, owner: f.owner, agenda, short, leadFixes: lead.map((x) => x.title), total: t };
}

DEFS.push({
  id: "mapwalk",
  facts: "repliesFacts",
  outTitle: "Your five-minute walk-through",
  savedTitle: "Saved walk-throughs",
  placeholder: "Fill in the scan facts above, then press Build my walk-through.",
  compute: buildWalk,
  render: (d) => `
    <p class="out-p">A ${Math.floor(d.total / 60)}-minute agenda for <strong>${escapeHtml(d.biz)}</strong>${d.biz.endsWith(".") ? "" : "."} Lead with the two fixes the scan supports most.</p>
    ${d.agenda.map((s) => `<div class="agenda-step"><div class="when">${s.start}<small>${s.secs}s</small></div><div><h4>${escapeHtml(s.title)}${d.short.includes(s.key) ? '<span class="badge due">Keep if short</span>' : ""}</h4><p>${escapeHtml(s.talk)}</p></div></div>`).join("")}
    <div class="tip"><b>Only two minutes?</b> Do these: ${d.agenda.filter((s) => d.short.includes(s.key)).map((s) => escapeHtml(s.title.toLowerCase())).join(" → ")}.</div>`,
  text: (d) => d.agenda.map((s) => `${s.start} — ${s.title}\n${s.talk}`).join("\n\n"),
  entry: (d) => ({ name: d.biz, meta: "5-minute walk-through" }),
});

/* ======================================================================
   7. FIX PRICE CALCULATOR
   ====================================================================== */
const roundPrice = (v) => (v >= 500 ? Math.round(v / 50) * 50 : Math.round(v / 25) * 25);
const SCOPE_LABEL = { A: "One-time fix", B: "Monthly fix and upkeep", C: "Monthly report only" };

function computePrice(i) {
  const niche = nicheOf(i.niche);
  const scope = SCOPE_LABEL[i.scope] ? i.scope : "B";
  const base = scope === "A" ? niche.fixBase : scope === "B" ? niche.retainerBase : Math.round(niche.retainerBase * 0.4);
  const market = ({ small: 0.85, mid: 1, metro: 1.25 })[i.market] ?? 1;
  const top3 = clamp(n(i.top3pct, 20), 0, 100);
  const severity = 0.8 + 0.7 * (1 - top3 / 100);
  const comp = 0.9 + niche.crowd * 0.03;
  const raw = base * market * severity * comp;
  const target = roundPrice(raw);
  const low = roundPrice(target * 0.8);
  const high = roundPrice(target * 1.3);
  const scanCost = n(i.scans, 1) * n(i.points, 25) * n(i.perCredit, 0.05);
  const timeCost = n(i.hours, 0) * n(i.hourly, 0);
  const cost = scanCost + timeCost;
  const floor = Math.ceil(cost / 0.6 / 5) * 5;
  const margin = target > 0 ? (target - cost) / target : 0;
  return {
    scope, scopeLabel: SCOPE_LABEL[scope], niche: niche.label, base, market, severity, comp, raw, target, low, high,
    scanCost, timeCost, cost, floor, margin, top3,
    perMonth: scope !== "A",
    line: scope === "A" ? `It's ${money(target)} one-time.` : `It's ${money(target)} per month.`,
  };
}

DEFS.push({
  id: "pricecalc",
  outTitle: "Your quote",
  savedTitle: "Saved quotes",
  placeholder: "Choose what you're selling and enter the scan numbers, then press Calculate my price.",
  prefill: (form) => {
    const f = lsGet("dtd_facts", null);
    const el = $('[data-f="top3pct"]', form);
    if (f && el && el.value === "" && n(f.total, 0) > 0) el.value = Math.round((n(f.top3, 0) / n(f.total, 25)) * 100);
  },
  compute: computePrice,
  after: (d) => { const p = lsGet("dtd_prices", {}); p[d.scope] = d.target; lsSet("dtd_prices", p); },
  render: (d) => `
    <p class="out-p"><strong>${escapeHtml(d.scopeLabel)}</strong> · ${escapeHtml(d.niche)}</p>
    <div class="price-row">
      <div class="price-box"><div class="lbl">Low</div><div class="amt">${money(d.low)}</div></div>
      <div class="price-box main"><div class="lbl">Target</div><div class="amt">${money(d.target)}</div></div>
      <div class="price-box"><div class="lbl">High</div><div class="amt">${money(d.high)}</div></div>
    </div>
    <p class="out-p">${d.perMonth ? "Per month. " : "One-time. "}Say it as: <em>“${escapeHtml(d.line)}”</em></p>
    <div class="tip"><b>Your floor is ${money(d.floor)}${d.perMonth ? " per month" : ""}.</b> Your costs are about ${money(d.cost)} (${money(d.scanCost)} in scan credits plus ${money(d.timeCost)} of your time), and the floor keeps at least a 40% margin. ${d.low < d.floor ? "Your low quote is below the floor — don't go that low." : `At the target you keep about ${Math.round(d.margin * 100)}%.`}</div>
    <div class="out-sub">How the number was built</div>
    <div class="tbl-wrap"><table class="tbl"><tbody>
      <tr><td>Starting point for ${escapeHtml(d.niche)}</td><td>${money(d.base)}</td></tr>
      <tr><td>Market size</td><td>× ${d.market}</td></tr>
      <tr><td>How bad the map is (${d.top3}% in the top 3)</td><td>× ${d.severity.toFixed(2)}</td></tr>
      <tr><td>Competition in the niche</td><td>× ${d.comp.toFixed(2)}</td></tr>
      <tr><td><strong>Result, rounded</strong></td><td><strong>${money(d.target)}</strong></td></tr>
    </tbody></table></div>`,
  text: (d) => `${d.scopeLabel} — ${d.niche}\nLow ${money(d.low)} · Target ${money(d.target)} · High ${money(d.high)}${d.perMonth ? " per month" : ""}\nFloor: ${money(d.floor)}\n"${d.line}"`,
  entry: (d) => ({ name: `${d.niche} — ${money(d.target)}${d.perMonth ? "/mo" : ""}`, meta: d.scopeLabel }),
});

/* ======================================================================
   8. CLIENTS-TO-GOAL PLANNER
   ====================================================================== */
function planGoal(i) {
  const goal = n(i.goal, 0);
  const months = clamp(Math.round(n(i.months, 3)), 1, 24);
  const raw = [Math.max(0, n(i.shareA, 0)), Math.max(0, n(i.shareB, 0)), Math.max(0, n(i.shareC, 0))];
  const sum = raw[0] + raw[1] + raw[2];
  const price = [n(i.priceA, 0), n(i.priceB, 0), n(i.priceC, 0)];
  if (goal <= 0) return { error: "Enter a monthly income goal" };
  if (sum <= 0) return { error: "Give at least one service a share above 0%" };
  const [a, b, c] = raw.map((x) => x / sum);
  if (a * price[0] + b * price[1] + c * price[2] <= 0) return { error: "Enter a price for the services in your mix" };
  const churn = clamp(n(i.churn, 0), 0, 100) / 100;
  const reply = clamp(n(i.reply, 15), 1, 100) / 100;
  const close = clamp(n(i.close, 25), 1, 100) / 100;

  const sim = (N) => {
    let rb = 0, rc = 0;
    const rows = [];
    for (let t = 1; t <= months; t++) {
      rb = rb * (1 - churn) + N * b;
      rc = rc * (1 - churn) + N * c;
      rows.push({ month: t, wins: N, active: rb + rc, income: N * a * price[0] + rb * price[1] + rc * price[2] });
    }
    return rows;
  };
  let N = 0;
  let rows = [];
  for (let k = 1; k <= 500; k++) {
    rows = sim(k);
    if (rows[months - 1].income >= goal) { N = k; break; }
  }
  if (!N) return { error: "That goal needs more than 500 new clients a month — raise your prices or lower the goal" };
  const replies = N / close;
  const messages = replies / reply;
  const perWeek = messages / 4.33;
  const credits = messages * n(i.points, 25) * Math.max(1, n(i.kw, 2));
  return {
    goal, months, N, rows, shares: [a, b, c], replies, messages, perWeek, credits, creditCost: credits * n(i.perCredit, 0.05),
    heavy: perWeek > 40, mix: { a: Math.round(a * 100), b: Math.round(b * 100), c: Math.round(c * 100) },
  };
}

DEFS.push({
  id: "goalplan",
  outTitle: "Your path to the goal",
  savedTitle: "Saved plans",
  placeholder: "Enter a monthly income goal, then press Plan my path.",
  prefill: (form) => {
    const p = lsGet("dtd_prices", {});
    [["priceA", "A"], ["priceB", "B"], ["priceC", "C"]].forEach(([f, s]) => {
      const el = $(`[data-f="${f}"]`, form);
      if (el && el.value === "" && p[s]) el.value = p[s];
    });
  },
  compute: planGoal,
  render: (d) => `
    <div class="headline-row"><div class="big-num">${d.N}<small> new ${d.N === 1 ? "client" : "clients"} a month</small></div></div>
    <p class="out-p">To earn ${money(d.goal)} a month by month ${d.months}, win about <strong>${d.N}</strong> new ${d.N === 1 ? "client" : "clients"} every month (mix: ${d.mix.a}% one-time, ${d.mix.b}% monthly fix, ${d.mix.c}% monthly report).</p>
    <div class="tbl-wrap"><table class="tbl"><tbody>
      <tr><td>Replies you need</td><td>${Math.ceil(d.replies)}</td></tr>
      <tr><td>Businesses to message each month</td><td>${Math.ceil(d.messages)}</td></tr>
      <tr><td>Businesses to message each week</td><td>${Math.ceil(d.perWeek)}</td></tr>
      <tr><td>Scan credits per month (every prospect scanned first)</td><td>${Math.ceil(d.credits).toLocaleString("en-US")}</td></tr>
      <tr><td>Scan cost at your credit price</td><td>${money(d.creditCost)}</td></tr>
    </tbody></table></div>
    ${d.heavy ? `<div class="tip"><b>That's a lot of outreach.</b> Over 40 businesses a week is hard to keep up. Raise your prices or lean toward monthly work before you take this on.</div>` : ""}
    <div class="out-sub">Month by month</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Month</th><th>New clients</th><th>Active monthly clients</th><th>Income</th></tr></thead><tbody>
      ${d.rows.map((r) => `<tr><td>${r.month}</td><td>${r.wins}</td><td>${r.active.toFixed(1)}</td><td>${money(r.income)}</td></tr>`).join("")}
    </tbody></table></div>`,
  text: (d) => `Goal ${money(d.goal)}/month by month ${d.months}\nNew clients per month: ${d.N}\nReplies needed: ${Math.ceil(d.replies)}\nMessages per month: ${Math.ceil(d.messages)} (${Math.ceil(d.perWeek)} per week)\nCredits per month: ${Math.ceil(d.credits)}\n\n` + d.rows.map((r) => `Month ${r.month}: ${r.wins} new, ${r.active.toFixed(1)} active, ${money(r.income)}`).join("\n"),
  entry: (d) => ({ name: `${money(d.goal)}/mo in ${d.months} months`, meta: `${d.N} clients a month` }),
});

/* ======================================================================
   9. ONE-PAGE OFFER SHEET
   ====================================================================== */
function buildOffer(i) {
  const total = Math.max(1, n(i.total, 25));
  const top3 = clamp(n(i.top3, 0), 0, total);
  const today = i.today || todayISO();
  const valid = Math.max(1, n(i.valid, 14));
  const price = { A: n(i.priceA, 0), B: n(i.priceB, 0), C: n(i.priceC, 0) };
  if (!(price.A > 0 || price.B > 0 || price.C > 0)) return { error: "Enter at least one price" };
  const town = (i.town || "").trim() || "your area";
  const tiers = [
    { key: "A", name: "Fix it once", cadence: "one-time", price: price.A, items: ["List every service customers search for on your Google profile", "One page for each town you serve", "Set up a simple way to ask customers for reviews", "One rescan after 30 days to show what changed"] },
    { key: "B", name: "Keep it fixed", cadence: "per month", price: price.B, items: ["Everything in Fix it once", "A short Google post every week", "Ongoing review requests", "A fresh rescan and updated map every month"] },
    { key: "C", name: "Monthly report only", cadence: "per month", price: price.C, items: ["An updated map of your rankings each month", "Your own plain-English summary of what changed", "Next steps you can do yourself"] },
  ].filter((t) => t.price > 0).map((t) => ({ ...t, rec: t.key === i.rec }));
  return {
    you: (i.you || "").trim() || "Your Agency", contact: (i.contact || "").trim(),
    biz: (i.biz || "").trim() || "Your business", owner: (i.owner || "").trim(),
    service: (i.service || "").trim(), town, top3, total, pct: Math.round((top3 / total) * 100),
    tiers, validUntil: fmtDate(addDays(today, valid)),
  };
}

function offerText(d) {
  const head = [`${d.you} — a plan for ${d.biz}`, d.owner ? `Prepared for ${d.owner}` : ""].filter(Boolean).join("\n");
  const finding = `Today ${d.biz} is in the top 3 at ${d.top3} of ${d.total} spots around ${d.town} (${d.pct}%)${d.service ? ` when customers search "${d.service}"` : ""}.`;
  const tiers = d.tiers.map((t) => `${t.name}${t.rec ? " (recommended)" : ""} — ${money(t.price)} ${t.cadence}\n${t.items.map((x) => "  - " + x).join("\n")}`);
  const foot = [`Offer valid until ${d.validUntil}. Rankings depend on many things and are not guaranteed; we rescan so you can see the change.`, d.contact].filter(Boolean).join("\n");
  return [head, finding, ...tiers, foot].join("\n\n");
}

DEFS.push({
  id: "offersheet",
  outTitle: "Your offer sheet",
  savedTitle: "Saved offer sheets",
  placeholder: "Fill in the prospect and your prices, then press Build my offer sheet.",
  extraBtns: [{ id: "print", label: "Print", fn: () => { document.body.classList.add("print-offer"); window.print(); } }],
  prefill: (form) => {
    const f = lsGet("dtd_facts", null);
    const fill = (k, v) => { const el = $(`[data-f="${k}"]`, form); if (el && el.value === "" && v !== undefined && v !== "") el.value = v; };
    if (f) { fill("biz", f.biz); fill("owner", f.owner); fill("service", f.service); fill("town", f.town); fill("top3", f.top3); }
    const p = lsGet("dtd_prices", {});
    fill("priceA", p.A); fill("priceB", p.B); fill("priceC", p.C);
  },
  compute: buildOffer,
  render: (d) => `
    <div class="offer-doc">
      <h2>${escapeHtml(d.you)}</h2>
      <div class="od-sub">A plan for ${escapeHtml(d.biz)}${d.owner ? " · Prepared for " + escapeHtml(d.owner) : ""}</div>
      <div class="od-finding">Today <strong>${escapeHtml(d.biz)}</strong> is in the top 3 at <strong>${d.top3} of ${d.total}</strong> spots around ${escapeHtml(d.town)} (${d.pct}%)${d.service ? ` when customers search “${escapeHtml(d.service)}”` : ""}.</div>
      <div class="od-tiers">
        ${d.tiers.map((t) => `<div class="od-tier${t.rec ? " rec" : ""}"><div class="od-tag">${t.rec ? "Recommended" : ""}</div><h3>${escapeHtml(t.name)}</h3><div class="od-price">${money(t.price)} <small>${t.cadence}</small></div><ul>${t.items.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>`).join("")}
      </div>
      <div class="od-foot">Offer valid until ${escapeHtml(d.validUntil)}. Rankings depend on many things and are not guaranteed; we rescan so you can see the change for yourself.${d.contact ? "<br>" + escapeHtml(d.contact) : ""}</div>
    </div>`,
  text: offerText,
  entry: (d) => ({ name: d.biz, meta: d.tiers.map((t) => money(t.price)).join(" / ") }),
});

/* ---------- boot ---------- */
function setDefaultDates() {
  $$('input[type="date"][data-f]').forEach((el) => { if (!el.value) el.value = todayISO(); });
}

function boot() {
  initGate();
  initTheme();
  initTabs();
  initSubtabs();
  fillNicheSelects();
  setDefaultDates();
  initFacts();
  DEFS.forEach(initTool);
  refreshQueueNote();
  refreshDue();
  window.addEventListener("afterprint", () => document.body.classList.remove("print-offer"));
}

document.addEventListener("DOMContentLoaded", boot);
