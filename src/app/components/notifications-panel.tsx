import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { toast } from 'sonner';
import { Bell, Check, Mail, RefreshCw, X } from 'lucide-react';
import { projectId } from '/utils/supabase/info';

interface NotificationsPanelProps {
  accessToken: string;
  onInvitationHandled?: () => void;
}

export function NotificationsPanel({ accessToken, onInvitationHandled }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState<string | null>(null);

  const invitationMap = useMemo(() => {
    const map: Record<string, any> = {};
    invitations.forEach((inv) => {
      map[inv.id] = inv;
    });
    return map;
  }, [invitations]);

  const loadNotifications = async () => {
    setIsRefreshing(true);
    try {
      const notificationsResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/notifications`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      const notificationsData = await notificationsResponse.json();
      if (notificationsData.success) {
        setNotifications(notificationsData.notifications || []);
      }
    } catch (error) {
      console.error('Load notifications error:', error);
      toast.error('Failed to load notifications');
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }

    try {
      const invitationsResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/contractor-invitations`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      const invitationsData = await invitationsResponse.json();
      if (invitationsData.success) {
        setInvitations(invitationsData.invitations || []);
      }
    } catch (error) {
      console.error('Load invitations error:', error);
    }
  };

  useEffect(() => {
    if (accessToken) {
      loadNotifications();
    }
  }, [accessToken]);

  const markAsRead = async (notificationId: string) => {
    setMarkingRead(notificationId);
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const data = await response.json();
      if (!data.success) {
        toast.error(data.error || 'Failed to mark as read');
        return;
      }
      setNotifications((prev) => prev.map((item) => item.id === notificationId ? { ...item, read: true } : item));
    } catch (error) {
      console.error('Mark read error:', error);
      toast.error('Failed to mark as read');
    } finally {
      setMarkingRead(null);
    }
  };

  const handleInvitationResponse = async (notificationId: string, invitationId: string, status: 'approved' | 'rejected') => {
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
      await markAsRead(notificationId);
      await loadNotifications();
      if (status === 'approved' && onInvitationHandled) {
        onInvitationHandled();
      }
    } catch (error) {
      console.error('Invitation response error:', error);
      toast.error('Failed to respond to invitation');
    } finally {
      setRespondingTo(null);
    }
  };

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-slate-600" />
            Notifications
          </CardTitle>
          <CardDescription>Invitations and status updates for your work.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={loadNotifications} disabled={isRefreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading notifications...</p>
        ) : notifications.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No notifications yet.
          </div>
        ) : (
          notifications.map((notification) => {
            const invitation = notification.invitationId ? invitationMap[notification.invitationId] : null;
            const isInvitation = notification.type === 'contractor_invitation' || !!invitation;
            const invitationStatus = invitation?.status || 'pending';
            const isPending = invitationStatus === 'pending';

            return (
              <div key={notification.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {isInvitation && invitation?.companyName
                        ? `Invitation from ${invitation.companyName}`
                        : notification.message}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <Mail className="h-3 w-3" />
                      <span>{new Date(notification.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                  <Badge className={notification.read ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-700'}>
                    {notification.read ? 'Read' : 'New'}
                  </Badge>
                </div>

                {isInvitation && (
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <p>
                      You have been invited to join <span className="font-semibold">{invitation?.companyName || 'a company'}</span> as a contractor.
                    </p>
                    {invitation?.invitedByName && (
                      <p className="text-xs text-slate-500">Invited by {invitation.invitedByName}</p>
                    )}
                    {invitation?.categories?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {invitation.categories.map((category: string) => (
                          <Badge key={category} variant="secondary">{category}</Badge>
                        ))}
                      </div>
                    )}
                    {invitation?.facilityIds?.length > 0 && (
                      <p className="text-xs text-slate-500">
                        Facilities: {invitation.facilityIds.join(', ')}
                      </p>
                    )}
                    {isPending ? (
                      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                        Review the invitation details, then choose Accept or Decline. Accepting adds the company to your switcher and unlocks job access.
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Invitation status: {invitationStatus}</p>
                    )}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {isInvitation && isPending && (
                    <>
                      <Button
                        size="sm"
                        disabled={respondingTo === invitation?.id}
                        onClick={() => handleInvitationResponse(notification.id, invitation.id, 'approved')}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={respondingTo === invitation?.id}
                        onClick={() => handleInvitationResponse(notification.id, invitation.id, 'rejected')}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Decline
                      </Button>
                    </>
                  )}
                  {!notification.read && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={markingRead === notification.id}
                      onClick={() => markAsRead(notification.id)}
                    >
                      Mark as read
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
