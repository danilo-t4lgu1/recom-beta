// web/src/components/ManualCurationTab.jsx
import { useState, useEffect, useRef } from 'react';
import { Card } from './Card.jsx';
import { Badge } from './Badge.jsx';
import { Skeleton } from './Skeleton.jsx';
import {
  SlidersIcon,
  SearchIcon,
  PlusIcon,
  TrashIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CheckCircleIcon,
  RefreshIcon,
  XIcon,
} from './Icons.jsx';
import { searchProducts, inspectProductRecommendations } from '../api/client.js';

export function ManualCurationTab({ initialProductId }) {
  const [baseProductId, setBaseProductId] = useState(initialProductId || '321418512');
  const [baseQuery, setBaseQuery] = useState('');
  const [baseSearchResults, setBaseSearchResults] = useState([]);
  const [showBaseDropdown, setShowBaseDropdown] = useState(false);

  // Produtos recomendados automáticos (motor)
  const [autoRecommendations, setAutoRecommendations] = useState([]);
  const [baseProductInfo, setBaseProductInfo] = useState(null);
  const [loadingAuto, setLoadingAuto] = useState(false);

  // Lista de Curadoria Manual (em memória / draft)
  const [curatedItems, setCuratedItems] = useState([]);

  // Busca para adicionar novo item à curadoria
  const [addQuery, setAddQuery] = useState('');
  const [addSearchResults, setAddSearchResults] = useState([]);
  const [showAddDropdown, setShowAddDropdown] = useState(false);

  // Toast / Feedback de Ação
  const [feedbackMessage, setFeedbackMessage] = useState(null);

  const baseSearchRef = useRef(null);
  const addSearchRef = useRef(null);

  // Fecha dropdowns ao clicar fora
  useEffect(() => {
    function handleClickOutside(e) {
      if (baseSearchRef.current && !baseSearchRef.current.contains(e.target)) {
        setShowBaseDropdown(false);
      }
      if (addSearchRef.current && !addSearchRef.current.contains(e.target)) {
        setShowAddDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Busca produto-base
  useEffect(() => {
    if (!baseQuery.trim()) {
      setBaseSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchProducts(baseQuery.trim(), { limit: 6 })
        .then((res) => {
          setBaseSearchResults(res.products || []);
          setShowBaseDropdown(true);
        })
        .catch(() => setBaseSearchResults([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [baseQuery]);

  // Busca produto para adicionar à curadoria
  useEffect(() => {
    if (!addQuery.trim()) {
      setAddSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchProducts(addQuery.trim(), { limit: 6 })
        .then((res) => {
          setAddSearchResults(res.products || []);
          setShowAddDropdown(true);
        })
        .catch(() => setAddSearchResults([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [addQuery]);

  // Carrega vitrine automática para o produto-base selecionado
  useEffect(() => {
    if (!baseProductId) return;

    let cancelled = false;
    setLoadingAuto(true);

    inspectProductRecommendations(baseProductId)
      .then((data) => {
        if (cancelled) return;
        setBaseProductInfo(data.source);
        setAutoRecommendations(data.recommendations || []);

        // Inicializa curadoria com os primeiros itens do motor se ainda vazio
        if (curatedItems.length === 0 && data.recommendations?.length > 0) {
          setCuratedItems(
            data.recommendations.slice(0, 3).map((r, idx) => ({
              productId: r.productId,
              name: r.name,
              categoryRaw: r.categoryRaw,
              stockTotal: r.stockTotal,
              isManualOverride: idx === 0, // Exemplo de slot manual
              priority: idx + 1,
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingAuto(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseProductId]);

  const handleSelectBaseProduct = (prod) => {
    setBaseProductId(prod.productId);
    setBaseQuery('');
    setShowBaseDropdown(false);
    setCuratedItems([]); // Reinicializa para o novo produto
  };

  const handleAddItemToCuration = (prod) => {
    if (curatedItems.some((item) => item.productId === prod.productId)) {
      setFeedbackMessage(`Produto ${prod.name} já está na lista de curadoria.`);
      setTimeout(() => setFeedbackMessage(null), 3000);
      return;
    }

    const newItem = {
      productId: prod.productId,
      name: prod.name,
      categoryRaw: prod.categoryRaw,
      stockTotal: prod.stockTotal,
      isManualOverride: true,
      priority: curatedItems.length + 1,
    };

    setCuratedItems([...curatedItems, newItem]);
    setAddQuery('');
    setShowAddDropdown(false);
    setFeedbackMessage(`Item adicionado à curadoria manual: ${prod.name}`);
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  const handleRemoveCuratedItem = (productId) => {
    const filtered = curatedItems.filter((i) => i.productId !== productId);
    setCuratedItems(filtered.map((item, idx) => ({ ...item, priority: idx + 1 })));
  };

  const handleMoveItem = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= curatedItems.length) return;

    const updated = [...curatedItems];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);

    setCuratedItems(updated.map((item, idx) => ({ ...item, priority: idx + 1 })));
  };

  const handleResetToAuto = () => {
    setCuratedItems(
      autoRecommendations.slice(0, 4).map((r, idx) => ({
        productId: r.productId,
        name: r.name,
        categoryRaw: r.categoryRaw,
        stockTotal: r.stockTotal,
        isManualOverride: false,
        priority: idx + 1,
      }))
    );
    setFeedbackMessage('Vitrine restaurada para os padrões automáticos do motor.');
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  const handleSaveDraft = () => {
    setFeedbackMessage('Curadoria manual registrada em rascunho de sessão com sucesso!');
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  return (
    <div className="curation-container">
      {/* Banner de Arquitetura */}
      <div className="curation-notice-banner">
        <SlidersIcon size={16} className="notice-icon" />
        <div className="notice-text">
          <strong>Scaffolding de Curadoria Manual Ativo:</strong> Interface preparada para override de vitrines.
          A camada de gravação em produção e persistência será conectada pelo Claude Code.
        </div>
      </div>

      {/* Seleção de Peça-Base */}
      <Card className="mt-4" title="Selecionar Peça-Base para Curadoria">
        <div className="curation-base-selector" ref={baseSearchRef}>
          <div className="recom-input-wrap">
            <SearchIcon size={16} className="recom-input-icon" />
            <input
              type="text"
              className="recom-input"
              placeholder="Buscar produto por nome ou ID..."
              value={baseQuery}
              onChange={(e) => setBaseQuery(e.target.value)}
              onFocus={() => {
                if (baseSearchResults.length > 0) setShowBaseDropdown(true);
              }}
            />
            {baseQuery && (
              <button
                type="button"
                className="inspector-search-clear"
                onClick={() => setBaseQuery('')}
                aria-label="Limpar"
              >
                <XIcon size={14} />
              </button>
            )}
          </div>

          {showBaseDropdown && (
            <div className="inspector-search-dropdown">
              {baseSearchResults.map((prod) => (
                <button
                  key={prod.productId}
                  type="button"
                  className="dropdown-result-item"
                  onClick={() => handleSelectBaseProduct(prod)}
                >
                  <div className="dropdown-item-main">
                    <span className="dropdown-item-name">{prod.name}</span>
                    <span className="dropdown-item-id font-mono">ID: {prod.productId}</span>
                  </div>
                  <span className="badge badge-neutral">{prod.categoryRaw || 'Catálogo'}</span>
                </button>
              ))}
            </div>
          )}

          {baseProductInfo && (
            <div className="curation-selected-base-chip mt-4">
              <div className="base-chip-info">
                <span className="font-mono text-muted">Peça Selecionada:</span>
                <span className="font-medium">{baseProductInfo.name}</span>
                <span className="font-mono text-muted">(ID: {baseProductInfo.productId})</span>
              </div>
              <div className="base-chip-badges">
                {baseProductInfo.categoryRaw && <Badge variant="neutral">{baseProductInfo.categoryRaw}</Badge>}
                {baseProductInfo.colorValue && <Badge variant="neutral">{baseProductInfo.colorValue}</Badge>}
                <Badge variant={baseProductInfo.hasAvailableGrade ? 'success' : 'danger'}>
                  {baseProductInfo.hasAvailableGrade ? 'Estoque OK' : 'Estoque Baixo'}
                </Badge>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Feedback Toast */}
      {feedbackMessage && (
        <div className="curation-toast mt-4">
          <CheckCircleIcon size={16} />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Split Comparativo */}
      <div className="curation-split-layout mt-6">
        {/* Coluna Esquerda: Vitrine Automática Atual */}
        <div className="curation-column">
          <div className="curation-column-header">
            <h4 className="column-title">1. Vitrine Determinística Automática</h4>
            <span className="text-muted font-mono" style={{ fontSize: '0.75rem' }}>
              Modo Leitura (Motor)
            </span>
          </div>

          {loadingAuto ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Skeleton height="70px" />
              <Skeleton height="70px" />
              <Skeleton height="70px" />
            </div>
          ) : (
            <div className="curation-items-stack">
              {autoRecommendations.slice(0, 5).map((rec, idx) => (
                <div key={rec.productId} className="curation-preview-item is-auto">
                  <span className="curation-rank font-mono">#{idx + 1}</span>
                  <div className="curation-item-details">
                    <span className="curation-item-name">{rec.name}</span>
                    <div className="curation-item-tags">
                      <span className="font-mono text-muted" style={{ fontSize: '0.72rem' }}>
                        ID: {rec.productId}
                      </span>
                      {rec.matchReason === 'proven_look' ? (
                        <Badge variant="proven">Look Comprovado</Badge>
                      ) : (
                        <Badge variant="neutral">{rec.categoryRaw || 'Auto'}</Badge>
                      )}
                    </div>
                  </div>
                  <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>
                    {rec.stockTotal} un
                  </span>
                </div>
              ))}
              {autoRecommendations.length === 0 && (
                <div className="text-center text-muted p-4">
                  Sem recomendações automáticas calculadas para esta peça.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Coluna Direita: Curadoria Manual & Overrides */}
        <div className="curation-column">
          <div className="curation-column-header">
            <h4 className="column-title">2. Curadoria Manual de Vitrine</h4>
            <span className="badge badge-proven font-mono" style={{ fontSize: '0.7rem' }}>
              Draft Editável
            </span>
          </div>

          {/* Campo de adição de produtos */}
          <div className="curation-add-bar mb-4" ref={addSearchRef}>
            <div className="recom-input-wrap">
              <SearchIcon size={14} className="recom-input-icon" />
              <input
                type="text"
                className="recom-input"
                style={{ fontSize: '0.8rem', padding: '0.5rem 0.85rem 0.5rem 2.2rem' }}
                placeholder="Buscar produto para vincular a esta vitrine..."
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
              />
            </div>

            {showAddDropdown && (
              <div className="inspector-search-dropdown">
                {addSearchResults.map((prod) => (
                  <button
                    key={prod.productId}
                    type="button"
                    className="dropdown-result-item"
                    onClick={() => handleAddItemToCuration(prod)}
                  >
                    <div className="dropdown-item-main">
                      <span className="dropdown-item-name">{prod.name}</span>
                      <span className="dropdown-item-id font-mono">ID: {prod.productId}</span>
                    </div>
                    <span className="badge badge-success font-mono">
                      <PlusIcon size={12} /> Vincular
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Lista de itens na curadoria */}
          <div className="curation-items-stack">
            {curatedItems.map((item, index) => (
              <div
                key={item.productId}
                className={`curation-preview-item ${item.isManualOverride ? 'is-manual' : ''}`}
              >
                <div className="curation-reorder-controls">
                  <button
                    type="button"
                    className="curation-btn-arrow"
                    disabled={index === 0}
                    onClick={() => handleMoveItem(index, -1)}
                    title="Mover para cima"
                  >
                    <ArrowUpIcon size={12} />
                  </button>
                  <span className="curation-rank font-mono">#{item.priority}</span>
                  <button
                    type="button"
                    className="curation-btn-arrow"
                    disabled={index === curatedItems.length - 1}
                    onClick={() => handleMoveItem(index, 1)}
                    title="Mover para baixo"
                  >
                    <ArrowDownIcon size={12} />
                  </button>
                </div>

                <div className="curation-item-details">
                  <span className="curation-item-name">{item.name}</span>
                  <div className="curation-item-tags">
                    <span className="font-mono text-muted" style={{ fontSize: '0.72rem' }}>
                      ID: {item.productId}
                    </span>
                    {item.isManualOverride ? (
                      <Badge variant="proven">Vínculo Manual</Badge>
                    ) : (
                      <Badge variant="neutral">Automático</Badge>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  className="recom-btn-icon"
                  style={{ width: '1.75rem', height: '1.75rem', color: 'var(--accent-danger)' }}
                  onClick={() => handleRemoveCuratedItem(item.productId)}
                  title="Remover da vitrine"
                >
                  <TrashIcon size={12} />
                </button>
              </div>
            ))}

            {curatedItems.length === 0 && (
              <div className="curation-empty-slot">
                <PlusIcon size={20} className="text-muted" />
                <span className="text-muted" style={{ fontSize: '0.82rem' }}>
                  Nenhum produto vinculado manualmente ainda. Use o campo acima para adicionar.
                </span>
              </div>
            )}
          </div>

          {/* Barra de Ações da Curadoria */}
          <div className="curation-actions-bar mt-6">
            <button
              type="button"
              className="recom-btn-primary"
              onClick={handleSaveDraft}
              disabled={curatedItems.length === 0}
            >
              <CheckCircleIcon size={14} /> Salvar Curadoria
            </button>
            <button
              type="button"
              className="recom-btn-secondary"
              onClick={handleResetToAuto}
            >
              <RefreshIcon size={14} /> Restaurar Padrão
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
