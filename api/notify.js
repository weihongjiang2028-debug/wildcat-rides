/**
 * /api/notify.js — NUCarpool SMS Notification Worker
 * Vercel Serverless Function (Node.js runtime)
 *
 * Endpoint: POST /api/notify
 * Call via Vercel Cron Job (vercel.json) every few minutes,
 * or trigger via Supabase Webhook on notification_jobs INSERT.
 *
 * Handles two job types:
 *   sms_partial_match — 3+3 pair formed; both riders get each other's info
 *                       + a note that we're still searching for a 3rd.
 *   sms_match_found   — Group fully locked (2+2, 2+3, or completed 3+3);
 *                       all riders get the complete contact list.
 *
 * Current behavior: logs the SMS payload + marks jobs sent.
 * Twilio wiring is scaffolded below — see the TODO section.
 *
 * ─── TODO: TWILIO INTEGRATION ────────────────────────────────────────────
 * 1. npm install twilio
 * 2. Add to Vercel env vars (Dashboard → Project → Settings → Environment):
 *      TWILIO_ACCOUNT_SID   = ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *      TWILIO_AUTH_TOKEN    = your_auth_token
 *      TWILIO_FROM_NUMBER   = +1XXXXXXXXXX
 *      SUPABASE_URL         = https://xxxx.supabase.co
 *      SUPABASE_SERVICE_ROLE_KEY = eyJ...
 *      NOTIFY_SECRET        = any-random-secret-string (for cron auth)
 * 3. Uncomment the Twilio block inside processSingleJob() below.
 * 4. Retry strategy: failed jobs stay status='failed'. Add a retry_count
 *    column + exponential backoff cron (1 min → 5 min → 30 min).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";

// ── Supabase admin client (service role — NEVER expose on the client side) ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);


 import twilio from "twilio";
 const twilioClient = twilio(
   process.env.TWILIO_ACCOUNT_SID,
   process.env.TWILIO_AUTH_TOKEN
 );

const MAX_JOBS_PER_RUN = 50;

// ════════════════════════════════════════════════════════════
// SMS TEXT BUILDERS
// ════════════════════════════════════════════════════════════

/**
 * Format ride date as "Mon, Jan 6".
 * @param {string} ride_date - ISO date string "YYYY-MM-DD"
 */
