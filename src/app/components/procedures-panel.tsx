import { useEffect, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { Textarea } from '@/app/components/ui/textarea';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';

interface ProceduresPanelProps {
  companyId: string;
  accessToken: string;
  canEdit: boolean;
}

export function ProceduresPanel({ companyId, accessToken, canEdit }: ProceduresPanelProps) {
  const [procedures, setProcedures] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isVersionOpen, setIsVersionOpen] = useState(false);
  const [selectedProcedure, setSelectedProcedure] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: '',
    equipmentCategory: '',
    description: '',
    checklist: '',
    document: null as File | null,
  });
  const [versionData, setVersionData] = useState({
    checklist: '',
    document: null as File | null,
  });

  useEffect(() => {
    loadProcedures();
  }, [companyId]);

  const loadProcedures = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/procedures?companyId=${companyId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await response.json();
      if (data.success) {
        setProcedures(data.procedures || []);
      }
    } catch (error) {
      console.error('Load procedures error:', error);
    }
  };

  const handleCreateProcedure = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = new FormData();
      payload.append('companyId', companyId);
      payload.append('title', formData.title);
      payload.append('equipmentCategory', formData.equipmentCategory);
      payload.append('description', formData.description);
      payload.append('checklist', JSON.stringify(
        formData.checklist
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean)
      ));
      if (formData.document) {
        payload.append('document', formData.document);
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/procedures`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: payload
        }
      );
      const data = await response.json();
      if (data.success) {
        toast.success('Procedure created');
        setIsCreateOpen(false);
        setFormData({ title: '', equipmentCategory: '', description: '', checklist: '', document: null });
        loadProcedures();
      } else {
        toast.error(data.error || 'Failed to create procedure');
      }
    } catch (error) {
      console.error('Create procedure error:', error);
      toast.error('Failed to create procedure');
    }
  };

  const handleCreateVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProcedure) return;
    try {
      const payload = new FormData();
      payload.append('checklist', JSON.stringify(
        versionData.checklist
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean)
      ));
      if (versionData.document) {
        payload.append('document', versionData.document);
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/procedures/${selectedProcedure.id}/versions`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: payload
        }
      );
      const data = await response.json();
      if (data.success) {
        toast.success('New version saved');
        setIsVersionOpen(false);
        setSelectedProcedure(null);
        setVersionData({ checklist: '', document: null });
        loadProcedures();
      } else {
        toast.error(data.error || 'Failed to create version');
      }
    } catch (error) {
      console.error('Create version error:', error);
      toast.error('Failed to create version');
    }
  };

  const filteredProcedures = procedures.filter((procedure) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return `${procedure.title} ${procedure.equipment_category || ''}`.toLowerCase().includes(query);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs text-slate-500">Search</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search procedures"
            className="h-8"
          />
        </div>
        {canEdit && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Add procedure</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create procedure</DialogTitle>
                <DialogDescription>Upload documents and define checklist items.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateProcedure} className="space-y-3">
                <div className="space-y-1">
                  <Label>Title</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Equipment category</Label>
                  <Input
                    value={formData.equipmentCategory}
                    onChange={(e) => setFormData({ ...formData, equipmentCategory: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Checklist (one per line)</Label>
                  <Textarea
                    value={formData.checklist}
                    onChange={(e) => setFormData({ ...formData, checklist: e.target.value })}
                    rows={4}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Procedure document</Label>
                  <Input type="file" onChange={(e) => setFormData({ ...formData, document: e.target.files?.[0] || null })} />
                </div>
                <Button type="submit" className="w-full">Create procedure</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="rounded-md border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Procedure</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Checklist</TableHead>
              <TableHead>Document</TableHead>
              {canEdit && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProcedures.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 6 : 5} className="text-center text-sm text-slate-500">
                  No procedures yet
                </TableCell>
              </TableRow>
            ) : (
              filteredProcedures.map((procedure) => (
                <TableRow key={procedure.id}>
                  <TableCell>
                    <div className="font-medium text-slate-900">{procedure.title}</div>
                    <div className="text-xs text-slate-500">{procedure.description || '-'}</div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{procedure.equipment_category || '-'}</TableCell>
                  <TableCell className="text-sm text-slate-600">{procedure.latestVersion?.version || '-'}</TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {procedure.checklist?.length || 0} items
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {procedure.latestVersion?.document_url ? (
                      <a href={procedure.latestVersion.document_url} className="text-emerald-700" target="_blank" rel="noreferrer">
                        Download
                      </a>
                    ) : '-'}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedProcedure(procedure);
                          setIsVersionOpen(true);
                        }}
                      >
                        New version
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isVersionOpen} onOpenChange={setIsVersionOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload new version</DialogTitle>
            <DialogDescription>{selectedProcedure?.title || 'Procedure'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateVersion} className="space-y-3">
            <div className="space-y-1">
              <Label>Checklist updates (one per line)</Label>
              <Textarea
                value={versionData.checklist}
                onChange={(e) => setVersionData({ ...versionData, checklist: e.target.value })}
                rows={4}
              />
            </div>
            <div className="space-y-1">
              <Label>Updated document</Label>
              <Input type="file" onChange={(e) => setVersionData({ ...versionData, document: e.target.files?.[0] || null })} />
            </div>
            <Button type="submit" className="w-full">Save version</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
