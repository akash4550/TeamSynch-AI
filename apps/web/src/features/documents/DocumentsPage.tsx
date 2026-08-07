import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload, Folder, Search, Grid, List as ListIcon, MoreVertical, File, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../providers/AuthProvider';
import { Button } from '../../components/ui/Button';
import { IngestStatusBadge } from './IngestStatusBadge'; // FEATURE (ledger #15): "AI Search" ingestion badge
// BUG FIX (#94): bounded pending claim — poll/overdue derivation, pure & pinned.
import { documentsIngestPollInterval, isIngestPendingOverdue } from './ingestPolling';

/*
 * UI PASS (#UI-documents, 2026-08-07): alignment of the documents surface
 * with the design system — h1 semibold ramp, Upload label-button +
 * blue-* accents -> primary-* (grid thumbnail, spinner), labelled h-10
 * search, aria-labelled grid/list segmented toggle, semantic list table
 * (banded header, divide-y, tabular-nums size/version/date), ui/Button
 * pagination + Retry, dialog semantics on the delete confirm (role=dialog,
 * blurred backdrop + backdrop click + ESC, Cancel autofocused), keyboard-
 * operable open-file targets (additive: role=button/tabIndex/Enter+Space;
 * the pointer onClick payload window.open(doc.url, '_blank') is unchanged),
 * and kebab/menu focus rings (grid kebab also visible on keyboard focus).
 * No behavioral change: pagination/polling (#94), upload/delete flows,
 * admin kebab gating, menu DOM contract, and every string pinned by
 * DocumentsActions/IngestPendingOverdue/ListQueryErrorStates ("Actions for
 * <file>", "Dismiss error", "Close delete dialog", "Delete Document",
 * "Delete Permanently", "We couldn't load your documents", "No documents
 * found", "Showing page N of M", banner messages) is verbatim.
 */

// Shared field chrome (mirrors the CRM/users filter inputs).
const fieldClass =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-gray-500';

