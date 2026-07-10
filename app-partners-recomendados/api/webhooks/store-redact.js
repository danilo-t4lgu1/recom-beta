// LGPD webhook: store/redact — Nuvemshop calls this after a merchant uninstalls the app,
// requesting deletion of store data. Stub for the Phase 1 viability spike: acknowledges
// receipt with 2xx (required within 3s per Nuvemshop's webhook contract) and logs the
// payload. Real data-deletion logic must be implemented before production go-live.
export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  console.log('[webhook] store/redact received:', JSON.stringify(req.body));
  res.status(200).json({ received: true });
}
