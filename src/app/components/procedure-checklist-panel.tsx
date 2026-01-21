import { useEffect, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Checkbox } from '@/app/components/ui/checkbox';
import { Label } from '@/app/components/ui/label';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';

interface ProcedureChecklistPanelProps {
  companyId: string;
  equipmentId: string;
  equipmentCategory: string;
  accessToken: string;
  canEdit: boolean;
}

export function ProcedureChecklistPanel({
  companyId,
  equipmentId,
  equipmentCategory,
  accessToken,
  canEdit
}: ProcedureChecklistPanelProps) {
  const [procedures, setProcedures] = useState<any[]>([]);
  const [responses, setResponses] = useState<Record<string, Record<string, boolean>>>({});

  useEffect(() => {
    loadProcedures();
  }, [companyId, equipmentCategory]);

  const loadProcedures = async () => {
    try {
      const params = new URLSearchParams({ companyId });
      if (equipmentCategory) params.set('category', equipmentCategory);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/procedures?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await response.json();
      if (data.success) {
        setProcedures(data.procedures || []);
      }
    } catch (error) {
      console.error('Load procedure checklist error:', error);
    }
  };

  const toggleItem = (procedureId: string, itemId: string) => {
    setResponses((prev) => ({
      ...prev,
      [procedureId]: {
        ...prev[procedureId],
        [itemId]: !prev[procedureId]?.[itemId]
      }
    }));
  };

  const handleSubmit = async (procedureId: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/procedures/${procedureId}/checklist/complete`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            equipmentId,
            responses: responses[procedureId] || {}
          })
        }
      );
      const data = await response.json();
      if (data.success) {
        toast.success('Checklist completed');
      } else {
        toast.error(data.error || 'Failed to complete checklist');
      }
    } catch (error) {
      console.error('Complete checklist error:', error);
      toast.error('Failed to complete checklist');
    }
  };

  if (procedures.length === 0) {
    return (
      <div className="rounded-md border border-border bg-white p-3 text-xs text-slate-500">
        No procedures available for this equipment category.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {procedures.map((procedure) => (
        <div key={procedure.id} className="rounded-md border border-border bg-white p-3">
          <div className="text-sm font-semibold text-slate-900">{procedure.title}</div>
          <div className="text-xs text-slate-500">{procedure.description || '-'}</div>
          <div className="mt-3 space-y-2">
            {(procedure.checklist || []).map((item: any) => (
              <div key={item.id} className="flex items-center gap-2 text-sm text-slate-700">
                <Checkbox
                  id={`${procedure.id}-${item.id}`}
                  checked={!!responses[procedure.id]?.[item.id]}
                  onCheckedChange={() => toggleItem(procedure.id, item.id)}
                  disabled={!canEdit}
                />
                <Label htmlFor={`${procedure.id}-${item.id}`} className="text-sm text-slate-700">
                  {item.item}
                </Label>
              </div>
            ))}
          </div>
          {canEdit && (
            <Button size="sm" className="mt-3" onClick={() => handleSubmit(procedure.id)}>
              Submit checklist
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