// Simplified for Phase 11
export const DocumentsPage = () => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [page, setPage] = useState(1);

  /*
   * BUG FIX (documents silently hidden): the page previously requested
   * `/documents` with no pagination params and rendered no pagination
   * controls, while the API defaults to page=1/limit=10 — so every document
   * past the first 10 was unreachable in the UI (the returned `total` was
   * ignored). Now we pass page/limit explicitly, keep `total`, render
   * pagination controls, and reset to page 1 on search/upload.
   */
  const limit = 12; // grid-friendly page size (divisible by the 2/3/4-column breakpoints)

  /*
   * BUG FIX (read-side lie — failed GET rendered a fake empty state): this
   * query surfaced only `isLoading`/`refetch`, so a rejected GET /documents
   * (500, 401 expiry, network down) fell through to `documents.length === 0`
   * and the page rendered "No documents found — Upload a file to get
   * started.", telling the user their files were wiped when the server had
   * simply failed. We now expose `isError`/`error` and render an honest
   * failure panel (server message + Retry) before the empty/success
   * branches. Same pattern as the Bug #31 tasks fix. (The paginator below
   * already hides on failure: it renders only when `total > 0`.)
   */
  const { data, isLoading, isError, error: documentsError, refetch } = useQuery({
    queryKey: ['documents', searchQuery, page],
      queryFn: async () => {
        const res = await api.get<{ data: any[]; total: number }>('/documents', {
          params: { search: searchQuery, page, limit }
        });
        return res.data;
      },
      /* FEATURE (ledger #15): while any row on this page awaits its first
       * ingestion pass (eligible + no status yet → "Indexing…" badge),
       * poll every 5s so the badge converges to the real terminal outcome
       * without a manual refresh. Polling self-stops the instant nothing
       * is pending — no standing traffic.
       * BUG FIX (#94, 2026-08-06): …and self-stops when every pending row
       * has outlived the honest window (queue down / job dead) — the old
       * "ingestion is one queue hop, so the pending window is seconds"
       * premise looped the 5s poll FOREVER on a state that can never
       * resolve. The age is measured from the server row's updatedAt —
       * never from when this tab opened. */
      refetchInterval: (query) => {
        const rows = ((query.state.data as { data?: any[] } | undefined)?.data) ?? [];
        return documentsIngestPollInterval(rows, Date.now());
      },
  });

  const documentsErrorMessage = (() => {
    const m = (documentsError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();

  const documents = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  /*
   * BUG FIX (documents had no usable action surface — Bug #39):
   * 1. Upload failures surfaced only a blocking `alert('Upload failed')`,
   *    discarding the server's reason (size/type/duplicate...). They now
   *    render the dismissible banner below with the envelope message.
   * 2. The kebab (MoreVertical) buttons in BOTH views had no onClick and no
   *    menu at all — 100% dead controls; document deletion was impossible
   *    from the UI even though the API exposes DELETE /documents/:id.
   *    The kebab now opens a menu (Delete, with a confirm dialog); per
   *    ROLE_PERMISSIONS the server grants document:delete ONLY to
   *    ADMIN/SUPER_ADMIN, so the kebab renders only for those roles (other
   *    roles would merely collect their own 403s).
   */
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canDeleteDocument =
    user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  const [documentActionError, setDocumentActionError] = useState<string | null>(null);
  const [menuDocId, setMenuDocId] = useState<string | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<{ id: string; fileName: string } | null>(null);

  const deleteDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      await api.delete(`/documents/${documentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setDeleteDoc(null);
      // Deleting the last row of a page > 1 must not strand the user on an
      // out-of-range page — step back one page in that case.
      if (page > 1 && documents.length === 1) {
        setPage((p) => Math.max(1, p - 1));
      }
    },
    onError: (error: any) => {
      // API error envelope is `{ success: false, error: { message } }` —
      // extract the nested string only (Bug #20 pattern), then close the
      // dialog and let the page banner carry the reason.
      const apiMessage = error?.response?.data?.error?.message;
      setDocumentActionError(
        typeof apiMessage === 'string' && apiMessage.length > 0
          ? apiMessage
          : 'Failed to delete the document. Please try again.'
      );
      setDeleteDoc(null);
    },
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setDocumentActionError(null); // fresh attempt clears the previous failure
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post('/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      // New uploads sort newest-first on page 1 — jump back so the file is visible right away
      setPage(1);
      refetch();
    } catch (error) {
      // BUG #39: was `console.error` + blocking `alert('Upload failed')` —
      // the server's reason (size/type/quota) never reached the user.
      // API error envelope is `{ success: false, error: { message } }` —
      // extract the nested string only (Bug #20 pattern).
      const apiMessage = (error as any)?.response?.data?.error?.message;
      setDocumentActionError(
        typeof apiMessage === 'string' && apiMessage.length > 0
          ? apiMessage
          : 'File upload failed. Please try again.'
      );
    } finally {
      setIsUploading(false);
      // Reset input
      event.target.value = '';
    }
  };

  // UI PASS: ESC closes the delete confirm — parity with the other feature
  // dialogs (same as Cancel/backdrop; never confirms).
  useEffect(() => {
    if (!deleteDoc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDeleteDoc(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [deleteDoc]);

  // UI PASS: shared open-file activation so the pointer target and the
  // keyboard handler can never drift apart.
  const openDocument = (url: string) => window.open(url, '_blank');
  const openDocumentKeyDown = (url: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDocument(url);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Documents</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage files and attachments across your workspace</p>
        </div>

        <div className="flex gap-3">
          <label className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-primary-600 px-4 text-sm font-medium text-white shadow-sm transition-colors focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2 hover:bg-primary-700 dark:focus-within:ring-offset-slate-900 ${isUploading ? 'pointer-events-none opacity-50' : ''}`}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            {isUploading ? 'Uploading...' : 'Upload File'}
            <input
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </label>
        </div>
      </div>

      {/* Bug #39: shared dismissible surface for upload/delete failures
          (replaces the old blocking `alert('Upload failed')`). */}
      {documentActionError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
        >
          <span>{documentActionError}</span>
          <button
            onClick={() => setDocumentActionError(null)}
            className="rounded font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-red-500/40"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-96">
          <label htmlFor="document-search" className="sr-only">Search documents</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            id="document-search"
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1); // reset pagination so filtering can't land on an out-of-range page
            }}
            className={`${fieldClass} pl-9`}
          />
        </div>

        <div className="flex self-start rounded-md bg-gray-100 p-1 dark:bg-slate-900 sm:self-auto">
          <button
            onClick={() => setViewMode('grid')}
            aria-label="Grid view"
            aria-pressed={viewMode === 'grid'}
            className={`rounded-md p-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40 ${viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
          >
            <Grid className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
            className={`rounded-md p-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40 ${viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
          >
            <ListIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div role="status" className="flex justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" aria-hidden="true"></div>
          <span className="sr-only">Loading...</span>
        </div>
      ) : isError ? (
        // Honest failure panel — never render the "No documents found" empty
        // state when the GET actually failed (see query comment above).
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-white p-12 text-center shadow-sm dark:border-red-900/50 dark:bg-slate-800"
        >
          <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">We couldn't load your documents</h3>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            {documentsErrorMessage ?? 'Something went wrong while fetching your documents. Your data is safe — please try again.'}
          </p>
          <Button onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : documents?.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <Folder className="mx-auto mb-4 h-16 w-16 text-gray-300 dark:text-slate-600" aria-hidden="true" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">No documents found</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Upload a file to get started.</p>
        </div>
      ) : (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {documents?.map((doc: any) => (
              <div key={doc.id} className="group relative rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
                {/* Bug #39: was a dead kebab (no onClick, no menu). Admin-only
                    because the server grants document:delete to ADMIN/SUPER_ADMIN. */}
                {canDeleteDocument && (
                  <div className="absolute right-2 top-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuDocId(menuDocId === doc.id ? null : doc.id);
                      }}
                      className="rounded-md p-1 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:hover:bg-slate-700"
                      aria-label={`Actions for ${doc.fileName}`}
                    >
                      <MoreVertical className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {menuDocId === doc.id && (
                      <>
                        {/* Click-through backdrop closes the menu */}
                        <div className="fixed inset-0 z-30 cursor-default" onClick={() => setMenuDocId(null)} />
                        <div className="absolute right-0 top-7 z-40 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                          <button
                            onClick={() => {
                              setMenuDocId(null);
                              setDeleteDoc({ id: doc.id, fileName: doc.fileName });
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 focus:outline-none focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 dark:focus:bg-red-900/20"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${doc.fileName}`}
                  className="mb-3 flex h-32 cursor-pointer flex-col items-center justify-center rounded-md bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40 group-hover:bg-primary-50 dark:bg-slate-900 dark:group-hover:bg-slate-700"
                  onClick={() => openDocument(doc.url)}
                  onKeyDown={openDocumentKeyDown(doc.url)}
                >
                   <FileText className="mb-2 h-12 w-12 text-primary-500" aria-hidden="true" />
                </div>
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white" title={doc.fileName}>
                  {doc.fileName}
                </p>
                <div className="mt-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span className="tabular-nums">{(doc.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                  <span className="tabular-nums">v{doc.version}</span>
                </div>
                {/* FEATURE (ledger #15): ingestion truth per document (was:
                    every upload looked equally "searchable"). BUG FIX (#94):
                    pendingExpired flips an overdue "Indexing…" to the honest
                    "Indexing overdue" (see ingestPolling.ts). */}
                <div className="mt-2">
                  <IngestStatusBadge doc={doc} pendingExpired={isIngestPendingOverdue(doc, Date.now())} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/75 dark:border-slate-700 dark:bg-slate-800/80">
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Name</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Size</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Version</th>
                    {/* FEATURE (ledger #15): ingestion-truth column */}
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">AI Search</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Uploaded At</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/70">
                  {documents?.map((doc: any) => (
                    <tr key={doc.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/40">
                      <td className="whitespace-nowrap px-6 py-4">
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={`Open ${doc.fileName}`}
                          className="flex cursor-pointer items-center rounded focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                          onClick={() => openDocument(doc.url)}
                          onKeyDown={openDocumentKeyDown(doc.url)}
                        >
                          <File className="mr-3 h-5 w-5 text-gray-400" aria-hidden="true" />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{doc.fileName}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm tabular-nums text-gray-500 dark:text-gray-400">
                        {(doc.fileSize / 1024 / 1024).toFixed(2)} MB
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm tabular-nums text-gray-500 dark:text-gray-400">
                        v{doc.version}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        <IngestStatusBadge doc={doc} pendingExpired={isIngestPendingOverdue(doc, Date.now())} />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm tabular-nums text-gray-500 dark:text-gray-400">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </td>
                      <td className="relative whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                        {/* Bug #39: same dead kebab in the list view — now an
                            admin-gated menu with Delete (confirm dialog). */}
                        {canDeleteDocument && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuDocId(menuDocId === doc.id ? null : doc.id);
                              }}
                              className="rounded-md p-1 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                              aria-label={`Actions for ${doc.fileName}`}
                            >
                              <MoreVertical className="h-5 w-5" aria-hidden="true" />
                            </button>
                            {menuDocId === doc.id && (
                              <>
                                {/* Click-through backdrop closes the menu */}
                                <div className="fixed inset-0 z-30 cursor-default" onClick={() => setMenuDocId(null)} />
                                <div className="absolute right-6 top-8 z-40 w-40 rounded-md border border-gray-200 bg-white py-1 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                  <button
                                    onClick={() => {
                                      setMenuDocId(null);
                                      setDeleteDoc({ id: doc.id, fileName: doc.fileName });
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 focus:outline-none focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 dark:focus:bg-red-900/20"
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Pagination controls — driven by the API's `total` so every document stays reachable */}
      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Showing page {page} of {totalPages} ({total} {total === 1 ? 'document' : 'documents'})
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Bug #39: Delete confirm dialog — the storage file is removed and the
          record soft-deleted, so this is irreversible from the UI. */}
      {deleteDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setDeleteDoc(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-document-title"
            className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 shadow-xl dark:border-red-900/50 dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 id="delete-document-title" className="text-lg font-semibold text-red-700 dark:text-red-400">Delete Document</h3>
              <button
                onClick={() => setDeleteDoc(null)}
                className="rounded-md p-1 text-gray-400 transition-colors hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                aria-label="Close delete dialog"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              This will permanently delete{' '}
              <span className="font-medium text-gray-900 dark:text-white">{deleteDoc.fileName}</span>{' '}
              from the workspace. This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-slate-700">
              {/* Safe default: focus lands on Cancel, never on the destructive action. */}
              <Button variant="outline" autoFocus onClick={() => setDeleteDoc(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteDocumentMutation.mutate(deleteDoc.id)}
                disabled={deleteDocumentMutation.isPending}
              >
                {deleteDocumentMutation.isPending ? 'Deleting...' : 'Delete Permanently'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
