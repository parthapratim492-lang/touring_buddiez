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
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#23302A;">
      <div style="background:linear-gradient(135deg,#173A31,#1F4A3E);padding:28px 24px;border-radius:12px 12px 0 0;">
        <h1 style="color:#D9BE8C;font-size:20px;margin:0;">Booking Confirmed 🎉</h1>
      </div>
      <div style="border:1px solid #ECE2CE;border-top:none;padding:24px;border-radius:0 0 12px 12px;">
        <p>Hi ${escapeHtml(booking.name || 'there')},</p>
        <p>Great news — your booking${pkgLine} with <b>Touring Buddiez</b> is now <span style="color:#1F4A3E;font-weight:700;">CONFIRMED</span>.</p>
        ${dateLine}
        ${groupLine}
        <p>We'll be in touch on WhatsApp with the final itinerary and payment details shortly.</p>
        <p style="margin-top:24px;">
          <a href="https://wa.me/919707386186" style="background:#25D366;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:700;display:inline-block;">Chat on WhatsApp</a>
        </p>
        <p style="margin-top:24px;font-size:13px;color:#55665C;">— Team Touring Buddiez<br>tourbuddiez@gmail.com &middot; +91 97073 86186</p>
      </div>
    </div>`;

  return sendMail({ to: booking.email, subject, text, html });
}

/**
 * Notifies the admin (business owner) that a new booking request came in.
 * Sent to whatever email is set in Site Settings — not the customer's email.
 */
async function sendAdminNewBookingEmail(adminEmail, booking) {
  if (!adminEmail || !booking) return false;

  const subject = `New booking request — ${booking.name}${booking.package_name ? ` (${booking.package_name})` : ''}`;

  const text =
`New booking request on Touring Buddiez:

Name: ${booking.name || '—'}
Phone: ${booking.phone || '—'}
Email: ${booking.email || '—'}
Package: ${booking.package_name || '—'}
Travel date: ${booking.travel_date || '—'}
Group size: ${booking.group_size || '—'}
Message: ${booking.message || '—'}

Open the admin panel to confirm or follow up: https://touringbuddieznortheast.in/admin`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#23302A;">
      <div style="background:linear-gradient(135deg,#16294B,#1F3A66);padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="color:#F2C879;font-size:18px;margin:0;">📩 New Booking Request</h1>
      </div>
      <div style="border:1px solid #ECE2CE;border-top:none;padding:24px;border-radius:0 0 12px 12px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#55665C;width:110px;">Name</td><td><b>${escapeHtml(booking.name || '—')}</b></td></tr>
          <tr><td style="padding:6px 0;color:#55665C;">Phone</td><td>${escapeHtml(booking.phone || '—')}</td></tr>
          <tr><td style="padding:6px 0;color:#55665C;">Email</td><td>${escapeHtml(booking.email || '—')}</td></tr>
          <tr><td style="padding:6px 0;color:#55665C;">Package</td><td>${escapeHtml(booking.package_name || '—')}</td></tr>
          <tr><td style="padding:6px 0;color:#55665C;">Travel date</td><td>${escapeHtml(booking.travel_date || '—')}</td></tr>
          <tr><td style="padding:6px 0;color:#55665C;">Group size</td><td>${escapeHtml(booking.group_size || '—')}</td></tr>
        </table>
        ${booking.message ? `<p style="margin-top:14px;padding-top:14px;border-top:1px solid #ECE2CE;color:#23302A;">${escapeHtml(booking.message)}</p>` : ''}
        <p style="margin-top:20px;">
          <a href="https://touringbuddieznortheast.in/admin" style="background:#173A31;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:700;display:inline-block;">Open Admin Panel</a>
        </p>
      </div>
    </div>`;

  return sendMail({ to: adminEmail, subject, text, html });
}

/**
 * Notifies the admin that a new contact-form enquiry came in.
 */
async function sendAdminNewEnquiryEmail(adminEmail, enquiry) {
  if (!adminEmail || !enquiry) return false;

  const subject = `New enquiry — ${enquiry.name}`;

  const text =
`New enquiry on Touring Buddiez:

Name: ${enquiry.name || '—'}
Phone: ${enquiry.phone || '—'}
Email: ${enquiry.email || '—'}
Source: ${enquiry.source || '—'}
Message: ${enquiry.message || '—'}

Open the admin panel to follow up: https://touringbuddieznortheast.in/admin`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#23302A;">
      <div style="background:linear-gradient(135deg,#16294B,#1F3A66);padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="color:#F2C879;font-size:18px;margin:0;">💬 New Enquiry</h1>
      </div>
      <div style="border:1px solid #ECE2CE;border-top:none;padding:24px;border-radius:0 0 12px 12px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#55665C;width:110px;">Name</td><td><b>${escapeHtml(enquiry.name || '—')}</b></td></tr>
          <tr><td style="padding:6px 0;color:#55665C;">Phone</td><td>${escapeHtml(enquiry.phone || '—')}</td></tr>
          <tr><td style="padding:6px 0;color:#55665C;">Email</td><td>${escapeHtml(enquiry.email || '—')}</td></tr>
          <tr><td style="padding:6px 0;color:#55665C;">Source</td><td>${escapeHtml(enquiry.source || '—')}</td></tr>
        </table>
        ${enquiry.message ? `<p style="margin-top:14px;padding-top:14px;border-top:1px solid #ECE2CE;color:#23302A;">${escapeHtml(enquiry.message)}</p>` : ''}
        <p style="margin-top:20px;">
          <a href="https://touringbuddieznortheast.in/admin" style="background:#173A31;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:700;display:inline-block;">Open Admin Panel</a>
        </p>
      </div>
    </div>`;

  return sendMail({ to: adminEmail, subject, text, html });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { sendMail, sendBookingConfirmedEmail, sendAdminNewBookingEmail, sendAdminNewEnquiryEmail };
