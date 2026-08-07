import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  DocumentIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { useGlobalSearch } from './hooks/useSearch';
import { useDebounce } from 'use-debounce';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

/*
 * UI PASS (#UI-search-results, 2026-08-07): visual-only restyle — Tremor
 * chrome (Title/Card/Text/Badge/Button/TextInput/Select) swapped for the
 * shared design system and the CRM-cluster control language. THIS file
 * only; debounce, URL sync, module filtering, result navigation, and the
 * Bug #37/#85 contracts are preserved verbatim.
 *
 * Locks held (SystemSearchQueryErrorStates): 'Search failed' + role="alert"
 * + server message + 'Retry search'; 'No results found' renders only on a
 * successful empty result set.
 *
 * Preserved copy: header text, 'Search...' placeholder, all five module
 * option labels/values (values drive the API whitelist — Bug #85),
 * 'Searching...', empty-state copy, `Found N results`, and the module→icon
 * hue map (projects primary-blue / tasks emerald / crm amber / documents
 * violet / fallback gray — incl. the Bug #85 documents icon).
 *
 * Disclosed a11y additions (additive only, mouse behaviour unchanged):
 * result cards are now also keyboard-operable (role="button", tabIndex,
 * Enter/Space activate the SAME navigate()), controls have sr-only labels
 * paired via htmlFor/id, the result count is aria-live, and the page gains
 * the standard p-6 padding every other page already applies.
 * Icons: lucide → heroicons (single icon system across the app).
 */

const inputClass =
  'h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100 dark:placeholder:text-gray-500';

const modulePillClass =
  'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset bg-gray-100 text-gray-600 ring-gray-500/10 dark:bg-slate-700/50 dark:text-gray-300 dark:ring-slate-500/30';

export const SearchResultsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [searchTerm, setSearchTerm] = useState(initialQuery);
  const [debouncedTerm] = useDebounce(searchTerm, 500);
  const [moduleFilter, setModuleFilter] = useState<string>('all');

  const navigate = useNavigate();

  const activeModules = moduleFilter === 'all' ? undefined : [moduleFilter];
  /*
   * BUG FIX (search claimed "No results found" on failure — Bug #37): this
   * query surfaced only `isLoading`, so a rejected GET /search (500, network
   * down, expired 401, INDEX error) fell through to the "No results found /
   * Try adjusting your search term" card — telling the user the workspace
   * contains no matches when the server had simply failed. `isError`/`refetch`
   * are now exposed and the page renders an honest failure card (server
   * message + Retry) before the empty/results branches. Same truth pattern
   * as Bug #31–#36.
   */
  const {
    data: results,
    isLoading,
    isError,
    error: searchError,
    refetch,
  } = useGlobalSearch(debouncedTerm, activeModules, 50);

  const searchErrorMessage = (() => {
    const m = (searchError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();

  // Update URL on debounce
  useEffect(() => {
    if (debouncedTerm) {
      setSearchParams({ q: debouncedTerm });
    }
  }, [debouncedTerm, setSearchParams]);

  // Module → icon map: hues preserved from the original lucide version
  // (projects/tasks/crm/documents/get their own colour — Bug #85).
  const renderIcon = (module: string) => {
    switch (module) {
      case 'projects': return <FolderIcon className="h-5 w-5 text-blue-500" aria-hidden="true" />;
      case 'tasks': return <CheckCircleIcon className="h-5 w-5 text-emerald-500" aria-hidden="true" />;
      case 'crm': return <UsersIcon className="h-5 w-5 text-amber-500" aria-hidden="true" />;
      // Bug #85: documents results (already returned under "All Modules")
      // get their proper icon instead of the generic fallback.
      case 'documents': return <DocumentIcon className="h-5 w-5 text-violet-500" aria-hidden="true" />;
      default: return <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />;
    }
  };

  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col p-6 bg-gray-50 dark:bg-slate-900">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Search Results</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Find anything across your workspace</p>
      </div>

      {/* Controls — same state wiring; native controls with labelled a11y.
          Stacks vertically on phones (was an overflowing fixed row). */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <div className="w-full max-w-md">
          <label htmlFor="global-search" className="sr-only">
            Search
          </label>
          <div className="relative">
            <MagnifyingGlassIcon
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
              aria-hidden="true"
            />
            <input
              id="global-search"
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label htmlFor="search-module-filter" className="sr-only">
            Filter by module
          </label>
          <select
            id="search-module-filter"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="h-10 w-full sm:w-48 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100"
          >
            <option value="all">All Modules</option>
            <option value="projects">Projects</option>
            <option value="tasks">Tasks</option>
            <option value="crm">CRM</option>
            {/* Bug #85: the API whitelist now accepts `modules=documents`
                (previously 400 "Unsupported search module") — expose it. */}
            <option value="documents">Documents</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto pb-8">
        {isLoading ? (
          <div role="status" className="flex items-center justify-center gap-2 p-12 text-sm text-gray-500 dark:text-gray-400">
            <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
            Searching...
          </div>
        ) : isError ? (
          // Bug #37: honest failure card — never claim "No results found"
          // when the search request itself failed.
          <div
            role="alert"
            className="text-center p-12 border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 rounded-xl"
          >
            <h2 className="text-base font-semibold text-red-700 dark:text-red-300">Search failed</h2>
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {searchErrorMessage ?? 'Something went wrong while searching. Please try again.'}
            </p>
            <Button size="sm" className="mt-3" onClick={() => refetch()}>
              Retry search
            </Button>
          </div>
        ) : !results || results.items.length === 0 ? (
          <div className="text-center p-12 border-2 border-dashed border-gray-200 dark:border-slate-600 rounded-xl">
            <MagnifyingGlassIcon className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" aria-hidden="true" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">No results found</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Try adjusting your search term or filters.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p aria-live="polite" className="text-sm text-gray-500 dark:text-gray-400">
              Found {results.total} results
            </p>
            {results.items.map((item) => (
              // Card is the click target (navigate to the entity) — unchanged
              // mouse behaviour; role/tabIndex/Enter/Space make it keyboard-
              // operable too (additive a11y, disclosed in the header block).
              <Card
                key={`${item.module}-${item.id}`}
                role="button"
                tabIndex={0}
                aria-label={item.title}
                className="flex gap-4 p-4 cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                onClick={() => navigate(item.url)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(item.url);
                  }
                }}
              >
                <div className="pt-0.5 shrink-0">
                  {renderIcon(item.module)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-primary-600 hover:underline dark:text-primary-400">
                      {item.title}
                    </h3>
                    <span className={modulePillClass}>{item.module}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{item.description}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
