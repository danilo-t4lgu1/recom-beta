// CLI de preview somente-leitura do motor de recomendação (D-17, RULE-02).
//
// `node src/recommendation/recommend-cli.js <productId>` roda o motor puro
// (`recommendForProduct`, plano 03-01) produto a produto sobre o snapshot real
// já persistido em `data/catalog.db` (`getLatestSnapshotProducts`, plano
// 03-02) e imprime somente o JSON do resultado em stdout — nenhum acesso de
// rede, nenhuma escrita, primeiro consumidor real da interface do motor e
// prenúncio do preview da Fase 4.
//
// Comportamento real esperado HOJE (2026-07): enquanto a planilha de tecidos
// não é importada (0/645 produtos com `fabric_tag_canonical` preenchido,
// D-16), o motor estrito (D-15) devolve `[]` para qualquer produto real do
// catálogo — isso é o resultado CORRETO nesta janela, não indício de bug.
// Após a importação da planilha, este mesmo comando passa a devolver
// recomendações reais sem nenhuma mudança de código. Este CLI não implementa
// nenhum modo alternativo de elegibilidade — ele apenas delega ao motor.

import { recommendForProduct } from './recommendation-engine.js';
import { getLatestSnapshotProducts } from '../db/catalog-store.js';

const productId = process.argv[2];

if (!productId) {
  console.error('Uso: node src/recommendation/recommend-cli.js <productId>');
  process.exit(1);
}

const recommendations = recommendForProduct(productId, getLatestSnapshotProducts());

console.log(JSON.stringify(recommendations, null, 2));
