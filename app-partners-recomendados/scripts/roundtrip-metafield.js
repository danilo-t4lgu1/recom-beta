// Script executável de round-trip do Metafield "recomendados" contra a loja real Talgui.
//
// Uso: node scripts/roundtrip-metafield.js <id_produto_teste> <id_produto_recomendado>
//
// Passos:
// 1. Confirma que o produto de teste existe (GET /products/{id}), loga o nome.
// 2. Grava o Metafield (POST /metafields) com o ID do produto recomendado.
// 3. Lê de volta (GET /metafields/products?owner_id=...&namespace=recomendados) e
//    confirma que o valor lido é idêntico ao valor gravado.
// 4. Imprime um resumo de sucesso/falha e sai com o exit code correspondente.

import { getProduct, createMetafield, getMetafields } from '../src/nuvemshop-client/client.js';

async function main() {
  const [testProductId, recommendedProductId] = process.argv.slice(2);

  if (!testProductId || !recommendedProductId) {
    console.error(
      'Uso: node scripts/roundtrip-metafield.js <id_produto_teste> <id_produto_recomendado>'
    );
    process.exit(1);
  }

  console.log(`\n[1/3] Confirmando produto de teste ${testProductId}...`);
  const product = await getProduct(testProductId);
  const productName = product?.name?.pt || product?.name?.es || JSON.stringify(product?.name);
  console.log(`  OK — produto encontrado: "${productName}" (id ${product.id})`);

  const valueToWrite = String(recommendedProductId);

  console.log(
    `\n[2/3] Gravando Metafield recomendados.produto_sugerido=${valueToWrite} no produto ${testProductId}...`
  );
  await createMetafield({ ownerId: testProductId, value: valueToWrite });
  console.log('  OK — Metafield gravado.');

  console.log(`\n[3/3] Lendo de volta os Metafields do produto ${testProductId}...`);
  const metafields = await getMetafields({ ownerId: testProductId });
  const written = metafields.find(
    (mf) => mf.namespace === 'recomendados' && mf.key === 'produto_sugerido'
  );

  if (!written) {
    console.error('\nFALHA: Metafield gravado não foi encontrado na leitura de volta.');
    process.exit(1);
  }

  if (String(written.value) !== valueToWrite) {
    console.error(
      `\nFALHA: valor lido ("${written.value}") difere do valor gravado ("${valueToWrite}").`
    );
    process.exit(1);
  }

  console.log(
    `\nSUCESSO: round-trip confirmado — valor gravado ("${valueToWrite}") == valor lido de volta ("${written.value}").`
  );
  console.log(
    `Produto de teste: ${testProductId} ("${productName}") -> recomendado: ${recommendedProductId}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('\nERRO durante o round-trip:', err.message);
  process.exit(1);
});
