import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Clock, User } from 'lucide-react';
import { projectId } from '/utils/supabase/info';

interface ActivityLogProps {
  entityType: 'company' | 'facility' | 'equipment' | 'issue' | 'user';
  entityId: string;
  accessToken: string;
  title?: string;
}

export function ActivityLog({ entityType, entityId, accessToken, title }: ActivityLogProps) {
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadActivities();
  }, [entityType, entityId]);

  const loadActivities = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/activity/${entityType}/${entityId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      const data = await response.json();

      if (data.success) {
        setActivities(data.activities);
      }
    } catch (error) {
      console.error('Load activities error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('created')) return 'bg-green-100 text-green-800';
    if (action.includes('updated')) return 'bg-blue-100 text-blue-800';
    if (action.includes('deleted') || action.includes('archived')) return 'bg-red-100 text-red-800';
    if (action.includes('assigned')) return 'bg-primary/10 text-primary border border-primary/20';
    if (action.includes('completed')) return 'bg-teal-100 text-teal-800';
    if (action.includes('approved')) return 'bg-indigo-100 text-indigo-800';
    if (action.includes('escalated')) return 'bg-orange-100 text-orange-800';
    return 'bg-slate-100 text-slate-700 border border-slate-200/70';
  };

  const formatAction = (action: string) => {
    return action.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title || 'Activity Log'}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-500">Loading activities...</p>
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title || 'Activity Log'}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-500">No activity recorded yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title || 'Activity Log'}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity, index) => (
            <div 
              key={activity.id}
              className={`flex gap-4 pb-4 ${index !== activities.length - 1 ? 'border-b border-slate-200/60' : ''}`}
            >
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 shadow-[0_8px_16px_-12px_rgba(15,23,42,0.5)]">
                <User className="w-5 h-5 text-primary" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <p className="font-medium">{activity.userName}</p>
                    <p className="text-sm text-slate-500">{activity.userRole.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</p>
                  </div>
                  <Badge className={getActionBadgeColor(activity.action)}>
                    {formatAction(activity.action)}
                  </Badge>
                </div>
                
                {activity.details && Object.keys(activity.details).length > 0 && (
                  <div className="mt-2 p-3 bg-slate-50/80 rounded-xl text-sm">
                    {Object.entries(activity.details).map(([key, value]: [string, any]) => (
                      <div key={key} className="text-slate-600">
                        <span className="font-medium">{key}:</span> {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                  <Clock className="w-3 h-3" />
                  {formatTimestamp(activity.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
