import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { toast } from 'sonner';
import { Check, Clock, X } from 'lucide-react';
import { projectId } from '/utils/supabase/info';

interface ContractorInvitationsPanelProps {
  accessToken: string;
  onInvitationHandled: () => void;
}

export function ContractorInvitationsPanel({ accessToken, onInvitationHandled }: ContractorInvitationsPanelProps) {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const loadInvitations = async () => {
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/contractor-invitations`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        cache: 'no-store'
      });

      const data = await response.json();
      if (data.success) {
        setInvitations(data.invitations.filter((inv: any) => inv.status === 'pending'));
      }
    } catch (error) {
      console.error('Failed to load invitations:', error);
      toast.error('Failed to load invitations');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInvitations();
  }, []);

  const handleRespond = async (invitationId: string, status: 'approved' | 'rejected') => {
    setRespondingTo(invitationId);
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/contractor-invitations/${invitationId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ status })
      });

      const data = await response.json();
      if (!data.success) {
        toast.error(data.error || 'Failed to respond to invitation');
        return;
      }

      toast.success(status === 'approved' ? 'Invitation accepted' : 'Invitation declined');
      await loadInvitations();
      if (status === 'approved') {
        onInvitationHandled();
      }
    } catch (error) {
      console.error('Respond invitation error:', error);
      toast.error('Failed to respond to invitation');
    } finally {
      setRespondingTo(null);
    }
  };

  return (
    <Card className="bg-white/90">
      <CardHeader>
        <CardTitle>Invitations</CardTitle>
        <CardDescription>Companies waiting for your response.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading invitations...</p>
        ) : invitations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No pending invitations yet.
          </div>
        ) : (
          invitations.map((invitation) => (
            <div key={invitation.id} className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.5)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{invitation.companyName}</p>
                  <p className="text-xs text-slate-500">Invited by {invitation.invitedByName}</p>
                </div>
                <Badge className="bg-amber-100 text-amber-800">
                  <Clock className="mr-1 h-3 w-3" />
                  Pending
                </Badge>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={respondingTo === invitation.id}
                  onClick={() => handleRespond(invitation.id, 'approved')}
                >
                  <Check className="mr-2 h-4 w-4" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={respondingTo === invitation.id}
                  onClick={() => handleRespond(invitation.id, 'rejected')}
                >
                  <X className="mr-2 h-4 w-4" />
                  Decline
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
