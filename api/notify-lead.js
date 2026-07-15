// /api/notify-lead
// POST /api/notify-lead
// Body: { lead: {name, company, email, phone, budget, need, score, stage, source} }
//
// Sends a notification email via Gmail SMTP to both configured recipients
// and logs the send to activity_log.
//
// Env vars required:
//   GMAIL_USER          -> stuniversity031@gmail.com
//   GMAIL_APP_PASSWORD   -> ftzqcjglfbubncrs
//   NOTIFY_EMAIL_2       -> propertiesonlinellc@outlook.com
//   DATABASE_URL          -> postgresql://neondb_owner:npg_mvcMDTlSA1j9@ep-bold-mode-at1yh03x-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require

const nodemailer = require('nodemailer');
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function buildEmailHtml(lead) {
  const rows = [
    ['Name', lead.name],
    ['Company', lead.company],
    ['Email', lead.email],
    ['Phone', lead.phone || '—'],
    ['Budget', lead.budget || '—'],
    ['Need', lead.need || '—'],
    ['Source', lead.source || '—'],
    ['AURA Score', lead.score != null ? `${lead.score}/100` : '—'],
    ['Stage', lead.stage || 'New'],
  ];
  const rowsHtml = rows
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;font-weight:600;">${k}</td><td style="padding:4px 0;">${v}</td></tr>`)
    .join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:480px;">
      <h2 style="color:#0ea5e9;margin-bottom:4px;">New Lead — AURA Intake</h2>
      <p style="color:#666;margin-top:0;">A new lead has entered the Crestivo pipeline.</p>
      <table style="border-collapse:collapse;">${rowsHtml}</table>
    </div>
  `;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const { lead } = req.body || {};
    if (!lead || !lead.name || !lead.company) {
      return res.status(400).json({ error: 'lead object with at least name and company is required' });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const recipients = [process.env.GMAIL_USER, process.env.NOTIFY_EMAIL_2].filter(Boolean);

    await transporter.sendMail({
      from: `AURA — Crestivo Lead Intake <${process.env.GMAIL_USER}>`,
      to: recipients.join(', '),
      subject: `New Lead: ${lead.name} (${lead.company})`,
      html: buildEmailHtml(lead),
    });

    try {
      await sql`
        INSERT INTO activity_log (lead_id, event_type, detail)
        VALUES (${lead.id || null}, 'email_sent', ${`Notification sent to ${recipients.join(', ')} for ${lead.name}`})
      `;
    } catch (logErr) {
      console.error('[api/notify-lead] failed to log activity:', logErr);
    }

    return res.status(200).json({ sent: true, recipients });
  } catch (err) {
    console.error('[api/notify-lead] error:', err);
    return res.status(500).json({ error: 'failed to send notification email' });
  }
};
