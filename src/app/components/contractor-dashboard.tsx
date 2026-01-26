import { useState, useEffect } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Badge } from '@/app/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Tabs, TabsContent } from '@/app/components/ui/tabs';
import { ContactCard } from '@/app/components/contact-card';
import { ActivityLog } from '@/app/components/activity-log';
import { JobActionModal } from '@/app/components/job-action-modal';
import { ProfileSettings } from '@/app/components/profile-settings';
import { NotificationsPanel } from '@/app/components/notifications-panel';
import { MobileBottomNav } from '@/app/components/mobile-bottom-nav';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import { IssueTimeline } from '@/app/components/issue-timeline';
import { downloadCsv, inDateRange, printTable, ExportColumn } from '@/app/components/table-export';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger
} from '@/app/components/ui/sidebar';
import { toast } from 'sonner';
import { Wrench, Clock, CheckCircle, AlertCircle, LogOut, Building2, Bell, Search } from 'lucide-react';
import { projectId } from '/utils/supabase/info';
import { getAuthHeaders } from '/utils/supabase/auth';

interface ContractorDashboardProps {
  user: any;
  accessToken: string;
  onLogout: () => void;
  companyId: string | null;
  companyBindings: any[];
  onCompanyChange: (companyId: string) => void;
  onProfileUpdate: (profile: any) => void;
  onInvitationHandled: () => void;
}

