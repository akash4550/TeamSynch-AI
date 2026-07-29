import { useState } from 'react';
import { useAuditLogs, useTriggerComplianceExport, AuditLogRecord } from '../../modules/audit/api/useAudit';
import { Card, Title, Text, Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell, Badge, Button, Flex } from '@tremor/react';
import { ShieldCheck, Download, RefreshCw } from 'lucide-react';

export const AuditLogViewerPage = () => {
  const [entityType, setEntityType] = useState<string>('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const { data, isLoading, refetch } = useAuditLogs({
    entityType: entityType || undefined,
    cursor,
    limit: 20,
  });

  const exportMutation = useTriggerComplianceExport();

  const logs = data?.data || [];

  const handleExport = (format: 'CSV' | 'JSON') => {
    exportMutation.mutate({ format, entityType: entityType || undefined });
  };

  return (
    <div className="p-6 space-y-6">
      <Flex className="mb-6">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <Title className="text-2xl dark:text-white">Immutable Security Audit Trail</Title>
          </div>
          <Text className="dark:text-gray-400 mt-1">
            Auditable security activity logs capturing user actions, IP addresses, and metadata.
          </Text>
        </div>

        <div className="flex gap-2">
          <Button
            icon={Download}
            variant="secondary"
            loading={exportMutation.isPending}
            onClick={() => handleExport('CSV')}
          >
            Export Compliance CSV
          </Button>
          <Button
            icon={Download}
            variant="secondary"
            loading={exportMutation.isPending}
            onClick={() => handleExport('JSON')}
          >
            Export JSON
          </Button>
        </div>
      </Flex>

      <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative w-64">
            <select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setCursor(undefined);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md text-sm text-gray-900 dark:text-white dark:bg-slate-900"
            >
              <option value="">All Entity Types</option>
              <option value="TASK">Task</option>
              <option value="PROJECT">Project</option>
              <option value="CLIENT">Client</option>
              <option value="DOCUMENT">Document</option>
              <option value="USER">User</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => refetch()}
          className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          title="Refresh Audit Logs"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Timestamp</TableHeaderCell>
              <TableHeaderCell>Actor / User</TableHeaderCell>
              <TableHeaderCell>Action Type</TableHeaderCell>
              <TableHeaderCell>Target Entity</TableHeaderCell>
              <TableHeaderCell>IP Address</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                  Loading security audit trail...
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                  No security activity records found.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log: AuditLogRecord) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-gray-500 font-mono">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium text-gray-900 dark:text-white">
                    {log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System'}
                  </TableCell>
                  <TableCell>
                    <Badge color={log.type === 'DELETE' ? 'rose' : log.type === 'CREATE' ? 'emerald' : 'blue'}>
                      {log.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {log.entityType}: #{log.entityId.slice(0, 8)}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 font-mono">
                    {log.ipAddress || '127.0.0.1'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {data?.hasMore && data.nextCursor && (
          <div className="flex justify-center pt-4 border-t border-gray-100 dark:border-slate-800">
            <Button
              variant="secondary"
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
