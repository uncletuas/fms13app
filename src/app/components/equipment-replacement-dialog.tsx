import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';

interface EquipmentReplacementDialogProps {
  equipment: any;
  accessToken: string;
  canEdit: boolean;
  onReplaced: () => void;
}

export function EquipmentReplacementDialog({ equipment, accessToken, canEdit, onReplaced }: EquipmentReplacementDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: equipment?.name || '',
    category: equipment?.category || '',
    brand: equipment?.brand || '',
    model: equipment?.model || '',
    serialNumber: '',
    location: equipment?.location || '',
    reason: ''
  });
  const [isSaving, setIsSaving] = useState(false);

  if (!canEdit) return null;

  const handleReplace = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/equipment/${equipment.id}/replace`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          reason: form.reason,
          newEquipment: {
            name: form.name,
            category: form.category,
            brand: form.brand,
            model: form.model,
            serialNumber: form.serialNumber,
            location: form.location,
            facilityId: equipment.facilityId
          }
        })
      });
      const data = await response.json();
      if (data.success) {
        toast.success('Equipment replaced');
        setOpen(false);
        onReplaced();
      } else {
        toast.error(data.error || 'Failed to replace equipment');
      }
    } catch (error) {
      console.error('Replace equipment error:', error);
      toast.error('Failed to replace equipment');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Replace equipment</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Replace equipment</DialogTitle>
          <DialogDescription>Create a new equipment record linked to this replacement.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleReplace} className="space-y-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="space-y-1">
            <Label>Category</Label>
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
          </div>
          <div className="space-y-1">
            <Label>Brand</Label>
            <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Model</Label>
            <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Serial number</Label>
            <Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Location</Label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Replacement reason</Label>
            <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} />
          </div>
          <Button type="submit" className="w-full" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Confirm replacement'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
