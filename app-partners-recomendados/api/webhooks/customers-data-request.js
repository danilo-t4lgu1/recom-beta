// LGPD webhook: customers/data_request — Nuvemshop calls this when a customer requests a
// copy of their data; the app is responsible for sending that data to the merchant directly
// (not returned in this response). Stub for the Phase 1 viability spike: acknowledges receipt
// with 2xx (required within 3s) and logs the payload. Real data-export logic must be
// implemented before production go-live.
export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  console.log('[webhook] customers/data_request received:', JSON.stringify(req.body));
  res.status(200).json({ received: true });
}
