// ════════════════════════════════════════════════════════════
// NUCarpool — app.js
// ════════════════════════════════════════════════════════════

// ── CONFIG ──────────────────────────────────────────────────
const SUPABASE_URL      = "https://ylpgfkmjqzuwmqqhubyq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlscGdma21qcXp1d21xcWh1YnlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjAwMzUsImV4cCI6MjA4NTczNjAzNX0.QuUF6VQdiFf4idaKsV_wCihaOX3QSeT_U1DZ-w1SgkA";
const sb = window.__nu_carpool_sb
  || (window.__nu_carpool_sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

const MATCH_WINDOW_MINS = 45;
const VALID_GROUP_SIZES = [2, 3];


// ════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════

const $       = id  => document.getElementById(id);
const setText = (id, t) => { const el = $(id); if (el) el.textContent = t ?? ""; };

const normEmail = e => (e || "").trim().toLowerCase();
const isNU      = e => e.endsWith("@u.northwestern.edu");

function withTimeout(promise, ms, label = "timeout") {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(label)), ms))
  ]);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function timeToMinutes(t) {
  const [h, m] = (t || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function minsToHHMM(mins) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, mins));
  return `${String(Math.floor(clamped / 60)).padStart(2,"0")}:${String(clamped % 60).padStart(2,"0")}`;
}

function formatTimeAMPM(hhmm) {
  if (!hhmm) return "";
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${mStr} ${ampm}`;
}

function isoToMDY(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function computeWindow(leavingAround) {
  const mid = timeToMinutes(leavingAround);
  return {
    window_start: minsToHHMM(mid - MATCH_WINDOW_MINS),
    window_end:   minsToHHMM(mid + MATCH_WINDOW_MINS),
  };
}

function routeLabel(direction, airport) {
  return direction === "to_airport"
    ? `Evanston → ${airport}`
    : `${airport} → Evanston`;
}

function groupSizeLabel(size) {
  return size === 2 ? "Just 2 riders" : "Up to 3 riders";
}

function show(el)  { el?.classList.remove("hidden"); }
function hide(el)  { el?.classList.add("hidden"); }

function isoLocalDate(d) {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function buildTimeOptions(selectEl, defaultHHMM) {
  selectEl.innerHTML = "";
  for (let mins = 0; mins < 24 * 60; mins += 15) {
    const hhmm = minsToHHMM(mins);
    const opt  = document.createElement("option");
    opt.value       = hhmm;
    opt.textContent = formatTimeAMPM(hhmm);
    selectEl.appendChild(opt);
  }
  if (defaultHHMM) selectEl.value = defaultHHMM;
}


// ════════════════════════════════════════════════════════════
// CAT-CAR MASCOT
// ════════════════════════════════════════════════════════════
function catCarSvg(mood = "happy") {
  const base = `
    <rect x="2" y="27" width="116" height="77" rx="23" fill="white"/>
    <polygon points="17,34 29,8 45,32" fill="white"/>
    <polygon points="75,32 91,8 103,34" fill="white"/>
    <rect x="6" y="31" width="108" height="70" rx="19" fill="#5b3a9e"/>
    <polygon points="21,38 30,13 44,35" fill="#5b3a9e"/>
    <polygon points="76,35 90,13 99,38" fill="#5b3a9e"/>
    <polygon points="25,36 33,18 41,34" fill="#8568ca"/>
    <polygon points="79,34 87,18 95,36" fill="#8568ca"/>
    <rect x="23" y="33" width="74" height="36" rx="9" fill="#7248b3" opacity="0.65"/>
    <path d="M31 36 Q60 31 89 36 L87 57 Q60 63 33 57 Z" fill="white" opacity="0.09"/>
    <rect x="7" y="84" width="20" height="14" rx="7" fill="#3c2170"/>
    <rect x="93" y="84" width="20" height="14" rx="7" fill="#3c2170"/>
    <ellipse cx="60" cy="74" rx="3" ry="2.5" fill="#1a0a35"/>
    <line x1="13" y1="69" x2="36" y2="71" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="13" y1="74" x2="36" y2="74" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="84" y1="71" x2="107" y2="69" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="84" y1="74" x2="107" y2="74" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
  `;
  const faces = {
    happy: `
      <circle cx="41" cy="63" r="9" fill="white"/><circle cx="79" cy="63" r="9" fill="white"/>
      <circle cx="42" cy="64" r="5.5" fill="#1a0a35"/><circle cx="80" cy="64" r="5.5" fill="#1a0a35"/>
      <circle cx="44" cy="61" r="2" fill="white"/><circle cx="82" cy="61" r="2" fill="white"/>
      <path d="M51 79 Q60 86 69 79" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    excited: `
      <circle cx="41" cy="62" r="11" fill="white"/><circle cx="79" cy="62" r="11" fill="white"/>
      <circle cx="41" cy="63" r="6.5" fill="#1a0a35"/><circle cx="79" cy="63" r="6.5" fill="#1a0a35"/>
      <circle cx="44" cy="59" r="2.5" fill="white"/><circle cx="82" cy="59" r="2.5" fill="white"/>
      <ellipse cx="28" cy="72" rx="8" ry="4" fill="#ff8fab" opacity="0.5"/>
      <ellipse cx="92" cy="72" rx="8" ry="4" fill="#ff8fab" opacity="0.5"/>
      <path d="M47 78 Q60 91 73 78 Z" fill="white" opacity="0.92"/>
      <text x="95" y="44" font-size="10" fill="white" opacity="0.85">✦</text>
      <text x="12" y="43" font-size="8" fill="white" opacity="0.7">✦</text>`,
    welcoming: `
      <circle cx="41" cy="62" r="11" fill="white"/><circle cx="79" cy="62" r="11" fill="white"/>
      <circle cx="41" cy="63" r="6" fill="#1a0a35"/><circle cx="79" cy="63" r="6" fill="#1a0a35"/>
      <circle cx="44" cy="59" r="2.5" fill="white"/><circle cx="82" cy="59" r="2.5" fill="white"/>
      <path d="M50 79 Q60 87 70 79" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <line x1="24" y1="49" x2="18" y2="43" stroke="white" stroke-width="1.5" stroke-linecap="round" opacity="0.75"/>
      <line x1="22" y1="54" x2="14" y2="53" stroke="white" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
      <line x1="96" y1="49" x2="102" y2="43" stroke="white" stroke-width="1.5" stroke-linecap="round" opacity="0.75"/>
      <line x1="98" y1="54" x2="106" y2="53" stroke="white" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>`,
    searching: `
      <circle cx="41" cy="63" r="9" fill="white"/><circle cx="79" cy="63" r="9" fill="white"/>
      <circle cx="43" cy="62" r="5.5" fill="#1a0a35"/><circle cx="81" cy="62" r="5.5" fill="#1a0a35"/>
      <circle cx="45" cy="60" r="2" fill="white"/><circle cx="83" cy="60" r="2" fill="white"/>
      <path d="M53 79 Q60 83 67 79" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/>
      <text x="90" y="42" font-size="13" fill="white" opacity="0.9">?</text>`,
  };
  return `<svg width="120" height="110" viewBox="0 0 120 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${base}${faces[mood] || faces.happy}</svg>`;
}


