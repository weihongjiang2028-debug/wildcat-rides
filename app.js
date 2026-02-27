// ====== CONFIG ======
const SUPABASE_URL = "https://ylpgfkmjqzuwmqqhubyq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlscGdma21qcXp1d21xcWh1YnlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjAwMzUsImV4cCI6MjA4NTczNjAzNX0.QuUF6VQdiFf4idaKsV_wCihaOX3QSeT_U1DZ-w1SgkA";
const sb = window.__nu_carpool_sb || (window.__nu_carpool_sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

// ====== HELPERS ======
const $ = (id) => document.getElementById(id);
const setText = (id, t) => { const el = $(id); if (el) el.textContent = t || ""; };
const normEmail = (e) => (e || "").trim().toLowerCase();
const isNU = (e) => e.endsWith("@u.northwestern.edu");

function withTimeout(promise, ms, label = "timeout") {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(label)), ms))
  ]);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function timeToMinutes(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function windowMidMinutes(from_t, to_t) { return Math.round((timeToMinutes(from_t) + timeToMinutes(to_t)) / 2); }

function isoToMDY(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function formatTimeAMPM(hhmm) {
  if (!hhmm) return "";
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${mStr} ${ampm}`;
}

function riderLabelFromEmail(email) {
  const e = normEmail(email || "");
  const local = e.split("@")[0] || "";
  const m = local.match(/^(.*?)(\d{4})$/);
  if (!m) return `👤 ${local}`;
  const namePart = m[1] || local;
  const yy = (m[2] || "").slice(2);
  return `👤 ${namePart} ${yy}'`;
}

function prettyRoute(direction, airport) {
  if ((direction || "").includes("Evanston")) return `Evanston → ${airport}`;
  return `${airport} → Evanston`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

// ====== DATE CUTOFF ======
const RIDE_BUFFER_DAYS = 1;

function isoLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function cutoffRideDateIso() {
  const d = new Date();
  d.setDate(d.getDate() - RIDE_BUFFER_DAYS);
  return isoLocalDate(d);
}

// ====== PHONE / SMS ======
function extractPhone(contact) {
  const raw = String(contact || "").trim();
  if (!raw) return null;
  let cleaned = raw.replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/[^\d]/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10 && !cleaned.startsWith("+")) cleaned = "+1" + digits;
  if (!cleaned.startsWith("+")) cleaned = "+" + digits;
  return { display: raw, e164: cleaned };
}

function smsLink(numberE164, body) {
  const msg = encodeURIComponent(body || "");
  const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return isiOS ? `sms:${numberE164}&body=${msg}` : `sms:${numberE164}?body=${msg}`;
}

// ====== TIME DROPDOWN ======
function buildTimeOptions(selectEl, defaultHHMM, includeAny = false) {
  selectEl.innerHTML = "";
  if (includeAny) {
    const anyOpt = document.createElement("option");
    anyOpt.value = "";
    anyOpt.textContent = "Anytime";
    selectEl.appendChild(anyOpt);
  }
  for (let mins = 0; mins < 24 * 60; mins += 15) {
    const hh = String(Math.floor(mins / 60)).padStart(2, "0");
    const mm = String(mins % 60).padStart(2, "0");
    const hhmm = `${hh}:${mm}`;
    const opt = document.createElement("option");
    opt.value = hhmm;
    opt.textContent = formatTimeAMPM(hhmm);
    selectEl.appendChild(opt);
  }
  if (defaultHHMM !== undefined && defaultHHMM !== null) selectEl.value = defaultHHMM;
}

async function copyText(txt) {
  try {
    await navigator.clipboard.writeText(txt);
    return true;
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  }
}

// ====== TABS ======
function activateTab(which) {
  const tabs  = { post: $("tab_post"),  find: $("tab_find"),  my: $("tab_my")  };
  const views = { post: $("view_post"), find: $("view_find"), my: $("view_my") };
  for (const k of Object.keys(tabs)) {
    tabs[k].classList.toggle("active", k === which);
    views[k].classList.toggle("hidden", k !== which);
  }
}

// ====== AUTH STATE ======
let currentUser    = null;
let lastResumeAt   = 0;
let __refreshInFlight = null;
const PENDING_KEY     = "nu_carpool_pending_action";
const RESUME_GRACE_MS = 4000;

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
  } catch (e) {
    console.warn("getSessionUserFast:", e.message || e);
    return null;
  }
}

async function getSessionUserWithGrace() {
  let u = await getSessionUserFast();
  if (u) return u;
  if ((Date.now() - lastResumeAt) < RESUME_GRACE_MS) {
    for (const delay of [200, 400, 800, 1200]) {
      await sleep(delay);
      u = await getSessionUserFast();
      if (u) return u;
    }
  }
  return null;
}

