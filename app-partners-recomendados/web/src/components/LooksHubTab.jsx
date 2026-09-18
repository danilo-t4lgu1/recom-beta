// web/src/components/LooksHubTab.jsx
import { useState, useEffect } from 'react';
import { Card } from './Card.jsx';
import { Badge } from './Badge.jsx';
import { Pagination } from './Pagination.jsx';
import { Skeleton } from './Skeleton.jsx';
import { SparklesIcon, ArrowRightIcon } from './Icons.jsx';
import { fetchCoPurchasePairs } from '../api/client.js';

const numberFormatter = new Intl.NumberFormat('pt-BR');

const CATEGORIES = [
  'Vestidos',
  'Blusas',
  'Calças',
  'Saias',
  'Shorts e Bermudas',
  'Macacões e Macaquinhos',
  'Conjuntos',
  'Casacos e Jaquetas',
  'Bodies',
  'Croppeds e Tops',
];

export function LooksHubTab({ onInspectProduct }) {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [sortBy, setSortBy] = useState('count');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchCoPurchasePairs({
      page,
      limit: 20,
      category: category || null,
      onlyInStock,
      sortBy,
    })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Falha ao carregar pares de co-compra');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, category, onlyInStock, sortBy]);

  return (
    <div className="looks-hub-container">
      {/* Barra de Filtros e Métricas */}
      <Card className="looks-filter-card">
        <div className="looks-filter-bar">
          <div className="looks-filter-group">
            <label className="filter-label text-muted">Categoria:</label>
            <select
              className="recom-select"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas as Categorias</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="looks-filter-group">
            <label className="filter-label text-muted">Ordenação:</label>
            <select
              className="recom-select"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
            >
              <option value="count">Mais pedidos em comum (Volume)</option>
              <option value="count_asc">Menos pedidos em comum</option>
            </select>
          </div>

          <label className="looks-checkbox-label">
            <input
              type="checkbox"
              checked={onlyInStock}
              onChange={(e) => {
                setOnlyInStock(e.target.checked);
                setPage(1);
              }}
            />
            <span>Apenas pares com estoque hoje</span>
          </label>

          {data && (
            <div className="looks-meta-count">
              <span className="font-mono text-muted">
                {numberFormatter.format(data.eligiblePairsCount)} pares elegíveis / {numberFormatter.format(data.total)} total
              </span>
            </div>
          )}
        </div>
      </Card>

      {error && (
        <Card className="mt-4" style={{ borderColor: 'var(--accent-danger)' }}>
          <div style={{ color: 'var(--accent-danger)' }}>Erro ao carregar pares: {error}</div>
        </Card>
      )}

      {/* Tabela de Pares */}
      <Card className="mt-4" title="Grafo de Co-Compra Real (Look Comprovado)">
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem' }}>
            <Skeleton height="3.5rem" />
            <Skeleton height="3.5rem" />
            <Skeleton height="3.5rem" />
            <Skeleton height="3.5rem" />
          </div>
        ) : data?.pairs?.length > 0 ? (
          <div className="table-responsive">
            <table className="recom-table">
              <thead>
                <tr>
                  <th>Peça A (Fonte)</th>
                  <th style={{ width: '40px', textAlign: 'center' }}></th>
                  <th>Peça B (Par Comprovado)</th>
                  <th style={{ textAlign: 'center' }}>Pedidos Reais</th>
                  <th style={{ textAlign: 'center' }}>Elegibilidade</th>
                  <th style={{ textAlign: 'right' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {data.pairs.map((pair) => (
                  <tr key={pair.id}>
                    {/* Peça A */}
                    <td>
                      <div className="pair-piece-cell">
                        <span className="piece-name font-medium">{pair.pieceA.name}</span>
                        <div className="piece-tags">
                          <span className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>
                            ID: {pair.pieceA.productId}
                          </span>
                          {pair.pieceA.categoryRaw && (
                            <span className="badge badge-neutral">{pair.pieceA.categoryRaw}</span>
                          )}
                          <span className="badge badge-neutral font-mono">
                            {pair.pieceA.stockTotal} un
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Conector */}
                    <td style={{ textAlign: 'center' }}>
                      <SparklesIcon size={14} className="text-muted" style={{ color: 'var(--accent-proven)' }} />
                    </td>

                    {/* Peça B */}
                    <td>
                      <div className="pair-piece-cell">
                        <span className="piece-name font-medium">{pair.pieceB.name}</span>
                        <div className="piece-tags">
                          <span className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>
                            ID: {pair.pieceB.productId}
                          </span>
                          {pair.pieceB.categoryRaw && (
                            <span className="badge badge-neutral">{pair.pieceB.categoryRaw}</span>
                          )}
                          <span className="badge badge-neutral font-mono">
                            {pair.pieceB.stockTotal} un
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Volume de Pedidos */}
                    <td style={{ textAlign: 'center' }}>
                      <span className="pair-order-count font-mono">
                        {numberFormatter.format(pair.count)}
                      </span>
                    </td>

                    {/* Elegibilidade */}
                    <td style={{ textAlign: 'center' }}>
                      <Badge variant={pair.isEligibleNow ? 'proven' : 'neutral'}>
                        {pair.isEligibleNow ? 'Elegível Hoje (Peso 0)' : 'Indisponível'}
                      </Badge>
                    </td>

                    {/* Ação */}
                    <td style={{ textAlign: 'right' }}>
                      {onInspectProduct && (
                        <button
                          type="button"
                          className="recom-btn-link"
                          onClick={() => onInspectProduct(pair.pieceA.productId)}
                        >
                          Inspecionar <ArrowRightIcon size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4 text-center text-muted">
            Nenhum par de co-compra encontrado com os filtros selecionados.
          </div>
        )}

        {data && (
          <div style={{ padding: '0.75rem 1.25rem' }}>
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              limit={data.limit}
              totalItems={data.total}
              onPageChange={setPage}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