// ════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ════════════════════════════════════════════════════════════

function activateTab(which) {
  const tabs  = { request: $("tab_request"), my: $("tab_my"), account: $("tab_account") };
  const views = { request: $("view_request"), my: $("view_my"), account: $("view_account") };

  Object.keys(tabs).forEach(k => {
    tabs[k]?.classList.toggle("active", k === which);
    views[k]?.classList.toggle("hidden", k !== which);
  });

  const hero = $("hero_section");
  if (hero) hero.style.display = which === "request" ? "" : "none";
}


// ════════════════════════════════════════════════════════════
// AUTH STATE
// ════════════════════════════════════════════════════════════

let currentUser     = null;
let __refreshFlight = null;
const PENDING_KEY   = "nu_carpool_pending_action";

function setAuthUI() {
  const chip = $("auth_chip");
  const btn  = $("auth_btn");
  if (currentUser?.email) {
    chip.textContent = currentUser.email;
    chip.classList.remove("hidden");
    btn.textContent = "Sign out";
  } else {
    chip.classList.add("hidden");
    btn.textContent = "Sign in";
  }
}

async function getSessionUserFast() {
  try {
    const { data } = await withTimeout(sb.auth.getSession(), 1200, "getSession timeout");
    return data?.session?.user || null;
  } catch { return null; }
}

async function refreshUser({ force = false } = {}) {
  if (__refreshFlight) return __refreshFlight;
  __refreshFlight = (async () => {
    const su = await getSessionUserFast();
    currentUser = su ? { email: su.email, id: su.id } : null;
    setAuthUI();
    if (force && su) {
      try {
        const { data } = await withTimeout(sb.auth.getUser(), 4000, "getUser timeout");
        if (data?.user) currentUser = { email: data.user.email, id: data.user.id };
        setAuthUI();
      } catch { /* non-fatal */ }
    }
    return currentUser;
  })().finally(() => { __refreshFlight = null; }).catch(() => { setAuthUI(); return currentUser; });
  return __refreshFlight;
}