async function refreshUser({ force = false } = {}) {
  if (__refreshInFlight) return __refreshInFlight;
  const prev = currentUser;

  __refreshInFlight = withTimeout((async () => {
    const su = await getSessionUserWithGrace();
    if (su) {
      currentUser = { email: su.email, id: su.id };
      setAuthUI();
    } else {
      if (prev?.email && (Date.now() - lastResumeAt) < RESUME_GRACE_MS) {
        currentUser = prev;
        setAuthUI();
        setTimeout(() => refreshUser({ force: false }).catch(() => {}), 500);
        return currentUser;
      }
      currentUser = null;
      setAuthUI();
      return null;
    }

    if (force) {
      try {
        const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error("getUser timeout")), ms));
        const { data } = await Promise.race([sb.auth.getUser(), timeout(4000)]);
        if (data?.user) currentUser = { email: data.user.email, id: data.user.id };
      } catch (e) {
        console.warn("refreshUser getUser failed (ignored):", e);
      }
      setAuthUI();
    }
    return currentUser;
  })(), 3000, "refreshUser timeout")
  .finally(() => { __refreshInFlight = null; })
  .catch((e) => {
    console.warn("refreshUser:", e.message || e);
    setAuthUI();
    return currentUser;
  });

  return __refreshInFlight;
}

function onAppResume() {
  lastResumeAt = Date.now();
  refreshUser({ force: false }).catch(() => {});
}

// ====== PENDING ACTIONS ======
function savePendingAction(action)  { localStorage.setItem(PENDING_KEY, JSON.stringify({ ...action, ts: Date.now() })); }
function loadPendingAction()        { try { return JSON.parse(localStorage.getItem(PENDING_KEY)); } catch (e) { return null; } }
function clearPendingAction()       { localStorage.removeItem(PENDING_KEY); }

async function requireAuthOrQueue(action) {
  try {
    await withTimeout(refreshUser({ force: false }), 2500, "requireAuth timeout");
  } catch (e) {
    console.warn("requireAuthOrQueue:", e.message || e);
  }
  if (currentUser?.email) return true;
  savePendingAction(action);
  openSignInModal(action?.emailHint || "");
  return false;
}

async function maybeResumePendingAction() {
  await refreshUser();
  if (!currentUser?.email) return;
  const pending = loadPendingAction();
  if (!pending) return;
  if (pending.ts && (Date.now() - pending.ts) > 15 * 60 * 1000) { clearPendingAction(); return; }
  clearPendingAction();
  if      (pending.type === "POST")         await doPostRide(pending.payload);
  else if (pending.type === "JOIN_PREVIEW") { pendingJoinRideId = pending.payload.rideId; await buildJoinPreviewById(pending.payload.rideId); openJoinPreviewModal(); }
  else if (pending.type === "CANCEL")       await doCancelJoin(pending.payload.rideId, null);
  else if (pending.type === "LOAD_MY")      { activateTab("my"); await loadMyRides(); }
  else if (pending.type === "CANCEL_RIDE")  await doCancelRideAsHost(pending.payload.rideId, null);
}

// ====== AUTH MODALS ======
function openSignInModal(prefillEmail = "") {
  showSignInView();
  setText("signin_msg", "");
  setText("signin_err", "");
  if (prefillEmail) $("signin_email").value = prefillEmail;
  $("signin_overlay").classList.add("show");
}
function closeSignInModal() { $("signin_overlay").classList.remove("show"); }

function openSignUpModal(prefillEmail = "") {
  setText("signup_msg", "");
  setText("signup_err", "");
  if (prefillEmail) $("signup_email").value = prefillEmail;
  $("signup_password").value = "";
  $("signup_password2").value = "";
  $("signup_overlay").classList.add("show");
}
function closeSignUpModal() { $("signup_overlay").classList.remove("show"); }

function showResetView() {
  hide($("signin_view"));
  show($("reset_view"));
  setText("reset_msg", "");
  setText("reset_err", "");
  $("reset_pw1").value = "";
  $("reset_pw2").value = "";
}

function showSignInView() {
  show($("signin_view"));
  hide($("reset_view"));
  setText("signin_msg", "");
  setText("signin_err", "");
}

function resetUIAfterSignOut() {
  closeSignInModal();
  clearPendingAction();
  setText("post_msg", ""); setText("post_err", "");
  setText("find_msg", ""); setText("find_err", "");
  setText("my_msg",   ""); setText("my_err",   "Signed out.");
  $("my_rides").innerHTML = "";
  $("post_btn").disabled = false;
  $("find_btn").disabled = false;
  $("my_refresh_btn").disabled = false;
  activateTab("find");
}

async function sendPasswordRecovery(email) {
  setText("signin_err", "");
  setText("signin_msg", "Sending recovery email...");
  $("forgot_pw_btn").disabled = true;
  $("signin_pw_btn").disabled = true;
  $("signup_pw_btn").disabled = true;
  try {
    if (!email || !isNU(email)) throw new Error("Please enter a Northwestern email (@u.northwestern.edu).");
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/" });
    if (error) throw error;
    setText("signin_msg", "Recovery email sent. Check your inbox, then come back here.");
  } catch (err) {
    setText("signin_msg", "");
    setText("signin_err", err.message || "Failed to send recovery email.");
  } finally {
    $("forgot_pw_btn").disabled = false;
    $("signin_pw_btn").disabled = false;
    $("signup_pw_btn").disabled = false;
  }
}

