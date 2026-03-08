import { NavLink, Route, Routes } from 'react-router-dom';
import {
  Activity,
  BrainCircuit,
  ClipboardList,
  Database,
  LayoutDashboard,
  MessageSquare,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Predict from './pages/Predict';
import Chat from './pages/Chat';
import FairnessAudit from './pages/FairnessAudit';
import AuditLog from './pages/AuditLog';
import ThresholdGuide from './pages/ThresholdGuide';
import LegalCompliance from './pages/LegalCompliance';
import DataAnalysis from './pages/DataAnalysis';
import ModelTransparency from './pages/ModelTransparency';

const NAV_SECTIONS = [
  {
    label: 'Clinical Tools',
    items: [
      { to: '/',        label: 'Dashboard',    icon: LayoutDashboard, end: true  },
      { to: '/predict', label: 'Predict',      icon: Activity,        end: false },
      { to: '/chat',    label: 'AI Agent',     icon: MessageSquare,   end: false },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { to: '/fairness', label: 'Fairness Audit', icon: ShieldCheck,  end: false },
      { to: '/log',      label: 'Audit Log',      icon: ClipboardList, end: false },
      { to: '/data',     label: 'Data Analysis',  icon: Database,      end: false },
      { to: '/model',    label: 'Model',          icon: BrainCircuit,  end: false },
    ],
  },
  {
    label: 'Reference',
    items: [
      { to: '/threshold', label: 'Threshold Guide', icon: SlidersHorizontal, end: false },
      { to: '/legal',     label: 'Legal & EU',      icon: Scale,             end: false },
    ],
  },
];

function Sidebar() {
  return (
    <aside className="flex flex-col w-56 min-h-screen bg-[#0d1e3a] border-r border-white/10 shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-teal-400 text-2xl">⚕</span>
          <div>
            <p className="text-white font-bold leading-tight text-sm">Clinical AI</p>
            <p className="text-white/40 text-xs">Readmission Risk</p>
          </div>
        </div>
      </div>

      {/* Sectioned nav */}
      <nav className="flex flex-col gap-0 p-3 flex-1 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-3">
            <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-widest text-white/25">
              {section.label}
            </p>
            {section.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                      : 'text-white/55 hover:text-white hover:bg-white/5',
                  ].join(' ')
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/10">
        <p className="text-white/25 text-xs">v1.0 · XGBoost + SHAP</p>
      </div>
    </aside>
  );
}

function App() {
  return (
    <div className="flex min-h-screen bg-[#0f1729] text-white">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/"          element={<Dashboard />}       />
          <Route path="/predict"   element={<Predict />}         />
          <Route path="/chat"      element={<Chat />}            />
          <Route path="/fairness"  element={<FairnessAudit />}   />
          <Route path="/log"       element={<AuditLog />}        />
          <Route path="/data"      element={<DataAnalysis />}    />
          <Route path="/model"     element={<ModelTransparency />} />
          <Route path="/threshold" element={<ThresholdGuide />}  />
          <Route path="/legal"     element={<LegalCompliance />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
