import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { toast } from 'sonner';
import { CheckCircle, XCircle, FileText } from 'lucide-react';
import { projectId } from '/utils/supabase/info';

interface JobActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: any;
  action: 'respond' | 'complete';
  accessToken: string;
  onSuccess: () => void;
}

export function JobActionModal({ isOpen, onClose, job, action, accessToken, onSuccess }: JobActionModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const jobLabel = job?.taskType === 'general' || !job?.equipmentId ? 'Task' : 'Equipment';
  
  // Response data
  const [decision, setDecision] = useState<'accepted' | 'rejected'>('accepted');
  const [reason, setReason] = useState('');
  const [proposedCost, setProposedCost] = useState('');
  const [proposal, setProposal] = useState('');
  const [proposalFiles, setProposalFiles] = useState<File[]>([]);
  
  // Completion data
  const [executionReport, setExecutionReport] = useState('');
  const [workPerformed, setWorkPerformed] = useState('');
  const [partsUsed, setPartsUsed] = useState('');
  const [finalCost, setFinalCost] = useState('');
  const [proofDocuments, setProofDocuments] = useState('');
  const [reportFiles, setReportFiles] = useState<File[]>([]);

  const uploadAttachments = async (kind: string, files: File[]) => {
    if (!files.length) return [];
    const attachments = [];

    for (const file of files) {
      const formData = new FormData();
      formData.append('issueId', job.id);
      formData.append('kind', kind);
      formData.append('file', file);

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/uploads`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        body: formData
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to upload attachment');
      }
      attachments.push(data.attachment);
    }

    return attachments;
  };

  const handleRespond = async () => {
    setIsLoading(true);
    try {
      const proposalAttachments = await uploadAttachments('proposal', proposalFiles);
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/issues/${job.id}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          decision,
          reason: decision === 'rejected' ? reason : undefined,
          proposedCost: proposedCost ? parseFloat(proposedCost) : 0,
          proposal,
          proposalAttachments
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Job ${decision}!`);
        onSuccess();
        onClose();
      } else {
        toast.error(data.error || 'Failed to respond to job');
      }
    } catch (error) {
      console.error('Job response error:', error);
      toast.error('Failed to respond to job');
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!executionReport.trim()) {
      toast.error('Execution report is required');
      return;
    }

    setIsLoading(true);
    try {
      // Parse parts used from comma-separated string
      const partsArray = partsUsed
        .split(',')
        .map(part => part.trim())
        .filter(part => part.length > 0);

      const reportAttachments = await uploadAttachments('report', reportFiles);
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/issues/${job.id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          executionReport,
          workPerformed,
          partsUsed: partsArray,
          finalCost: finalCost ? parseFloat(finalCost) : 0,
          proofDocuments: proofDocuments.split(',').map(doc => doc.trim()).filter(doc => doc.length > 0),
          reportAttachments
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Job completed successfully!');
        onSuccess();
        onClose();
      } else {
        toast.error(data.error || 'Failed to complete job');
      }
    } catch (error) {
      console.error('Job completion error:', error);
      toast.error('Failed to complete job');
    } finally {
      setIsLoading(false);
    }
  };

  if (action === 'respond') {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Respond to Job Assignment</DialogTitle>
            <DialogDescription>
              Review the job details and decide whether to accept or reject this assignment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-white/80 border border-slate-200/70 p-4 rounded-2xl space-y-2 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.5)]">
              <p className="text-sm"><strong>{jobLabel}:</strong> {job.equipmentName}</p>
              <p className="text-sm"><strong>Description:</strong> {job.description}</p>
              <p className="text-sm"><strong>Priority:</strong> <span className={`font-semibold ${job.priority === 'high' ? 'text-red-600' : job.priority === 'medium' ? 'text-yellow-600' : 'text-green-600'}`}>{job.priority}</span></p>
            </div>

            <div className="space-y-2">
              <Label>Decision</Label>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant={decision === 'accepted' ? 'default' : 'outline'}
                  onClick={() => setDecision('accepted')}
                  className="flex-1"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Accept
                </Button>
                <Button
                  type="button"
                  variant={decision === 'rejected' ? 'destructive' : 'outline'}
                  onClick={() => setDecision('rejected')}
                  className="flex-1"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </Button>
              </div>
            </div>

            {decision === 'rejected' && (
              <div className="space-y-2">
                <Label htmlFor="reason">Reason for Rejection *</Label>
                <Textarea
                  id="reason"
                  placeholder="Please explain why you're rejecting this job..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                />
              </div>
            )}

            {decision === 'accepted' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="proposedCost">Proposed Cost (NGN)</Label>
                  <Input
                    id="proposedCost"
                    type="number"
                    placeholder="0.00"
                    value={proposedCost}
                    onChange={(e) => setProposedCost(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="proposal">Proposal / Work Plan</Label>
                  <Textarea
                    id="proposal"
                    placeholder="Describe your approach to fixing this issue..."
                    value={proposal}
                    onChange={(e) => setProposal(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="proposal-files">Quote Attachments</Label>
                  <Input
                    id="proposal-files"
                    type="file"
                    multiple
                    onChange={(e) => setProposalFiles(Array.from(e.target.files || []))}
                  />
                  <p className="text-xs text-slate-500">Attach quotes, diagrams, or supporting files.</p>
                </div>
              </>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleRespond}
                className="flex-1"
                disabled={isLoading || (decision === 'rejected' && !reason.trim())}
              >
                {isLoading ? 'Submitting...' : 'Submit Response'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Completion form
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Complete Job</DialogTitle>
          <DialogDescription>
            Submit your execution report and details about the completed work.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-white/80 border border-slate-200/70 p-4 rounded-2xl space-y-2 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.5)]">
            <p className="text-sm"><strong>{jobLabel}:</strong> {job.equipmentName}</p>
            <p className="text-sm"><strong>Description:</strong> {job.description}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="executionReport">Execution Report *</Label>
            <Textarea
              id="executionReport"
              placeholder="Provide a detailed report of the work performed..."
              value={executionReport}
              onChange={(e) => setExecutionReport(e.target.value)}
              rows={5}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="workPerformed">Work Performed</Label>
            <Textarea
              id="workPerformed"
              placeholder="Describe the specific tasks completed..."
              value={workPerformed}
              onChange={(e) => setWorkPerformed(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="partsUsed">Parts Used (comma-separated)</Label>
            <Input
              id="partsUsed"
              type="text"
              placeholder="e.g., Motor, Belt, Filter"
              value={partsUsed}
              onChange={(e) => setPartsUsed(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="finalCost">Final Cost (NGN) *</Label>
            <Input
              id="finalCost"
              type="number"
              placeholder="0.00"
              value={finalCost}
              onChange={(e) => setFinalCost(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="proofDocuments">Proof Documents (comma-separated URLs)</Label>
            <Input
              id="proofDocuments"
              type="text"
              placeholder="e.g., https://example.com/photo1.jpg, https://example.com/photo2.jpg"
              value={proofDocuments}
              onChange={(e) => setProofDocuments(e.target.value)}
            />
            <p className="text-xs text-slate-500">Enter URLs to photos or documents as proof of completion</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-files">Report Attachments</Label>
            <Input
              id="report-files"
              type="file"
              multiple
              onChange={(e) => setReportFiles(Array.from(e.target.files || []))}
            />
            <p className="text-xs text-slate-500">Attach completion photos, invoices, or documents.</p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleComplete}
              className="flex-1"
              disabled={isLoading}
            >
              <FileText className="w-4 h-4 mr-2" />
              {isLoading ? 'Submitting...' : 'Complete Job'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
