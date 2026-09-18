// web/src/components/AuditTab.jsx
import { useState, useEffect } from 'react';
import { Card } from './Card.jsx';
import { Badge } from './Badge.jsx';
import { Skeleton } from './Skeleton.jsx';
import { FileSpreadsheetIcon, TagIcon } from './Icons.jsx';
import { fetchFabricTags } from '../api/client.js';

const numberFormatter = new Intl.NumberFormat('pt-BR');

function titleCase(value) {
  if (typeof value !== 'string' || !value) return value;
  return value[0].toUpperCase() + value.slice(1).toLowerCase();
}

export function AuditTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchFabricTags()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Falha ao carregar auditoria');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
          <Skeleton height="60px" />
          <Skeleton height="200px" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card style={{ borderColor: 'var(--accent-danger)' }}>
        <div style={{ color: 'var(--accent-danger)' }}>Erro ao carregar auditoria: {error}</div>
      </Card>
    );
  }

  const filteredRows = (data?.rows || []).filter((r) => {
    if (selectedGroup) {
      if (selectedGroup === '__missing__' && r.hasTag) return false;
      if (selectedGroup !== '__missing__' && r.fabricTagCanonical !== selectedGroup) return false;
    }
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      const matchName = r.name && r.name.toLowerCase().includes(q);
      const matchId = String(r.productId).includes(q);
      const matchSku = r.sku && r.sku.toLowerCase().includes(q);
      if (!matchName && !matchId && !matchSku) return false;
    }
    return true;
  });

  return (
    <div className="audit-tab-container">
      {/* Header com Ações de Exportação */}
      <Card
        title="Auditoria de Tags de Tecidos & Relatórios"
        icon={TagIcon}
        subtitle="Mapeamento taxonômico de materiais e planilhas oficiais para auditoria"
        action={
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <a
              href="/api/fabric-tags?format=xlsx"
              className="recom-btn-primary"
              download="catalogo_tags_tecidos.xlsx"
            >
              <FileSpreadsheetIcon size={14} /> Exportar Tecidos (.xlsx)
            </a>
            <a
              href="/api/cron-log?format=xlsx"
              className="recom-btn-secondary"
              download="log_cron.xlsx"
            >
              <FileSpreadsheetIcon size={14} /> Exportar Log Cron (.xlsx)
            </a>
          </div>
        }
      >
        <div className="audit-summary-stats">
          <div className="audit-stat-item">
            <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>Total Catálogo</span>
            <span className="font-mono audit-stat-num">{numberFormatter.format(data.total)}</span>
          </div>
          <div className="audit-stat-item">
            <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>Tags Preenchidas</span>
            <span className="font-mono audit-stat-num text-success">{numberFormatter.format(data.filledCount)}</span>
          </div>
          <div className="audit-stat-item">
            <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>Tags Faltantes</span>
            <span className="font-mono audit-stat-num text-danger">{numberFormatter.format(data.missingCount)}</span>
          </div>
          <div className="audit-stat-item">
            <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>Índice de Mapeamento</span>
            <span className="font-mono audit-stat-num">
              {Math.round((data.filledCount / data.total) * 100)}%
            </span>
          </div>
        </div>

        {/* Filtros da Tabela */}
        <div className="audit-filter-row mt-6">
          <div style={{ flex: 1 }}>
            <input
              type="text"
              className="recom-input"
              style={{ paddingLeft: '1rem' }}
              placeholder="Filtrar por nome, SKU ou ID..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
          <div>
            <select
              className="recom-select"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
            >
              <option value="">Todos os Grupos</option>
              {data.byGroup.map((g) => (
                <option key={g.group} value={g.group}>
                  {titleCase(g.group)} ({g.count})
                </option>
              ))}
              <option value="__missing__">Apenas Faltantes ({data.missingCount})</option>
            </select>
          </div>
        </div>

        {/* Tabela de Produtos */}
        <div className="table-responsive mt-4">
          <table className="recom-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Produto</th>
                <th>SKU</th>
                <th>Grupo de Tecido</th>
                <th style={{ textAlign: 'right' }}>Estoque Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.slice(0, 50).map((row) => (
                <tr key={row.productId}>
                  <td className="font-mono text-muted">{row.productId}</td>
                  <td className="font-medium">{row.name || 'Sem nome'}</td>
                  <td className="font-mono text-muted">{row.sku || '—'}</td>
                  <td>
                    {row.hasTag ? (
                      <Badge variant="fabric">{titleCase(row.fabricTagCanonical)}</Badge>
                    ) : (
                      <Badge variant="danger">Não Mapeado</Badge>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }} className="font-mono">
                    {numberFormatter.format(row.stockTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredRows.length > 50 && (
          <div className="p-4 text-center text-muted font-mono" style={{ fontSize: '0.78rem' }}>
            Mostrando primeiros 50 produtos de {filteredRows.length} correspondentes. Utilize a exportação Excel para a lista completa.
          </div>
        )}
      </Card>
    </div>
  );
}
