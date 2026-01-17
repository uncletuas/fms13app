import { useState, useEffect } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { toast } from 'sonner';
import { Building2, Check, X, Clock, LogOut } from 'lucide-react';
import { projectId } from '/utils/supabase/info';

interface ContractorInvitationsProps {
  user: any;
  accessToken: string;
  onLogout: () => void;
  onInvitationHandled: () => void;
}

export function ContractorInvitations({ user, accessToken, onLogout, onInvitationHandled }: ContractorInvitationsProps) {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/contractor-invitations`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
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

      if (data.success) {
        toast.success(status === 'approved' ? 'Invitation accepted!' : 'Invitation declined');
        
        // Reload invitations
        await loadInvitations();
        
        // If approved, notify parent to refresh company bindings
        if (status === 'approved') {
          setTimeout(() => {
            onInvitationHandled();
          }, 1000);
        }
      } else {
        toast.error(data.error || 'Failed to respond to invitation');
      }
    } catch (error) {
      console.error('Failed to respond:', error);
      toast.error('Failed to respond to invitation');
    } finally {
      setRespondingTo(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-lg">Loading invitations...</div>
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                <Building2 className="w-7 h-7 text-white" />
              </div>
              <div>
                <CardTitle>No Pending Invitations</CardTitle>
                <CardDescription>You don't have any company assignments yet</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              You are registered as a contractor but haven't been assigned to any companies yet. 
              Company administrators can invite you using your Contractor ID:
            </p>
            <div className="bg-gray-100 p-4 rounded-lg mb-4">
              <p className="text-sm text-gray-600 mb-1">Your Contractor ID</p>
              <p className="font-mono text-lg font-semibold">{user.id}</p>
            </div>
            <Button onClick={onLogout} variant="outline" className="w-full">
              Logout
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-3xl mx-auto py-8">
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Building2 className="w-7 h-7 text-white" />
                </div>
                <div>
                  <CardTitle>Company Invitations</CardTitle>
                  <CardDescription>Review and respond to company invitations</CardDescription>
                </div>
              </div>
              <Button onClick={onLogout} variant="outline" size="sm">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </CardHeader>
        </Card>

        <div className="space-y-4">
          {invitations.map((invitation) => (
            <Card key={invitation.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{invitation.companyName}</CardTitle>
                    <CardDescription>
                      Invited by {invitation.invitedByName}
                    </CardDescription>
                  </div>
                  <Badge className="bg-yellow-100 text-yellow-800">
                    <Clock className="w-3 h-3 mr-1" />
                    Pending
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">Invitation Details</p>
                    <p className="text-sm mt-1">
                      You have been invited to work as a contractor for <strong>{invitation.companyName}</strong>.
                    </p>
                  </div>
                  
                  {invitation.categories && invitation.categories.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Assigned Categories</p>
                      <div className="flex flex-wrap gap-2">
                        {invitation.categories.map((cat: string, index: number) => (
                          <Badge key={index} variant="secondary">{cat}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-sm text-gray-500">
                      Invited on {new Date(invitation.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => handleRespond(invitation.id, 'approved')}
                    disabled={respondingTo === invitation.id}
                    className="flex-1"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    {respondingTo === invitation.id ? 'Accepting...' : 'Accept Invitation'}
                  </Button>
                  <Button
                    onClick={() => handleRespond(invitation.id, 'rejected')}
                    disabled={respondingTo === invitation.id}
                    variant="outline"
                    className="flex-1"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Decline
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
