import { useState } from 'react';
import { PlusIcon, MagnifyingGlassIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useClients, useCreateClient, type Client } from './hooks/useCRMQueries';

/*
 * UI PASS (#UI-clients, 2026-08-06): visual-only redesign of this page.
 *
 * Why Tremor was swapped for the project's own design-system primitives
 * (ui/Button + ui/Card) and semantic table markup — THIS page only, no
 * shared component touched: @tremor/react's internal utility classes live
 * in node_modules, which Tailwind v4's automatic content scanning excludes
 * (and index.css declares no `@source` for the package). Verified
 * empirically: the production build's CSS contains ZERO `tremor-*` classes,
 * so every Tremor design token on this page (Card surface, table chrome,
 * Badge colours, brand Button) rendered as dead CSS — the "generic HTML"
 * look. Fixing Tremor compilation globally is intentionally OUT of scope
 * (it would restyle unrelated pages).
 *
 * Non-negotiables preserved byte-for-byte: all state vars, hooks,
 * handlers (handleCreate, onSuccess/onError, refetch, pagination, search
 * reset), query params (search/page/limit), route links, and every
 * behavioural contract pinned by ListQueryErrorStates and
 * CRMCreateErrorFeedback (h1 "Clients", role="alert" error panel with the
 * server message + Retry, "No clients found" empty copy, "Showing page"
 * pagination text, "Add Client"/"Save Client" button names, and the form
 * placeholders).
 */

/* Status pill — same ACTIVE/other mapping as the old Tremor Badge, but with
 * theme-aware WCAG-AA tokens that actually compile. */
