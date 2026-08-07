import { useState } from 'react';
import { PlusIcon, MagnifyingGlassIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useContacts, useCreateContact, useClients, type Contact } from './hooks/useCRMQueries';

/*
 * UI PASS (#UI-contacts, 2026-08-06): visual-only redesign, same design
 * language as #UI-clients (page-local; no shared component touched).
 * Tremor's internal utilities are node_modules-only classes which Tailwind
 * v4 excludes from scanning — see the foundation note in
 * features/crm/ClientsPage.tsx. All state vars, hooks, handlers
 * (handleCreate, onSuccess/onError, refetch, pagination, search reset),
 * query params, and every behavioural contract (identical copy for the
 * loading/empty/error branches and the form) are preserved verbatim.
 */

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

export const ContactsPage = () => {
  const [search, setSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null); // inline create-form failure (Bug #27)
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [clientId, setClientId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');

  const [page, setPage] = useState(1);
  /*
   * BUG FIX (records silently hidden): previously `useContacts({ search })`
   * sent no pagination params — the API defaults to limit=10, so every contact
   * past the first 10 was unreachable and there were no pagination controls.
   */
  const limit = 10;
  /*
   * BUG FIX (read-side lie — failed GET rendered a fake empty state): this
   * query exposed only `isLoading`, so a rejected GET /crm/contacts fell
   * through to `contacts.length === 0` and the table claimed "No contacts
   * found. Click \"Add Contact\" to create one." — telling the user their
   * records were wiped when the server had simply failed. Now surfaces an
   * honest failure row (server message + Retry) before the empty/success
   * branches; the paginator is hidden on failure. Same as Bug #31/#32.
   */
  const { data: contactsData, isLoading, isError, error: contactsError, refetch } = useContacts({ search, page, limit });
  // FEATURE (ledger #6): dropdown feeds off the raised 500 aggregate cap
  // (was 100); truncation beyond it is declared next to the select.
  const { data: clientsData } = useClients({ limit: 500 });

  const contactsErrorMessage = (() => {
    const m = (contactsError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();
  const createContactMutation = useCreateContact();

  const contacts = contactsData?.data || [];
  const total = contactsData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const clients = clientsData?.data || [];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !clientId) return;
    setFormError(null); // clear the previous failure so a retry reports fresh state

    createContactMutation.mutate(
      { clientId, firstName, lastName, email, phone, designation },
      {
        onSuccess: () => {
          setIsModalOpen(false);
          setFormError(null);
          setFirstName('');
          setLastName('');
          setEmail('');
          setPhone('');
          setDesignation('');
        },
        // BUG FIX (silent create failures — CRM class): rejections used to
        // leave the modal frozen with no feedback; now surfaced inline from
        // the shared `{ error: { message } }` envelope (string-only).
        onError: (error: any) => {
          const apiMessage = error?.response?.data?.error?.message;
          setFormError(
            typeof apiMessage === 'string' && apiMessage.length > 0
              ? apiMessage
              : 'Failed to create the contact. Please check the details and try again.'
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
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Contacts</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage individual customer contacts across your clients.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="shrink-0 gap-2 self-start sm:self-auto">
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
          Add Contact
        </Button>
      </div>

      {/* Search — programmatically labelled; icon optically centred; h-10 control height */}
      <div className="mb-6 w-full max-w-sm">
        <label htmlFor="contact-search" className="sr-only">
          Search contacts
        </label>
        <div className="relative">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            aria-hidden="true"
          />
          <input
            id="contact-search"
            type="text"
            placeholder="Search contacts..."
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
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/75 dark:border-slate-700 dark:bg-slate-800/80">
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Title / Designation
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Email
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Phone
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/70">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10">
                    <div
                      role="status"
                      className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400"
                    >
                      <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Loading contacts...
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                // Honest failure row — never render the "No contacts found" empty
                // state when the GET actually failed (see query comment above).
                <tr>
                  <td colSpan={4} className="px-4 py-8">
                    <div
                      role="alert"
                      className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center dark:border-red-900/50 dark:bg-red-900/20"
                    >
                      <p className="text-sm font-medium text-red-700 dark:text-red-300">
                        We couldn't load your contacts
                      </p>
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {contactsErrorMessage ?? 'Something went wrong while fetching your contacts. Your data is safe — please try again.'}
                      </p>
                      <Button size="sm" className="mt-4" onClick={() => refetch()}>
                        Retry
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                    No contacts found. Click "Add Contact" to create one.
                  </td>
                </tr>
              ) : (
                contacts.map((contact: Contact) => (
                  <tr
                    key={contact.id}
                    className="transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/40"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                      {contact.firstName} {contact.lastName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{renderOptional(contact.designation)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{renderOptional(contact.email)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{renderOptional(contact.phone)}</td>
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
          Showing page {page} of {totalPages} ({total} {total === 1 ? 'contact' : 'contacts'})
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

      {/* Add Contact Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-contact-title"
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            <h3 id="add-contact-title" className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Add New Contact
            </h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="contact-client" className={labelClass}>
                  Client Company *
                </label>
                <select
                  id="contact-client"
                  required
                  autoFocus
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select Client Company...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {/* FEATURE (ledger #6 — truncation honesty): the picker
                    lists the fetched page; a 501st+ client must not
                    masquerade as nonexistent. */}
                {(clientsData?.total ?? 0) > clients.length && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Showing the first {clients.length} of {clientsData?.total} clients.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="contact-first-name" className={labelClass}>
                    First Name *
                  </label>
                  <input
                    id="contact-first-name"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="contact-last-name" className={labelClass}>
                    Last Name *
                  </label>
                  <input
                    id="contact-last-name"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="contact-designation" className={labelClass}>
                  Designation / Title
                </label>
                <input
                  id="contact-designation"
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className={inputClass}
                  placeholder="VP of Engineering"
                />
              </div>
              <div>
                <label htmlFor="contact-email" className={labelClass}>
                  Email
                </label>
                <input
                  id="contact-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="contact-phone" className={labelClass}>
                  Phone
                </label>
                <input
                  id="contact-phone"
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
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
                <Button type="submit" isLoading={createContactMutation.isPending}>
                  Save Contact
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
