import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { downloadCsv } from '@/app/components/table-export';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';
import { getAuthHeaders } from '/utils/supabase/auth';

const detectDelimiter = (line: string) => {
  const counts = {
    ',': (line.match(/,/g) || []).length,
    ';': (line.match(/;/g) || []).length,
    '\t': (line.match(/\t/g) || []).length,
  };
  const delimiter = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || ',';
  return delimiter;
};

const parseCsvText = (csvText: string) => {
  const rows: string[][] = [];
  const lines = csvText.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const delimiter = detectDelimiter(lines[0]);
  for (const line of lines) {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === delimiter && !inQuotes) {
        values.push(current);
        current = '';
        continue;
      }
      current += char;
    }
    values.push(current);
    rows.push(values);
  }
  const headers = rows[0].map((header, index) => {
    const cleaned = index === 0 ? header.replace(/^\ufeff/, '') : header;
    return cleaned.trim();
  });
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] ?? '';
    });
    return obj;
  });
};

const normalizeKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '_');

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
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewCount, setPreviewCount] = useState(0);
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

  const handleFileChange = async (file?: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setImportErrors([]);
    setPreviewErrors([]);
    setPreviewRows([]);
    setPreviewCount(0);
    setImportedCount(null);
    setFile(file);
    try {
      const csvText = await file.text();
      const rows = parseCsvText(csvText);
      setPreviewCount(rows.length);

      const seen = new Set<string>();
      const errors: string[] = [];
      rows.forEach((row, index) => {
        const normalized = Object.fromEntries(
          Object.entries(row).map(([key, value]) => [normalizeKey(key), value])
        );
        const name = normalized.name || normalized.equipment || normalized.equipment_name;
        const category = normalized.category || normalized.equipment_category;
        const facility = normalized.facility_id || normalized.facility || normalized.facility_name || normalized.branch;
        if (!name || !category || !facility) {
          errors.push(`Row ${index + 2}: name, category, and facility are required`);
        }
        const serialNumber = normalized.serialnumber || normalized.serial_number || '';
        if (serialNumber && facility) {
          const key = `${String(facility).trim().toLowerCase()}:${String(serialNumber).trim().toLowerCase()}`;
          if (seen.has(key)) {
            errors.push(`Row ${index + 2}: duplicate serialNumber in file`);
          } else {
            seen.add(key);
          }
        }
      });

      const preview = rows.slice(0, 5).map((row) => {
        const normalized = Object.fromEntries(
          Object.entries(row).map(([key, value]) => [normalizeKey(key), value])
        );
        return {
          name: normalized.name || normalized.equipment || normalized.equipment_name || '',
          category: normalized.category || normalized.equipment_category || '',
          facility: normalized.facility_id || normalized.facility || normalized.facility_name || normalized.branch || '',
          location: normalized.location || '',
          serialNumber: normalized.serialnumber || normalized.serial_number || ''
        };
      });
      setPreviewRows(preview);
      setPreviewErrors(errors);
    } catch (error) {
      console.error('Parse CSV error:', error);
      setPreviewErrors(['Unable to parse CSV preview.']);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Upload a file to import');
      return;
    }

    setIsImporting(true);
    try {
      const { headers, token } = await getAuthHeaders(accessToken);
      if (!token) {
        toast.error('Session expired. Please sign in again.');
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('companyId', companyId);

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/equipment/import`, {
        method: 'POST',
        headers,
        body: formData
      });

      const data = await response.json();
      if (!data.success) {
        toast.error(data.error || 'Failed to import equipment');
        return;
      }

      const errorMessages = (data.errors || []).map((item: any) => `Row ${item.row}: ${item.error}`);
      setImportErrors(errorMessages);
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

          {previewErrors.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              <div className="font-semibold">Preview warnings</div>
              <ul className="mt-2 space-y-1">
                {previewErrors.slice(0, 5).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
              {previewErrors.length > 5 && <div className="mt-2">...and {previewErrors.length - 5} more</div>}
            </div>
          )}

          {previewRows.length > 0 && (
            <div className="rounded-xl border border-slate-200/70 bg-white/90 p-3 text-xs text-slate-600 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.5)]">
              <div className="font-semibold text-slate-700">Preview (first {previewRows.length} of {previewCount})</div>
              <div className="mt-2 grid gap-1">
                {previewRows.map((row, index) => (
                  <div key={`${row.name}-${index}`} className="grid grid-cols-5 gap-2">
                    <span className="truncate">{row.name || '-'}</span>
                    <span className="truncate">{row.category || '-'}</span>
                    <span className="truncate">{row.facility || '-'}</span>
                    <span className="truncate">{row.location || '-'}</span>
                    <span className="truncate">{row.serialNumber || '-'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {importErrors.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              <div className="font-semibold">Skipped rows</div>
              <ul className="mt-2 space-y-1">
                {importErrors.slice(0, 5).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
              {importErrors.length > 5 && <div className="mt-2">...and {importErrors.length - 5} more</div>}
            </div>
          )}

          <div className="rounded-xl border border-slate-200/70 bg-white/90 p-3 text-xs text-slate-600 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.5)]">
            <div>Imported: {importedCount ?? '-'}</div>
            <div>Errors: {importErrors.length}</div>
          </div>

          <Button onClick={handleImport} disabled={isImporting || !file} className="w-full">
            {isImporting ? 'Importing...' : 'Import Equipment'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
