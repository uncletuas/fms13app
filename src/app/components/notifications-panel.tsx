import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { toast } from 'sonner';
import { Bell, Check, Mail, RefreshCw, X } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface NotificationsPanelProps {
  accessToken: string;
  onInvitationHandled?: () => void;
  onUnreadCount?: (count: number) => void;
}

export function NotificationsPanel({ accessToken, onInvitationHandled, onUnreadCount }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState<string | null>(null);
  const unreadCount = notifications.filter((item) => !item.read).length;

  useEffect(() => {
    onUnreadCount?.(unreadCount);
  }, [unreadCount, onUnreadCount]);

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
        headers: { 'Authorization': `Bearer ${accessToken}`, apikey: publicAnonKey },
        cache: 'no-store'
      });
      const notificationsData = await notificationsResponse.json();
      if (notificationsData.success) {
        const nextNotifications = notificationsData.notifications || [];
        setNotifications(nextNotifications);
        onUnreadCount?.(nextNotifications.filter((item: any) => !item.read).length);
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
        headers: { 'Authorization': `Bearer ${accessToken}`, apikey: publicAnonKey },
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
        headers: { 'Authorization': `Bearer ${accessToken}`, apikey: publicAnonKey }
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
          'Authorization': `Bearer ${accessToken}`,
          apikey: publicAnonKey
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

  const getTone = (notification: any, isInvitation: boolean) => {
    if (isInvitation) {
      return {
        border: 'border-emerald-200',
        bg: 'bg-emerald-50/60',
        accent: 'bg-emerald-500',
        iconBg: 'bg-emerald-100 text-emerald-700',
        chip: notification.read ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-200 text-emerald-800'
      };
    }
    if (notification.type?.includes('completed')) {
      return {
        border: 'border-sky-200',
        bg: 'bg-sky-50/70',
        accent: 'bg-sky-500',
        iconBg: 'bg-sky-100 text-sky-700',
        chip: notification.read ? 'bg-sky-100 text-sky-700' : 'bg-sky-200 text-sky-800'
      };
    }
    if (notification.type?.includes('rejected')) {
      return {
        border: 'border-rose-200',
        bg: 'bg-rose-50/70',
        accent: 'bg-rose-500',
        iconBg: 'bg-rose-100 text-rose-700',
        chip: notification.read ? 'bg-rose-100 text-rose-700' : 'bg-rose-200 text-rose-800'
      };
    }
    return {
      border: 'border-slate-200',
      bg: 'bg-slate-50/80',
      accent: 'bg-slate-400',
      iconBg: 'bg-slate-100 text-slate-600',
      chip: notification.read ? 'bg-slate-100 text-slate-600' : 'bg-slate-200 text-slate-700'
    };
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold text-slate-900">Notifications</div>
            <p className="text-xs text-slate-500">Invitations and status updates for your work.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-100 text-emerald-700">{unreadCount} new</Badge>
          <Button variant="outline" size="sm" onClick={loadNotifications} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>
      <div className="space-y-4 p-5">
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
            const tone = getTone(notification, isInvitation);

            return (
              <div key={notification.id} className={`relative overflow-hidden rounded-xl border ${tone.border} ${tone.bg} p-4 pl-5`}>
                <span className={`absolute left-0 top-0 h-full w-1 ${tone.accent}`} />
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-full ${tone.iconBg}`}>
                      {isInvitation ? <Mail className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {isInvitation && invitation?.companyName
                          ? `Invitation from ${invitation.companyName}`
                          : notification.message}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <span>{new Date(notification.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <Badge className={tone.chip}>{notification.read ? 'Read' : 'New'}</Badge>
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
                          <Badge key={category} className="bg-slate-100 text-slate-700">{category}</Badge>
                        ))}
                      </div>
                    )}
                    {invitation?.facilityIds?.length > 0 && (
                      <p className="text-xs text-slate-500">
                        Facilities: {invitation.facilityIds.join(', ')}
                      </p>
                    )}
                    {isPending ? (
                      <div className="mt-3 rounded-lg bg-white/70 p-3 text-xs text-slate-600">
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
      </div>
    </div>
  );
}
