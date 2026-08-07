import { useEffect, useState } from 'react';
import { useAuditLogs, useTriggerComplianceExport, AuditLogRecord } from '../../modules/audit/api/useAudit';
import { ArrowDownTrayIcon, ArrowPathIcon, CheckCircleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useSocket } from '../../providers/SocketProvider';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

/*
 * UI PASS (#UI-audit-viewer, 2026-08-06): visual-only restyle — last Tremor
 * chrome in the system cluster swapped for the shared primitives and the
 * CRM-cluster table language. THIS file only; the socket subscription,
 * export single-flight state machine, filters, cursor pagination, and all
 * Bug #37/#71/#100 truth contracts are preserved verbatim.
 *
 * Locks held (SystemSearchQueryErrorStates): 'We couldn't load the audit
 * trail' alert row + server message + Retry; 'No security activity records
 * found.' only on a successful empty read; null IP renders an em-dash text
 * node (never '127.0.0.1') with the 'Not recorded' tooltip; real IPs
 * render verbatim.
 *
 * Visual/a11y-only changes: cluster header with one icon system
 * (heroicons), labelled native select (sr-only label + htmlFor/id),
 * aria-label on the icon-only refresh button, export status banner is now
 * role="status", semantic table chrome (header band, divide/hover rows,
 * tabular-nums), and pill hues for the action type (DELETE rose / CREATE
 * emerald / default primary — same mapping as the old Tremor Badge).
 */

interface AuditExportCompletedEvent {
  jobId?: string;
  userId?: string;
  format?: string;
  downloadUrl?: string;
  totalRecords?: number;
  truncated?: boolean; // BUG FIX (#71): server now reports export-cap truncation
}

/* Action-type pill — same hue rules as the old Tremor Badge. */
const typePillClass = (type: string) =>
  `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
    type === 'DELETE'
      ? 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/20'
      : type === 'CREATE'
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20'
        : 'bg-primary-50 text-primary-700 ring-primary-600/20 dark:bg-primary-400/10 dark:text-primary-300 dark:ring-primary-400/20'
  }`;

