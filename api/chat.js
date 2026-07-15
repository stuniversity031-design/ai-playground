// /api/chat
// POST /api/chat
// Body: { messages: [{role, content}, ...], system: "...", leadId: 123 | null }
//
// Proxies to Groq so the API key never reaches the browser, and logs the
// exchange to chat_history.
//
// Env vars required:
//   GROQ_API_KEY   -> from console.groq.com
//   DATABASE_URL   -> Neon connection string

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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const { messages, system, leadId } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1000,
        messages: [
          { role: 'system', content: system || 'You are AURA, a lead intelligence assistant.' },
          ...messages.map(m => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('[api/chat] Groq error:', groqRes.status, errText);
      return res.status(502).json({ error: 'upstream chat provider error' });
    }

    const data = await groqRes.json();
    const reply = data.choices?.[0]?.message?.content || 'Signal lost. Reconnecting…';

    // Log both sides of the exchange (best-effort — don't fail the response if logging fails)
    try {
      if (lastUserMsg) {
        await sql`INSERT INTO chat_history (lead_id, role, content) VALUES (${leadId || null}, 'user', ${lastUserMsg.content})`;
      }
      await sql`INSERT INTO chat_history (lead_id, role, content) VALUES (${leadId || null}, 'assistant', ${reply})`;
    } catch (logErr) {
      console.error('[api/chat] failed to log chat_history:', logErr);
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('[api/chat] error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
};
