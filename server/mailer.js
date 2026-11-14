'use strict';

const nodemailer = require('nodemailer');

const {
  SMTP_HOST = '',
  SMTP_PORT = '465',
  SMTP_SECURE = '',
  SMTP_USER = '',
  SMTP_PASS = '',
  MAIL_FROM = ''
} = process.env;

const port = Number(SMTP_PORT) || 465;
const configured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

const transporter = configured
  ? nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: SMTP_SECURE ? SMTP_SECURE === 'true' : port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  })
  : null;

function mailConfigured() {
  return configured;
}

/**
 * Sends the 6-digit password reset code.
 * Returns { sent: false } when SMTP is not configured so the caller can fall
 * back to printing/logging the code (useful while developing locally).
 */
async function sendOtpEmail(to, otp) {
  if (!configured) return { sent: false };

  const from = MAIL_FROM || SMTP_USER;

  await transporter.sendMail({
    from: `"FootHub" <${from}>`,
    to,
    subject: `FootHub password reset code: ${otp}`,
    text: `Your FootHub password reset code is ${otp}.\n\nIt expires in 10 minutes. If you did not ask for this, you can ignore this email.`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif; background:#0f172a; padding:28px; border-radius:12px; color:#f8fafc;">
        <h2 style="margin:0 0 8px; font-size:20px;">FootHub password reset</h2>
        <p style="color:#94a3b8; font-size:14px; margin:0 0 18px;">Use the code below to set a new password.</p>
        <div style="font-size:32px; font-weight:800; letter-spacing:8px; color:#ff4f00; margin-bottom:18px;">${otp}</div>
        <p style="color:#94a3b8; font-size:12px; margin:0;">The code expires in 10 minutes. If you did not ask for this, you can ignore this email.</p>
      </div>
    `
  });

  return { sent: true };
}

module.exports = { sendOtpEmail, mailConfigured };