export const AuditLogViewerPage = () => {
  const [entityType, setEntityType] = useState<string>('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  /*
   * BUG FIX (compliance lie — failed read claimed "no records" — Bug #37):
   * this query surfaced only `isLoading`, so a rejected GET /audit/logs
   * (500, network down, expired 401) fell through to `logs.length === 0`
   * and the IMMUTABLE SECURITY AUDIT TRAIL claimed "No security activity
   * records found." — the gravest fabrication a compliance surface can
   * make. `isError`/`error` are now exposed, and the table renders an
   * honest failure row (server message + Retry) before the empty/results
   * branches. Same truth pattern as Bug #31–#36.
   */
  const { data, isLoading, isError, error: auditError, refetch } = useAuditLogs({
    entityType: entityType || undefined,
    cursor,
    limit: 20,
  });

  const auditErrorMessage = (() => {
    const m = (auditError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();

  const exportMutation = useTriggerComplianceExport();
  const { socket } = useSocket();

  /*
   * BUG FIX (export button did nothing visible): `/audit/export` is
   * asynchronous — it answers 202 with a job ticket while a worker builds the
   * file, uploads it, and emits `audit.export.completed` carrying a 1-hour
   * pre-signed download URL. The page ignored the ticket and never listened,
   * so clicking Export produced no feedback and no file. We now hold the
   * ticket's jobId, show progress, open the download when the matching event
   * arrives, and use a 60s timeout so a failed worker can't strand the UI.
   * Buttons stay disabled while an export is in flight, which keeps the
   * jobId correlation strictly single-flight.
   */
  const [pendingExportJobId, setPendingExportJobId] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!socket || !pendingExportJobId) return;

    const handleExportCompleted = (payload: AuditExportCompletedEvent) => {
      if (!payload || payload.jobId !== pendingExportJobId) return;
      setPendingExportJobId(null);
      if (payload.downloadUrl) {
        window.open(payload.downloadUrl, '_blank');
        /*
         * BUG FIX (#71 — silent export truncation): the worker caps exports
         * at 5000 rows; before this fix the status line claimed "Export
         * complete" with no hint that rows were dropped. When the payload
         * flags truncation, say so plainly and tell the admin how to get
         * the remainder (narrow filters, export again).
         */
        setExportStatus(
          payload.truncated
            ? `Export downloaded — ${payload.totalRecords ?? ''} records (${payload.format ?? 'file'}), export row cap reached. Narrow the filters and export again for the remaining records.`
            : `Export complete — ${payload.totalRecords ?? 'all'} records downloaded (${payload.format ?? 'file'}).`
        );
      } else {
        setExportStatus('Export finished but no download link was returned. Please try again.');
      }
    };

    socket.on('audit.export.completed', handleExportCompleted);
    return () => {
      socket.off('audit.export.completed', handleExportCompleted);
    };
  }, [socket, pendingExportJobId]);

  // Safety net: if the worker fails silently, restore the UI with an explanation.
  useEffect(() => {
    if (!pendingExportJobId) return;
    const timeout = setTimeout(() => {
      setPendingExportJobId(null);
      setExportStatus('Export is taking longer than expected. Please try again.');
    }, 60_000);
    return () => clearTimeout(timeout);
  }, [pendingExportJobId]);

  const isExporting = exportMutation.isPending || pendingExportJobId !== null;

  const logs = data?.data || [];

  const handleExport = (format: 'CSV' | 'JSON') => {
    exportMutation.mutate(
      { format, entityType: entityType || undefined },
      {
        onSuccess: (ticket) => {
          setPendingExportJobId(ticket.jobId);
          setExportStatus(`Export queued — generating ${format} file…`);
        },
        onError: () => {
          setExportStatus('Export failed to start. Please try again.');
        },
      }
    );
  };

  return (
    <div className="p-6 h-full overflow-auto bg-gray-50 dark:bg-slate-900">
      {/* Page header — cluster language; both export actions are secondary
          (no primary action on a read-only compliance surface) */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" aria-hidden="true" />
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Immutable Security Audit Trail</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Auditable security activity logs capturing user actions, IP addresses, and metadata.
          </p>
        </div>

        <div className="flex shrink-0 gap-2 self-start">
          <Button
            variant="outline"
            className="gap-2"
            isLoading={isExporting}
            onClick={() => handleExport('CSV')}
          >
            {!isExporting && <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />}
            Export Compliance CSV
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            isLoading={isExporting}
            onClick={() => handleExport('JSON')}
          >
            {!isExporting && <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />}
            Export JSON
          </Button>
        </div>
      </div>

      {exportStatus && (
        <div role="status" className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 rounded-lg flex items-center gap-2 text-sm border border-emerald-200 dark:border-emerald-800">
          <CheckCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{exportStatus}</span>
        </div>
      )}

      {/* Filter toolbar — labelled native select + icon-button refresh */}
      <Card className="mb-6 p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <label htmlFor="audit-entity-type" className="sr-only">
            Filter by entity type
          </label>
          <select
            id="audit-entity-type"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setCursor(undefined);
            }}
            className="h-10 w-64 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100"
          >
            <option value="">All Entity Types</option>
            <option value="TASK">Task</option>
            <option value="PROJECT">Project</option>
            <option value="CLIENT">Client</option>
            <option value="DOCUMENT">Document</option>
            <option value="USER">User</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-md p-2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-gray-400 dark:hover:text-gray-200"
          title="Refresh Audit Logs"
          aria-label="Refresh audit logs"
        >
          <ArrowPathIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </Card>

      {/* Table surface — horizontal scroll contained INSIDE the card */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/75 dark:border-slate-700 dark:bg-slate-800/80">
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Timestamp</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Actor / User</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Action Type</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Target Entity</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/70">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8">
                    <div role="status" className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Loading security audit trail...
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                // Bug #37: honest failure row — never claim "No security
                // activity records found." when the read simply failed.
                <tr>
                  <td colSpan={5} className="px-4 py-8">
                    <div
                      role="alert"
                      className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center dark:border-red-900/50 dark:bg-red-900/20"
                    >
                      <p className="text-sm font-medium text-red-700 dark:text-red-300">We couldn't load the audit trail</p>
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {auditErrorMessage ?? 'Something went wrong while fetching the audit logs. Your data is safe — please try again.'}
                      </p>
                      <Button size="sm" className="mt-3" onClick={() => refetch()}>
                        Retry
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No security activity records found.
                  </td>
                </tr>
              ) : (
                logs.map((log: AuditLogRecord) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/40">
                    <td className="px-4 py-3 font-mono text-xs tabular-nums whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={typePillClass(log.type)}>{log.type}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                      {log.entityType}: <span className="font-mono text-xs">#{log.entityId.slice(0, 8)}</span>
                    </td>
                    {/*
                     * BUG FIX (#100, 2026-08-06 — fabricated IPs in the
                     * "immutable" audit trail): NO producer writes
                     * ActivityLog.ipAddress today (the AuditSubscriber's
                     * EventBus payloads don't carry one, and
                     * user.repository's inline role-change row doesn't set
                     * one), so EVERY row fell through to a hardcoded
                     * '127.0.0.1' fallback while the CSV export of the SAME
                     * rows honestly printed an empty cell. An em-dash now
                     * marks "not recorded", matching the export. The cell's
                     * text contract is pinned by tests — do not restructure.
                     */}
                    <td
                      className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400"
                      title={log.ipAddress ? undefined : 'Not recorded for this event'}
                    >
                      {log.ipAddress || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data?.hasMore && data.nextCursor && (
          <div className="flex justify-center border-t border-gray-100 px-4 py-4 dark:border-slate-700/80">
            <Button
              variant="outline"
              onClick={() => setCursor(data.nextCursor || undefined)}
            >
              Load Next Page
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};
