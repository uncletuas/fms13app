import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis
} from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent
} from '@/app/components/ui/chart';
import { Progress } from '@/app/components/ui/progress';

interface AdminIntelligencePanelProps {
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

const toDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export function AdminIntelligencePanel({
  facilities,
  equipment,
  issues,
  contractors
}: AdminIntelligencePanelProps) {
  const issueTrend = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }).map((_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      return {
        key,
        label: date.toLocaleString('en-US', { month: 'short' }),
        created: 0,
        completed: 0
      };
    });

    const map = new Map(months.map((item) => [item.key, item]));
    issues.forEach((issue) => {
      const createdAt = toDate(issue.createdAt || issue.updatedAt);
      if (createdAt) {
        const key = `${createdAt.getFullYear()}-${createdAt.getMonth()}`;
        const target = map.get(key);
        if (target) target.created += 1;
      }
      const completedAt = toDate(issue.completedAt || issue.approvedAt || issue.closedAt);
      if (completedAt) {
        const key = `${completedAt.getFullYear()}-${completedAt.getMonth()}`;
        const target = map.get(key);
        if (target) target.completed += 1;
      }
    });

    return months;
  }, [issues]);

  const facilityHealth = useMemo(() => {
    const facilityMap = new Map<string, any>();
    facilities.forEach((facility) => {
      facilityMap.set(facility.id, {
        id: facility.id,
        name: facility.name,
        green: 0,
        yellow: 0,
        red: 0
      });
    });

    equipment.forEach((item) => {
      const facilityId = item.facilityId;
      if (!facilityId) return;
      if (!facilityMap.has(facilityId)) {
        facilityMap.set(facilityId, {
          id: facilityId,
          name: item.facilityName || facilityId,
          green: 0,
          yellow: 0,
          red: 0
        });
      }
      const row = facilityMap.get(facilityId);
      if (!row) return;
      if (item.healthStatus === 'red') row.red += 1;
      else if (item.healthStatus === 'yellow') row.yellow += 1;
      else row.green += 1;
    });

    return Array.from(facilityMap.values())
      .map((row) => ({
        ...row,
        total: row.green + row.yellow + row.red
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [facilities, equipment]);

  const vendorPerformance = useMemo(() => {
    return contractors
      .map((contractor) => ({
        id: contractor.id,
        name: contractor.name || contractor.email || 'Contractor',
        response: contractor.performance?.avg_response_minutes ?? null,
        completion: contractor.performance?.avg_completion_minutes ?? null,
        delayed: contractor.performance?.delayed_jobs_count ?? 0
      }))
      .filter((row) => row.response !== null || row.completion !== null)
      .sort((a, b) => (a.response ?? Infinity) - (b.response ?? Infinity))
      .slice(0, 6);
  }, [contractors]);

  const costDistribution = useMemo(() => {
    const totals = { equipment: 0, general: 0 };
    issues.forEach((issue) => {
      const cost = issue.completion?.finalCost || 0;
      if (!cost) return;
      if (issue.taskType === 'general') totals.general += cost;
      else totals.equipment += cost;
    });
    return [
      { name: 'Equipment tasks', value: totals.equipment },
      { name: 'General tasks', value: totals.general }
    ];
  }, [issues]);

  const equipmentRanking = useMemo(() => {
    const counts = new Map<string, number>();
    issues.forEach((issue) => {
      if (!issue.equipmentId) return;
      counts.set(issue.equipmentId, (counts.get(issue.equipmentId) || 0) + 1);
    });
    return equipment
      .map((item) => ({
        id: item.id,
        name: item.name,
        location: item.location || item.facilityName || '-',
        issues: counts.get(item.id) || 0
      }))
      .sort((a, b) => b.issues - a.issues)
      .slice(0, 6);
  }, [equipment, issues]);

  const facilityRanking = useMemo(() => {
    return facilityHealth
      .map((facility) => {
        const issueCount = issues.filter((issue) => issue.facilityId === facility.id).length;
        const score = facility.total
          ? Math.round(((facility.green + facility.yellow * 0.6) / facility.total) * 100)
          : 0;
        return {
          ...facility,
          issueCount,
          score
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [facilityHealth, issues]);

  const slaMetrics = useMemo(() => {
    const completedIssues = issues.filter((issue) => issue.completedAt || issue.approvedAt || issue.closedAt);
    const withSla = completedIssues.filter((issue) => issue.slaDeadline);
    const onTime = withSla.filter((issue) => {
      const completedAt = toDate(issue.completedAt || issue.approvedAt || issue.closedAt);
      const deadline = toDate(issue.slaDeadline);
      return completedAt && deadline ? completedAt <= deadline : false;
    });
    const avgResponse = completedIssues
      .map((issue) => issue.executionMetrics?.responseMinutes)
      .filter((value: number | null) => value !== null && value !== undefined) as number[];
    const avgCompletion = completedIssues
      .map((issue) => issue.executionMetrics?.executionMinutes)
      .filter((value: number | null) => value !== null && value !== undefined) as number[];
    const avgResponseMinutes = avgResponse.length
      ? Math.round(avgResponse.reduce((acc, value) => acc + value, 0) / avgResponse.length)
      : null;
    const avgCompletionMinutes = avgCompletion.length
      ? Math.round(avgCompletion.reduce((acc, value) => acc + value, 0) / avgCompletion.length)
      : null;
    const compliance = withSla.length ? Math.round((onTime.length / withSla.length) * 100) : 0;
    return {
      compliance,
      avgResponseMinutes,
      avgCompletionMinutes,
      delayedCount: withSla.length - onTime.length
    };
  }, [issues]);

  const chartConfig = {
    created: { label: 'Created', color: '#94a3b8' },
    completed: { label: 'Completed', color: '#f1a423' },
    green: { label: 'Healthy', color: '#22c55e' },
    yellow: { label: 'Warning', color: '#f59e0b' },
    red: { label: 'Critical', color: '#ef4444' },
    response: { label: 'Response', color: '#163a5b' },
    completion: { label: 'Completion', color: '#7fa4bf' }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-900">SLA compliance</CardTitle>
            <CardDescription className="text-xs text-slate-500">On-time closures vs targets</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-semibold text-slate-900">{slaMetrics.compliance}%</div>
            <Progress value={slaMetrics.compliance} className="h-2 bg-primary/10" />
            <div className="text-xs text-slate-500">
              {slaMetrics.delayedCount} delayed jobs flagged
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-900">Response speed</CardTitle>
            <CardDescription className="text-xs text-slate-500">Average vendor response time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">
              {formatMinutes(slaMetrics.avgResponseMinutes)}
            </div>
            <div className="mt-2 text-xs text-slate-500">Measured from assignment to response.</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-900">Execution speed</CardTitle>
            <CardDescription className="text-xs text-slate-500">Average completion duration</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">
              {formatMinutes(slaMetrics.avgCompletionMinutes)}
            </div>
            <div className="mt-2 text-xs text-slate-500">Includes accepted to completed jobs.</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-900">Issue volume trend</CardTitle>
            <CardDescription className="text-xs text-slate-500">Created vs completed (last 6 months)</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[240px] w-full">
              <LineChart data={issueTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="created" stroke="var(--color-created)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="completed" stroke="var(--color-completed)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-900">Facility health mix</CardTitle>
            <CardDescription className="text-xs text-slate-500">Equipment condition by facility</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[240px] w-full">
              <BarChart data={facilityHealth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="green" stackId="a" fill="var(--color-green)" />
                <Bar dataKey="yellow" stackId="a" fill="var(--color-yellow)" />
                <Bar dataKey="red" stackId="a" fill="var(--color-red)" />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-900">Vendor performance</CardTitle>
            <CardDescription className="text-xs text-slate-500">Response vs execution time (minutes)</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[240px] w-full">
              <BarChart data={vendorPerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="response" fill="var(--color-response)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completion" fill="var(--color-completion)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-900">Cost distribution</CardTitle>
            <CardDescription className="text-xs text-slate-500">Completed work by task type</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <ChartContainer config={{ equipment: { label: 'Equipment tasks', color: '#163a5b' }, general: { label: 'General tasks', color: '#f1a423' } }} className="h-[200px] w-[200px]">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie data={costDistribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                  {costDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#163a5b' : '#f1a423'} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="space-y-2 text-xs text-slate-600">
              {costDistribution.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${index === 0 ? 'bg-primary' : 'bg-amber-400'}`} />
                  <span>{entry.name}</span>
                  <span className="font-semibold text-slate-900">NGN {entry.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-900">Equipment risk ranking</CardTitle>
            <CardDescription className="text-xs text-slate-500">Most frequent breakdowns</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {equipmentRanking.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-slate-500">
                      No issue history yet
                    </TableCell>
                  </TableRow>
                ) : (
                  equipmentRanking.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-slate-900">{row.name}</TableCell>
                      <TableCell className="text-sm text-slate-600">{row.location}</TableCell>
                      <TableCell className="text-sm text-slate-600">{row.issues}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-900">Facility performance</CardTitle>
            <CardDescription className="text-xs text-slate-500">Health score and open issues</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facility</TableHead>
                  <TableHead>Health score</TableHead>
                  <TableHead>Open issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {facilityRanking.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-slate-500">
                      No facility data
                    </TableCell>
                  </TableRow>
                ) : (
                  facilityRanking.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-slate-900">{row.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <span className="font-semibold text-slate-900">{row.score}%</span>
                          <span className="text-xs text-slate-500">
                            {row.green}G/{row.yellow}Y/{row.red}R
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{row.issueCount}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
