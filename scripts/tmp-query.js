/* temp diagnostic script to run the primary payment-batches query */
const { pool } = require('../src/database/connection');

(async () => {
  try {
    const where = 'WHERE 1=1';
    const orderBy = ' ORDER BY pb.id DESC';
    const q = `
      SELECT pb.*,
             e.name AS entity_name,
             f.name AS fund_name,
             COALESCE(cu.created_by_name, pb.created_by::text, '') AS created_by_name
        FROM payment_batches pb
   LEFT JOIN entities e ON pb.entity_id = e.id
   LEFT JOIN funds    f ON pb.fund_id = f.id
   LEFT JOIN LATERAL (
         SELECT COALESCE(
                    NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''),
                    u.username
                ) AS created_by_name
           FROM users u
          WHERE pb.created_by IS NOT NULL
            AND (
                  u.id::text        = pb.created_by::text
               OR LOWER(u.username) = LOWER(pb.created_by::text)
               OR LOWER(u.email)    = LOWER(pb.created_by::text)
            )
          LIMIT 1
   ) cu ON TRUE
            ${where}
            ${orderBy}
    `;
    const r = await pool.query(q, []);
    console.log('rows =', r.rows.length);
    console.log('first row sample:', {
      id: r.rows[0]?.id,
      created_by: r.rows[0]?.created_by,
      created_by_name: r.rows[0]?.created_by_name,
      entity_name: r.rows[0]?.entity_name,
      fund_name: r.rows[0]?.fund_name
    });
    process.exit(0);
  } catch (e) {
    console.error('ERROR', e.code, e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
