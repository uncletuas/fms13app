import { Badge } from '@/app/components/ui/badge';

interface IssueTimelineProps {
  issue: any;
}

const formatTimestamp = (value?: string | null) => {
  if (!value) return 'Pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return date.toLocaleString();
};

const formatDuration = (minutes: number | null | undefined) => {
  if (minutes === null || minutes === undefined) return 'Pending';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
};

const computeMetrics = (issue: any) => {
  if (issue?.executionMetrics) return issue.executionMetrics;
  const diffMinutes = (start?: string | null, end?: string | null) => {
    if (!start || !end) return null;
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    if (Number.isNaN(startTime) || Number.isNaN(endTime)) return null;
    return Math.round((endTime - startTime) / 60000);
  };
  const respondedAt = issue.respondedAt || issue.contractorResponse?.respondedAt || null;
  const acceptedAt = issue.acceptedAt || (issue.contractorResponse?.decision === 'accepted' ? respondedAt : null);
  const completedAt = issue.completedAt || issue.completion?.completedAt || null;
  const approvedAt = issue.approvedAt || null;
  return {
    responseMinutes: diffMinutes(issue.assignedAt, respondedAt),
    executionMinutes: diffMinutes(acceptedAt || respondedAt || issue.assignedAt, completedAt),
    totalMinutes: diffMinutes(issue.createdAt, completedAt),
    approvalMinutes: diffMinutes(completedAt, approvedAt),
  };
};

export function IssueTimeline({ issue }: IssueTimelineProps) {
  const metrics = computeMetrics(issue);
  const slaDeadline = issue.slaDeadline ? new Date(issue.slaDeadline) : null;
  const completedAt = issue.completedAt || issue.completion?.completedAt || null;
  const isOverdue = slaDeadline
    ? (completedAt ? new Date(completedAt).getTime() > slaDeadline.getTime() : Date.now() > slaDeadline.getTime())
    : false;
  const events = [
    { label: 'Issue reported', timestamp: issue.createdAt, by: issue.reportedBy?.name },
    { label: 'Assigned to contractor', timestamp: issue.assignedAt, by: issue.assignedTo || null },
    {
      label: issue.contractorResponse?.decision === 'rejected' ? 'Contractor rejected' : 'Contractor responded',
      timestamp: issue.respondedAt || issue.contractorResponse?.respondedAt,
      by: issue.contractorResponse?.contractorName
    },
    { label: 'Work started', timestamp: issue.acceptedAt, by: issue.contractorResponse?.contractorName },
    { label: 'Work completed', timestamp: issue.completedAt || issue.completion?.completedAt, by: issue.completion?.contractorName },
    { label: 'Approved', timestamp: issue.approvedAt, by: issue.approvedBy?.name },
    { label: 'Closed', timestamp: issue.closedAt, by: issue.approvedBy?.name },
  ];

  return (
    <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.5)]">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">Execution Timeline</div>
        {issue.slaDeadline && (
          <Badge className={isOverdue ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'}>
            SLA {formatTimestamp(issue.slaDeadline)} {isOverdue ? '- Missed' : ''}
          </Badge>
        )}
      </div>
      <div className="mt-3 space-y-3">
        {events.map((event) => (
          <div key={event.label} className="flex items-start justify-between gap-4 text-sm">
            <div>
              <div className="font-medium text-slate-800">{event.label}</div>
              {event.by && <div className="text-xs text-slate-500">By {event.by}</div>}
            </div>
            <div className="text-xs text-slate-500">{formatTimestamp(event.timestamp)}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-4">
        <div className="rounded-xl bg-slate-50/80 px-3 py-2 text-xs">
          <div className="text-slate-500">Response time</div>
          <div className="font-semibold text-slate-800">{formatDuration(metrics.responseMinutes)}</div>
        </div>
        <div className="rounded-xl bg-slate-50/80 px-3 py-2 text-xs">
          <div className="text-slate-500">Execution time</div>
          <div className="font-semibold text-slate-800">{formatDuration(metrics.executionMinutes)}</div>
        </div>
        <div className="rounded-xl bg-slate-50/80 px-3 py-2 text-xs">
          <div className="text-slate-500">Total time</div>
          <div className="font-semibold text-slate-800">{formatDuration(metrics.totalMinutes)}</div>
        </div>
        <div className="rounded-xl bg-slate-50/80 px-3 py-2 text-xs">
          <div className="text-slate-500">Approval time</div>
          <div className="font-semibold text-slate-800">{formatDuration(metrics.approvalMinutes)}</div>
        </div>
      </div>
    </div>
  );
}
