// web/src/components/TabsNav.jsx
import {
  LayersIcon,
  SearchIcon,
  SparklesIcon,
  ShieldIcon,
  SlidersIcon,
  FileSpreadsheetIcon,
} from './Icons.jsx';

const TABS = [
  { id: 'overview', label: 'Visão Geral', icon: LayersIcon },
  { id: 'inspector', label: 'Inspetor de Vitrines', icon: SearchIcon },
  { id: 'looks', label: 'Looks Comprovados', icon: SparklesIcon, count: '1.373' },
  { id: 'health', label: 'Saúde & Disjuntor', icon: ShieldIcon },
  { id: 'curation', label: 'Curadoria Manual', icon: SlidersIcon },
  { id: 'audit', label: 'Tecidos & Export', icon: FileSpreadsheetIcon },
];

export function TabsNav({ activeTab, onChangeTab }) {
  return (
    <nav className="recom-tabs-nav" aria-label="Abas de navegação do painel">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            className={`recom-tab-btn ${isActive ? 'is-active' : ''}`}
            onClick={() => onChangeTab(tab.id)}
            role="tab"
            aria-selected={isActive}
          >
            <Icon size={14} className="tab-icon" />
            <span className="tab-label">{tab.label}</span>
            {tab.count && <span className="tab-badge">{tab.count}</span>}
          </button>
        );
      })}
    </nav>
  );
}