function formatRideDate(ride_date) {
  return new Date(ride_date + "T12:00:00")
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Build the SMS body for a sms_partial_match job (3+3 forming group).
 * Recipient has been paired with one other person; 1 slot still open.
 *
 * @param {object} job - notification_jobs row
 * @returns {string}
 */
function buildPartialMatchSms(job) {
  const { ride_date, airport, direction, target_size, riders } = job.payload;

  const dirLabel = direction === "to_airport"
    ? `Evanston → ${airport}`
    : `${airport} → Evanston`;
  const dateStr = formatRideDate(ride_date);

  // Find who this job belongs to, then list everyone else.
  const others = (riders || []).filter(r => r.user_id !== job.user_id);
  const otherLines = others.map(r => {
    const name  = r.first_name || "Wildcat";
    const phone = r.phone_e164 ? `📱 ${r.phone_e164}` : "(no phone on file)";
    return `• ${name} — ${phone}`;
  }).join("\n");

  return [
    `🐾 NUCarpool — You're paired up!`,
    ``,
    `${dirLabel} · ${dateStr} (CST)`,
    ``,
    `Your match so far:`,
    otherLines,
    ``,
    `We're still searching for 1 more rider (you're both open to up to ${target_size}).`,
    `You'll get another text if someone joins — but feel free to coordinate now!`,
    ``,
    `— NUCarpool`,
  ].join("\n");
}

/**
 * Build the SMS body for a sms_match_found job (fully locked group).
 * This is sent to ALL riders, including the original pair from a 3+3
 * forming group that just got its 3rd member.
 *
 * @param {object} job - notification_jobs row
 * @returns {string}
 */
function buildMatchFoundSms(job) {
  const { ride_date, airport, direction, riders } = job.payload;

  const dirLabel = direction === "to_airport"
    ? `Evanston → ${airport}`
    : `${airport} → Evanston`;
  const dateStr = formatRideDate(ride_date);

  // Show all co-riders (everyone except the recipient of this job).
  const others = (riders || []).filter(r => r.user_id !== job.user_id);
  const otherLines = others.map(r => {
    const name  = r.first_name || "Wildcat";
    const phone = r.phone_e164 ? `📱 ${r.phone_e164}` : "(no phone on file)";
    return `• ${name} — ${phone}`;
  }).join("\n");

  const groupSize = (riders || []).length;

  return [
    `🎉 NUCarpool — Your group is locked!`,
    ``,
    `${dirLabel} · ${dateStr} (CST)`,
    ``,
    `Your carpool group (${groupSize} riders):`,
    otherLines,
    ``,
    `Reach out to coordinate pickup time, meeting spot & luggage.`,
    `One person books Uber/Lyft — split the fare via Venmo/Zelle.`,
    ``,
    `— NUCarpool`,
  ].join("\n");
}

// ════════════════════════════════════════════════════════════
// JOB PROCESSOR
// ════════════════════════════════════════════════════════════

/**
 * Process a single notification_jobs row.
 * Logs the payload, optionally sends via Twilio, marks the job done.
 *
 * @param {object} job - full row from notification_jobs
 */
async function processSingleJob(job) {
  // Jobs with no phone number are created for logging only (rider has no
  // phone on file or hasn't opted in). Mark sent and move on.
  if (!job.phone_e164) {
    console.log(`[notify] Skipping job ${job.id} (${job.type}) — no phone number`);
    await supabase
      .from("notification_jobs")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", job.id);
    return;
  }

  // Build the SMS body based on job type.
  const smsBody = job.type === "sms_partial_match"
    ? buildPartialMatchSms(job)
    : buildMatchFoundSms(job);

  // ── Debug log (always runs — useful for dev/staging) ──────────────────
  console.log(`[notify] Job ${job.id} | type=${job.type} | to=${job.phone_e164}`);
  console.log(`[notify] SMS body:\n${smsBody}`);
  console.log(`[notify] Full payload:`, JSON.stringify(job.payload, null, 2));
  // ──────────────────────────────────────────────────────────────────────


   try {
     await twilioClient.messages.create({
       to:   job.phone_e164,
       from: process.env.TWILIO_FROM_NUMBER,
       body: smsBody,
     });
     console.log(`[notify] SMS sent → ${job.phone_e164}`);
   } catch (err) {
     console.error(`[notify] Twilio error for job ${job.id}:`, err.message);
     await supabase
       .from("notification_jobs")
       .update({ status: "failed" })
       .eq("id", job.id);
     return;  // don't mark as sent
   }
   //──────────────────────────────────────────────────────────────────────

  await supabase
    .from("notification_jobs")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", job.id);
}

// ════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  // Shared-secret auth: set NOTIFY_SECRET in Vercel env vars,
  // then pass it as "Authorization: Bearer <secret>" from your cron caller.
  const authHeader  = req.headers["authorization"] || "";
  const querySecret = (req.query && req.query.secret) ? req.query.secret : "";
  const secret      = process.env.NOTIFY_SECRET;
  if (secret && authHeader !== `Bearer ${secret}` && querySecret !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Fetch pending jobs oldest-first (both types in one query).
    const { data: jobs, error } = await supabase
      .from("notification_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(MAX_JOBS_PER_RUN);

    if (error) throw error;

    const results = { processed: 0, skipped: 0, failed: 0 };

    for (const job of jobs || []) {
      try {
        await processSingleJob(job);
        results.processed++;
      } catch (err) {
        console.error(`[notify] Failed job ${job.id}:`, err.message);
        await supabase
          .from("notification_jobs")
          .update({ status: "failed" })
          .eq("id", job.id);
        results.failed++;
      }
    }

    return res.status(200).json({ ok: true, ...results });
  } catch (err) {
    console.error("[notify] Fatal error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}