function onAppResume() { refreshUser({ force: false }).catch(() => {}); }

function savePendingAction(a)  { localStorage.setItem(PENDING_KEY, JSON.stringify({ ...a, ts: Date.now() })); }
function loadPendingAction()   { try { return JSON.parse(localStorage.getItem(PENDING_KEY)); } catch { return null; } }
function clearPendingAction()  { localStorage.removeItem(PENDING_KEY); }

async function requireAuthOrQueue(action) {
  try { await withTimeout(refreshUser(), 2500, "auth timeout"); } catch { /* ignore */ }
  if (currentUser?.email) return true;
  savePendingAction(action);
  openSignInModal(action?.emailHint || "");
  return false;
}

async function maybeResumePendingAction() {
  await refreshUser();
  if (!currentUser?.email) return;
  const p = loadPendingAction();
  if (!p) return;
  if (p.ts && (Date.now() - p.ts) > 15 * 60 * 1000) { clearPendingAction(); return; }
  clearPendingAction();
  if (p.type === "SUBMIT_REQUEST") { activateTab("request"); await doSubmitRequest(p.payload); }
  if (p.type === "LOAD_MY")        { activateTab("my");      await loadMyRequests(); }
}


// ════════════════════════════════════════════════════════════
// AUTH MODALS
// ════════════════════════════════════════════════════════════

function openSignInModal(prefill = "") {
  showSignInView();
  setText("signin_msg",""); setText("signin_err","");
  if (prefill) $("signin_email").value = prefill;
  $("signin_overlay").classList.add("show");
}
function closeSignInModal()  { $("signin_overlay").classList.remove("show"); }

function openSignUpModal(email = "") {
  setText("signup_msg",""); setText("signup_err","");
  $("signup_email").value    = email;
  $("signup_password").value = ""; $("signup_password2").value = "";
  $("signup_overlay").classList.add("show");
}
function closeSignUpModal()  { $("signup_overlay").classList.remove("show"); }

function showSignInView() {
  show($("signin_view")); hide($("reset_view"));
  setText("signin_msg",""); setText("signin_err","");
}
function showResetView() {
  hide($("signin_view")); show($("reset_view"));
  setText("reset_msg",""); setText("reset_err","");
  $("reset_pw1").value = ""; $("reset_pw2").value = "";
}

function resetUIAfterSignOut() {
  closeSignInModal(); clearPendingAction();
  activateTab("request");
}

async function signInWithPassword(email, password) {
  setText("signin_err",""); setText("signin_msg","Signing in...");
  $("signin_pw_btn").disabled = true;
  try {
    if (!isNU(email)) throw new Error("Please use your Northwestern email (@u.northwestern.edu).");
    if (!password)    throw new Error("Please enter your password.");
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setText("signin_msg","Signed in."); return true;
  } catch (err) {
    setText("signin_msg",""); setText("signin_err", err.message || "Sign in failed.");
    return false;
  } finally { $("signin_pw_btn").disabled = false; }
}

async function signUpWithPassword(email, p1, p2) {
  setText("signup_err",""); setText("signup_msg","Creating account...");
  $("signup_create_btn").disabled = true;
  try {
    if (!isNU(email))    throw new Error("Please use your Northwestern email.");
    if (p1.length < 8)  throw new Error("Password must be at least 8 characters.");
    if (p1 !== p2)      throw new Error("Passwords do not match.");
    const { error } = await sb.auth.signUp({
      email, password: p1,
      options: { emailRedirectTo: window.location.origin }
    });
    if (error) throw error;
    setText("signup_msg","Account created. Now sign in."); return true;
  } catch (err) {
    setText("signup_msg",""); setText("signup_err", err.message || "Sign up failed.");
    return false;
  } finally { $("signup_create_btn").disabled = false; }
}

async function sendPasswordRecovery(email) {
  setText("signin_err",""); setText("signin_msg","Sending recovery email...");
  try {
    if (!isNU(email)) throw new Error("Please enter your Northwestern email first.");
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/"
    });
    if (error) throw error;
    setText("signin_msg","Recovery email sent. Check your inbox.");
  } catch (err) {
    setText("signin_msg",""); setText("signin_err", err.message || "Failed to send recovery email.");
  }
}

