import { useEffect, useState } from 'react';

const numberFormatter = new Intl.NumberFormat('pt-BR');
const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function formatCronRun(lastCronRun) {
  if (!lastCronRun) return { label: 'nenhuma execução ainda', status: 'unknown' };
  const status = lastCronRun.status === 'success' ? 'success' : lastCronRun.status;
  const at = lastCronRun.finishedAt || lastCronRun.startedAt;
  const when = at ? timeFormatter.format(new Date(at)) : '—';
  return { label: `${status === 'success' ? 'ok' : status} · ${when}`, status };
}

// Primeira letra maiúscula, só para exibição (o valor canônico real fica em minúsculo
// no banco — nunca alterado, isso é puramente cosmético na tela/export).
function titleCase(value) {
  if (typeof value !== 'string' || !value) return value;
  return value[0].toUpperCase() + value.slice(1).toLowerCase();
}

function Tag({ label, value, unit, sub, tone, onToggle, expanded }) {
  return (
    <div className="tag" data-tone={tone}>
      <span className="tag-label">{label}</span>
      <span className="tag-value">
        {value}
        {unit ? <small> {unit}</small> : null}
      </span>
      {sub ? <div className="tag-sub" dangerouslySetInnerHTML={{ __html: sub }} /> : null}
      {onToggle ? (
        <button type="button" className="tag-toggle" onClick={onToggle}>
          {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Hook genérico de "buscar sob demanda": só dispara o fetch na primeira vez que
 * `enabled` vira true (ex: usuário clica em "Ver detalhes") — os endpoints de
 * fabric-tags/cron-log fazem um trabalho de agregação/sweep mais pesado que o
 * /api/dashboard principal, não faz sentido pagar esse custo em toda carga de
 * página se o usuário nunca expandir o card.
 */
function useLazyFetch(url, enabled) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || data || error) return;
    let cancelled = false;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, url]);

  return { data, error };
}

export default function App() {
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState(null);
  const [fabricExpanded, setFabricExpanded] = useState(false);
  const [cronExpanded, setCronExpanded] = useState(false);

  const { data: fabricDetail, error: fabricError } = useLazyFetch('/api/fabric-tags', fabricExpanded);
  const { data: cronLog, error: cronLogError } = useLazyFetch('/api/cron-log', cronExpanded);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/dashboard')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setDashboard(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="page">
        <p className="state-message is-error">
          Não foi possível carregar o painel — verifique se o admin-server está rodando ({error}).
        </p>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="page">
        <p className="state-message">carregando painel…</p>
      </div>
    );
  }

  const { relatedProducts, relatedProductsStock, fabricTagFilled, lastCronRun } = dashboard;
  const cron = formatCronRun(lastCronRun);
  const zeroStockItems = relatedProductsStock.items.filter((item) => item.stockTotal === 0);

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <span className="eyebrow">Talgui · Recom</span>
          <h1>Painel Administrativo</h1>
        </div>
        <div className="cron-pill">
          <span className="status-dot" data-status={cron.status} />
          <span>cron: {cron.label}</span>
        </div>
      </header>

      <section className="tag-grid">
        <Tag
          label="Produtos relacionados"
          value={numberFormatter.format(relatedProducts.count)}
          unit={`/ ${numberFormatter.format(relatedProducts.totalProducts)}`}
        />
        <Tag
          label="Recomendados sem estoque"
          value={numberFormatter.format(relatedProductsStock.zeroStockCount)}
          unit={`/ ${numberFormatter.format(relatedProductsStock.items.length)}`}
          tone={relatedProductsStock.zeroStockCount > 0 ? 'alert' : 'ok'}
          sub={
            relatedProductsStock.zeroStockCount > 0
              ? 'aparecem no carrossel até o próximo cron atualizar'
              : 'nenhum zerado agora'
          }
        />
        <Tag
          label="Sem tag de tecido"
          value={numberFormatter.format(fabricTagFilled.total - fabricTagFilled.count)}
          unit={`/ ${numberFormatter.format(fabricTagFilled.total)}`}
          tone={fabricTagFilled.total - fabricTagFilled.count > 0 ? 'alert' : 'ok'}
          onToggle={() => setFabricExpanded((v) => !v)}
          expanded={fabricExpanded}
        />
        <Tag
          label="Cron diário"
          value={cron.status === 'success' ? 'Atualizado ✓' : cron.status === 'unknown' ? '—' : 'Falhou'}
          tone={cron.status === 'success' ? 'ok' : cron.status === 'unknown' ? undefined : 'alert'}
          sub={lastCronRun ? timeFormatter.format(new Date(lastCronRun.finishedAt || lastCronRun.startedAt)) : null}
          onToggle={() => setCronExpanded((v) => !v)}
          expanded={cronExpanded}
        />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Produtos recomendados sem estoque</h2>
          <span className="count">{numberFormatter.format(zeroStockItems.length)}</span>
        </div>
        {zeroStockItems.length === 0 ? (
          <p className="panel-empty">Nenhum produto recomendado está zerado agora.</p>
        ) : (
          <ul className="stock-list">
            {zeroStockItems.map((item) => (
              <li key={item.productId}>
                <span>
                  {item.name || 'Produto sem nome'} <span className="product-id">#{item.productId}</span>
                </span>
                <span className="stock-badge">0 un.</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {fabricExpanded ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Cobertura de tag de tecido por grupo</h2>
            <a className="download-link" href="/api/fabric-tags?format=xlsx" download>
              ⬇ Baixar Excel
            </a>
          </div>
          {fabricError ? (
            <p className="state-message is-error">Não foi possível carregar ({fabricError}).</p>
          ) : !fabricDetail ? (
            <p className="panel-empty">carregando…</p>
          ) : (
            <>
              <ul className="group-list">
                {fabricDetail.byGroup.map((g) => (
                  <li key={g.group}>
                    <span>{titleCase(g.group)}</span>
                    <span className="group-count">{numberFormatter.format(g.count)} SKUs</span>
                  </li>
                ))}
              </ul>
              <p className="panel-footnote">
                <strong>{numberFormatter.format(fabricDetail.missingCount)}</strong> SKUs sem Tag [TECIDO] preenchido
                de {numberFormatter.format(fabricDetail.total)} no catálogo completo.
              </p>
            </>
          )}
        </section>
      ) : null}

      {cronExpanded ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Log do cron — últimos 7 dias</h2>
            <a className="download-link" href="/api/cron-log?format=xlsx" download>
              ⬇ Baixar Excel (histórico completo)
            </a>
          </div>
          {cronLogError ? (
            <p className="state-message is-error">Não foi possível carregar ({cronLogError}).</p>
          ) : !cronLog ? (
            <p className="panel-empty">carregando…</p>
          ) : (
            <table className="cron-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Hora</th>
                  <th>Status</th>
                  <th>Catálogo</th>
                  <th>Relacionados</th>
                  <th>Daily Recompute</th>
                </tr>
              </thead>
              <tbody>
                {cronLog.rows.slice(-7).reverse().map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td>{row.time || '—'}</td>
                    <td data-tone={row.status === 'ATUALIZADO' ? 'ok' : 'alert'}>{row.status}</td>
                    <td>{row.catalog != null ? numberFormatter.format(row.catalog) : '—'}</td>
                    <td>{row.related != null ? numberFormatter.format(row.related) : '—'}</td>
                    <td data-tone={row.dailyRecompute === 'ERROR' ? 'alert' : undefined}>
                      {row.dailyRecompute || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}
    </div>
  );
}
