const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method 
not allowed' });

  try {
    const body = req.body || {};
    const msg = body.message || {};
    const call = msg.call || {};
    const analysis = msg.analysis || {};
    const transcript = msg.artifact?.transcript || '';

    const name = analysis.structuredData?.name || call.customer?.name || 
'Unknown';
    const phone = call.customer?.number || null;
    const company = analysis.structuredData?.company || 'Unknown';
    const email = analysis.structuredData?.email || null;
    const budget = analysis.structuredData?.budget || null;
    const need = analysis.structuredData?.need || null;
    const source = 'VAPI Call';
    const notes = transcript ? transcript.slice(0, 500) : analysis.summary 
|| null;

    const [lead] = await sql`
      INSERT INTO leads (name, company, email, phone, budget, need, 
source, notes, score, stage)
      VALUES (${name}, ${company}, ${email}, ${phone}, ${budget}, ${need}, 
${source}, ${notes}, 50, 'New')
      RETURNING *
    `;

    await sql`
      INSERT INTO activity_log (lead_id, event_type, detail)
      VALUES (${lead.id}, 'lead_created', ${`VAPI call lead: ${name} from 
${company}`})
    `;

    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 
'https://your-vercel-url.vercel.app'}/api/notify-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead }),
    });

    return res.status(200).json({ received: true, lead });
  } catch (err) {
    console.error('[api/vapi-webhook] error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
};