async function updatePasswordFromRecovery() {
  setText("reset_err",""); setText("reset_msg","Updating...");
  $("reset_save_btn").disabled = true;
  try {
    const p1 = $("reset_pw1").value, p2 = $("reset_pw2").value;
    if (p1.length < 8) throw new Error("Password must be at least 8 characters.");
    if (p1 !== p2)     throw new Error("Passwords do not match.");
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) throw error;
    setText("signin_msg","Password updated. Please sign in."); showSignInView();
  } catch (err) {
    setText("reset_msg",""); setText("reset_err", err.message || "Failed.");
  } finally { $("reset_save_btn").disabled = false; }
}


// ════════════════════════════════════════════════════════════
// TOGGLE / PICKER HELPERS
// ════════════════════════════════════════════════════════════

/** Wire segmented toggle buttons (group size) to a hidden <select>. */
function initSegToggle(toggleId, selectId) {
  const wrap = $(toggleId), sel = $(selectId);
  if (!wrap || !sel) return;
  wrap.querySelectorAll(".seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      wrap.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      sel.value = btn.dataset.val;
    });
  });
}

/** Wire direction card picker to a hidden <select>. */
function initDirPicker(pickerId, selectId) {
  const wrap = $(pickerId), sel = $(selectId);
  if (!wrap || !sel) return;
  wrap.querySelectorAll(".dir-card").forEach(btn => {
    btn.addEventListener("click", () => {
      wrap.querySelectorAll(".dir-card").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      sel.value = btn.dataset.val;
    });
  });
}

/** Wire airport pill buttons to a hidden <select>. */
function initAirportPills(rowId, selectId) {
  const wrap = $(rowId), sel = $(selectId);
  if (!wrap || !sel) return;
  wrap.querySelectorAll(".airport-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      wrap.querySelectorAll(".airport-pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      sel.value = btn.dataset.val;
    });
  });
}


// ════════════════════════════════════════════════════════════
// POST-SUBMIT MODAL
// ════════════════════════════════════════════════════════════

/**
 * Open the post-submit confirmation modal.
 * @param {'matched'|'forming'|'waiting'} state
 */
function openSubmittedModal(state) {
  const overlay = $("submitted_overlay");
  const header  = $("sub_header");
  const mascot  = $("mascot_submitted");
  const pill    = $("sub_pill");
  const title   = $("sub_title");
  const sub     = $("sub_sub");
  const steps   = $("sub_steps");
  const disclaimer = $("sub_disclaimer");
  const cta     = $("sub_cta");

  const configs = {
    matched: {
      headerClass: "sub-header--matched",
      mascotMood:  "excited",
      pill:        "🎉 Group Locked",
      title:       "You're matched!",
      sub:         "Your carpool group is confirmed and on the way.",
      steps: [
        { icon: "📱", head: "Check your texts",
          body: "We just texted everyone's name and phone number to all riders. Open it now!" },
        { icon: "👋", head: "Say hi to your match",
          body: "Reach out and introduce yourself. Agree on a meeting spot and how to split the fare." },
        { icon: "🚗", head: "Book & split",
          body: "One person requests Uber/Lyft — everyone pays their share on Venmo or Zelle." },
      ],
      disclaimer: "NUCarpool connects you. It doesn't book rides or handle payments.",
      cta:        "View My Match →",
    },
    forming: {
      headerClass: "sub-header--forming",
      mascotMood:  "happy",
      pill:        "📱 Paired Up",
      title:       "You've got a match!",
      sub:         "2 of 3 riders locked in — still searching for one more.",
      steps: [
        { icon: "📱", head: "Check your texts now",
          body: "You and your match were just texted each other's contact info. Don't wait — say hi!" },
        { icon: "🔍", head: "We're still searching",
          body: "Since you're both open to a 3rd rider, we'll keep the slot open. You'll get another text if someone joins." },
        { icon: "✅", head: "You're good to go either way",
          body: "A 2-person split still saves you $15+. Coordinate now and treat the 3rd as a bonus." },
      ],
      disclaimer: "NUCarpool connects you. It doesn't book rides or handle payments.",
      cta:        "View My Match →",
    },
    waiting: {
      headerClass: "sub-header--waiting",
      mascotMood:  "searching",
      pill:        "🔍 Searching",
      title:       "Request submitted!",
      sub:         "We're scanning for Wildcats going your way.",
      steps: [
        { icon: "✅", head: "You're in the queue",
          body: "Your request is live. Every new submission from a compatible Wildcat triggers a match attempt automatically." },
        { icon: "📱", head: "Watch for a text",
          body: "The moment we find a match, we'll text you and your match-mate each other's contact info — no app refresh needed." },
        { icon: "🗓️", head: "No action needed",
          body: "Just check your texts as your travel date approaches. You can cancel anytime from My Requests." },
      ],
      disclaimer: "Make sure the phone number you entered is correct — that's where we'll send your match.",
      cta:        "Got it — I'll watch for a text",
    },
  };

  const cfg = configs[state] || configs.waiting;

  // Apply header colour class
  header.className = `sub-header ${cfg.headerClass}`;

  // Mascot
  mascot.innerHTML = catCarSvg(cfg.mascotMood);

  // Text content
  pill.textContent  = cfg.pill;
  title.textContent = cfg.title;
  sub.textContent   = cfg.sub;

  // Build steps HTML
  steps.innerHTML = cfg.steps.map(s => `
    <div class="sub-step">
      <div class="sub-step-icon">${s.icon}</div>
      <div class="sub-step-text">
        <div class="sub-step-head">${escapeHtml(s.head)}</div>
        <div class="sub-step-body">${escapeHtml(s.body)}</div>
      </div>
    </div>
  `).join("");

  disclaimer.textContent = cfg.disclaimer;
  cta.textContent        = cfg.cta;

  overlay.classList.add("show");

  // CTA closes modal and navigates to My Requests
  cta.onclick = () => {
    closeSubmittedModal();
    activateTab("my");
    loadMyRequests();
  };
}

