import { useMemo, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { downloadCsv, printTable, ExportColumn } from '@/app/components/table-export';

interface ReportsPanelProps {
  companyId: string;
  facilities: any[];
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

export function ReportsPanel({ companyId, facilities, equipment, issues, contractors }: ReportsPanelProps) {
  const [activeTab, setActiveTab] = useState('equipment');

  const equipmentRows = useMemo(() => {
    return equipment.map((eq) => {
      const eqIssues = issues.filter((issue) => issue.equipmentId === eq.id);
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
  }, [equipment, issues]);

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

  const facilityRows = useMemo(() => {
    return facilities.map((facility) => {
      const facilityEquipment = equipment.filter((eq) => eq.facilityId === facility.id);
      const facilityIssues = issues.filter((issue) => issue.facilityId === facility.id);
      const openIssues = facilityIssues.filter(
        (issue) => !['completed', 'approved', 'closed'].includes(issue.status)
      );
      const green = facilityEquipment.filter((eq) => eq.healthStatus === 'green').length;
      const yellow = facilityEquipment.filter((eq) => eq.healthStatus === 'yellow').length;
      const red = facilityEquipment.filter((eq) => eq.healthStatus === 'red').length;
      const total = green + yellow + red;
      const healthScore = total ? Math.round(((green + yellow * 0.6) / total) * 100) : 0;
      const totalCost = facilityIssues.reduce((sum, issue) => sum + (issue.completion?.finalCost || 0), 0);
      return {
        id: facility.id,
        name: facility.name,
        location: facility.location || '-',
        equipmentCount: facilityEquipment.length,
        openIssues: openIssues.length,
        healthScore,
        totalCost
      };
    });
  }, [facilities, equipment, issues]);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="equipment">Equipment Performance</TabsTrigger>
        <TabsTrigger value="vendors">Vendor Performance</TabsTrigger>
        <TabsTrigger value="facilities">Facility Performance</TabsTrigger>
      </TabsList>

      <TabsContent value="equipment">
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
                    { label: 'Equipment', value: (row) => row.name },
                    { label: 'Category', value: (row) => row.category },
                    { label: 'Location', value: (row) => row.location },
                    { label: 'Issues', value: (row) => row.issueCount },
                    { label: 'Avg Response (min)', value: (row) => row.avgResponse ?? '-' },
                    { label: 'Avg Completion (min)', value: (row) => row.avgCompletion ?? '-' },
                    { label: 'Total Cost', value: (row) => row.totalCost || 0 },
                  ],
                  equipmentRows
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
                    { label: 'Equipment', value: (row) => row.name },
                    { label: 'Category', value: (row) => row.category },
                    { label: 'Location', value: (row) => row.location },
                    { label: 'Issues', value: (row) => row.issueCount },
                    { label: 'Avg Response (min)', value: (row) => row.avgResponse ?? '-' },
                    { label: 'Avg Completion (min)', value: (row) => row.avgCompletion ?? '-' },
                    { label: 'Total Cost', value: (row) => row.totalCost || 0 },
                  ],
                  equipmentRows,
                  'All time'
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
              {equipmentRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-slate-500">
                    No equipment performance data
                  </TableCell>
                </TableRow>
              ) : (
                equipmentRows.map((row) => (
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
      </TabsContent>

      <TabsContent value="vendors">
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
                    { label: 'Contractor', value: (row) => row.name },
                    { label: 'Email', value: (row) => row.email },
                    { label: 'Status', value: (row) => row.status },
                    { label: 'Avg Response (min)', value: (row) => row.avgResponse ?? '-' },
                    { label: 'Avg Completion (min)', value: (row) => row.avgCompletion ?? '-' },
                    { label: 'Missed SLA', value: (row) => row.delayed },
                    { label: 'Total Jobs', value: (row) => row.totalJobs },
                  ],
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
                    { label: 'Contractor', value: (row) => row.name },
                    { label: 'Email', value: (row) => row.email },
                    { label: 'Status', value: (row) => row.status },
                    { label: 'Avg Response (min)', value: (row) => row.avgResponse ?? '-' },
                    { label: 'Avg Completion (min)', value: (row) => row.avgCompletion ?? '-' },
                    { label: 'Missed SLA', value: (row) => row.delayed },
                    { label: 'Total Jobs', value: (row) => row.totalJobs },
                  ],
                  vendorRows,
                  'All time'
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
      </TabsContent>

      <TabsContent value="facilities">
        <div className="rounded-md border border-border bg-white">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Facility performance</div>
              <div className="text-xs text-slate-500">Equipment health, issues, and cost</div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-8"
                onClick={() => downloadCsv(
                  `facility-performance-${companyId}.csv`,
                  [
                    { label: 'Facility', value: (row) => row.name },
                    { label: 'Location', value: (row) => row.location },
                    { label: 'Equipment', value: (row) => row.equipmentCount },
                    { label: 'Open Issues', value: (row) => row.openIssues },
                    { label: 'Health Score', value: (row) => `${row.healthScore}%` },
                    { label: 'Total Cost', value: (row) => row.totalCost || 0 },
                  ],
                  facilityRows
                )}
              >
                Download CSV
              </Button>
              <Button
                variant="outline"
                className="h-8"
                onClick={() => printTable(
                  'Facility Performance',
                  [
                    { label: 'Facility', value: (row) => row.name },
                    { label: 'Location', value: (row) => row.location },
                    { label: 'Equipment', value: (row) => row.equipmentCount },
                    { label: 'Open Issues', value: (row) => row.openIssues },
                    { label: 'Health Score', value: (row) => `${row.healthScore}%` },
                    { label: 'Total Cost', value: (row) => row.totalCost || 0 },
                  ],
                  facilityRows,
                  'All time'
                )}
              >
                Print PDF
              </Button>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Facility</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead>Open Issues</TableHead>
                <TableHead>Health Score</TableHead>
                <TableHead>Total Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {facilityRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-slate-500">
                    No facility performance data
                  </TableCell>
                </TableRow>
              ) : (
                facilityRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{row.name}</div>
                      <div className="text-xs text-slate-500">{row.location}</div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{row.equipmentCount}</TableCell>
                    <TableCell className="text-sm text-slate-600">{row.openIssues}</TableCell>
                    <TableCell className="text-sm text-slate-600">{row.healthScore}%</TableCell>
                    <TableCell className="text-sm text-slate-600">NGN {row.totalCost.toLocaleString()}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>
    </Tabs>
  );
}
