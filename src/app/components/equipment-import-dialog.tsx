import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { downloadCsv } from '@/app/components/table-export';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';

interface EquipmentImportDialogProps {
  companyId: string;
  accessToken: string;
  onImported: () => void;
  triggerLabel?: string;
}

export function EquipmentImportDialog({
  companyId,
  accessToken,
  onImported,
  triggerLabel = 'Import CSV',
}: EquipmentImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const templateHeaders = [
    { label: 'name', value: () => '' },
    { label: 'category', value: () => '' },
    { label: 'facility', value: () => '' },
    { label: 'location', value: () => '' },
    { label: 'brand', value: () => '' },
    { label: 'model', value: () => '' },
    { label: 'serialNumber', value: () => '' },
    { label: 'contractorId', value: () => '' },
    { label: 'healthStatus', value: () => '' },
    { label: 'installDate', value: () => '' },
    { label: 'warrantyPeriod', value: () => '' },
  ];

  const handleFileChange = (file?: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setErrors([]);
    setImportedCount(null);
    setFile(file);
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Upload a file to import');
      return;
    }

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('companyId', companyId);

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/equipment/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        body: formData
      });

      const data = await response.json();
      if (!data.success) {
        toast.error(data.error || 'Failed to import equipment');
        return;
      }

      const errorMessages = (data.errors || []).map((item: any) => `Row ${item.row}: ${item.error}`);
      setErrors(errorMessages);
      setImportedCount(data.created.length);
      if (data.errors?.length) {
        toast.error(`Imported ${data.created.length} items with ${data.errors.length} errors`);
      } else {
        toast.success(`Imported ${data.created.length} equipment records`);
      }

      onImported();
    } catch (error) {
      console.error('Import equipment error:', error);
      toast.error('Failed to import equipment');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import Equipment</DialogTitle>
          <DialogDescription>Upload a CSV file to add equipment in bulk.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-slate-500">Template</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCsv('equipment-import-template.csv', templateHeaders, [{}])}
              >
                Download CSV template
              </Button>
              <span className="text-xs text-slate-500">Use facility name or ID in the facility column.</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="equipment-import">Upload file</Label>
            <Input
              id="equipment-import"
              type="file"
              accept=".csv"
              onChange={(e) => handleFileChange(e.target.files?.[0])}
            />
            {fileName && <p className="text-xs text-slate-500">Loaded: {fileName}</p>}
          </div>

          {errors.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              <div className="font-semibold">Skipped rows</div>
              <ul className="mt-2 space-y-1">
                {errors.slice(0, 5).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
              {errors.length > 5 && <div className="mt-2">...and {errors.length - 5} more</div>}
            </div>
          )}

          <div className="rounded-md border border-border bg-white p-3 text-xs text-slate-600">
            <div>Imported: {importedCount ?? '-'}</div>
            <div>Errors: {errors.length}</div>
          </div>

          <Button onClick={handleImport} disabled={isImporting || !file} className="w-full">
            {isImporting ? 'Importing...' : 'Import Equipment'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