function closeSubmittedModal() {
  $("submitted_overlay")?.classList.remove("show");
}


// ════════════════════════════════════════════════════════════
// REQUEST FORM — SUBMIT
// ════════════════════════════════════════════════════════════

async function requestRideClick() {
  setText("req_err",""); setText("req_msg","");
  const ok = await requireAuthOrQueue({
    type:    "SUBMIT_REQUEST",
    payload: collectRequestPayload()
  });
  if (!ok) return;
  const payload = collectRequestPayload();
  if (!payload) return;
  await doSubmitRequest(payload);
}

function collectRequestPayload() {
  const direction      = $("req_direction").value;
  const airport        = $("req_airport").value;
  const ride_date      = $("req_date").value;
  const leaving_around = $("req_time").value;
  const group_size     = parseInt($("req_group_size").value, 10);
  const phone_raw      = ($("req_phone")?.value || "").trim();

  if (!ride_date) {
    setText("req_err","Please select a date."); return null;
  }
  if (!leaving_around) {
    setText("req_err","Please select a departure time."); return null;
  }
  if (!VALID_GROUP_SIZES.includes(group_size)) {
    setText("req_err","Please choose a max group size of 2 or 3."); return null;
  }
  if (!phone_raw) {
    setText("req_err","Please enter your phone number so we can text you when matched."); return null;
  }

  // Normalize to E.164
  const digits = phone_raw.replace(/\D/g,"");
  if (digits.length < 10 || digits.length > 11) {
    setText("req_err","Please enter a valid 10-digit US phone number."); return null;
  }
  const phone_e164 = "+" + (digits.length === 10 ? "1" + digits : digits);

  const { window_start, window_end } = computeWindow(leaving_around);
  return { direction, airport, ride_date, leaving_around, window_start, window_end, group_size, phone_e164 };
}

async function doSubmitRequest(payload) {
  if (!payload) {
    // Can happen if form was invalid when user was redirected to sign-in
    activateTab("request");
    return;
  }
  setText("req_err",""); setText("req_msg","Submitting your request...");
  $("req_btn").disabled = true;

  await refreshUser();
  const userId = currentUser?.id;
  const email  = normEmail(currentUser?.email || "");

  if (!userId || !isNU(email)) {
    setText("req_msg",""); setText("req_err","Please sign in with your Northwestern email.");
    $("req_btn").disabled = false;
    return;
  }

  const { data: inserted, error: insertErr } = await sb
    .from("ride_requests")
    .insert([{
      user_id:        userId,
      user_email:     email,
      direction:      payload.direction,
      airport:        payload.airport,
      ride_date:      payload.ride_date,
      leaving_around: payload.leaving_around,
      window_start:   payload.window_start,
      window_end:     payload.window_end,
      group_size:     payload.group_size,
      phone_e164:     payload.phone_e164,
      status:         "active",
    }])
    .select()
    .single();

  if (insertErr) {
    setText("req_msg",""); setText("req_err","Submit failed: " + (insertErr.message || "Unknown error"));
    $("req_btn").disabled = false;
    return;
  }

  setText("req_msg","Request saved. Searching for matches...");

  const { data: matchResult, error: matchErr } = await sb
    .rpc("attempt_match", { p_request_id: inserted.id });

  $("req_btn").disabled = false;

  if (matchErr) {
    console.warn("attempt_match RPC error:", matchErr);
  }

  setText("req_msg","");

  // Determine which modal state to show
  let modalState = "waiting";
  if (matchResult?.matched && matchResult?.locked) {
    modalState = "matched";
  } else if (matchResult?.matched) {
    modalState = "forming";
  }

  // Load My Requests in background, then show the modal
  loadMyRequests().catch(() => {});
  openSubmittedModal(modalState);
}


