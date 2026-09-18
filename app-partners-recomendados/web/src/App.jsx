// web/src/App.jsx
import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header.jsx';
import { TabsNav } from './components/TabsNav.jsx';
import { OverviewTab } from './components/OverviewTab.jsx';
import { fetchDashboard } from './api/client.js';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [inspectorProductId, setInspectorProductId] = useState(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await fetchDashboard();
      setDashboard(data);
    } catch (err) {
      setError(err.message || 'Falha ao carregar métricas do painel');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGoToTab = (tabId, productId = null) => {
    if (productId) setInspectorProductId(productId);
    setActiveTab(tabId);
  };

  return (
    <div className="page">
      <Header
        lastCronRun={dashboard?.lastCronRun}
        onRefresh={() => loadData(true)}
        refreshing={refreshing}
      />

      <TabsNav activeTab={activeTab} onChangeTab={setActiveTab} />

      {error && (
        <div className="recom-card mt-4" style={{ borderColor: 'var(--accent-danger)' }}>
          <div className="recom-card-body" style={{ color: 'var(--accent-danger)' }}>
            Erro de comunicação com a API: {error}
          </div>
        </div>
      )}

      <main className="recom-main-content">
        {activeTab === 'overview' && (
          <OverviewTab
            dashboard={dashboard}
            loading={loading}
            onGoToTab={handleGoToTab}
          />
        )}

        {activeTab === 'inspector' && (
          <div className="recom-card p-4 text-center text-muted">
            Aba Inspetor de Vitrines em montagem no Plan 11.4 {inspectorProductId ? `(Produto selecionado: ${inspectorProductId})` : ''}
          </div>
        )}

        {activeTab === 'looks' && (
          <div className="recom-card p-4 text-center text-muted">
            Aba Looks Comprovados em montagem no Plan 11.5
          </div>
        )}

        {activeTab === 'health' && (
          <div className="recom-card p-4 text-center text-muted">
            Aba Saúde do Catálogo & Disjuntor em montagem no Plan 11.5
          </div>
        )}

        {activeTab === 'curation' && (
          <div className="recom-card p-4 text-center text-muted">
            Aba Curadoria Manual em montagem no Plan 11.4
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="recom-card p-4 text-center text-muted">
            Aba Auditoria de Tecidos & Export em montagem no Plan 11.5
          </div>
        )}
      </main>
    </div>
  );
}
