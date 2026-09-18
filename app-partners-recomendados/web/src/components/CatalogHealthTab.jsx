// web/src/components/CatalogHealthTab.jsx
import { useState, useEffect } from 'react';
import { Card } from './Card.jsx';
import { Badge } from './Badge.jsx';
import { Skeleton } from './Skeleton.jsx';
import { ShieldIcon, LayersIcon, AlertCircleIcon } from './Icons.jsx';
import { fetchCatalogHealth } from '../api/client.js';

const numberFormatter = new Intl.NumberFormat('pt-BR');

export function CatalogHealthTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchCatalogHealth()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Falha ao carregar saúde do catálogo');
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <Card>
          <Skeleton height="100px" />
        </Card>
        <Card>
          <Skeleton height="200px" />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card style={{ borderColor: 'var(--accent-danger)' }}>
        <div style={{ color: 'var(--accent-danger)' }}>Erro ao carregar telemetria: {error}</div>
      </Card>
    );
  }

  const { circuitBreaker, categories, ineligibleReasons, totalActive, totalWithRecommendations, overallCoveragePercent } = data;

  return (
    <div className="health-tab-container">
      {/* 1. Telemetria do Disjuntor de Segurança */}
      <Card
        title="Disjuntor de Segurança & Integridade Operacional"
        icon={ShieldIcon}
        subtitle="Mecanismo de defesa contra apagões e churn descontrolado no catálogo ao vivo"
        action={
          <Badge variant={circuitBreaker.status === 'NORMAL' ? 'success' : 'danger'}>
            Status: {circuitBreaker.status === 'NORMAL' ? 'Normal · Operação Segura' : circuitBreaker.status}
          </Badge>
        }
      >
        <div className="circuit-breaker-grid">
          {/* Churn de Catálogo */}
          <div className="circuit-metric-item">
            <div className="circuit-metric-header">
              <span className="text-muted font-mono" style={{ fontSize: '0.75rem' }}>
                Churn Diário Recente
              </span>
              <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>
                Teto Máx: {circuitBreaker.churnLimitPercent}%
              </span>
            </div>
            <div className="circuit-metric-number font-mono">
              {circuitBreaker.churnPercent}%
            </div>
            <div className="progress-bar-wrap">
              <div
                className={`progress-bar-fill ${circuitBreaker.churnPercent > 20 ? 'is-warn' : ''}`}
                style={{ width: `${Math.min(100, (circuitBreaker.churnPercent / circuitBreaker.churnLimitPercent) * 100)}%` }}
              />
            </div>
            <span className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.35rem', display: 'block' }}>
              Margem segura restante: {(circuitBreaker.churnLimitPercent - circuitBreaker.churnPercent).toFixed(1)}%
            </span>
          </div>

          {/* Taxa de Apagão */}
          <div className="circuit-metric-item">
            <div className="circuit-metric-header">
              <span className="text-muted font-mono" style={{ fontSize: '0.75rem' }}>
                Taxa de Apagão Recente
              </span>
              <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>
                Teto Máx: {circuitBreaker.blackoutLimitPercent}%
              </span>
            </div>
            <div className="circuit-metric-number font-mono">
              {circuitBreaker.blackoutPercent}%
            </div>
            <div className="progress-bar-wrap">
              <div
                className="progress-bar-fill"
                style={{ width: `${Math.min(100, (circuitBreaker.blackoutPercent / circuitBreaker.blackoutLimitPercent) * 100)}%` }}
              />
            </div>
            <span className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.35rem', display: 'block' }}>
              Margem segura restante: {(circuitBreaker.blackoutLimitPercent - circuitBreaker.blackoutPercent).toFixed(1)}%
            </span>
          </div>

          {/* Cobertura Global */}
          <div className="circuit-metric-item">
            <div className="circuit-metric-header">
              <span className="text-muted font-mono" style={{ fontSize: '0.75rem' }}>
                Cobertura Global Ativa
              </span>
              <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>
                {numberFormatter.format(totalWithRecommendations)} de {numberFormatter.format(totalActive)}
              </span>
            </div>
            <div className="circuit-metric-number font-mono">
              {overallCoveragePercent}%
            </div>
            <div className="progress-bar-wrap">
              <div
                className="progress-bar-fill"
                style={{ width: `${overallCoveragePercent}%` }}
              />
            </div>
            <span className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.35rem', display: 'block' }}>
              Catálogo publicado coberto pelo motor
            </span>
          </div>
        </div>
      </Card>

      {/* 2. Cobertura por Categoria Oficial */}
      <Card
        className="mt-6"
        title="Cobertura de Vitrines por Categoria"
        icon={LayersIcon}
        subtitle="Monitoramento das categorias da taxonomia oficial da loja Talgui"
      >
        <div className="category-health-grid">
          {categories.map((cat) => (
            <div key={cat.category} className="category-health-card">
              <div className="cat-card-header">
                <span className="cat-name font-medium">{cat.category}</span>
                <span className="font-mono cat-pct">{cat.coveragePercent}%</span>
              </div>

              <div className="progress-bar-wrap" style={{ margin: '0.5rem 0' }}>
                <div
                  className={`progress-bar-fill ${cat.status === 'warning' ? 'is-warn' : cat.status === 'critical' ? 'is-danger' : ''}`}
                  style={{ width: `${cat.coveragePercent}%` }}
                />
              </div>

              <div className="cat-card-footer font-mono text-muted">
                <span>{cat.covered} cobertos</span>
                <span>/ {cat.active} ativos</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 3. Diagnóstico de Peças Sem Vitrine */}
      <Card
        className="mt-6"
        title="Diagnóstico de Produtos Sem Recomendação Ativa"
        icon={AlertCircleIcon}
        subtitle="Distribuição dos fatores de inelegibilidade determinística no catálogo"
      >
        <div className="ineligible-grid">
          <div className="ineligible-item">
            <span className="ineligible-num font-mono">{ineligibleReasons.noStockGrade}</span>
            <span className="ineligible-label">Grade Incompleta</span>
            <span className="ineligible-desc text-muted">Produtos com menos de 3 tamanhos com estoque positivo.</span>
          </div>

          <div className="ineligible-item">
            <span className="ineligible-num font-mono">{ineligibleReasons.noColor}</span>
            <span className="ineligible-label">Sem Cor Cadastrada</span>
            <span className="ineligible-desc text-muted">Produtos sem atributo de cor no cadastro da Nuvemshop.</span>
          </div>

          <div className="ineligible-item">
            <span className="ineligible-num font-mono">{ineligibleReasons.unmappedGroup}</span>
            <span className="ineligible-label">Grupo Não Mapeado</span>
            <span className="ineligible-desc text-muted">Peças sem categoria-folha pertencente a Look Inteiro ou Partes Cima/Baixo.</span>
          </div>

          <div className="ineligible-item">
            <span className="ineligible-num font-mono">{ineligibleReasons.unpublished}</span>
            <span className="ineligible-label">Despublicados</span>
            <span className="ineligible-desc text-muted">Produtos desativados ou ocultos no storefront.</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
