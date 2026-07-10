// LGPD webhook: customers/redact — Nuvemshop calls this to request deletion of a specific
// customer's data. Stub for the Phase 1 viability spike: acknowledges receipt with 2xx
// (required within 3s) and logs the payload. Real data-deletion logic must be implemented
// before production go-live.
export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  console.log('[webhook] customers/redact received:', JSON.stringify(req.body));
  res.status(200).json({ received: true });
}
