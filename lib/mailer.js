/* ============================================================
   TOURING BUDDIEZ — MAILER
   Small nodemailer wrapper used to email customers when their
   booking status changes (e.g. confirmed by the admin).

   Configure via environment variables (see .env.example):
     SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM

   For Gmail specifically: SMTP_USER is the full gmail address
   (tourbuddiez@gmail.com) and SMTP_PASS must be a 16-character
   Google "App Password" (Google Account → Security → 2-Step
   Verification → App passwords) — a normal Gmail login password
   will NOT work here.

   If SMTP_USER / SMTP_PASS aren't set, sendMail() silently no-ops
   (logs to console instead) so the rest of the app keeps working
   in local/dev environments without mail configured.
   ============================================================ */

const nodemailer = require('nodemailer');

const MAIL_FROM = process.env.MAIL_FROM || 'Touring Buddiez <tourbuddiez@gmail.com>';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  return transporter;
}

/**
 * Sends a plain-text + HTML email. Never throws — logs and resolves false
 * on failure so a mail hiccup can never break an admin action like
 * confirming a booking.
 */
async function sendMail({ to, subject, text, html }) {
  if (!to) return false;
  const t = getTransporter();
  if (!t) {
    console.log(`[mailer] SMTP not configured — would have emailed ${to}: "${subject}"`);
    return false;
  }
  try {
    await t.sendMail({ from: MAIL_FROM, to, subject, text, html });
    return true;
  } catch (err) {
    console.error('[mailer] send failed:', err.message);
    return false;
  }
}

/**
 * Notifies a customer that their booking enquiry has been confirmed.
 */
async function sendBookingConfirmedEmail(booking) {
  if (!booking || !booking.email) return false;

  const pkgLine = booking.package_name ? ` for <b>${escapeHtml(booking.package_name)}</b>` : '';
  const dateLine = booking.travel_date ? `<p><b>Travel date:</b> ${escapeHtml(booking.travel_date)}</p>` : '';
  const groupLine = booking.group_size ? `<p><b>Group size:</b> ${escapeHtml(booking.group_size)}</p>` : '';

  const subject = `Your Touring Buddiez booking${booking.package_name ? ` — ${booking.package_name}` : ''} is confirmed!`;

  const text =
`Hi ${booking.name || 'there'},

Great news — your booking${booking.package_name ? ` for ${booking.package_name}` : ''} with Touring Buddiez is now CONFIRMED.

${booking.travel_date ? `Travel date: ${booking.travel_date}\n` : ''}${booking.group_size ? `Group size: ${booking.group_size}\n` : ''}
We'll be in touch on WhatsApp (+91 97073 86186) with the final itinerary and payment details shortly. If you have any questions in the meantime, just reply to this email or message us on WhatsApp.

See you on the road!
— Team Touring Buddiez
tourbuddiez@gmail.com`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#2B342E;">
      <div style="background:linear-gradient(135deg,#163829,#1E4A36);padding:28px 24px;border-radius:12px 12px 0 0;">
        <h1 style="color:#E4C583;font-size:20px;margin:0;">Booking Confirmed 🎉</h1>
      </div>
      <div style="border:1px solid #E9EEE6;border-top:none;padding:24px;border-radius:0 0 12px 12px;">
        <p>Hi ${escapeHtml(booking.name || 'there')},</p>
        <p>Great news — your booking${pkgLine} with <b>Touring Buddiez</b> is now <span style="color:#1E4A36;font-weight:700;">CONFIRMED</span>.</p>
        ${dateLine}
        ${groupLine}
        <p>We'll be in touch on WhatsApp with the final itinerary and payment details shortly.</p>
        <p style="margin-top:24px;">
          <a href="https://wa.me/919707386186" style="background:#25D366;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:700;display:inline-block;">Chat on WhatsApp</a>
        </p>
        <p style="margin-top:24px;font-size:13px;color:#5A665D;">— Team Touring Buddiez<br>tourbuddiez@gmail.com &middot; +91 97073 86186</p>
      </div>
    </div>`;

  return sendMail({ to: booking.email, subject, text, html });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { sendMail, sendBookingConfirmedEmail };