async function updatePasswordFromRecovery() {
  setText("reset_err", "");
  setText("reset_msg", "Updating password...");
  $("reset_save_btn").disabled = true;
  $("reset_back_btn").disabled = true;
  try {
    const p1 = $("reset_pw1").value || "";
    const p2 = $("reset_pw2").value || "";
    if (p1.length < 8) throw new Error("Password must be at least 8 characters.");
    if (p1 !== p2)     throw new Error("Passwords do not match.");
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) throw error;
    setText("signin_msg", "Password updated. Please sign in.");
    showSignInView();
  } catch (err) {
    setText("reset_msg", "");
    setText("reset_err", err.message || "Failed to update password.");
  } finally {
    $("reset_save_btn").disabled = false;
    $("reset_back_btn").disabled = false;
  }
}

async function signUpWithPassword(email, password) {
  setText("signin_err", "");
  setText("signin_msg", "Creating account...");
  $("signup_pw_btn").disabled = true;
  $("signin_pw_btn").disabled = true;
  try {
    if (!email || !isNU(email))           throw new Error("Please use your Northwestern email (@u.northwestern.edu).");
    if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");
    const { error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    if (error) throw error;
    setText("signin_msg", "Account created. Now sign in with your password.");
    return true;
  } catch (err) {
    setText("signin_msg", "");
    setText("signin_err", err.message || "Sign up failed.");
    return false;
  } finally {
    $("signup_pw_btn").disabled = false;
    $("signin_pw_btn").disabled = false;
  }
}

async function signInWithPassword(email, password) {
  setText("signin_err", "");
  setText("signin_msg", "Signing in...");
  $("signin_pw_btn").disabled = true;
  $("forgot_pw_btn").disabled = true;
  $("signup_pw_btn").disabled = true;
  try {
    if (!email || !isNU(email)) throw new Error("Please use your Northwestern email (@u.northwestern.edu).");
    if (!password)              throw new Error("Please enter your password.");
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setText("signin_msg", "Signed in.");
    return true;
  } catch (err) {
    setText("signin_msg", "");
    setText("signin_err", err.message || "Sign in failed.");
    return false;
  } finally {
    $("signin_pw_btn").disabled = false;
    $("forgot_pw_btn").disabled = false;
    $("signup_pw_btn").disabled = false;
  }
}

// ====== DATABASE HELPERS ======
async function getSeatsFilledMap(rideIds) {
  if (!rideIds.length) return {};
  const { data: parts, error } = await sb.from("ride_participants").select("ride_id").in("ride_id", rideIds);
  if (error) return {};
  const map = {};
  for (const p of (parts || [])) map[p.ride_id] = (map[p.ride_id] || 0) + 1;
  return map;
}

async function getMyJoinedIds(email) {
  const { data: joins, error } = await sb.from("ride_participants").select("ride_id").eq("user_email", email);
  if (error) return [];
  return [...new Set((joins || []).map(j => j.ride_id))];
}

// ====== POST A RIDE ======
async function postRideClick() {
  setText("post_err", "");
  setText("post_msg", "");
  const payload = collectPostPayload();
  if (!payload) return;
  const ok = await requireAuthOrQueue({ type: "POST", payload, emailHint: payload.owner_email });
  if (!ok) return;
  await doPostRide(payload);
}

function collectPostPayload() {
  const direction     = $("post_direction").value;
  const airport       = $("post_airport").value;
  const ride_date_iso = $("post_date").value;
  const from_time     = $("post_from").value;
  const to_time       = $("post_to").value;
  const max_seats     = parseInt($("post_max_seats").value, 10);
  const contact       = $("post_contact").value.trim();
  const owner_email   = normEmail(currentUser?.email || "");

  if (!ride_date_iso)          { setText("post_err", "Please select a date."); return null; }
  if (!from_time || !to_time)  { setText("post_err", "Please fill both From and To times."); return null; }
  if (timeToMinutes(from_time) > timeToMinutes(to_time)) { setText("post_err", "From time must be earlier than To time."); return null; }
  if (!contact)                { setText("post_err", "Please provide contact info."); return null; }

  return { owner_email, direction, airport, ride_date: ride_date_iso, from_time, to_time, max_seats, status: "open", note: null, contact };
}

async function doPostRide(payload) {
  setText("post_err", "");
  setText("post_msg", "Posting...");
  $("post_btn").disabled = true;
  await refreshUser();
  payload.owner_email = normEmail(currentUser?.email || "");
  if (!payload.owner_email || !isNU(payload.owner_email)) {
    setText("post_msg", "");
    setText("post_err", "Please sign in with your Northwestern email.");
    $("post_btn").disabled = false;
    return;
  }
  const { data, error } = await sb.from("rides").insert([payload]).select().single();
  if (error) {
    setText("post_msg", "");
    setText("post_err", "Submit failed:\n" + (error.message || JSON.stringify(error)));
    $("post_btn").disabled = false;
    return;
  }
  await sb.from("ride_participants").insert([{ ride_id: data.id, user_email: payload.owner_email }]);
  setText("post_msg", "Posted! Your ride is now open.");
  openPostDoneModal();
  $("post_btn").disabled = false;
}

// ====== FIND / SEARCH ======
async function searchRides() {
  setText("find_err", "");
  setText("find_msg", "Searching...");
  $("find_btn").disabled = true;

  const direction     = $("find_direction").value;
  const airport       = $("find_airport").value;
  const ride_date_iso = $("find_date").value;
  const t             = $("find_time").value;

  if (!ride_date_iso) {
    setText("find_msg", "");
    setText("find_err", "Please select a date.");
    $("find_btn").disabled = false;
    return;
  }

  await refreshUser();
  const myEmail = normEmail(currentUser?.email || "");

  let q = sb.from("rides")
    .select("*")
    .eq("ride_date", ride_date_iso)
    .eq("direction", direction)
    .eq("airport", airport)
    .in("status", ["open", "full"]);
  if (myEmail) q = q.neq("owner_email", myEmail);

  const { data: rides, error } = await q.order("created_at", { ascending: false });
  if (error) {
    setText("find_msg", "");
    setText("find_err", "Search failed:\n" + (error.message || JSON.stringify(error)));
    $("find_btn").disabled = false;
    return;
  }

  const list      = rides || [];
  const rideIds   = list.map(r => r.id);
  const countsMap = await getSeatsFilledMap(rideIds);
  const myJoined  = myEmail ? await getMyJoinedIds(myEmail) : [];
  const tMin      = t ? timeToMinutes(t) : null;

  const enriched = list.map(r => ({
    ...r,
    seats_filled:  countsMap[r.id] || 0,
    dist:          tMin === null ? null : Math.abs(windowMidMinutes(r.from_time, r.to_time) - tMin),
    alreadyJoined: myJoined.includes(r.id),
    isOwner:       myEmail && normEmail(r.owner_email) === myEmail,
  }));

  enriched.sort((a, b) =>
    tMin !== null
      ? (a.dist ?? 0) - (b.dist ?? 0)
      : timeToMinutes(a.from_time) - timeToMinutes(b.from_time)
  );

  renderResults(enriched);
  setText("find_msg", enriched.length ? `Found ${enriched.length} ride(s).` : "No rides for this day.");
  $("find_btn").disabled = false;
}

function renderResults(rides) {
  const container = $("results");
  container.innerHTML = "";

  for (const r of rides) {
    const filled = r.seats_filled || 0;
    const isFull = filled >= r.max_seats;
    const joined = !!r.alreadyJoined;

    const div = document.createElement("div");
    div.className = "ride";

    const joinBtnHtml = joined
      ? `<button data-cancel="${r.id}" class="danger">Cancel Join</button>`
      : `<button data-join="${r.id}" ${isFull ? "disabled" : ""}>Join Ride</button>`;

    const poster      = riderLabelFromEmail(r.owner_email).replace(/^👤\s*/, "");
    const contactLine = joined ? `📱 ${r.contact || ""}` : `📱 Contact unlocked once joined`;

    div.innerHTML = `
      <div class="leaveWindowLabel">Leaving window</div>
      <div class="leaveWindowTime">${escapeHtml(`${formatTimeAMPM(r.from_time)} – ${formatTimeAMPM(r.to_time)}`)}</div>
      <div class="leaveWindowDate">${escapeHtml(isoToMDY(r.ride_date))}</div>
      <div class="rideDivider"></div>
      <div class="rideMetaLine">🧭 ${escapeHtml(prettyRoute(r.direction, r.airport))}</div>
      <div class="rideMetaLine">${escapeHtml(`👤 Posted by ${poster}`)}</div>
      <div class="rideSubMeta">💺 ${filled} / ${r.max_seats} seats filled</div>
      <div class="rideSubMeta">${escapeHtml(contactLine)}</div>
      <div class="row" style="margin-top:10px;">${joinBtnHtml}</div>
    `;
    container.appendChild(div);
  }

  container.querySelectorAll("button[data-join]").forEach(btn =>
    btn.addEventListener("click", () => joinRideClick(btn.getAttribute("data-join"), btn))
  );
  container.querySelectorAll("button[data-cancel]").forEach(btn =>
    btn.addEventListener("click", () => cancelJoinClick(btn.getAttribute("data-cancel"), btn))
  );
}

// ====== JOIN ======
let pendingJoinRideId = null;
let joindoneSmsUrl    = null;

async function joinRideClick(rideId, btn) {
  const ok = await requireAuthOrQueue({ type: "JOIN_PREVIEW", payload: { rideId } });
  if (!ok) return;
  pendingJoinRideId = rideId;
  await buildJoinPreviewById(rideId);
  openJoinPreviewModal();
}

async function buildJoinPreviewById(rideId) {
  setText("joinpreview_err", "");
  setText("joinpreview_msg", "Loading...");
  $("joinpreview_confirm").disabled = true;

  const { data: ride, error } = await sb.from("rides").select("*").eq("id", rideId).single();
  if (error || !ride) {
    setText("joinpreview_msg", "");
    setText("joinpreview_err", error?.message || "Failed to load ride.");
    $("joinpreview_confirm").disabled = false;
    return null;
  }

  const { data: parts } = await sb.from("ride_participants").select("ride_id").eq("ride_id", rideId);
  const remaining = Math.max(ride.max_seats - (parts || []).length, 0);
  const poster    = riderLabelFromEmail(ride.owner_email).replace("👤 ", "");

  $("joinpreview_body").innerHTML =
    `<strong>${escapeHtml(poster)}'s ride</strong><br/>
     ${escapeHtml(isoToMDY(ride.ride_date))} · ${escapeHtml(prettyRoute(ride.direction, ride.airport))}<br/>
     • ${escapeHtml(`${formatTimeAMPM(ride.from_time)}–${formatTimeAMPM(ride.to_time)}`)}<br/>
     • ${remaining} seat${remaining === 1 ? "" : "s"} remaining`;

  setText("joinpreview_msg", "");
  $("joinpreview_confirm").disabled = false;
  return ride;
}

async function doJoinRide(rideId) {
  await refreshUser();
  const email = normEmail(currentUser?.email || "");
  if (!email || !isNU(email)) { alert("Please sign in with your Northwestern email."); return; }

  const { data: existing } = await sb.from("ride_participants").select("id").eq("ride_id", rideId).eq("user_email", email).maybeSingle();
  if (existing) {
    await searchRides();
    const { data: ride } = await sb.from("rides").select("*").eq("id", rideId).single();
    if (ride) { fillJoinDoneStep1(ride, email); openJoinDoneModal(); }
    return;
  }

  const { error: e1 } = await sb.from("ride_participants").insert([{ ride_id: rideId, user_email: email }]);
  if (e1) { alert(e1.message || "Join failed."); return; }

  const { data: ride }  = await sb.from("rides").select("*").eq("id", rideId).single();
  const { data: parts } = await sb.from("ride_participants").select("ride_id").eq("ride_id", rideId);
  const newStatus = (parts || []).length >= ride.max_seats ? "full" : "open";
  await sb.from("rides").update({ status: newStatus }).eq("id", rideId);

  await searchRides();
  fillJoinDoneStep1(ride, email);
  openJoinDoneModal();
}

function fillJoinDoneStep1(ride, myEmail) {
  const poster = riderLabelFromEmail(ride.owner_email).replace("👤 ", "");
  const msg    = makeMessageTemplate(ride, myEmail);
  const phone  = extractPhone(ride.contact || "");

  if (phone) {
    joindoneSmsUrl = smsLink(phone.e164, msg);
    $("joindone_step1").innerHTML =
      `<strong>Reach out to poster</strong><br/>
       👤 Posted by ${escapeHtml(poster)}<br/>
       📱 <a href="tel:${phone.e164}">${escapeHtml(phone.display)}</a>`;
  } else {
    joindoneSmsUrl = null;
    $("joindone_step1").innerHTML =
      `<strong>Reach out to poster</strong><br/>
       👤 Posted by ${escapeHtml(poster)}<br/>
       📱 ${escapeHtml(ride.contact || "No contact provided")}`;
  }
  $("joindone_text_poster").textContent = phone ? "Text Poster" : "Copy Contact";
}

function makeMessageTemplate(ride, myEmail) {
  return `Hi! I just joined your carpool on ${isoToMDY(ride.ride_date)} (${ride.direction}, ${ride.airport}). My leave window is ${formatTimeAMPM(ride.from_time)}–${formatTimeAMPM(ride.to_time)}. Where should we meet, and what time should we confirm? Thanks!`;
}

// ====== CANCEL JOIN ======
async function cancelJoinClick(rideId, btn) {
  const ok = await requireAuthOrQueue({ type: "CANCEL", payload: { rideId } });
  if (!ok) return;
  await doCancelJoin(rideId, btn);
}

async function doCancelJoin(rideId, btn) {
  await refreshUser();
  const email = normEmail(currentUser?.email || "");
  if (!email || !isNU(email)) { alert("Please sign in with your Northwestern email."); return; }
  if (!confirm("Cancel your join for this ride?")) return;

  if (btn) { btn.disabled = true; btn.textContent = "Cancelling..."; }

  const { error } = await sb.from("ride_participants").delete().eq("ride_id", rideId).eq("user_email", email);
  if (error) {
    alert(error.message || "Cancel failed.");
    if (btn) { btn.disabled = false; btn.textContent = "Cancel Join"; }
    return;
  }

  const { data: ride }  = await sb.from("rides").select("max_seats").eq("id", rideId).single();
  const { data: parts } = await sb.from("ride_participants").select("ride_id").eq("ride_id", rideId);
  if (ride && (parts || []).length < ride.max_seats) {
    await sb.from("rides").update({ status: "open" }).eq("id", rideId);
  }

  await searchRides().catch(() => {});
  if (!$("view_my").classList.contains("hidden")) await loadMyRides();
}

// ====== CANCEL RIDE AS HOST ======
async function cancelRideAsHostClick(rideId, btn) {
  const ok = await requireAuthOrQueue({ type: "CANCEL_RIDE", payload: { rideId } });
  if (!ok) return;
  await doCancelRideAsHost(rideId, btn);
}

async function doCancelRideAsHost(rideId, btn) {
  await refreshUser();
  const email = normEmail(currentUser?.email || "");
  if (!email || !isNU(email)) { alert("Please sign in with your Northwestern email."); return; }
  if (!confirm("Cancel (delete) this ride for everyone? This cannot be undone.")) return;

  if (btn) { btn.disabled = true; btn.textContent = "Cancelling..."; }

  const { data: ride, error: e0 } = await sb.from("rides").select("id, owner_email").eq("id", rideId).single();
  if (e0 || !ride) { alert(e0?.message || "Failed to load ride."); if (btn) { btn.disabled = false; btn.textContent = "Cancel Ride"; } return; }
  if (normEmail(ride.owner_email) !== email) { alert("You can only cancel rides you posted."); if (btn) { btn.disabled = false; btn.textContent = "Cancel Ride"; } return; }

  const { error: pErr } = await sb.from("ride_participants").delete().eq("ride_id", rideId);
  if (pErr) { alert(pErr.message || "Cancel failed (participants)."); if (btn) { btn.disabled = false; btn.textContent = "Cancel Ride"; } return; }

  const { error: rErr } = await sb.from("rides").delete().eq("id", rideId);
  if (rErr) { alert(rErr.message || "Cancel failed (ride)."); if (btn) { btn.disabled = false; btn.textContent = "Cancel Ride"; } return; }

  if (!$("view_my").classList.contains("hidden"))   await loadMyRides();
  if (!$("view_find").classList.contains("hidden"))  await searchRides().catch(() => {});
}

// ====== MY RIDES ======
async function loadMyRidesClick() {
  activateTab("my");
  setText("my_err", "");
  setText("my_msg", "Signing you back in…");
  let ok = false;
  try {
    ok = await withTimeout(requireAuthOrQueue({ type: "LOAD_MY", payload: {} }), 3000, "loadMy timeout");
  } catch (e) {
    console.warn("loadMyRidesClick:", e.message || e);
  }
  if (!ok) { setText("my_msg", ""); setText("my_err", "Still signing you in — please tap Sign in if prompted."); return; }
  setText("my_msg", "Loading…");
  await loadMyRides();
}

async function loadMyRides() {
  setText("my_err", "");
  setText("my_msg", "Loading...");
  $("my_refresh_btn").disabled = true;

  await refreshUser();
  const email = normEmail(currentUser?.email || "");
  if (!email || !isNU(email)) {
    setText("my_msg", "");
    setText("my_err", "Please sign in with your Northwestern email.");
    $("my_refresh_btn").disabled = false;
    return;
  }

  const { data: posted, error: e1 } = await sb.from("rides")
    .select("*")
    .eq("owner_email", email)
    .gte("ride_date", cutoffRideDateIso())
    .order("created_at", { ascending: false });

  if (e1) {
    setText("my_msg", "");
    setText("my_err", e1.message || "Failed to load posted rides.");
    $("my_refresh_btn").disabled = false;
    return;
  }

  const joinedIds = await getMyJoinedIds(email);
  let joined = [];
  if (joinedIds.length) {
    const { data: jr, error: e2 } = await sb.from("rides")
      .select("*")
      .in("id", joinedIds)
      .gte("ride_date", cutoffRideDateIso())
      .order("created_at", { ascending: false });
    if (!e2) joined = jr || [];
  }

  const allIds    = [...new Set([...(posted || []).map(r => r.id), ...(joined || []).map(r => r.id)])];
  const countsMap = await getSeatsFilledMap(allIds);
  renderMyRides(posted || [], joined || [], countsMap, email);
  setText("my_msg", "Loaded.");
  $("my_refresh_btn").disabled = false;
}

function renderMyRides(posted, joined, countsMap, myEmail) {
  const container = $("my_rides");
  container.innerHTML = "";

  const sectionTitle = (txt) => {
    const d = document.createElement("div");
    d.className = "muted";
    d.style.cssText = "font-weight:900; margin-top:8px;";
    d.textContent = txt;
    return d;
  };

  const makeCard = (r, tag) => {
    const filled  = countsMap[r.id] || 0;
    const isOwner = normEmail(r.owner_email) === myEmail;
    const isFull  = filled >= r.max_seats;
    const div     = document.createElement("div");
    div.className = "ride";
    div.innerHTML = `
      <div class="row" style="justify-content:space-between; gap:10px;">
        <div class="row" style="gap:8px;">
          <span class="pill">${escapeHtml(tag)}</span>
          <span class="pill">${isOwner ? "HOST" : "RIDER"}</span>
        </div>
        <span class="pill">${isFull ? "FULL" : "OPEN"}</span>
      </div>
      <div class="rideTime">${escapeHtml(`${formatTimeAMPM(r.from_time)}–${formatTimeAMPM(r.to_time)}`)}</div>
      <div class="rideMeta"><span>${escapeHtml(`${isoToMDY(r.ride_date)} · ${r.direction} · ${r.airport}`)}</span></div>
      <div class="kv">
        <div class="kvRow"><div class="kvLabel">Seats</div><div class="kvValue">${filled}/${r.max_seats} filled</div></div>
        <div class="kvRow"><div class="kvLabel">Contact</div><div class="kvValue">${escapeHtml(r.contact)}</div></div>
      </div>
      ${!isOwner ? `
        <div class="row" style="margin-top:12px;"><button class="danger" data-cancel="${r.id}">Cancel Join</button></div>
      ` : `
        <div class="row" style="margin-top:12px;"><button class="danger" data-cancel-ride="${r.id}">Cancel Ride</button></div>
        <div class="hint" style="margin-top:10px;">Cancelling will hide this ride from everyone.</div>
      `}
    `;
    return div;
  };

  container.appendChild(sectionTitle("My Posted Rides"));
  if (!posted.length) {
    const d = document.createElement("div"); d.className = "muted"; d.textContent = "(none)"; container.appendChild(d);
  } else {
    posted.forEach(r => container.appendChild(makeCard(r, "POSTED")));
  }

  container.appendChild(document.createElement("div")).className = "hr";

  container.appendChild(sectionTitle("My Joined Rides"));
  const joinedOnly = joined.filter(r => !posted.some(p => p.id === r.id));
  if (!joinedOnly.length) {
    const d = document.createElement("div"); d.className = "muted"; d.textContent = "(none)"; container.appendChild(d);
  } else {
    joinedOnly.forEach(r => container.appendChild(makeCard(r, "JOINED")));
  }

  container.querySelectorAll("button[data-cancel]").forEach(btn =>
    btn.addEventListener("click", () => cancelJoinClick(btn.getAttribute("data-cancel"), btn))
  );
  container.querySelectorAll("button[data-cancel-ride]").forEach(btn =>
    btn.addEventListener("click", () => cancelRideAsHostClick(btn.getAttribute("data-cancel-ride"), btn))
  );
}

// ====== MODAL HELPERS ======
function openPostDoneModal()     { $("postdone_overlay").classList.add("show"); }
function closePostDoneModal()    { $("postdone_overlay").classList.remove("show"); }
function openJoinPreviewModal()  { $("joinpreview_overlay").classList.add("show"); }
function closeJoinPreviewModal() { $("joinpreview_overlay").classList.remove("show"); }
function openJoinDoneModal()     { $("joindone_overlay").classList.add("show"); }
function closeJoinDoneModal()    { $("joindone_overlay").classList.remove("show"); }

// ====== INIT ======
document.addEventListener("DOMContentLoaded", async () => {

  // Handle password recovery redirect
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("code")) {
      await sb.auth.exchangeCodeForSession(window.location.href);
      url.searchParams.delete("code");
      window.history.replaceState({}, document.title, url.toString());
    }
  } catch (e) {
    console.warn("exchangeCodeForSession failed:", e);
  }

  // Tabs
  $("tab_post").addEventListener("click", () => activateTab("post"));
  $("tab_find").addEventListener("click", () => activateTab("find"));
  $("tab_my").addEventListener("click",   () => loadMyRidesClick());

  // Main buttons
  $("post_btn").addEventListener("click",       postRideClick);
  $("find_btn").addEventListener("click",       searchRides);
  $("my_refresh_btn").addEventListener("click", loadMyRides);

  // Auth button
  $("auth_btn").addEventListener("click", async () => {
    await refreshUser();
    if (currentUser?.email) {
      $("auth_btn").disabled = true;
      try { await sb.auth.signOut(); } catch (e) { console.warn("signOut failed:", e); }
      currentUser = null;
      setAuthUI();
      resetUIAfterSignOut();
      $("auth_btn").disabled = false;
    } else {
      openSignInModal("");
    }
  });

  // Join Preview modal
  $("joinpreview_close").addEventListener("click",   closeJoinPreviewModal);
  $("joinpreview_cancel").addEventListener("click",  closeJoinPreviewModal);
  $("joinpreview_overlay").addEventListener("click", e => { if (e.target === $("joinpreview_overlay")) closeJoinPreviewModal(); });
  $("joinpreview_confirm").addEventListener("click", async () => {
    setText("joinpreview_err", "");
    setText("joinpreview_msg", "Joining...");
    $("joinpreview_confirm").disabled = true;
    $("joinpreview_cancel").disabled  = true;
    try {
      if (!pendingJoinRideId) throw new Error("Missing ride id.");
      closeJoinPreviewModal();
      await doJoinRide(pendingJoinRideId);
    } catch (err) {
      setText("joinpreview_msg", "");
      setText("joinpreview_err", err.message || "Join failed.");
    } finally {
      $("joinpreview_confirm").disabled = false;
      $("joinpreview_cancel").disabled  = false;
    }
  });

  // Join Done modal
  $("joindone_close").addEventListener("click",      closeJoinDoneModal);
  $("joindone_overlay").addEventListener("click",    e => { if (e.target === $("joindone_overlay")) closeJoinDoneModal(); });
  $("joindone_close_text").addEventListener("click", closeJoinDoneModal);
  $("joindone_text_poster").addEventListener("click", async () => {
    if (joindoneSmsUrl) { window.location.href = joindoneSmsUrl; return; }
    await copyText(String($("joindone_step1").textContent || "").trim());
    $("joindone_text_poster").textContent = "Copied!";
    setTimeout(() => $("joindone_text_poster").textContent = "Copy Contact", 900);
  });

  // Sign-in modal
  $("signin_close").addEventListener("click",   closeSignInModal);
  $("signin_overlay").addEventListener("click", e => { if (e.target === $("signin_overlay")) closeSignInModal(); });
  $("signup_pw_btn").addEventListener("click",  () => { const email = normEmail($("signin_email").value); closeSignInModal(); openSignUpModal(email); });
  $("signin_pw_btn").addEventListener("click",  async () => {
    const ok = await signInWithPassword(normEmail($("signin_email").value), $("signin_password").value || "");
    if (ok) { await refreshUser(); if (currentUser?.email) closeSignInModal(); }
  });
  $("forgot_pw_btn").addEventListener("click",  () => sendPasswordRecovery(normEmail($("signin_email").value)));
  $("reset_save_btn").addEventListener("click", updatePasswordFromRecovery);
  $("reset_back_btn").addEventListener("click", showSignInView);

  // Sign-up modal
  $("signup_close").addEventListener("click",    closeSignUpModal);
  $("signup_back_btn").addEventListener("click", () => { closeSignUpModal(); openSignInModal($("signup_email").value || ""); });
  $("signup_overlay").addEventListener("click",  e => { if (e.target === $("signup_overlay")) closeSignUpModal(); });
  $("signup_create_btn").addEventListener("click", async () => {
    setText("signup_msg", ""); setText("signup_err", "");
    const email = normEmail($("signup_email").value);
    const p1    = $("signup_password").value  || "";
    const p2    = $("signup_password2").value || "";
    if (!email || !isNU(email)) { setText("signup_err", "Please use your Northwestern email (@u.northwestern.edu)."); return; }
    if (p1.length < 8)          { setText("signup_err", "Password must be at least 8 characters."); return; }
    if (p1 !== p2)              { setText("signup_err", "Passwords do not match."); return; }
    const ok = await signUpWithPassword(email, p1);
    if (ok) { closeSignUpModal(); openSignInModal(email); }
  });

  // Post-success modal
  $("postdone_close").addEventListener("click",   closePostDoneModal);
  $("postdone_got_it").addEventListener("click",  closePostDoneModal);
  $("postdone_overlay").addEventListener("click", e => { if (e.target === $("postdone_overlay")) closePostDoneModal(); });
  $("postdone_view_my").addEventListener("click", async () => { closePostDoneModal(); activateTab("my"); await loadMyRides(); });

  // Date defaults
  const todayIso = new Date().toISOString().slice(0, 10);
  $("find_date").value = todayIso;
  $("post_date").value = todayIso;
  $("find_date_display").textContent = isoToMDY(todayIso);
  $("post_date_display").textContent = isoToMDY(todayIso);
  $("find_date").addEventListener("change", () => $("find_date_display").textContent = isoToMDY($("find_date").value));
  $("post_date").addEventListener("change", () => $("post_date_display").textContent = isoToMDY($("post_date").value));

  // Time dropdowns
  buildTimeOptions($("post_from"), "14:00", false);
  buildTimeOptions($("post_to"),   "15:00", false);
  buildTimeOptions($("find_time"), "",      true);

  // Auth state listener
  sb.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user ? { email: session.user.email, id: session.user.id } : null;
    setAuthUI();
    if (event === "PASSWORD_RECOVERY") { openSignInModal(""); showResetView(); return; }
    if (event === "SIGNED_IN")         { closeSignInModal(); await maybeResumePendingAction(); }
    if (event === "SIGNED_OUT")        { resetUIAfterSignOut(); }
  });

  // iOS resume handlers (registered once)
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") onAppResume(); });
  window.addEventListener("pageshow", onAppResume);
  window.addEventListener("focus",    onAppResume);

  // Initial load
  await refreshUser();
  setAuthUI();
  await maybeResumePendingAction();
  activateTab("find");

});
