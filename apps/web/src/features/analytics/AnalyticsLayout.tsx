import { useRef, useState } from 'react';
import { ExecutiveDashboard } from './ExecutiveDashboard';
import { ProjectDashboard } from './ProjectDashboard';
import { AnalyticsCRMOverview } from './AnalyticsCRMOverview';
import { TeamDashboard } from './TeamDashboard';

/*
 * UI PASS (#UI-analytics-layout, 2026-08-07): Tremor TabGroup/TabList/Tab
 * swapped for a NATIVE WAI-ARIA tablist. No test locks. Preserved: tab
 * labels and order (Executive / Projects & Tasks / CRM / Teams), the
 * selectedIndex state, and the manual conditional rendering (hooks in
 * inactive tabs stay dormant — see original comment).
 *
 * Keyboard parity is NOT regressed: Tremor's tabs supported arrow-key
 * navigation, and so do these — roving tabindex with ArrowLeft/ArrowRight
 * (plus Home/End), selection follows focus (automatic activation, same as
 * Tremor). role="tablist"/"tab"/"tabpanel" with aria-selected and
 * aria-controls/aria-labelledby wiring added; the active tab moves focus
 * only via arrow keys (click/tab order semantics unchanged for mouse and
 * Tab users).
 */

const TABS = ['Executive', 'Projects & Tasks', 'CRM', 'Teams'] as const;

export const AnalyticsLayout = () => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  /* WAI-ARIA tablist keyboard support — roving tabindex, automatic
   * activation (matches the Tremor TabGroup behaviour it replaces). */
  const handleTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    setSelectedIndex(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50 dark:bg-slate-900">
      <div className="border-b border-gray-200 bg-white px-6 pt-4 dark:border-slate-700 dark:bg-slate-800">
        <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-white">Analytics Platform</h1>
        <div role="tablist" aria-label="Analytics dashboards" className="-mb-px flex gap-6 overflow-x-auto">
          {TABS.map((label, index) => (
            <button
              key={label}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              id={`analytics-tab-${index}`}
              role="tab"
              type="button"
              aria-selected={selectedIndex === index}
              aria-controls={`analytics-tabpanel-${index}`}
              tabIndex={selectedIndex === index ? 0 : -1}
              onClick={() => setSelectedIndex(index)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800 ${
                selectedIndex === index
                  ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-slate-500 dark:hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex-1 overflow-auto"
        role="tabpanel"
        id={`analytics-tabpanel-${selectedIndex}`}
        aria-labelledby={`analytics-tab-${selectedIndex}`}
      >
        {/* We do conditional rendering manually to ensure hooks in inactive
            tabs don't fire if unnecessary, though TabPanels handles it too */}
        {selectedIndex === 0 && <ExecutiveDashboard />}
        {selectedIndex === 1 && <ProjectDashboard />}
        {selectedIndex === 2 && <AnalyticsCRMOverview />}
        {selectedIndex === 3 && <TeamDashboard />}
      </div>
    </div>
  );
};
