import { useMemo, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { downloadCsv, inDateRange, printTable, ExportColumn } from '@/app/components/table-export';

interface ReportsPanelProps {
  companyId: string;
  equipment: any[];
  issues: any[];
  contractors: any[];
}

const formatMinutes = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours}h ${minutes}m`;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export function ReportsPanel({ companyId, equipment, issues, contractors }: ReportsPanelProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => inDateRange(issue.createdAt || issue.updatedAt, startDate, endDate));
  }, [issues, startDate, endDate]);

  const equipmentRows = useMemo(() => {
    return equipment.map((eq) => {
      const eqIssues = filteredIssues.filter((issue) => issue.equipmentId === eq.id);
      const responseTimes = eqIssues
        .map((issue) => issue.executionMetrics?.responseMinutes)
        .filter((value: number | null) => value !== null && value !== undefined) as number[];
      const completionTimes = eqIssues
        .map((issue) => issue.executionMetrics?.executionMinutes)
        .filter((value: number | null) => value !== null && value !== undefined) as number[];
      const costs = eqIssues
        .map((issue) => issue.completion?.finalCost || 0)
        .filter((value: number) => value > 0);
      const avgResponse = responseTimes.length ? Math.round(sum(responseTimes) / responseTimes.length) : null;
      const avgCompletion = completionTimes.length ? Math.round(sum(completionTimes) / completionTimes.length) : null;
      const totalCost = sum(costs);
      const lastIssue = eqIssues.length
        ? eqIssues.reduce((latest: any, current: any) =>
          new Date(current.updatedAt || current.createdAt).getTime() > new Date(latest.updatedAt || latest.createdAt).getTime()
            ? current
            : latest)
        : null;

      return {
        id: eq.id,
        name: eq.name,
        category: eq.category,
        location: eq.location || '-',
        issueCount: eqIssues.length,
        avgResponse,
        avgCompletion,
        totalCost,
        lastIssueAt: lastIssue ? lastIssue.updatedAt || lastIssue.createdAt : null
      };
    });
  }, [equipment, filteredIssues]);

  const vendorRows = useMemo(() => {
    return contractors.map((contractor) => ({
      id: contractor.id,
      name: contractor.name,
      email: contractor.email || '-',
      status: contractor?.binding?.status || 'active',
      avgResponse: contractor.performance?.avg_response_minutes ?? null,
      avgCompletion: contractor.performance?.avg_completion_minutes ?? null,
      delayed: contractor.performance?.delayed_jobs_count ?? 0,
      totalJobs: contractor.performance?.total_jobs ?? 0
    }));
  }, [contractors]);

  const equipmentQuery = search.trim().toLowerCase();
  const filteredEquipmentRows = equipmentRows.filter((row) => {
    if (!equipmentQuery) return true;
    return `${row.name} ${row.category} ${row.location} ${row.id}`.toLowerCase().includes(equipmentQuery);
  });

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Label className="text-xs text-slate-500">Search equipment</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search equipment"
              className="h-8"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">From</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">To</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8"
            />
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Equipment performance</div>
            <div className="text-xs text-slate-500">Health, response times, and costs</div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-8"
              onClick={() => downloadCsv(
                `equipment-performance-${companyId}.csv`,
                [
                  { label: 'Equipment', value: (row: any) => row.name },
                  { label: 'Category', value: (row: any) => row.category },
                  { label: 'Location', value: (row: any) => row.location },
                  { label: 'Issues', value: (row: any) => row.issueCount },
                  { label: 'Avg Response (min)', value: (row: any) => row.avgResponse ?? '-' },
                  { label: 'Avg Completion (min)', value: (row: any) => row.avgCompletion ?? '-' },
                  { label: 'Total Cost', value: (row: any) => row.totalCost || 0 },
                ] as ExportColumn<any>[],
                filteredEquipmentRows
              )}
            >
              Download CSV
            </Button>
            <Button
              variant="outline"
              className="h-8"
              onClick={() => printTable(
                'Equipment Performance',
                [
                  { label: 'Equipment', value: (row: any) => row.name },
                  { label: 'Category', value: (row: any) => row.category },
                  { label: 'Location', value: (row: any) => row.location },
                  { label: 'Issues', value: (row: any) => row.issueCount },
                  { label: 'Avg Response (min)', value: (row: any) => row.avgResponse ?? '-' },
                  { label: 'Avg Completion (min)', value: (row: any) => row.avgCompletion ?? '-' },
                  { label: 'Total Cost', value: (row: any) => row.totalCost || 0 },
                ] as ExportColumn<any>[],
                filteredEquipmentRows,
                `${startDate || 'All'} to ${endDate || 'All'}`
              )}
            >
              Print PDF
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Equipment</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Issues</TableHead>
              <TableHead>Avg Response</TableHead>
              <TableHead>Avg Completion</TableHead>
              <TableHead>Total Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEquipmentRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-slate-500">
                  No equipment performance data
                </TableCell>
              </TableRow>
            ) : (
              filteredEquipmentRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium text-slate-900">{row.name}</div>
                    <div className="text-xs text-slate-500">{row.location}</div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{row.category}</TableCell>
                  <TableCell className="text-sm text-slate-600">{row.issueCount}</TableCell>
                  <TableCell className="text-sm text-slate-600">{formatMinutes(row.avgResponse)}</TableCell>
                  <TableCell className="text-sm text-slate-600">{formatMinutes(row.avgCompletion)}</TableCell>
                  <TableCell className="text-sm text-slate-600">NGN {row.totalCost.toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-md border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Vendor performance</div>
            <div className="text-xs text-slate-500">Response speed and SLA compliance</div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-8"
              onClick={() => downloadCsv(
                `vendor-performance-${companyId}.csv`,
                [
                  { label: 'Contractor', value: (row: any) => row.name },
                  { label: 'Email', value: (row: any) => row.email },
                  { label: 'Status', value: (row: any) => row.status },
                  { label: 'Avg Response (min)', value: (row: any) => row.avgResponse ?? '-' },
                  { label: 'Avg Completion (min)', value: (row: any) => row.avgCompletion ?? '-' },
                  { label: 'Missed SLA', value: (row: any) => row.delayed },
                  { label: 'Total Jobs', value: (row: any) => row.totalJobs },
                ] as ExportColumn<any>[],
                vendorRows
              )}
            >
              Download CSV
            </Button>
            <Button
              variant="outline"
              className="h-8"
              onClick={() => printTable(
                'Vendor Performance',
                [
                  { label: 'Contractor', value: (row: any) => row.name },
                  { label: 'Email', value: (row: any) => row.email },
                  { label: 'Status', value: (row: any) => row.status },
                  { label: 'Avg Response (min)', value: (row: any) => row.avgResponse ?? '-' },
                  { label: 'Avg Completion (min)', value: (row: any) => row.avgCompletion ?? '-' },
                  { label: 'Missed SLA', value: (row: any) => row.delayed },
                  { label: 'Total Jobs', value: (row: any) => row.totalJobs },
                ] as ExportColumn<any>[],
                vendorRows,
                `${startDate || 'All'} to ${endDate || 'All'}`
              )}
            >
              Print PDF
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contractor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Avg Response</TableHead>
              <TableHead>Avg Completion</TableHead>
              <TableHead>Missed SLA</TableHead>
              <TableHead>Total Jobs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendorRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-slate-500">
                  No vendor performance data
                </TableCell>
              </TableRow>
            ) : (
              vendorRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium text-slate-900">{row.name}</div>
                    <div className="text-xs text-slate-500">{row.email}</div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{row.status}</TableCell>
                  <TableCell className="text-sm text-slate-600">{formatMinutes(row.avgResponse)}</TableCell>
                  <TableCell className="text-sm text-slate-600">{formatMinutes(row.avgCompletion)}</TableCell>
                  <TableCell className="text-sm text-slate-600">{row.delayed}</TableCell>
                  <TableCell className="text-sm text-slate-600">{row.totalJobs}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
