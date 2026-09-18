// web/src/components/OverviewTab.jsx
import { useState, useEffect } from 'react';
import { Card } from './Card.jsx';
import { Badge } from './Badge.jsx';
import { SkeletonCard } from './Skeleton.jsx';
import {
  PackageIcon,
  AlertTriangleIcon,
  TagIcon,
  ClockIcon,
  ChevronRightIcon,
  FileSpreadsheetIcon,
} from './Icons.jsx';
import { fetchFabricTags, fetchCronLog } from '../api/client.js';

const numberFormatter = new Intl.NumberFormat('pt-BR');

function titleCase(value) {
  if (typeof value !== 'string' || !value) return value;
  return value[0].toUpperCase() + value.slice(1).toLowerCase();
}

export function OverviewTab({ dashboard, loading, onGoToTab }) {
  const [fabricExpanded, setFabricExpanded] = useState(false);
  const [cronExpanded, setCronExpanded] = useState(false);
  const [zeroStockExpanded, setZeroStockExpanded] = useState(false);

  const [fabricData, setFabricData] = useState(null);
  const [fabricLoading, setFabricLoading] = useState(false);

  const [cronLogData, setCronLogData] = useState(null);
  const [cronLogLoading, setCronLogLoading] = useState(false);

  useEffect(() => {
    if (!fabricExpanded || fabricData || fabricLoading) return;
    setFabricLoading(true);
    fetchFabricTags()
      .then((data) => setFabricData(data))
      .catch(() => {})
      .finally(() => setFabricLoading(false));
  }, [fabricExpanded, fabricData, fabricLoading]);

  useEffect(() => {
    if (!cronExpanded || cronLogData || cronLogLoading) return;
    setCronLogLoading(true);
    fetchCronLog()
      .then((data) => setCronLogData(data))
      .catch(() => {})
      .finally(() => setCronLogLoading(false));
  }, [cronExpanded, cronLogData, cronLogLoading]);

  if (loading || !dashboard) {
    return (
      <div className="overview-grid">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const { relatedProducts, relatedProductsStock, fabricTagFilled, lastCronRun } = dashboard;
  const zeroStockItems = relatedProductsStock.items.filter((item) => item.stockTotal === 0);
  const totalStock = relatedProductsStock.totalUnitsInStock;
  const fabricPercent = Math.round((fabricTagFilled.count / fabricTagFilled.total) * 100);

  return (
    <div className="overview-container">
      <div className="overview-grid">
        {/* Card 1: Produtos Relacionados */}
        <Card
          title="Produtos Relacionados"
          icon={PackageIcon}
          subtitle="Catálogo coberto com vitrine ativa"
          className="overview-kpi-card"
        >
          <div className="kpi-value-row">
            <span className="kpi-main-number">
              {numberFormatter.format(relatedProducts.count)}
            </span>
            <span className="kpi-total-number">
              / {numberFormatter.format(relatedProducts.totalProducts)}
            </span>
          </div>
          <div className="kpi-meta-row">
            <Badge variant="success">
              {Math.round((relatedProducts.count / relatedProducts.totalProducts) * 100)}% Cobertura
            </Badge>
            {onGoToTab && (
              <button
                type="button"
                className="recom-btn-link"
                onClick={() => onGoToTab('inspector')}
              >
                Inspecionar produto <ChevronRightIcon size={12} />
              </button>
            )}
          </div>
        </Card>

        {/* Card 2: Estoque das Vitrines */}
        <Card
          title="Estoque das Vitrines"
          icon={AlertTriangleIcon}
          subtitle="Unidades disponíveis nas recomendações"
          className="overview-kpi-card"
        >
          <div className="kpi-value-row">
            <span className="kpi-main-number">{numberFormatter.format(totalStock)}</span>
            <span className="kpi-total-number">peças em estoque</span>
          </div>
          <div className="kpi-meta-row">
            {zeroStockItems.length === 0 ? (
              <Badge variant="success">Nenhum item zerado</Badge>
            ) : (
              <Badge variant="danger">{zeroStockItems.length} produtos zerados</Badge>
            )}
            {zeroStockItems.length > 0 && (
              <button
                type="button"
                className="recom-btn-link"
                onClick={() => setZeroStockExpanded(!zeroStockExpanded)}
              >
                {zeroStockExpanded ? 'Ocultar' : 'Ver lista'}
              </button>
            )}
          </div>
        </Card>

        {/* Card 3: Cobertura de Tecidos */}
        <Card
          title="Tecidos Preenchidos"
          icon={TagIcon}
          subtitle="Mapeamento taxonômico para Peso 1"
          className="overview-kpi-card"
        >
          <div className="kpi-value-row">
            <span className="kpi-main-number">
              {numberFormatter.format(fabricTagFilled.count)}
            </span>
            <span className="kpi-total-number">
              / {numberFormatter.format(fabricTagFilled.total)}
            </span>
          </div>
          <div className="kpi-meta-row">
            <Badge variant={fabricPercent >= 80 ? 'success' : 'warning'}>
              {fabricPercent}% Mapeados
            </Badge>
            <button
              type="button"
              className="recom-btn-link"
              onClick={() => setFabricExpanded(!fabricExpanded)}
            >
              {fabricExpanded ? 'Ocultar grupos' : 'Ver grupos'}
            </button>
          </div>
        </Card>

        {/* Card 4: Status do Cron */}
        <Card
          title="Execução Diária"
          icon={ClockIcon}
          subtitle="Rotina autônoma no GitHub Actions"
          className="overview-kpi-card"
        >
          <div className="kpi-value-row">
            <span className="kpi-main-number" style={{ fontSize: '1.4rem', textTransform: 'capitalize' }}>
              {lastCronRun ? lastCronRun.status : 'Desconhecido'}
            </span>
          </div>
          <div className="kpi-meta-row">
            <span className="kpi-subtext">
              {lastCronRun?.finishedAt
                ? `Concluído em ${new Date(lastCronRun.finishedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                : 'Aguardando próximo ciclo'}
            </span>
            <button
              type="button"
              className="recom-btn-link"
              onClick={() => setCronExpanded(!cronExpanded)}
            >
              {cronExpanded ? 'Ocultar histórico' : 'Ver histórico'}
            </button>
          </div>
        </Card>
      </div>

      {/* Painel Expansível: Itens com Estoque Zero */}
      {zeroStockExpanded && zeroStockItems.length > 0 && (
        <Card
          title="Produtos Recomendados Sem Estoque"
          subtitle={`${zeroStockItems.length} produtos estão gravados em vitrines ativas mas encontram-se com estoque zerado hoje.`}
          className="mt-4"
        >
          <div className="table-responsive">
            <table className="recom-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Produto</th>
                  <th style={{ textAlign: 'right' }}>Estoque Atual</th>
                  <th style={{ textAlign: 'right' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {zeroStockItems.map((item) => (
                  <tr key={item.productId}>
                    <td className="font-mono text-muted">{item.productId}</td>
                    <td className="font-medium">{item.name || 'Produto sem nome'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Badge variant="danger">0 un</Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {onGoToTab && (
                        <button
                          type="button"
                          className="recom-btn-link"
                          onClick={() => onGoToTab('inspector', item.productId)}
                        >
                          Ver Vitrine
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Painel Expansível: Detalhamento por Grupo de Tecido */}
      {fabricExpanded && (
        <Card
          title="Distribuição por Grupo de Tecido"
          subtitle="Taxonomia canônica utilizada pelo motor determinístico no cálculo de match de Peso 1."
          className="mt-4"
          action={
            <a
              href="/api/fabric-tags?format=xlsx"
              className="recom-btn-secondary"
              download="catalogo_tags_tecidos.xlsx"
            >
              <FileSpreadsheetIcon size={14} /> Exportar Excel
            </a>
          }
        >
          {fabricLoading ? (
            <div className="p-4 text-center text-muted">Carregando grupos de tecidos...</div>
          ) : fabricData?.byGroup ? (
            <div className="table-responsive">
              <table className="recom-table">
                <thead>
                  <tr>
                    <th>Grupo de Tecido</th>
                    <th style={{ textAlign: 'right' }}>Produtos</th>
                    <th style={{ textAlign: 'right' }}>Proporção</th>
                  </tr>
                </thead>
                <tbody>
                  {fabricData.byGroup.map((g) => {
                    const pct = Math.round((g.count / fabricData.total) * 100);
                    return (
                      <tr key={g.group}>
                        <td className="font-medium">{titleCase(g.group)}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono">
                          {numberFormatter.format(g.count)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="text-muted font-mono">{pct}%</span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="table-row-highlight">
                    <td>Sem tag mapeada</td>
                    <td style={{ textAlign: 'right' }} className="font-mono">
                      {numberFormatter.format(fabricData.missingCount)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="text-muted font-mono">
                        {Math.round((fabricData.missingCount / fabricData.total) * 100)}%
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      )}

      {/* Painel Expansível: Histórico do Cron */}
      {cronExpanded && (
        <Card
          title="Histórico Diário de Sincronizações"
          subtitle="Telemetria das execuções diárias do catálogo e reconexões do cron."
          className="mt-4"
          action={
            <a
              href="/api/cron-log?format=xlsx"
              className="recom-btn-secondary"
              download="log_cron.xlsx"
            >
              <FileSpreadsheetIcon size={14} /> Exportar Log
            </a>
          }
        >
          {cronLogLoading ? (
            <div className="p-4 text-center text-muted">Carregando histórico do cron...</div>
          ) : cronLogData?.rows ? (
            <div className="table-responsive">
              <table className="recom-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Horário</th>
                    <th>Status Catálogo</th>
                    <th style={{ textAlign: 'right' }}>Itens Lidos</th>
                    <th style={{ textAlign: 'right' }}>Relacionados</th>
                    <th style={{ textAlign: 'center' }}>Daily Recompute</th>
                  </tr>
                </thead>
                <tbody>
                  {cronLogData.rows.slice(-14).reverse().map((row) => (
                    <tr key={row.date}>
                      <td className="font-mono">{row.date}</td>
                      <td className="font-mono text-muted">{row.time || '—'}</td>
                      <td>
                        <Badge variant={row.status === 'ATUALIZADO' ? 'success' : 'danger'}>
                          {row.status}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right' }} className="font-mono">
                        {row.catalog != null ? numberFormatter.format(row.catalog) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }} className="font-mono">
                        {row.related != null ? numberFormatter.format(row.related) : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {row.dailyRecompute ? (
                          <Badge variant={row.dailyRecompute === 'OK' ? 'success' : 'danger'}>
                            {row.dailyRecompute}
                          </Badge>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
