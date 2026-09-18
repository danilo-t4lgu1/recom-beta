// web/src/components/Header.jsx
import { RefreshIcon } from './Icons.jsx';

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

export function Header({ lastCronRun, onRefresh, refreshing }) {
  const cron = formatCronRun(lastCronRun);

  return (
    <header className="masthead">
      <div>
        <span className="eyebrow">TALGUI · RECOM INTELLIGENCE</span>
        <h1 className="masthead-title">Painel de Gestão e Vitrines</h1>
      </div>
      <div className="masthead-controls">
        <div className="cron-pill" title="Status da última sincronização automática do cron">
          <span className="status-dot" data-status={cron.status} />
          <span>cron: {cron.label}</span>
        </div>
        {onRefresh && (
          <button
            type="button"
            className="recom-btn-icon"
            onClick={onRefresh}
            disabled={refreshing}
            title="Recarregar dados"
            aria-label="Recarregar dados"
          >
            <RefreshIcon size={14} className={refreshing ? 'spin' : ''} />
          </button>
        )}
      </div>
    </header>
  );
}