const StatusPill = ({ status }: { status: Client['status'] }) => {
  const active = status === 'ACTIVE';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
        active
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20'
          : 'bg-gray-100 text-gray-600 ring-gray-500/10 dark:bg-slate-700/50 dark:text-gray-300 dark:ring-slate-500/30'
      }`}
    >
      {status}
    </span>
  );
};

/* Muted em dash: the consistent "no value" affordance (decorative only). */
const EmptyCell = () => (
  <span aria-hidden="true" className="text-gray-400 dark:text-gray-500">
    —
  </span>
);

/* Same truthiness rule as the old `value || '-'`. */
const renderOptional = (value?: string) => (value ? value : <EmptyCell />);

const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';
const inputClass =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-500 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder:text-gray-400';

export const ClientsPage = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [formError, setFormError] = useState<string | null>(null); // inline create-form failure (Bug #27)
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');

  /*
   * BUG FIX (records silently hidden): the page previously called
   * `useClients({ search })` with no pagination params — the API defaults to
   * page=1/limit=10, so every client past the first 10 was unreachable in the
   * UI (no pagination controls existed, and the returned `total` was ignored).
   * Now we pass page/limit explicitly, render pagination from `total`, and
   * reset to page 1 whenever the search term changes (avoids "empty page"
   * states after filtering mid-pagination).
   */
  const limit = 10;
  /*
   * BUG FIX (read-side lie — failed GET rendered a fake empty state): this
   * query exposed only `isLoading`, so a rejected GET /crm/clients (500,
   * network down, expired 401) fell through to `clients.length === 0` and
   * the table claimed "No clients found. Click \"Add Client\" to create
   * one." — telling the user their data was wiped (and nudging them to
   * create duplicates) when the server had simply failed. We now surface
   * `isError`/`error`/`refetch` and render an honest failure row (server
   * message + Retry) before any empty/success branches, and hide the
   * paginator while the table is in the failure state (it would otherwise
   * claim "(0 clients)"). Same pattern as the Bug #31 tasks fix.
   */
  const { data, isLoading, isError, error: clientsError, refetch } = useClients({ search, page, limit });
  const createClientMutation = useCreateClient();

  const clientsErrorMessage = (() => {
    const m = (clientsError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();

  const clients = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setFormError(null); // clear the previous failure so a retry reports fresh state

    createClientMutation.mutate(
      { name, industry, email, phone, website },
      {
        onSuccess: () => {
          setIsModalOpen(false);
          setFormError(null);
          setName('');
          setIndustry('');
          setEmail('');
          setPhone('');
          setWebsite('');
        },
        /*
         * BUG FIX (silent create failures — CRM class): every CRM create
         * mutation passed only onSuccess, so server rejections (duplicate
         * email 409, malformed URL 400...) left the modal open with zero
         * feedback — admins saw a frozen app. Failures now render inline
         * with the server's message from the shared `{ error: { message } }`
         * envelope (string-only, Bug #20 pattern).
         */
        onError: (error: any) => {
          const apiMessage = error?.response?.data?.error?.message;
          setFormError(
            typeof apiMessage === 'string' && apiMessage.length > 0
              ? apiMessage
              : 'Failed to create the client. Please check the details and try again.'
          );
        },
      }
    );
  };

  return (
    <div className="p-6 h-full overflow-auto bg-gray-50 dark:bg-gray-900">
      {/* Page header — aligned title cluster; exactly one primary action */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Clients</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage your customer organizations.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="shrink-0 gap-2 self-start sm:self-auto">
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
          Add Client
        </Button>
      </div>

      {/* Search — programmatically labelled; icon optically centred; h-10 control height */}
      <div className="mb-6 w-full max-w-sm">
        <label htmlFor="client-search" className="sr-only">
          Search clients
        </label>
        <div className="relative">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            aria-hidden="true"
          />
          <input
            id="client-search"
            type="text"
            placeholder="Search clients..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1); // new search must restart from page 1
            }}
            className={inputClass}
          />
        </div>
      </div>

      {/* Table surface — horizontal scroll is contained INSIDE the card on small screens */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/75 dark:border-slate-700 dark:bg-slate-800/80">
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Industry
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Email
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Phone
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/70">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10">
                    <div
                      role="status"
                      className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400"
                    >
                      <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Loading clients...
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                // Honest failure row — never render the "No clients found" empty
                // state when the GET actually failed (see query comment above).
                <tr>
                  <td colSpan={6} className="px-4 py-8">
                    <div
                      role="alert"
                      className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center dark:border-red-900/50 dark:bg-red-900/20"
                    >
                      <p className="text-sm font-medium text-red-700 dark:text-red-300">
                        We couldn't load your clients
                      </p>
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {clientsErrorMessage ?? 'Something went wrong while fetching your clients. Your data is safe — please try again.'}
                      </p>
                      <Button size="sm" className="mt-4" onClick={() => refetch()}>
                        Retry
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                    No clients found. Click "Add Client" to create one.
                  </td>
                </tr>
              ) : (
                clients.map((client: Client) => (
                  <tr
                    key={client.id}
                    className="transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/40"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{client.name}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{renderOptional(client.industry)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{renderOptional(client.email)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{renderOptional(client.phone)}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={client.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/crm/clients/${client.id}`}>
                        <Button size="sm" variant="ghost">
                          View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination — uses the API's `total` (previously discarded). Hidden on
          query failure: with no response there is no honest page/total to show. */}
      {!isError && (
      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
          Showing page {page} of {totalPages} ({total} {total === 1 ? 'client' : 'clients'})
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            aria-label="Go to previous page"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label="Go to next page"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
      )}

      {/* Add Client Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-client-title"
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            <h3 id="add-client-title" className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Add New Client
            </h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="client-name" className={labelClass}>
                  Company Name *
                </label>
                <input
                  id="client-name"
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label htmlFor="client-industry" className={labelClass}>
                  Industry
                </label>
                <input
                  id="client-industry"
                  type="text"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className={inputClass}
                  placeholder="Software / Healthcare"
                />
              </div>
              <div>
                <label htmlFor="client-email" className={labelClass}>
                  Email
                </label>
                <input
                  id="client-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="contact@acme.com"
                />
              </div>
              <div>
                <label htmlFor="client-phone" className={labelClass}>
                  Phone
                </label>
                <input
                  id="client-phone"
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div>
                <label htmlFor="client-website" className={labelClass}>
                  Website
                </label>
                <input
                  id="client-website"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className={inputClass}
                  placeholder="https://acme.com"
                />
              </div>
              {formError && (
                <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                  {formError}
                </p>
              )}
              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-slate-700">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsModalOpen(false);
                    setFormError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={createClientMutation.isPending}>
                  Save Client
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
