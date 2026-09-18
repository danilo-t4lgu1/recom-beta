// web/src/components/InspectorTab.jsx
import { useState, useEffect, useRef } from 'react';
import { Card } from './Card.jsx';
import { Badge } from './Badge.jsx';
import { Skeleton } from './Skeleton.jsx';
import {
  SearchIcon,
  ExternalLinkIcon,
  PackageIcon,
  XIcon,
} from './Icons.jsx';
import { searchProducts, inspectProductRecommendations } from '../api/client.js';

const numberFormatter = new Intl.NumberFormat('pt-BR');

const POPULAR_EXAMPLES = [
  { id: '321418512', name: 'Vestido Mércia Tomara que Caia Preto' },
  { id: '322839130', name: 'Blusa Canelada Gola Alta' },
  { id: '322823787', name: 'Calça Reta Alfaiataria' },
];

export function InspectorTab({ initialProductId, onSelectForCuration }) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const [selectedProductId, setSelectedProductId] = useState(initialProductId || null);
  const [inspectionData, setInspectionData] = useState(null);
  const [loadingInspection, setLoadingInspection] = useState(false);
  const [inspectionError, setInspectionError] = useState(null);

  const searchContainerRef = useRef(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Busca debounced
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(() => {
      setIsSearching(true);
      searchProducts(query.trim(), { limit: 8 })
        .then((res) => {
          setSearchResults(res.products || []);
          setShowDropdown(true);
        })
        .catch(() => setSearchResults([]))
        .finally(() => setIsSearching(false));
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Carrega inspeção do produto selecionado
  useEffect(() => {
    if (!selectedProductId) return;

    let cancelled = false;
    setLoadingInspection(true);
    setInspectionError(null);

    inspectProductRecommendations(selectedProductId)
      .then((data) => {
        if (!cancelled) setInspectionData(data);
      })
      .catch((err) => {
        if (!cancelled) setInspectionError(err.message || 'Falha ao inspecionar vitrine');
      })
      .finally(() => {
        if (!cancelled) setLoadingInspection(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProductId]);

  const handleSelectProduct = (product) => {
    setSelectedProductId(product.productId);
    setQuery('');
    setShowDropdown(false);
  };

  return (
    <div className="inspector-container">
      {/* Barra de Busca de Alta Precisão */}
      <div className="inspector-search-bar" ref={searchContainerRef}>
        <div className="recom-input-wrap">
          <SearchIcon size={16} className="recom-input-icon" />
          <input
            type="text"
            className="recom-input"
            placeholder="Buscar produto por nome, ID da Nuvemshop, cor ou categoria..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setShowDropdown(true);
            }}
          />
          {query && (
            <button
              type="button"
              className="inspector-search-clear"
              onClick={() => {
                setQuery('');
                setSearchResults([]);
              }}
              aria-label="Limpar busca"
            >
              <XIcon size={14} />
            </button>
          )}
        </div>

        {/* Dropdown de Autocomplete */}
        {showDropdown && (
          <div className="inspector-search-dropdown">
            {isSearching ? (
              <div className="dropdown-status-item text-muted">Buscando no catálogo ativo...</div>
            ) : searchResults.length > 0 ? (
              searchResults.map((product) => (
                <button
                  key={product.productId}
                  type="button"
                  className="dropdown-result-item"
                  onClick={() => handleSelectProduct(product)}
                >
                  <div className="dropdown-item-main">
                    <span className="dropdown-item-name">{product.name}</span>
                    <span className="dropdown-item-id font-mono">ID: {product.productId}</span>
                  </div>
                  <div className="dropdown-item-badges">
                    {product.colorValue && (
                      <span className="badge badge-neutral">{product.colorValue}</span>
                    )}
                    {product.categoryRaw && (
                      <span className="badge badge-neutral">{product.categoryRaw}</span>
                    )}
                    <span className="badge badge-success font-mono">
                      {product.stockTotal} un
                    </span>
                  </div>
                </button>
              ))
            ) : query.trim() ? (
              <div className="dropdown-status-item text-muted">
                Nenhum produto publicado encontrado com &ldquo;{query}&rdquo;
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Sugestões Rápidas (quando nenhum produto selecionado) */}
      {!selectedProductId && (
        <div className="inspector-empty-state">
          <div className="empty-state-icon">
            <SearchIcon size={32} />
          </div>
          <h3>Inspecione qualquer vitrine do catálogo</h3>
          <p className="text-muted">
            Digite um nome ou ID acima para visualizar exatamente as 8 recomendações geradas pelo motor determinístico, com os pesos (0, 1, 2) e motivos de match.
          </p>
          <div className="empty-state-examples">
            <span className="text-muted">Exemplos rápidos:</span>
            {POPULAR_EXAMPLES.map((ex) => (
              <button
                key={ex.id}
                type="button"
                className="recom-btn-secondary"
                onClick={() => setSelectedProductId(ex.id)}
              >
                {ex.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loadingInspection && (
        <div className="inspector-loading">
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <Skeleton width="50%" height="1.8rem" />
              <Skeleton width="30%" height="1rem" />
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <Skeleton width="120px" height="2rem" />
                <Skeleton width="120px" height="2rem" />
                <Skeleton width="120px" height="2rem" />
              </div>
            </div>
          </Card>
          <div className="recommendations-grid mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <Skeleton width="100%" height="160px" />
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Skeleton width="70%" height="1rem" />
                  <Skeleton width="40%" height="0.8rem" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Erro */}
      {inspectionError && (
        <Card className="mt-4" style={{ borderColor: 'var(--accent-danger)' }}>
          <div style={{ color: 'var(--accent-danger)' }}>
            Não foi possível inspecionar o produto selecionado: {inspectionError}
          </div>
        </Card>
      )}

      {/* Conteúdo da Inspeção */}
      {!loadingInspection && inspectionData?.source && (
        <div className="inspector-content">
          {/* Card do Produto-Fonte */}
          <Card
            className="source-product-card"
            title="Peça-Fonte de Referência"
            icon={PackageIcon}
            action={
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {onSelectForCuration && (
                  <button
                    type="button"
                    className="recom-btn-secondary"
                    onClick={() => onSelectForCuration(inspectionData.source.productId)}
                  >
                    Vincular Manualmente
                  </button>
                )}
                {inspectionData.source.canonicalUrl && (
                  <a
                    href={inspectionData.source.canonicalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="recom-btn-secondary"
                  >
                    Abrir na Loja <ExternalLinkIcon size={12} />
                  </a>
                )}
              </div>
            }
          >
            <div className="source-header-layout">
              <div className="source-main-info">
                <div className="source-id font-mono text-muted">
                  ID Nuvemshop: {inspectionData.source.productId}
                </div>
                <h2 className="source-name">{inspectionData.source.name}</h2>
                <div className="source-tags-row">
                  {inspectionData.source.productGroupCanonical && (
                    <Badge variant="neutral">Grupo: {inspectionData.source.productGroupCanonical}</Badge>
                  )}
                  {inspectionData.source.categoryRaw && (
                    <Badge variant="neutral">Categoria: {inspectionData.source.categoryRaw}</Badge>
                  )}
                  {inspectionData.source.colorValue && (
                    <Badge variant="neutral">Cor: {inspectionData.source.colorValue}</Badge>
                  )}
                  {inspectionData.source.fabricTagCanonical && (
                    <Badge variant="neutral">Tecido: {inspectionData.source.fabricTagCanonical}</Badge>
                  )}
                  <Badge variant={inspectionData.source.hasAvailableGrade ? 'success' : 'danger'}>
                    {inspectionData.source.hasAvailableGrade ? 'Grade de Estoque OK' : 'Grade Incompleta (<3 tam)'}
                  </Badge>
                  <span className="source-stock-pill font-mono">
                    Total: {numberFormatter.format(inspectionData.source.stockTotal)} un
                  </span>
                </div>
              </div>
            </div>

            {/* Variantes da Fonte */}
            {inspectionData.source.variants?.length > 0 && (
              <div className="source-variants-section">
                <span className="variants-section-title text-muted">Estoque por Tamanho/Variante:</span>
                <div className="source-variants-chips">
                  {inspectionData.source.variants.map((v) => (
                    <div
                      key={v.variantId || v.sku}
                      className={`variant-chip ${v.stockTotal === 0 ? 'is-out' : ''}`}
                    >
                      <span className="variant-chip-size">{v.sizeValue || v.sku || 'Un'}</span>
                      <span className="variant-chip-stock font-mono">{v.stockTotal}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Vitrine Simulada: Itens Recomendados */}
          <div className="inspector-recommendations-header mt-6">
            <div>
              <h3 className="section-title">
                Vitrine ao Vivo ({inspectionData.recommendations.length} de até 8 itens)
              </h3>
              <p className="text-muted section-desc">
                Ordem exata e desempate determinístico entregues ao storefront da loja.
              </p>
            </div>
          </div>

          {inspectionData.recommendations.length === 0 ? (
            <Card className="mt-4">
              <div className="p-4 text-center text-muted">
                Nenhum produto atendeu aos critérios mínimos de elegibilidade determinística para esta peça-fonte
                (verifique cor cadastrada, visibilidade e grade de estoque).
              </div>
            </Card>
          ) : (
            <div className="recommendations-grid mt-4">
              {inspectionData.recommendations.map((rec, index) => {
                let reasonBadge = <Badge variant="color">Peso 2 · Cor + Grupo</Badge>;
                if (rec.matchReason === 'proven_look') {
                  reasonBadge = <Badge variant="proven">Peso 0 · Look Comprovado</Badge>;
                } else if (rec.matchReason === 'same_fabric') {
                  reasonBadge = <Badge variant="fabric">Peso 1 · Cor + Tecido</Badge>;
                }

                return (
                  <Card key={rec.productId} className="recommendation-card">
                    <div className="rec-card-index font-mono">#{index + 1}</div>

                    <div className="rec-card-body">
                      <div className="rec-reason-wrap">{reasonBadge}</div>

                      <h4 className="rec-product-name">{rec.name}</h4>
                      <div className="rec-id font-mono text-muted">ID: {rec.productId}</div>

                      <div className="rec-attributes">
                        {rec.categoryRaw && <span className="rec-attr-pill">{rec.categoryRaw}</span>}
                        {rec.colorValue && <span className="rec-attr-pill">{rec.colorValue}</span>}
                        {rec.fabricTagCanonical && (
                          <span className="rec-attr-pill">{rec.fabricTagCanonical}</span>
                        )}
                      </div>

                      <div className="rec-stock-row">
                        <div className="rec-stock-main">
                          <span className="font-mono rec-stock-number">
                            {numberFormatter.format(rec.stockTotal)}
                          </span>
                          <span className="text-muted font-mono" style={{ fontSize: '0.72rem' }}> un</span>
                        </div>
                        <span className="text-muted font-mono" style={{ fontSize: '0.72rem' }}>
                          {rec.sizesWithStock || 0} tam. c/ estoque
                        </span>
                      </div>

                      {/* Mini grade de estoque */}
                      {rec.variants?.length > 0 && (
                        <div className="rec-mini-variants">
                          {rec.variants.map((v) => (
                            <span
                              key={v.variantId || v.sku}
                              className={`mini-variant-chip ${v.stockTotal === 0 ? 'is-out' : ''}`}
                              title={`${v.sizeValue}: ${v.stockTotal} un`}
                            >
                              {v.sizeValue}: {v.stockTotal}
                            </span>
                          ))}
                        </div>
                      )}

                      {rec.canonicalUrl && (
                        <div className="rec-card-actions">
                          <a
                            href={rec.canonicalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="recom-btn-link font-mono"
                            style={{ fontSize: '0.75rem' }}
                          >
                            Ver PDP <ExternalLinkIcon size={11} />
                          </a>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
