// /api/leads
// GET    /api/leads            -> list all leads, newest first
// POST   /api/leads            -> create a lead (body: {name, company, email, ...})
// PATCH  /api/leads?id=123     -> update a lead (body: any subset of fields, e.g. {stage:"Qualified"})
//
// Env vars required (set in Vercel project settings):
//   DATABASE_URL   -> Neon connection string, e.g. postgresql://user:pass@host/db?sslmode=require

const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const leads = await sql`SELECT * FROM leads ORDER BY created_at DESC`;
      return res.status(200).json({ leads });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.name || !b.company || !b.email) {
        return res.status(400).json({ error: 'name, company, and email are required' });
      }

      const [lead] = await sql`
        INSERT INTO leads
          (name, company, email, phone, title, industry, revenue, score, stage, budget, need, timeline, source, notes)
        VALUES
          (${b.name}, ${b.company}, ${b.email}, ${b.phone || null}, ${b.title || null},
           ${b.industry || 'Unknown'}, ${b.revenue || 'Unknown'}, ${b.score ?? 50}, ${b.stage || 'New'},
           ${b.budget || null}, ${b.need || null}, ${b.timeline || 'TBD'}, ${b.source || null}, ${b.notes || null})
        RETURNING *
      `;

      await sql`
        INSERT INTO activity_log (lead_id, event_type, detail)
        VALUES (${lead.id}, 'lead_created', ${`${lead.name} from ${lead.company} entered the pipeline via ${lead.source || 'unknown source'}`})
      `;

      return res.status(201).json({ lead });
    }

    if (req.method === 'PATCH') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'id query param is required' });

      const b = req.body || {};
      const existing = await sql`SELECT * FROM leads WHERE id = ${id}`;
      if (!existing.length) return res.status(404).json({ error: 'lead not found' });

      const current = existing[0];
      const merged = { ...current, ...b };

      const [lead] = await sql`
        UPDATE leads SET
          name = ${merged.name}, company = ${merged.company}, email = ${merged.email},
          phone = ${merged.phone}, title = ${merged.title}, industry = ${merged.industry},
          revenue = ${merged.revenue}, score = ${merged.score}, stage = ${merged.stage},
          budget = ${merged.budget}, need = ${merged.need}, timeline = ${merged.timeline},
          source = ${merged.source}, notes = ${merged.notes}, last_contact = ${merged.last_contact},
          updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;

      if (b.stage && b.stage !== current.stage) {
        await sql`
          INSERT INTO activity_log (lead_id, event_type, detail)
          VALUES (${id}, 'stage_change', ${`${lead.name}: ${current.stage} -> ${b.stage}`})
        `;
      }

      return res.status(200).json({ lead });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, OPTIONS');
    return res.status(405).json({ error: `method ${req.method} not allowed` });
  } catch (err) {
    console.error('[api/leads] error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
};
