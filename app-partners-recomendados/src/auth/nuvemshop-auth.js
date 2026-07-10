// Autenticação do App Partners privado "Talgui Recomendados" contra a loja real Talgui.
//
// Caminho principal (usado neste spike): o access_token foi obtido uma única vez via
// fluxo OAuth completo (ver exchangeCodeForToken abaixo) durante o registro do app no
// Partners Portal, e é lido de .env por getAccessToken() em toda execução — não expira
// até revogação/desinstalação do app (Nuvemshop RESEARCH.md Pattern 1).
//
// Caminho de fallback (exportado para uso futuro / reautorização): exchangeCodeForToken
// implementa o passo de troca de código por token do fluxo OAuth 2.0 padrão, caso o app
// precise ser reinstalado ou uma nova loja precise autorizar o app.

const TOKEN_URL = 'https://www.tiendanube.com/apps/authorize/token';

/**
 * Lê o access_token e o store_id já obtidos (via .env) para autenticar chamadas à API
 * pública da Nuvemshop.
 * @returns {{ accessToken: string, storeId: string }}
 */
export function getAccessToken() {
  const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;
  const storeId = process.env.NUVEMSHOP_STORE_ID;

  if (!accessToken) {
    throw new Error(
      'NUVEMSHOP_ACCESS_TOKEN ausente ou vazio em .env — confirme que o arquivo existe e foi preenchido com as credenciais reais do App Partners.'
    );
  }
  if (!storeId) {
    throw new Error(
      'NUVEMSHOP_STORE_ID ausente ou vazio em .env — confirme que o arquivo existe e foi preenchido com o store_id real da loja Talgui.'
    );
  }

  return { accessToken, storeId };
}

/**
 * Troca um código de autorização OAuth por um access_token permanente.
 * Usado apenas quando o fluxo completo de autorização (redirect + code) é necessário —
 * por exemplo, reinstalação do app ou autorização em uma nova loja.
 *
 * Credenciais enviadas sempre no corpo JSON do POST, nunca em query string (RESEARCH.md
 * Don't Hand-Roll — evita vazamento de client_secret/code em logs de acesso HTTP).
 *
 * @param {string} code - Código de autorização retornado pelo redirect da Nuvemshop (expira em 5 min)
 * @returns {Promise<{ accessToken: string, tokenType: string, userId: string|number, scope: string }>}
 */
export async function exchangeCodeForToken(code) {
  const clientId = process.env.NUVEMSHOP_CLIENT_ID;
  const clientSecret = process.env.NUVEMSHOP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'NUVEMSHOP_CLIENT_ID e/ou NUVEMSHOP_CLIENT_SECRET ausentes em .env — necessários para trocar o código de autorização por um access_token.'
    );
  }
  if (!code) {
    throw new Error('code é obrigatório para exchangeCodeForToken(code).');
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
    }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Falha ao trocar código por token (status ${response.status}): ${JSON.stringify(body)}`
    );
  }

  return {
    accessToken: body.access_token,
    tokenType: body.token_type,
    userId: body.user_id,
    scope: body.scope,
  };
}