export function ContractorDashboard({ user, accessToken, onLogout, companyId, companyBindings, onCompanyChange, onProfileUpdate, onInvitationHandled }: ContractorDashboardProps) {
  const [stats, setStats] = useState<any>(null);
  const [issues, setIssues] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [globalSearch, setGlobalSearch] = useState('');
  const [selectedIssue, setSelectedIssue] = useState<any>(null);
  const [jobAction, setJobAction] = useState<{ issue: any; action: 'respond' | 'complete' } | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const activeRole = companyBindings.find((binding) => binding.companyId === companyId)?.role || user?.role || 'contractor';
  const [companyDirectory, setCompanyDirectory] = useState<Record<string, any>>({});
  const [issueSearch, setIssueSearch] = useState('');
  const [issuePriorityFilter, setIssuePriorityFilter] = useState('all');
  const [issueStartDate, setIssueStartDate] = useState('');
  const [issueEndDate, setIssueEndDate] = useState('');

  const buildAuthHeaders = async (extra?: Record<string, string>) => {
    const { headers, token } = await getAuthHeaders(accessToken);
    if (!token) {
      toast.error('Session expired. Please sign in again.');
      return null;
    }
    return { ...headers, ...extra };
  };

  useEffect(() => {
    if (companyId && accessToken) {
      loadDashboardData();
    }
  }, [companyId, accessToken]);

  useEffect(() => {
    const loadCompanies = async () => {
      if (companyBindings.length === 0) {
        setCompanyDirectory({});
        return;
      }

      try {
        const headers = await buildAuthHeaders();
        if (!headers) return;
        const uniqueIds = Array.from(new Set(companyBindings.map((binding) => binding.companyId)));
        const entries = await Promise.all(
          uniqueIds.map(async (id) => {
            const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/companies/${id}`, {
              headers,
              cache: 'no-store'
            });
            const data = await response.json();
            if (data.success) {
              return [id, data.company];
            }
            return [id, { id, name: id }];
          })
        );
        setCompanyDirectory(Object.fromEntries(entries));
      } catch (error) {
        console.error('Failed to load companies:', error);
      }
    };

    if (accessToken) {
      loadCompanies();
    }
  }, [companyBindings, accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    loadNotificationCount();
    const interval = setInterval(() => loadNotificationCount(), 30000);
    return () => clearInterval(interval);
  }, [accessToken]);

  const loadNotificationCount = async () => {
    if (!accessToken) return;
    try {
      const headers = await buildAuthHeaders();
      if (!headers) return;
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/notifications`, {
        headers,
        cache: 'no-store'
      });
      const data = await response.json();
      if (data.success) {
        const unreadCount = (data.notifications || []).filter((item: any) => !item.read).length;
        setUnreadNotifications(unreadCount);
      }
    } catch (error) {
      console.error('Load notification count error:', error);
    }
  };

  useEffect(() => {
    if (!companyId || !accessToken) return;
    const interval = setInterval(() => loadDashboardData(), 30000);
    const handleFocus = () => loadDashboardData();
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [companyId, accessToken]);

  const loadDashboardData = async () => {
    if (!companyId) {
      setStats(null);
      setIssues([]);
      setCompany(null);
      return;
    }

    try {
      const authHeaders = await buildAuthHeaders();
      if (!authHeaders) {
        return;
      }
      const fetchJson = async (url: string) => {
        try {
          const response = await fetch(url, { headers: authHeaders, cache: 'no-store' });
          const text = await response.text();
          const data = text ? JSON.parse(text) : {};
          if (!response.ok) {
            return { success: false, error: data.error || response.statusText };
          }
          return data;
        } catch (error) {
          return { success: false, error: 'Network error' };
        }
      };

      const [statsData, issuesData, companyData] = await Promise.all([
        fetchJson(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/dashboard/stats?companyId=${companyId}`),
        fetchJson(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/issues?companyId=${companyId}`),
        fetchJson(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/companies/${companyId}`)
      ]);

      if (statsData.success) setStats(statsData.stats);
      if (issuesData.success) setIssues(issuesData.issues);
      if (companyData.success) setCompany(companyData.company);
      if ([statsData, issuesData, companyData].some((item) => item?.error)) {
        const firstError = [statsData, issuesData, companyData].map((item) => item?.error).find(Boolean);
        if (firstError) {
          toast.error(firstError);
        }
      }
    } catch (error) {
      console.error('Dashboard load error:', error);
      toast.error('Failed to load dashboard data');
    }
  };

  const handleUpdateIssueStatus = async (issueId: string, newStatus: string) => {
    try {
      const headers = await buildAuthHeaders({ 'Content-Type': 'application/json' });
      if (!headers) return;
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/issues/${issueId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Issue status updated');
        loadDashboardData();
        if (selectedIssue && selectedIssue.id === issueId) {
          setSelectedIssue(null);
        }
      } else {
        toast.error(data.error || 'Failed to update status');
      }
    } catch (error) {
      console.error('Update status error:', error);
      toast.error('Failed to update status');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      created: { label: 'Created', className: 'bg-blue-100 text-blue-800' },
      assigned: { label: 'Assigned', className: 'bg-indigo-100 text-indigo-800' },
      in_progress: { label: 'In Progress', className: 'bg-yellow-100 text-yellow-800' },
      awaiting_parts: { label: 'Awaiting Parts', className: 'bg-orange-100 text-orange-800' },
      escalated: { label: 'Escalated', className: 'bg-red-100 text-red-800' },
      completed: { label: 'Completed', className: 'bg-green-100 text-green-800' },
      approved: { label: 'Approved', className: 'bg-teal-100 text-teal-800' },
      closed: { label: 'Closed', className: 'bg-slate-100 text-slate-700 border border-slate-200/70' },
    };
    const config = statusConfig[status] || { label: status, className: 'bg-slate-100 text-slate-700 border border-slate-200/70' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const priorityConfig: Record<string, { label: string; className: string }> = {
      high: { label: 'High', className: 'bg-red-100 text-red-700' },
      medium: { label: 'Medium', className: 'bg-yellow-100 text-yellow-700' },
      low: { label: 'Low', className: 'bg-emerald-100 text-emerald-700' },
    };
    const config = priorityConfig[priority] || { label: priority, className: 'bg-slate-100 text-slate-700' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getPriorityLevel = (priority: string) => {
    if (priority === 'high') return 3;
    if (priority === 'medium') return 2;
    return 1;
  };

  // Sort issues by priority (high to low) and then by creation date
  const sortedIssues = [...issues].sort((a, b) => {
    const priorityDiff = getPriorityLevel(b.priority) - getPriorityLevel(a.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const issueQuery = issueSearch.trim().toLowerCase();
  const filteredIssues = sortedIssues.filter((issue) => {
    const matchesQuery = !issueQuery
      || `${issue.equipmentName || ''} ${issue.title || ''} ${issue.description || ''} ${issue.id} ${issue.reportedBy?.name || ''}`
        .toLowerCase()
        .includes(issueQuery);
    const matchesPriority = issuePriorityFilter === 'all' || issue.priority === issuePriorityFilter;
    const matchesDate = inDateRange(issue.createdAt || issue.updatedAt, issueStartDate, issueEndDate);
    return matchesQuery && matchesPriority && matchesDate;
  });

  const pendingIssues = filteredIssues.filter(i => ['created', 'assigned'].includes(i.status));
  const inProgressIssues = filteredIssues.filter(i => ['in_progress', 'awaiting_parts'].includes(i.status));
  const completedIssues = filteredIssues.filter(i => ['completed', 'approved', 'closed'].includes(i.status));
  const escalatedIssues = filteredIssues.filter(i => i.status === 'escalated');
  const issueFilterControls = companyId ? (
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[200px]">
        <Label className="text-xs text-slate-500">Search</Label>
        <Input
          value={issueSearch}
          onChange={(e) => setIssueSearch(e.target.value)}
          placeholder="Search issues"
          className="h-8"
        />
      </div>
      <div>
        <Label className="text-xs text-slate-500">Priority</Label>
        <Select value={issuePriorityFilter} onValueChange={setIssuePriorityFilter}>
          <SelectTrigger className="h-8 w-full sm:w-[140px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-slate-500">From</Label>
        <Input
          type="date"
          value={issueStartDate}
          onChange={(e) => setIssueStartDate(e.target.value)}
          className="h-8"
        />
      </div>
      <div>
        <Label className="text-xs text-slate-500">To</Label>
        <Input
          type="date"
          value={issueEndDate}
          onChange={(e) => setIssueEndDate(e.target.value)}
          className="h-8"
        />
      </div>
    </div>
  ) : null;
  const subtitle = companyId
    ? (company?.name || companyDirectory[companyId]?.name || 'Loading...')
    : 'Independent Contractor';
  const avatarUrl = user?.avatarUrl || user?.avatar_url || user?.profile?.avatarUrl;
  const initials = (user?.name || 'User')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0])
    .join('')
    .toUpperCase();

  return (
    <SidebarProvider defaultOpen>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex-row gap-0">
        <Sidebar collapsible="icon" mobileHidden className="border-r border-sidebar-border bg-sidebar">
          <SidebarHeader className="gap-4 border-b border-sidebar-border px-6 py-6">
            <div className="flex items-center gap-3 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <button type="button" className="group flex items-center justify-center rounded-2xl p-1">
                    <Avatar className="h-11 w-11 border border-white/20 bg-white/10 shadow-[0_12px_24px_-16px_rgba(15,23,42,0.7)] group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10">
                      <AvatarImage src={avatarUrl} alt={user?.name || 'Profile'} />
                      <AvatarFallback className="bg-white/10 text-xs font-semibold text-white">{initials}</AvatarFallback>
                    </Avatar>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl">
                  <DialogHeader>
                    <DialogTitle>Profile settings</DialogTitle>
                    <DialogDescription>Review and update your contractor profile.</DialogDescription>
                  </DialogHeader>
                  <ProfileSettings
                    user={user}
                    role={activeRole}
                    accessToken={accessToken}
                    onProfileUpdated={onProfileUpdate}
                  />
                </DialogContent>
              </Dialog>
              <div className="group-data-[collapsible=icon]:hidden">
                <div className="text-sm font-semibold text-white">{user?.name || 'Contractor'}</div>
                <div className="text-xs text-white/70">{subtitle}</div>
              </div>
            </div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-white/50 group-data-[collapsible=icon]:hidden">Contractor</div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Assignments</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={activeTab === 'pending'} onClick={() => setActiveTab('pending')}>
                    <Clock />
                    <span>Pending</span>
                    <span className="ml-auto text-xs text-slate-500">{pendingIssues.length}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={activeTab === 'inprogress'} onClick={() => setActiveTab('inprogress')}>
                    <Wrench />
                    <span>In Progress</span>
                    <span className="ml-auto text-xs text-slate-500">{inProgressIssues.length}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={activeTab === 'completed'} onClick={() => setActiveTab('completed')}>
                    <CheckCircle />
                    <span>Completed</span>
                    <span className="ml-auto text-xs text-slate-500">{completedIssues.length}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={activeTab === 'escalated'} onClick={() => setActiveTab('escalated')}>
                    <AlertCircle />
                    <span>Escalated</span>
                    <span className="ml-auto text-xs text-slate-500">{escalatedIssues.length}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
            <SidebarSeparator />
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border px-6 py-4 text-xs text-white/60 group-data-[collapsible=icon]:hidden">
            Contractor access
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="min-h-screen min-w-0 bg-background flex flex-col">
          <header className="sticky top-0 z-30 border-b border-white/70 bg-white/85 px-4 py-4 sm:px-6 backdrop-blur shadow-[0_12px_30px_-24px_rgba(15,23,42,0.5)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-1 items-center gap-3">
                <SidebarTrigger className="hidden md:inline-flex" />
                <div className="flex w-full max-w-md items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-3 py-2 shadow-sm">
                  <Search className="h-4 w-4 text-slate-400" />
                  <Input
                    value={globalSearch}
                    onChange={(e) => setGlobalSearch(e.target.value)}
                    placeholder="Search requests, jobs, companies..."
                    className="h-6 border-0 bg-transparent p-0 text-sm text-slate-700 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {companyBindings.length > 0 && (
                  <Select value={companyId ?? ''} onValueChange={onCompanyChange}>
                    <SelectTrigger className="w-full sm:w-[220px]">
                      <Building2 className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companyBindings.map((binding) => (
                        <SelectItem key={binding.companyId} value={binding.companyId}>
                          {companyDirectory[binding.companyId]?.name || binding.companyId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="icon" aria-label="Notifications" className="relative">
                      <Bell className="h-4 w-4" />
                      {unreadNotifications > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
                          {unreadNotifications > 9 ? '9+' : unreadNotifications}
                        </span>
                      )}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>Notifications</DialogTitle>
                      <DialogDescription>Invitations and job updates.</DialogDescription>
                    </DialogHeader>
                    <NotificationsPanel
                      accessToken={accessToken}
                      onInvitationHandled={onInvitationHandled}
                      onUnreadCount={setUnreadNotifications}
                    />
                  </DialogContent>
                </Dialog>
                <Button variant="outline" onClick={onLogout}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="px-4 py-6 pb-24 sm:px-6 space-y-6">
        {/* Stats Grid */}
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 ${companyId ? 'mb-6' : ''}`}>
          <Card className="relative overflow-hidden border-transparent bg-gradient-to-br from-slate-50 via-white to-slate-100/80 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
            <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-slate-200/40" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Assigned</CardTitle>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 text-white shadow-[0_10px_20px_-10px_rgba(15,23,42,0.6)]">
                <Wrench className="w-4 h-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-slate-900">{stats?.totalAssigned || 0}</div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-transparent bg-gradient-to-br from-sky-50 via-white to-sky-100/80 shadow-[0_18px_45px_-30px_rgba(14,165,233,0.45)]">
            <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-sky-200/40" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending</CardTitle>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500 text-white shadow-[0_10px_20px_-10px_rgba(14,165,233,0.7)]">
                <Clock className="w-4 h-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-sky-700">{stats?.pending || 0}</div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-transparent bg-gradient-to-br from-amber-50 via-white to-amber-100/80 shadow-[0_18px_45px_-30px_rgba(245,158,11,0.45)]">
            <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-amber-200/40" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">In Progress</CardTitle>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-white shadow-[0_10px_20px_-10px_rgba(245,158,11,0.7)]">
                <Wrench className="w-4 h-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-amber-700">{stats?.inProgress || 0}</div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-transparent bg-gradient-to-br from-emerald-50 via-white to-emerald-100/80 shadow-[0_18px_45px_-30px_rgba(16,185,129,0.45)]">
            <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-emerald-200/40" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed</CardTitle>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_10px_20px_-10px_rgba(16,185,129,0.7)]">
                <CheckCircle className="w-4 h-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-emerald-700">{stats?.completed || 0}</div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-transparent bg-gradient-to-br from-violet-50 via-white to-violet-100/80 shadow-[0_18px_45px_-30px_rgba(139,92,246,0.45)]">
            <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-violet-200/40" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg Rating</CardTitle>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500 text-white shadow-[0_10px_20px_-10px_rgba(139,92,246,0.7)]">
                <AlertCircle className="w-4 h-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-violet-700">
                {stats?.avgRating ? stats.avgRating.toFixed(1) : '-'}
              </div>
              <p className="text-xs text-slate-500 mt-1">Out of 5.0</p>
            </CardContent>
          </Card>
        </div>

        {!companyId && (
          <Card className="border-slate-200 bg-slate-50">
            <CardContent className="py-6 text-sm text-slate-600">
              Select a company to view job requests, active work, and performance stats.
            </CardContent>
          </Card>
        )}

        {/* Priority Queue Notice */}
        {escalatedIssues.length > 0 && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <h3 className="font-semibold text-red-900">
                {escalatedIssues.length} Escalated Issue{escalatedIssues.length > 1 ? 's' : ''} Require Immediate Attention
              </h3>
            </div>
          </div>
        )}

        {/* Tabbed Issues */}

            <TabsContent value="pending" className="space-y-3">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Pending Issues</CardTitle>
                    <CardDescription className="text-xs text-slate-500">New assignments awaiting your response.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="h-8"
                      onClick={() => downloadCsv(
                        `pending-issues-${companyId || 'all'}.csv`,
                        [
                          { label: 'Issue', value: (row: any) => row.title || row.equipmentName || row.id },
                          { label: 'Priority', value: (row: any) => row.priority },
                          { label: 'Status', value: (row: any) => row.status },
                          { label: 'Reported By', value: (row: any) => row.reportedBy?.name || '-' },
                          { label: 'Created', value: (row: any) => row.createdAt || row.updatedAt || '-' },
                        ] as ExportColumn<any>[],
                        pendingIssues
                      )}
                    >
                      Download CSV
                    </Button>
                    <Button
                      variant="outline"
                      className="h-8"
                      onClick={() => printTable(
                        'Pending Issues',
                        [
                          { label: 'Issue', value: (row: any) => row.title || row.equipmentName || row.id },
                          { label: 'Priority', value: (row: any) => row.priority },
                          { label: 'Status', value: (row: any) => row.status },
                          { label: 'Reported By', value: (row: any) => row.reportedBy?.name || '-' },
                          { label: 'Created', value: (row: any) => row.createdAt || row.updatedAt || '-' },
                        ] as ExportColumn<any>[],
                        pendingIssues,
                        `${issueStartDate || 'All'} to ${issueEndDate || 'All'}`
                      )}
                    >
                      Print PDF
                    </Button>
                  </div>
                </div>
                {issueFilterControls}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Issue</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reported By</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingIssues.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-slate-500">
                          No pending issues
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingIssues.map((issue) => (
                        <TableRow key={issue.id} className="cursor-pointer" onClick={() => setSelectedIssue(issue)}>
                          <TableCell>
                            <div className="font-medium text-slate-900">{issue.equipmentName}</div>
                            <div className="text-xs text-slate-500">{issue.description}</div>
                            <div className="text-xs text-slate-400">{new Date(issue.createdAt).toLocaleDateString()}</div>
                          </TableCell>
                          <TableCell>{getPriorityBadge(issue.priority)}</TableCell>
                          <TableCell>{getStatusBadge(issue.status)}</TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {issue.reportedBy?.name || '-'}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setJobAction({ issue, action: 'respond' });
                              }}
                            >
                              Review & Respond
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
</TabsContent>

            <TabsContent value="inprogress" className="space-y-3">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Active Work</CardTitle>
                    <CardDescription className="text-xs text-slate-500">Issues currently in progress.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="h-8"
                      onClick={() => downloadCsv(
                        `in-progress-issues-${companyId || 'all'}.csv`,
                        [
                          { label: 'Issue', value: (row: any) => row.title || row.equipmentName || row.id },
                          { label: 'Status', value: (row: any) => row.status },
                          { label: 'Contact', value: (row: any) => row.reportedBy?.contact || row.reportedBy?.name || '-' },
                          { label: 'Updated', value: (row: any) => row.updatedAt || row.createdAt || '-' },
                        ] as ExportColumn<any>[],
                        inProgressIssues
                      )}
                    >
                      Download CSV
                    </Button>
                    <Button
                      variant="outline"
                      className="h-8"
                      onClick={() => printTable(
                        'In Progress Issues',
                        [
                          { label: 'Issue', value: (row: any) => row.title || row.equipmentName || row.id },
                          { label: 'Status', value: (row: any) => row.status },
                          { label: 'Contact', value: (row: any) => row.reportedBy?.contact || row.reportedBy?.name || '-' },
                          { label: 'Updated', value: (row: any) => row.updatedAt || row.createdAt || '-' },
                        ] as ExportColumn<any>[],
                        inProgressIssues,
                        `${issueStartDate || 'All'} to ${issueEndDate || 'All'}`
                      )}
                    >
                      Print PDF
                    </Button>
                  </div>
                </div>
                {issueFilterControls}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Issue</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inProgressIssues.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-slate-500">
                          No issues in progress
                        </TableCell>
                      </TableRow>
                    ) : (
                      inProgressIssues.map((issue) => (
                        <TableRow key={issue.id} className="cursor-pointer" onClick={() => setSelectedIssue(issue)}>
                          <TableCell>
                            <div className="font-medium text-slate-900">{issue.equipmentName}</div>
                            <div className="text-xs text-slate-500">{issue.description}</div>
                          </TableCell>
                          <TableCell>{getStatusBadge(issue.status)}</TableCell>
                          <TableCell className="text-sm text-slate-600">
                            <div>{issue.reportedBy?.name || '-'}</div>
                            <div className="text-xs text-slate-500">{issue.reportedBy?.contact?.phone || issue.reportedBy?.contact?.email || ''}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                              {issue.status === 'in_progress' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleUpdateIssueStatus(issue.id, 'awaiting_parts')}
                                  >
                                    Awaiting Parts
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => setJobAction({ issue, action: 'complete' })}
                                  >
                                    Mark Complete
                                  </Button>
                                </>
                              )}
                              {issue.status === 'awaiting_parts' && (
                                <Button size="sm" onClick={() => handleUpdateIssueStatus(issue.id, 'in_progress')}>
                                  Resume Work
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
</TabsContent>

            <TabsContent value="completed" className="space-y-3">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Completed Issues</CardTitle>
                    <CardDescription className="text-xs text-slate-500">Closed work with feedback.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="h-8"
                      onClick={() => downloadCsv(
                        `completed-issues-${companyId || 'all'}.csv`,
                        [
                          { label: 'Issue', value: (row: any) => row.title || row.equipmentName || row.id },
                          { label: 'Status', value: (row: any) => row.status },
                          { label: 'Rating', value: (row: any) => row.rating || '-' },
                          { label: 'Completed', value: (row: any) => row.completedAt || row.updatedAt || '-' },
                        ] as ExportColumn<any>[],
                        completedIssues
                      )}
                    >
                      Download CSV
                    </Button>
                    <Button
                      variant="outline"
                      className="h-8"
                      onClick={() => printTable(
                        'Completed Issues',
                        [
                          { label: 'Issue', value: (row: any) => row.title || row.equipmentName || row.id },
                          { label: 'Status', value: (row: any) => row.status },
                          { label: 'Rating', value: (row: any) => row.rating || '-' },
                          { label: 'Completed', value: (row: any) => row.completedAt || row.updatedAt || '-' },
                        ] as ExportColumn<any>[],
                        completedIssues,
                        `${issueStartDate || 'All'} to ${issueEndDate || 'All'}`
                      )}
                    >
                      Print PDF
                    </Button>
                  </div>
                </div>
                {issueFilterControls}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Issue</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedIssues.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-slate-500">
                          No completed issues
                        </TableCell>
                      </TableRow>
                    ) : (
                      completedIssues.map((issue) => (
                        <TableRow key={issue.id} className="cursor-pointer" onClick={() => setSelectedIssue(issue)}>
                          <TableCell>
                            <div className="font-medium text-slate-900">{issue.equipmentName}</div>
                            <div className="text-xs text-slate-500">{issue.description}</div>
                          </TableCell>
                          <TableCell>{getStatusBadge(issue.status)}</TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {issue.rating ? `${issue.rating}/5` : '-'}
                          </TableCell>
                          <TableCell className="text-sm text-slate-500">
                            {new Date(issue.updatedAt).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
</TabsContent>

            <TabsContent value="escalated" className="space-y-3">
              <Card className="border-red-200">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle>Escalated Issues</CardTitle>
                      <CardDescription className="text-xs text-slate-500">Immediate attention required.</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="h-8"
                        onClick={() => downloadCsv(
                          `escalated-issues-${companyId || 'all'}.csv`,
                          [
                            { label: 'Issue', value: (row: any) => row.title || row.equipmentName || row.id },
                            { label: 'Priority', value: (row: any) => row.priority },
                            { label: 'Status', value: (row: any) => row.status },
                            { label: 'Created', value: (row: any) => row.createdAt || row.updatedAt || '-' },
                          ] as ExportColumn<any>[],
                          escalatedIssues
                        )}
                      >
                        Download CSV
                      </Button>
                      <Button
                        variant="outline"
                        className="h-8"
                        onClick={() => printTable(
                          'Escalated Issues',
                          [
                            { label: 'Issue', value: (row: any) => row.title || row.equipmentName || row.id },
                            { label: 'Priority', value: (row: any) => row.priority },
                            { label: 'Status', value: (row: any) => row.status },
                            { label: 'Created', value: (row: any) => row.createdAt || row.updatedAt || '-' },
                          ] as ExportColumn<any>[],
                          escalatedIssues,
                          `${issueStartDate || 'All'} to ${issueEndDate || 'All'}`
                        )}
                      >
                        Print PDF
                      </Button>
                    </div>
                  </div>
                  {issueFilterControls}
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Issue</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {escalatedIssues.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-sm text-slate-500">
                            No escalated issues
                          </TableCell>
                        </TableRow>
                      ) : (
                        escalatedIssues.map((issue) => (
                          <TableRow key={issue.id} className="cursor-pointer" onClick={() => setSelectedIssue(issue)}>
                            <TableCell>
                              <div className="font-medium text-slate-900">{issue.equipmentName}</div>
                              <div className="text-xs text-slate-500">{issue.description}</div>
                            </TableCell>
                            <TableCell>{getPriorityBadge(issue.priority)}</TableCell>
                            <TableCell>{getStatusBadge(issue.status)}</TableCell>
                            <TableCell>
                              <Button size="sm" onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateIssueStatus(issue.id, 'in_progress');
                              }}>
                                Start Work
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            </div>
          </main>

      {/* Issue Detail Dialog */}
      {selectedIssue && (
        <Dialog open={!!selectedIssue} onOpenChange={() => setSelectedIssue(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Issue Details</DialogTitle>
              <DialogDescription>Issue ID: {selectedIssue.id}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">{selectedIssue.equipmentName}</h3>
                <div className="flex gap-2 mb-3">
                  {getPriorityBadge(selectedIssue.priority)}
                  {getStatusBadge(selectedIssue.status)}
                </div>
                <p className="text-sm text-slate-600">{selectedIssue.description}</p>
              </div>

              {selectedIssue.reportedBy && (
                <ContactCard
                  title="Reported By (Contact for Questions)"
                  name={selectedIssue.reportedBy.name}
                  role={selectedIssue.reportedBy.role}
                  branch={selectedIssue.reportedBy.branch}
                  contact={selectedIssue.reportedBy.contact}
                />
              )}

              <IssueTimeline issue={selectedIssue} />

              {selectedIssue.slaDeadline && (
                <div className="rounded-lg border border-slate-200/70 bg-white/80 p-3 shadow-sm">
                  <p className="text-sm">
                    <span className="font-medium">SLA Deadline:</span>{' '}
                    {new Date(selectedIssue.slaDeadline).toLocaleString()}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                {['created', 'assigned'].includes(selectedIssue.status) && (
                  <Button 
                    onClick={() => setJobAction({ issue: selectedIssue, action: 'respond' })}
                    className="flex-1"
                  >
                    Review & Respond
                  </Button>
                )}
                {selectedIssue.status === 'in_progress' && (
                  <>
                    <Button 
                      variant="outline"
                      onClick={() => handleUpdateIssueStatus(selectedIssue.id, 'awaiting_parts')}
                      className="flex-1"
                    >
                      Awaiting Parts
                    </Button>
                    <Button 
                      onClick={() => setJobAction({ issue: selectedIssue, action: 'complete' })}
                      className="flex-1"
                    >
                      Mark Complete
                    </Button>
                  </>
                )}
                {selectedIssue.status === 'awaiting_parts' && (
                  <Button 
                    onClick={() => handleUpdateIssueStatus(selectedIssue.id, 'in_progress')}
                    className="flex-1"
                  >
                    Resume Work
                  </Button>
                )}
                {selectedIssue.status === 'escalated' && (
                  <Button 
                    onClick={() => handleUpdateIssueStatus(selectedIssue.id, 'in_progress')}
                    className="flex-1"
                  >
                    Start Work
                  </Button>
                )}
              </div>

              <ActivityLog 
                entityType="issue"
                entityId={selectedIssue.id}
                accessToken={accessToken}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {jobAction && (
        <JobActionModal
          isOpen={!!jobAction}
          onClose={() => setJobAction(null)}
          job={jobAction.issue}
          action={jobAction.action}
          accessToken={accessToken}
          onSuccess={() => {
            setSelectedIssue(null);
            loadDashboardData();
          }}
        />
      )}
      <MobileBottomNav
        activeId={activeTab}
        items={[
          { id: 'pending', label: 'Pending', icon: <Clock className="h-4 w-4" />, onClick: () => setActiveTab('pending') },
          { id: 'inprogress', label: 'Active', icon: <Wrench className="h-4 w-4" />, onClick: () => setActiveTab('inprogress') },
          { id: 'completed', label: 'Done', icon: <CheckCircle className="h-4 w-4" />, onClick: () => setActiveTab('completed') },
          { id: 'escalated', label: 'Escalated', icon: <AlertCircle className="h-4 w-4" />, onClick: () => setActiveTab('escalated') },
        ]}
      />
        </SidebarInset>
      </Tabs>
    </SidebarProvider>
  );
}
