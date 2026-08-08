import { useEffect, useRef, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { useGlobalSearch } from './hooks/useSearch';
import { useDebounce } from 'use-debounce';

/*
 * UI PASS (#UI-global-search-overlay, 2026-08-07): visual-only polish of
 * the ⌘K palette to the R12 search-cluster standard. All search wiring,
 * debounce, focus timing, navigation, failure/empty copy, and result
 * keys are preserved verbatim.
 *
 * Locks held (CalendarSearchOverlayFailures — Bug #40): 'Search failed'
 * in a role="alert" pane + server message + 'Retry search'; the honest
 * 'No results found for "…"' empty state is untouched.
 *
 * Disclosed additive changes: panel is now role="dialog" aria-modal
 * (labelled), ESC closes the overlay (standard modal expectation — new
 * additive handler only), the close icon button and the search field are
 * labelled, primary-* accent replaces literal blue-*, dark surfaces moved
 * onto slate tokens with a dark-mode chip contrast fix (was chip-on-same-
 * tone), and lucide → heroicons (matching R12's SearchResultsPage icons;
 * the module→hue map is unchanged).
 */

export const GlobalSearchOverlay: FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm] = useDebounce(searchTerm, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  /*
   * BUG FIX (⌘K overlay went silently blank on search failure — Bug #40):
   * this query surfaced only `isLoading`, so a rejected GET /search fell
   * into `results?.items.map` with `results === undefined` — an EMPTY list
   * with zero feedback (the "No results" branch requires `length === 0`,
   * which undefined never satisfies). The overlay now renders an honest
   * failure pane (server message + Retry) instead. Same truth pattern as
   * the SearchResultsPage fix (Bug #37).
   */
  const {
    data: results,
    isLoading,
    isError,
    error: searchError,
    refetch,
  } = useGlobalSearch(debouncedTerm);

  const searchErrorMessage = (() => {
    const m = (searchError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

  /* ESC-to-close: additive standard modal affordance (mouse/backdrop
   * behaviour unchanged). Hook order is stable — this runs regardless of
   * the `isOpen` early-return below. */
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelect = (url: string) => {
    navigate(url);
    onClose();
  };

  // Module → icon map: hues preserved from the original (R12 parity).
  const renderIcon = (module: string) => {
    switch (module) {
      case 'projects': return <FolderIcon className="h-4 w-4 text-blue-500" aria-hidden="true" />;
      case 'tasks': return <CheckCircleIcon className="h-4 w-4 text-emerald-500" aria-hidden="true" />;
      case 'crm': return <UsersIcon className="h-4 w-4 text-amber-500" aria-hidden="true" />;
      default: return <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col border border-gray-200 dark:border-slate-700 mx-4"
        onClick={e => e.stopPropagation()}
      >

        <div className="flex items-center p-4 border-b border-gray-100 dark:border-slate-700">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 mr-3" aria-hidden="true" />
          <label htmlFor="global-search-overlay-input" className="sr-only">
            Search workspace
          </label>
          <input
            ref={inputRef}
            id="global-search-overlay-input"
            type="text"
            placeholder="Search projects, tasks, clients..."
            className="flex-1 bg-transparent border-none outline-none text-gray-900 dark:text-white text-lg placeholder-gray-400"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {isLoading && <ArrowPathIcon className="h-5 w-5 text-gray-400 animate-spin mr-2" aria-hidden="true" />}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="p-1 rounded-md text-gray-400 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:hover:bg-slate-700"
          >
            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {searchTerm.trim().length > 1 && (
          <div className="max-h-[60vh] overflow-y-auto">
            {isError ? (
              // Bug #40: honest failure pane — a failed search is NOT the
              // same thing as "no results".
              <div role="alert" className="p-8 text-center">
                <p className="text-sm font-medium text-red-700 dark:text-red-300">Search failed</p>
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {searchErrorMessage ?? 'Something went wrong while searching. Please try again.'}
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="mt-3 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                >
                  Retry search
                </button>
              </div>
            ) : results?.items.length === 0 && !isLoading ? (
              <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No results found for "{searchTerm}"
              </div>
            ) : (
              <ul className="py-2">
                {results?.items.map(item => (
                  <li key={`${item.module}-${item.id}`}>
                    <button
                      type="button"
                      className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                      onClick={() => handleSelect(item.url)}
                    >
                      {/* Dark-mode contrast fix: chip was same-tone as the panel */}
                      <div className="mt-1 bg-gray-100 dark:bg-slate-700 p-2 rounded-md">
                        {renderIcon(item.module)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {item.title}
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {item.description}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-500 capitalize px-2 py-1 bg-gray-100 dark:bg-slate-700 rounded">
                        {item.module}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {results && results.total > 20 && (
              <div className="p-3 border-t border-gray-100 dark:border-slate-700 text-center">
                <button
                  type="button"
                  onClick={() => {
                    navigate(`/search?q=${encodeURIComponent(searchTerm)}`);
                    onClose();
                  }}
                  className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                >
                  View all {results.total} results
                </button>
              </div>
            )}
          </div>
        )}

        {searchTerm.trim().length <= 1 && (
          <div className="p-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Type at least 2 characters to search across your workspace.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
