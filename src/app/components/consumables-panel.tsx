import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { Textarea } from '@/app/components/ui/textarea';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface ConsumablesPanelProps {
  companyId: string;
  accessToken: string;
  canEdit: boolean;
  canManage?: boolean;
  equipment: any[];
}

export function ConsumablesPanel({ companyId, accessToken, canEdit, canManage, equipment }: ConsumablesPanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [consumables, setConsumables] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [eventConsumableId, setEventConsumableId] = useState('');
  const [eventEquipmentId, setEventEquipmentId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadModule();
  }, [companyId]);

  useEffect(() => {
    if (enabled) {
      loadConsumables();
      loadEvents();
    }
  }, [enabled]);

  const canAdminister = canManage ?? canEdit;

  const loadModule = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/modules?companyId=${companyId}`,
        { headers: { Authorization: `Bearer ${accessToken}`, apikey: publicAnonKey } }
      );
      const data = await response.json();
      if (data.success) {
        setEnabled(!!data.modules?.consumables_enabled);
      }
    } catch (error) {
      console.error('Load modules error:', error);
    }
  };

  const loadConsumables = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/consumables?companyId=${companyId}`,
        { headers: { Authorization: `Bearer ${accessToken}`, apikey: publicAnonKey } }
      );
      const data = await response.json();
      if (data.success) {
        setConsumables(data.consumables || []);
        setEnabled(data.enabled !== false);
      }
    } catch (error) {
      console.error('Load consumables error:', error);
    }
  };

  const loadEvents = async () => {
    try {
      const params = new URLSearchParams({ companyId });
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/consumables/events?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}`, apikey: publicAnonKey } }
      );
      const data = await response.json();
      if (data.success) {
        setEvents(data.events || []);
      }
    } catch (error) {
      console.error('Load consumable events error:', error);
    }
  };

  const handleToggleModule = async () => {
    if (!companyId) {
      toast.error('Select a company before enabling modules');
      return;
    }
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/modules`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: publicAnonKey
          },
          body: JSON.stringify({ companyId, consumablesEnabled: !enabled })
        }
      );
      const data = await response.json();
      if (data.success) {
        setEnabled(!enabled);
        toast.success(`Consumables ${!enabled ? 'enabled' : 'disabled'}`);
        if (!enabled) {
          loadConsumables();
          loadEvents();
        }
      } else {
        toast.error(data.error || 'Failed to update module');
      }
    } catch (error) {
      console.error('Toggle module error:', error);
      toast.error('Failed to update module');
    }
  };

  const handleCreateConsumable = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/consumables`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: publicAnonKey
          },
          body: JSON.stringify({ companyId, name, unit })
        }
      );
      const data = await response.json();
      if (data.success) {
        toast.success('Consumable created');
        setName('');
        setUnit('');
        loadConsumables();
      } else {
        toast.error(data.error || 'Failed to create consumable');
      }
    } catch (error) {
      console.error('Create consumable error:', error);
      toast.error('Failed to create consumable');
    }
  };

  const handleLogEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/consumables/events`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: publicAnonKey
          },
          body: JSON.stringify({
            companyId,
            consumableId: eventConsumableId,
            equipmentId: eventEquipmentId || null,
            quantity: quantity ? parseFloat(quantity) : 0,
            notes
          })
        }
      );
      const data = await response.json();
      if (data.success) {
        toast.success('Usage logged');
        setEventConsumableId('');
        setEventEquipmentId('');
        setQuantity('');
        setNotes('');
        loadEvents();
      } else {
        toast.error(data.error || 'Failed to log usage');
      }
    } catch (error) {
      console.error('Log usage error:', error);
      toast.error('Failed to log usage');
    }
  };

  const consumableMap = useMemo(() => {
    return new Map(consumables.map((item) => [item.id, item]));
  }, [consumables]);

  const equipmentMap = useMemo(() => {
    return new Map(equipment.map((item) => [item.id, item]));
  }, [equipment]);

  if (!enabled) {
    return (
      <div className="rounded-md border border-border bg-white p-4">
        <div className="text-sm font-semibold text-slate-900">Consumables module</div>
        <p className="text-xs text-slate-500 mt-1">Enable consumables to track usage and servicing items.</p>
        {canAdminister ? (
          <Button variant="outline" className="mt-3" onClick={handleToggleModule}>
            Enable module
          </Button>
        ) : (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Ask a company admin to enable this module.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canAdminister && (
        <div className="rounded-md border border-border bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Module status</div>
              <div className="text-xs text-slate-500">Consumables tracking enabled</div>
            </div>
            <Button variant="outline" onClick={handleToggleModule}>
              Disable module
            </Button>
          </div>
        </div>
      )}

      {canAdminister && (
        <div className="rounded-md border border-border bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Add consumable</div>
          <form onSubmit={handleCreateConsumable} className="mt-3 grid gap-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Unit</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="liters, pcs, bottles" />
            </div>
            <Button type="submit">Create consumable</Button>
          </form>
        </div>
      )}

      <div className="rounded-md border border-border bg-white">
        <div className="border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">Consumables list</div>
          <div className="text-xs text-slate-500">Active service items</div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {consumables.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-sm text-slate-500">
                  No consumables yet
                </TableCell>
              </TableRow>
            ) : (
              consumables.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-slate-900">{item.name}</TableCell>
                  <TableCell className="text-sm text-slate-600">{item.unit || '-'}</TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {canEdit && (
        <div className="rounded-md border border-border bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Log usage</div>
          <form onSubmit={handleLogEvent} className="mt-3 grid gap-3">
            <div className="space-y-1">
              <Label>Consumable</Label>
              <Select value={eventConsumableId} onValueChange={setEventConsumableId}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select consumable" />
                </SelectTrigger>
                <SelectContent>
                  {consumables.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Equipment (optional)</Label>
              <Select value={eventEquipmentId} onValueChange={setEventEquipmentId}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select equipment" />
                </SelectTrigger>
                <SelectContent>
                  {equipment.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Quantity</Label>
              <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" step="0.01" required />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
            <Button type="submit" disabled={!eventConsumableId}>Log usage</Button>
          </form>
        </div>
      )}

      <div className="rounded-md border border-border bg-white">
        <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Usage log</div>
            <div className="text-xs text-slate-500">Consumable history</div>
          </div>
          <div className="ml-auto flex items-end gap-2">
            <div>
              <Label className="text-xs text-slate-500">From</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">To</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8" />
            </div>
            <Button variant="outline" className="h-8" onClick={loadEvents}>Filter</Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Consumable</TableHead>
              <TableHead>Equipment</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Logged by</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-slate-500">
                  No usage logs yet
                </TableCell>
              </TableRow>
            ) : (
              events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-medium text-slate-900">{consumableMap.get(event.consumable_id)?.name || '-'}</TableCell>
                  <TableCell className="text-sm text-slate-600">{equipmentMap.get(event.equipment_id)?.name || '-'}</TableCell>
                  <TableCell className="text-sm text-slate-600">{event.quantity || 0}</TableCell>
                  <TableCell className="text-sm text-slate-600">{event.actor_name || '-'}</TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {event.created_at ? new Date(event.created_at).toLocaleDateString() : '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
