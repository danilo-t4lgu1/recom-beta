// web/src/App.jsx
import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header.jsx';
import { TabsNav } from './components/TabsNav.jsx';
import { OverviewTab } from './components/OverviewTab.jsx';
import { InspectorTab } from './components/InspectorTab.jsx';
import { ManualCurationTab } from './components/ManualCurationTab.jsx';
import { LooksHubTab } from './components/LooksHubTab.jsx';
import { CatalogHealthTab } from './components/CatalogHealthTab.jsx';
import { AuditTab } from './components/AuditTab.jsx';
import { fetchDashboard } from './api/client.js';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [targetProductId, setTargetProductId] = useState(null);

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
    if (productId) setTargetProductId(productId);
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
          <InspectorTab
            initialProductId={targetProductId}
            onSelectForCuration={(id) => handleGoToTab('curation', id)}
          />
        )}

        {activeTab === 'looks' && (
          <LooksHubTab
            onInspectProduct={(id) => handleGoToTab('inspector', id)}
          />
        )}

        {activeTab === 'health' && (
          <CatalogHealthTab />
        )}

        {activeTab === 'curation' && (
          <ManualCurationTab initialProductId={targetProductId} />
        )}

        {activeTab === 'audit' && (
          <AuditTab />
        )}
      </main>
    </div>
  );
}
