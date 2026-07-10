// Endpoint público (PLAT-05) — versão Vercel Serverless Function do endpoint que já
// existia localmente em src/server.js (plano 01-03). Publicado no MESMO projeto Vercel
// que já hospeda os webhooks LGPD (plano 01-02, app-partners-recomendados.vercel.app),
// em vez de subir infraestrutura separada (override 01-05 / D-11).
//
// Reaproveita getRecommendations() de src/api/recommendations.js — não duplica a lógica
// de leitura do Metafield. GET-only: qualquer outro método retorna 405 Method Not Allowed
// (mesma garantia de somente-leitura do server.js local, ASVS L1 V4 Access Control).
//
// Nunca repassa access_token/client_secret/Bearer da Nuvemshop ao chamador — o contrato
// de resposta é o mesmo objeto mínimo { productId, recommendedProductId } de sempre.
import { getRecommendations } from '../../src/api/recommendations.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { productId } = req.query;

  try {
    const result = await getRecommendations(productId);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal error fetching recommendations' });
  }
}
