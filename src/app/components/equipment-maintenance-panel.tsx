import { useEffect, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';

interface EquipmentMaintenancePanelProps {
  equipmentId: string;
  accessToken: string;
  canEdit: boolean;
}

export function EquipmentMaintenancePanel({ equipmentId, accessToken, canEdit }: EquipmentMaintenancePanelProps) {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [scheduleType, setScheduleType] = useState<'time' | 'usage'>('time');
  const [intervalMonths, setIntervalMonths] = useState('');
  const [intervalHours, setIntervalHours] = useState('');
  const [nextDueAt, setNextDueAt] = useState('');
  const [nextDueHours, setNextDueHours] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadSchedules();
  }, [equipmentId]);

  const loadSchedules = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/maintenance-schedules?equipmentId=${equipmentId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );
      const data = await response.json();
      if (data.success) {
        setSchedules(data.schedules || []);
      }
    } catch (error) {
      console.error('Load maintenance schedules error:', error);
    }
  };

  const handleCreateSchedule = async () => {
    setIsLoading(true);
    try {
      const payload = {
        equipmentId,
        scheduleType,
        intervalMonths: intervalMonths ? parseInt(intervalMonths, 10) : null,
        intervalHours: intervalHours ? parseInt(intervalHours, 10) : null,
        nextDueAt: nextDueAt || null,
        nextDueHours: nextDueHours ? parseInt(nextDueHours, 10) : null
      };

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/maintenance-schedules`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify(payload)
        }
      );
      const data = await response.json();
      if (data.success) {
        toast.success('Maintenance schedule created');
        setIntervalMonths('');
        setIntervalHours('');
        setNextDueAt('');
        setNextDueHours('');
        loadSchedules();
      } else {
        toast.error(data.error || 'Failed to create schedule');
      }
    } catch (error) {
      console.error('Create schedule error:', error);
      toast.error('Failed to create schedule');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteSchedule = async (schedule: any) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/maintenance-schedules/${schedule.id}/complete`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            nextDueAt: schedule.schedule_type === 'time' ? nextDueAt || null : null,
            nextDueHours: schedule.schedule_type === 'usage' ? (nextDueHours ? parseInt(nextDueHours, 10) : null) : null
          })
        }
      );
      const data = await response.json();
      if (data.success) {
        toast.success('Maintenance logged');
        loadSchedules();
      } else {
        toast.error(data.error || 'Failed to log maintenance');
      }
    } catch (error) {
      console.error('Complete schedule error:', error);
      toast.error('Failed to log maintenance');
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold text-slate-900">Maintenance schedules</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Interval</TableHead>
            <TableHead>Next due</TableHead>
            {canEdit && <TableHead>Action</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {schedules.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canEdit ? 4 : 3} className="text-center text-sm text-slate-500">
                No schedules yet
              </TableCell>
            </TableRow>
          ) : (
            schedules.map((schedule) => (
              <TableRow key={schedule.id}>
                <TableCell className="text-sm text-slate-700">{schedule.schedule_type}</TableCell>
                <TableCell className="text-sm text-slate-600">
                  {schedule.schedule_type === 'time'
                    ? `${schedule.interval_months || '-'} months`
                    : `${schedule.interval_hours || '-'} hours`}
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  {schedule.next_due_at ? new Date(schedule.next_due_at).toLocaleString() : schedule.next_due_hours || '-'}
                </TableCell>
                {canEdit && (
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => handleCompleteSchedule(schedule)}>
                      Mark complete
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {canEdit && (
        <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.5)]">
          <div className="text-xs font-semibold text-slate-700">Add schedule</div>
          <div className="mt-3 grid gap-3">
            <div className="space-y-1">
              <Label>Schedule type</Label>
              <Select value={scheduleType} onValueChange={(value) => setScheduleType(value as 'time' | 'usage')}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="time">Time-based</SelectItem>
                  <SelectItem value="usage">Usage-based</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scheduleType === 'time' ? (
              <>
                <div className="space-y-1">
                  <Label>Interval (months)</Label>
                  <Input value={intervalMonths} onChange={(e) => setIntervalMonths(e.target.value)} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label>Next due date</Label>
                  <Input type="datetime-local" value={nextDueAt} onChange={(e) => setNextDueAt(e.target.value)} className="h-8" />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <Label>Interval (hours)</Label>
                  <Input value={intervalHours} onChange={(e) => setIntervalHours(e.target.value)} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label>Next due hours</Label>
                  <Input value={nextDueHours} onChange={(e) => setNextDueHours(e.target.value)} className="h-8" />
                </div>
              </>
            )}
            <Button onClick={handleCreateSchedule} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Create schedule'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
