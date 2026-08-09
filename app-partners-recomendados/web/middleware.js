// Vercel Edge Middleware — porta de entrada de TODO request deste projeto
// (front estático + /api/dashboard). Substitui o toggle nativo "Vercel
// Authentication: All Deployments" (Pro-only) por HTTP Basic Auth simples:
// suficiente pra um painel interno de baixo valor de ataque, funciona no
// plano Hobby, e cobre os aliases *.vercel.app que o toggle gratuito não
// protegia (só cobria URLs de deployment com hash).
//
// Credenciais vivem em Environment Variables da Vercel (ADMIN_BASIC_AUTH_USER/
// _PASSWORD), nunca no código/git.

function unauthorized() {
  return new Response('Autenticação necessária.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Recom Admin"' },
  });
}

export default function middleware(request) {
  const expectedUser = process.env.ADMIN_BASIC_AUTH_USER;
  const expectedPassword = process.env.ADMIN_BASIC_AUTH_PASSWORD;

  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Basic ')) {
    return unauthorized();
  }

  let decoded;
  try {
    decoded = atob(header.slice('Basic '.length));
  } catch {
    return unauthorized();
  }

  const separatorIndex = decoded.indexOf(':');
  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (user !== expectedUser || password !== expectedPassword) {
    return unauthorized();
  }
}