// ════════════════════════════════════════════════════════════
// MY REQUESTS
// ════════════════════════════════════════════════════════════

async function loadMyRequestsClick() {
  activateTab("my");
  const ok = await requireAuthOrQueue({ type: "LOAD_MY", payload: {} });
  if (!ok) { setText("my_err","Sign in to see your requests."); return; }
  await loadMyRequests();
}

async function loadMyRequests() {
  setText("my_err",""); setText("my_msg","Loading...");
  $("my_refresh_btn").disabled = true;

  await refreshUser();
  if (!currentUser?.id) {
    setText("my_msg",""); setText("my_err","Please sign in.");
    $("my_refresh_btn").disabled = false;
    return;
  }

  const { data: rows, error } = await sb
    .rpc("get_my_requests_with_groups", { p_user_id: currentUser.id });

  $("my_refresh_btn").disabled = false;

  if (error) {
    setText("my_msg",""); setText("my_err","Failed to load: " + error.message);
    return;
  }

  renderMyRequests(rows || []);
  setText("my_msg","");
}

function renderMyRequests(requests) {
  const container = $("my_requests");
  container.innerHTML = "";

  const active   = requests.filter(r => r.status === "active");
  const matched  = requests.filter(r => r.status === "matched");
  const canceled = requests.filter(r => r.status === "canceled");

  const addSection = (title, icon, items, emptyText) => {
    const hdr = document.createElement("div");
    hdr.className = "my-section-header";
    hdr.innerHTML = `<span>${icon}</span> ${title}`;
    container.appendChild(hdr);
    if (!items.length) {
      const el = document.createElement("div");
      el.className   = "my-empty";
      el.textContent = emptyText;
      container.appendChild(el);
    } else {
      items.forEach(r => container.appendChild(makeRequestCard(r)));
    }
  };

  addSection("Matched Rides",   "🎉", matched,  "No matched rides yet.");
  addSection("Active Requests", "⏳", active,   "No active requests. Submit one above!");
  if (canceled.length) addSection("Canceled", "✕", canceled, "");

  container.querySelectorAll("button[data-cancel-req]").forEach(btn =>
    btn.addEventListener("click", () => cancelRequestClick(btn.getAttribute("data-cancel-req"), btn))
  );
}

function makeRequestCard(r) {
  const div   = document.createElement("div");
  div.className = "request-card";
  if (r.status === "matched")  div.classList.add("request-card--matched");
  if (r.status === "canceled") div.classList.add("request-card--canceled");

  const group = r.group;

  let statusBadge = "";
  if (r.status === "active") {
    statusBadge = `<span class="req-status-badge req-status-active">⏳ Active</span>`;
  } else if (r.status === "matched" && group?.status === "locked") {
    statusBadge = `<span class="req-status-badge req-status-matched">✓ Matched!</span>`;
  } else if (r.status === "matched" && group?.status === "forming") {
    statusBadge = `<span class="req-status-badge req-status-forming">📱 Paired — looking for 3rd</span>`;
  } else if (r.status === "canceled") {
    statusBadge = `<span class="req-status-badge req-status-canceled">✕ Canceled</span>`;
  }

  const timeStr = formatTimeAMPM(r.leaving_around);
  const dateStr = isoToMDY(r.ride_date);
  const route   = routeLabel(r.direction, r.airport);
  const sizeStr = groupSizeLabel(r.group_size);

  let ridersHtml = "";

  if (r.status === "matched" && group?.status === "locked" && group?.riders?.length) {
    ridersHtml = `
      <div class="req-riders">
        <div class="req-riders-title">Your carpool group:</div>
        ${group.riders.map(rd => {
          const name  = escapeHtml(rd.first_name || rd.email.split("@")[0]);
          const phone = rd.phone_e164
            ? `<span class="req-rider-phone">${escapeHtml(rd.phone_e164)}</span>`
            : `<span class="req-rider-nophone">no phone on file</span>`;
          return `<div class="req-rider-row"><span class="req-rider-name">👤 ${name}</span>${phone}</div>`;
        }).join("")}
        <p class="req-riders-hint">Coordinate via text to split your Uber fare. 💸</p>
      </div>`;
  } else if (r.status === "matched" && group?.status === "forming" && group?.riders?.length) {
    const curSize = group.riders.length;
    const target  = group.target_size;
    ridersHtml = `
      <div class="req-riders req-riders--forming">
        <div class="req-riders-title">Current pair (${curSize} of ${target}):</div>
        ${group.riders.map(rd => {
          const name  = escapeHtml(rd.first_name || rd.email.split("@")[0]);
          const phone = rd.phone_e164
            ? `<span class="req-rider-phone">${escapeHtml(rd.phone_e164)}</span>`
            : `<span class="req-rider-nophone">no phone on file</span>`;
          return `<div class="req-rider-row"><span class="req-rider-name">👤 ${name}</span>${phone}</div>`;
        }).join("")}
        <div class="req-forming-note" style="margin-top:10px;margin-bottom:0;">
          🔍 Still looking for 1 more rider going the same direction.
        </div>
      </div>`;
  }

  let actionsHtml = "";
  if (r.status === "active") {
    actionsHtml = `<div class="req-actions">
      <button class="btn-danger" data-cancel-req="${r.id}" style="font-size:13px;padding:9px 12px;">Cancel Request</button>
    </div>`;
  } else if (r.status === "matched" && group?.status === "forming") {
    actionsHtml = `<div class="req-actions">
      <button class="btn-danger" data-cancel-req="${r.id}" style="font-size:13px;padding:9px 12px;">Cancel</button>
    </div>`;
  }

  div.innerHTML = `
    <div class="req-card-header">
      <div class="req-time-block">
        <div class="req-leaving-label">${escapeHtml(dateStr)} · ${escapeHtml(route)}</div>
        <div class="req-time">${escapeHtml(timeStr)}</div>
        <div class="req-window-hint">${escapeHtml(sizeStr)}</div>
      </div>
      <div>${statusBadge}</div>
    </div>
    ${ridersHtml}
    ${actionsHtml}
  `;
  return div;
}


