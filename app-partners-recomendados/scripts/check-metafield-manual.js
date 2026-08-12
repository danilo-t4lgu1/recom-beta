// Script de LEITURA (só olha, nunca escreve) do Metafield "recomendados.produto_sugerido"
// de um produto na loja real Talgui. Usado apenas para o teste manual de verificação da Fase 5.
// Não é parte do plano da fase — script temporário de apoio, pode ser removido depois.
//
// Uso: node --env-file=.env scripts/check-metafield-manual.js <id_produto>
// Exemplo: node --env-file=.env scripts/check-metafield-manual.js 349886153

import { findMetafield } from '../src/nuvemshop-client/client.js';

async function main() {
  const productId = process.argv[2];

  if (!productId) {
    console.error('Uso: node --env-file=.env scripts/check-metafield-manual.js <id_produto>');
    process.exit(1);
  }

  console.log('Consultando a API da Nuvemshop (timeout de 15s)...');

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout de 15s — sem resposta da API. Verifique conexão/VPN/firewall.')), 15000)
  );

  const metafield = await Promise.race([findMetafield({ ownerId: productId }), timeout]);

  if (!metafield) {
    console.log(`Nenhum Metafield "recomendados.produto_sugerido" encontrado para o produto ${productId}.`);
  } else {
    console.log(`Produto ${productId} — Metafield atual:`);
    console.log(`  id: ${metafield.id}`);
    console.log(`  valor (produto recomendado): ${metafield.value}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nERRO:', err.message);
    process.exit(1);
  });
