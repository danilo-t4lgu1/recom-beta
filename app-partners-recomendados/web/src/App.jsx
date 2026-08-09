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

function Tag({ label, value, unit, sub, tone }) {
  return (
    <div className="tag" data-tone={tone}>
      <span className="tag-label">{label}</span>
      <span className="tag-value">
        {value}
        {unit ? <small> {unit}</small> : null}
      </span>
      {sub ? <div className="tag-sub" dangerouslySetInnerHTML={{ __html: sub }} /> : null}
    </div>
  );
}

export default function App() {
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState(null);

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
          label="Estoque dos relacionados"
          value={numberFormatter.format(relatedProductsStock.totalUnitsInStock)}
          unit="un."
          tone={relatedProductsStock.zeroStockCount > 0 ? 'alert' : 'ok'}
          sub={
            relatedProductsStock.zeroStockCount > 0
              ? `<strong>${relatedProductsStock.zeroStockCount}</strong> sem estoque`
              : 'nenhum zerado'
          }
        />
        <Tag
          label="Tecido preenchido em tags"
          value={numberFormatter.format(fabricTagFilled.count)}
          unit={`/ ${numberFormatter.format(fabricTagFilled.total)}`}
        />
        <Tag
          label="Última varredura (cron)"
          value={cron.status === 'success' ? 'ok' : cron.status === 'unknown' ? '—' : 'falhou'}
          tone={cron.status === 'success' ? 'ok' : cron.status === 'unknown' ? undefined : 'alert'}
          sub={lastCronRun ? timeFormatter.format(new Date(lastCronRun.finishedAt || lastCronRun.startedAt)) : null}
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
    </div>
  );
}