// ════════════════════════════════════════════════════════════
// CANCEL REQUEST
// ════════════════════════════════════════════════════════════

async function cancelRequestClick(requestId, btn) {
  const ok = await requireAuthOrQueue({ type: "LOAD_MY", payload: {} });
  if (!ok) return;
  if (!confirm("Cancel this ride request? If you're in a forming group, your match-mate will be released.")) return;

  if (btn) { btn.disabled = true; btn.textContent = "Canceling..."; }

  const { data, error } = await sb.rpc("cancel_request", {
    p_request_id: requestId,
    p_user_id:    currentUser.id,
  });

  if (error || !data?.success) {
    alert((error?.message || data?.reason) || "Cancel failed.");
    if (btn) { btn.disabled = false; btn.textContent = "Cancel Request"; }
    return;
  }

  await loadMyRequests();
}


// ════════════════════════════════════════════════════════════
// ACCOUNT / PROFILE
// ════════════════════════════════════════════════════════════

async function loadAccountTab() {
  activateTab("account");
  const ok = await requireAuthOrQueue({ type: "LOAD_MY", payload: {} });
  if (!ok) return;
  await loadProfile();
}

async function loadProfile() {
  setText("acct_err",""); setText("acct_msg","Loading...");
  await refreshUser();
  if (!currentUser?.id) { setText("acct_msg",""); setText("acct_err","Please sign in."); return; }

  const { data: profile, error } = await sb
    .from("profiles")
    .select("first_name")
    .eq("id", currentUser.id)
    .single();

  if (error && error.code !== "PGRST116") {
    setText("acct_msg",""); setText("acct_err","Failed to load profile: " + error.message);
    return;
  }

  if (profile) {
    $("acct_first_name").value = profile.first_name || "";
  }
  setText("acct_email", currentUser.email);
  setText("acct_msg","");
}

async function saveProfile() {
  setText("acct_err",""); setText("acct_msg","Saving...");
  $("acct_save_btn").disabled = true;

  await refreshUser();
  if (!currentUser?.id) {
    setText("acct_msg",""); setText("acct_err","Please sign in.");
    $("acct_save_btn").disabled = false;
    return;
  }

  const first_name = ($("acct_first_name").value || "").trim();

  const { error } = await sb.from("profiles").upsert({
    id:         currentUser.id,
    email:      currentUser.email,
    first_name: first_name || null,
    updated_at: new Date().toISOString(),
  });

  $("acct_save_btn").disabled = false;

  if (error) {
    setText("acct_msg",""); setText("acct_err","Save failed: " + error.message);
    return;
  }
  setText("acct_msg","Saved ✓");
  setTimeout(() => setText("acct_msg",""), 3000);
}


// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", async () => {

  // ── Mascots ──
  const mascots = {
    mascot_signin: "welcoming",
    mascot_signup: "excited",
    hero_mascot:   "happy",
  };
  for (const [id, mood] of Object.entries(mascots)) {
    const el = $(id);
    if (el) el.innerHTML = catCarSvg(mood);
  }

  // ── Controls ──
  initDirPicker("req_dir_toggle",  "req_direction");
  initSegToggle("req_size_toggle", "req_group_size");
  initAirportPills("req_airport_row", "req_airport");

  // ── Time dropdown ──
  buildTimeOptions($("req_time"), "14:00");

  // ── Date ──
  const todayIso = isoLocalDate(new Date());
  $("req_date").value = todayIso;
  $("req_date_display").textContent = isoToMDY(todayIso);
  $("req_date").addEventListener("change", () =>
    $("req_date_display").textContent = isoToMDY($("req_date").value)
  );

  // ── Password recovery redirect ──
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("code")) {
      await sb.auth.exchangeCodeForSession(window.location.href);
      url.searchParams.delete("code");
      window.history.replaceState({}, document.title, url.toString());
    }
  } catch { /* non-fatal */ }

  // ── Tab clicks ──
  $("tab_request")?.addEventListener("click", () => activateTab("request"));
  $("tab_my")?.addEventListener("click",      () => loadMyRequestsClick());
  $("tab_account")?.addEventListener("click", () => loadAccountTab());

  // ── Request + account ──
  $("req_btn")?.addEventListener("click", requestRideClick);
  $("acct_save_btn")?.addEventListener("click", saveProfile);
  $("my_refresh_btn")?.addEventListener("click", loadMyRequests);

  // ── Auth button ──
  $("auth_btn").addEventListener("click", async () => {
    await refreshUser();
    if (currentUser?.email) {
      $("auth_btn").disabled = true;
      try { await sb.auth.signOut(); } catch { /* ignore */ }
      currentUser = null; setAuthUI(); resetUIAfterSignOut();
      $("auth_btn").disabled = false;
    } else {
      openSignInModal("");
    }
  });

  // ── Sign-in modal ──
  $("signin_close").addEventListener("click",   closeSignInModal);
  $("signin_overlay").addEventListener("click", e => { if (e.target === $("signin_overlay")) closeSignInModal(); });
  $("signin_pw_btn").addEventListener("click",  async () => {
    const ok = await signInWithPassword(normEmail($("signin_email").value), $("signin_password").value);
    if (ok) { await refreshUser(); if (currentUser) closeSignInModal(); }
  });
  $("signup_pw_btn").addEventListener("click",  () => { closeSignInModal(); openSignUpModal(normEmail($("signin_email").value)); });
  $("forgot_pw_btn").addEventListener("click",  () => sendPasswordRecovery(normEmail($("signin_email").value)));
  $("reset_save_btn").addEventListener("click", updatePasswordFromRecovery);
  $("reset_back_btn").addEventListener("click", showSignInView);

  // ── Sign-up modal ──
  $("signup_close").addEventListener("click",    closeSignUpModal);
  $("signup_back_btn").addEventListener("click", () => { closeSignUpModal(); openSignInModal($("signup_email").value); });
  $("signup_overlay").addEventListener("click",  e => { if (e.target === $("signup_overlay")) closeSignUpModal(); });
  $("signup_create_btn").addEventListener("click", async () => {
    const ok = await signUpWithPassword(
      normEmail($("signup_email").value),
      $("signup_password").value, $("signup_password2").value
    );
    if (ok) { closeSignUpModal(); openSignInModal($("signup_email").value); }
  });

  // ── Post-submit modal ──
  $("submitted_close")?.addEventListener("click", closeSubmittedModal);
  $("submitted_overlay")?.addEventListener("click", e => {
    if (e.target === $("submitted_overlay")) closeSubmittedModal();
  });

  // ── Auth state listener ──
  sb.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user ? { email: session.user.email, id: session.user.id } : null;
    setAuthUI();
    if (event === "PASSWORD_RECOVERY") { openSignInModal(""); showResetView(); }
    if (event === "SIGNED_IN")         { closeSignInModal(); await maybeResumePendingAction(); }
    if (event === "SIGNED_OUT")        { resetUIAfterSignOut(); }
  });

  // ── iOS/PWA resume ──
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") onAppResume(); });
  window.addEventListener("pageshow", onAppResume);
  window.addEventListener("focus",    onAppResume);

  // ── Initial load ──
  await refreshUser();
  setAuthUI();
  await maybeResumePendingAction();
  activateTab("request");
});