import { useState, useEffect } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Badge } from '@/app/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { Tabs, TabsContent } from '@/app/components/ui/tabs';
import { ContactCard } from '@/app/components/contact-card';
import { ActivityLog } from '@/app/components/activity-log';
import { ProfileSettings } from '@/app/components/profile-settings';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import { downloadCsv, inDateRange, printTable, ExportColumn } from '@/app/components/table-export';
import { IssueTimeline } from '@/app/components/issue-timeline';
import { EquipmentImportDialog } from '@/app/components/equipment-import-dialog';
import { EquipmentMaintenancePanel } from '@/app/components/equipment-maintenance-panel';
import { EquipmentReplacementDialog } from '@/app/components/equipment-replacement-dialog';
import { ProceduresPanel } from '@/app/components/procedures-panel';
import { ConsumablesPanel } from '@/app/components/consumables-panel';
import { ProcedureChecklistPanel } from '@/app/components/procedure-checklist-panel';
import { NotificationsPanel } from '@/app/components/notifications-panel';
import { MobileBottomNav } from '@/app/components/mobile-bottom-nav';
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
import { AlertCircle, Bell, Building2, CheckCircle, ClipboardList, FlaskConical, LogOut, Package, Plus, Search, Users } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface FacilityManagerDashboardProps {
  user: any;
  accessToken: string;
  onLogout: () => void;
  companyId: string;
  companyBindings: any[];
  onCompanyChange: (companyId: string) => void;
  onProfileUpdate: (profile: any) => void;
}

export function FacilityManagerDashboard({ user, accessToken, onLogout, companyId, companyBindings, onCompanyChange, onProfileUpdate }: FacilityManagerDashboardProps) {
  const [stats, setStats] = useState<any>(null);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [contractors, setContractors] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('issues');
  const [globalSearch, setGlobalSearch] = useState('');
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const activeRole = companyBindings.find((binding) => binding.companyId === companyId)?.role || user?.role || 'facility_manager';
  
  const [isCreateEquipmentOpen, setIsCreateEquipmentOpen] = useState(false);
  const [isCreateIssueOpen, setIsCreateIssueOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<any>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<any>(null);
  
  const [equipmentData, setEquipmentData] = useState({
    name: '',
    category: '',
    brand: '',
    model: '',
    serialNumber: '',
    installDate: '',
    warrantyPeriod: '',
    contractorId: '',
    location: '',
    facilityId: ''
  });
  
  const [issueData, setIssueData] = useState({
    taskType: 'equipment',
    title: '',
    equipmentId: '',
    facilityId: '',
    description: '',
    priority: 'medium',
    slaDeadline: ''
  });

  const [issueUpdateData, setIssueUpdateData] = useState({
    feedback: '',
    rating: 0
  });

  const [issueSearch, setIssueSearch] = useState('');
  const [issueStatusFilter, setIssueStatusFilter] = useState('all');
  const [issuePriorityFilter, setIssuePriorityFilter] = useState('all');
  const [issueStartDate, setIssueStartDate] = useState('');
  const [issueEndDate, setIssueEndDate] = useState('');

  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [equipmentHealthFilter, setEquipmentHealthFilter] = useState('all');
  const [equipmentStartDate, setEquipmentStartDate] = useState('');
  const [equipmentEndDate, setEquipmentEndDate] = useState('');

  const [contractorSearch, setContractorSearch] = useState('');
  const [contractorStartDate, setContractorStartDate] = useState('');
  const [contractorEndDate, setContractorEndDate] = useState('');

  useEffect(() => {
    if (companyId) {
      loadDashboardData();
    }
  }, [companyId]);

  useEffect(() => {
    if (!accessToken) return;
    loadNotificationCount();
    const interval = setInterval(() => loadNotificationCount(), 30000);
    return () => clearInterval(interval);
  }, [accessToken]);

  useEffect(() => {
    if (!companyId) return;
    const interval = setInterval(() => loadDashboardData(), 30000);
    const handleFocus = () => loadDashboardData();
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [companyId]);

  const loadDashboardData = async () => {
    try {
      if (!accessToken) {
        return;
      }
      const authHeaders = { Authorization: `Bearer ${accessToken}`, apikey: publicAnonKey };
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

      const [statsData, facilitiesData, equipmentData, issuesData, contractorsData] = await Promise.all([
        fetchJson(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/dashboard/stats?companyId=${companyId}`),
        fetchJson(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/facilities?companyId=${companyId}`),
        fetchJson(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/equipment?companyId=${companyId}`),
        fetchJson(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/issues?companyId=${companyId}`),
        fetchJson(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/contractors?companyId=${companyId}`)
      ]);

      if (statsData.success) setStats(statsData.stats);
      if (facilitiesData.success) setFacilities(facilitiesData.facilities);
      if (equipmentData.success) setEquipment(equipmentData.equipment);
      if (issuesData.success) setIssues(issuesData.issues);
      if (contractorsData.success) setContractors(contractorsData.contractors);
      if ([statsData, facilitiesData, equipmentData, issuesData, contractorsData].some((item) => item?.error)) {
        const firstError = [statsData, facilitiesData, equipmentData, issuesData, contractorsData]
          .map((item) => item?.error)
          .find(Boolean);
        if (firstError) {
          toast.error(firstError);
        }
      }
    } catch (error) {
      console.error('Dashboard load error:', error);
      toast.error('Failed to load dashboard data');
    }
  };

  const loadNotificationCount = async () => {
    if (!accessToken) return;
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/notifications`, {
        headers: { Authorization: `Bearer ${accessToken}`, apikey: publicAnonKey },
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

  const handleCreateEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/equipment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ ...equipmentData, companyId })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Equipment registered successfully');
        setIsCreateEquipmentOpen(false);
        setEquipmentData({
          name: '', category: '', brand: '', model: '', serialNumber: '',
          installDate: '', warrantyPeriod: '', contractorId: '', location: '', facilityId: ''
        });
        loadDashboardData();
      } else {
        toast.error(data.error || 'Failed to register equipment');
      }
    } catch (error) {
      console.error('Create equipment error:', error);
      toast.error('Failed to register equipment');
    }
  };

  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (issueData.taskType === 'general' && (!issueData.title || !issueData.facilityId)) {
        toast.error('Task title and facility are required');
        return;
      }
      if (issueData.taskType === 'equipment' && !issueData.equipmentId) {
        toast.error('Equipment is required');
        return;
      }

      const payload = issueData.taskType === 'general'
        ? {
            title: issueData.title,
            facilityId: issueData.facilityId,
            companyId,
            description: issueData.description,
            priority: issueData.priority,
            slaDeadline: issueData.slaDeadline || undefined,
            taskType: 'general'
          }
        : {
            equipmentId: issueData.equipmentId,
            description: issueData.description,
            priority: issueData.priority,
            slaDeadline: issueData.slaDeadline || undefined,
            taskType: 'equipment'
          };

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/issues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Issue reported successfully');
        setIsCreateIssueOpen(false);
        setIssueData({ taskType: 'equipment', title: '', equipmentId: '', facilityId: '', description: '', priority: 'medium', slaDeadline: '' });
        loadDashboardData();
      } else {
        toast.error(data.error || 'Failed to report issue');
      }
    } catch (error) {
      console.error('Create issue error:', error);
      toast.error('Failed to report issue');
    }
  };

  const handleApproveIssue = async (issueId: string) => {
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/issues/${issueId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          status: 'approved',
          feedback: issueUpdateData.feedback,
          rating: issueUpdateData.rating
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Issue approved successfully');
        setSelectedIssue(null);
        setIssueUpdateData({ feedback: '', rating: 0 });
        loadDashboardData();
      } else {
        toast.error(data.error || 'Failed to approve issue');
      }
    } catch (error) {
      console.error('Approve issue error:', error);
      toast.error('Failed to approve issue');
    }
  };

  const handleAssignContractor = async (issueId: string, contractorId: string) => {
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/issues/${issueId}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ contractorId })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Contractor assigned successfully');
        loadDashboardData();
      } else {
        toast.error(data.error || 'Failed to assign contractor');
      }
    } catch (error) {
      console.error('Assign contractor error:', error);
      toast.error('Failed to assign contractor');
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

  const getContractorName = (contractorId: string | null) => {
    if (!contractorId) return 'Unassigned';
    const contractor = contractors.find((item) => item.id === contractorId);
    return contractor?.name || contractorId;
  };

  const renderAttachmentList = (attachments: any[]) => {
    if (!attachments.length) return null;
    return (
      <div className="mt-2 space-y-1">
        {attachments.map((file, index) => (
          <a
            key={file.path || `${file.url}-${index}`}
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="block text-xs text-blue-600 hover:underline"
          >
            {file.name || `Attachment ${index + 1}`}
          </a>
        ))}
      </div>
    );
  };

  const issueQuery = issueSearch.trim().toLowerCase();
  const filteredIssues = issues.filter((issue) => {
    const matchesQuery = !issueQuery
      || `${issue.equipmentName || ''} ${issue.title || ''} ${issue.description || ''} ${issue.id} ${issue.reportedBy?.name || ''}`
        .toLowerCase()
        .includes(issueQuery);
    const matchesStatus = issueStatusFilter === 'all' || issue.status === issueStatusFilter;
    const matchesPriority = issuePriorityFilter === 'all' || issue.priority === issuePriorityFilter;
    const matchesDate = inDateRange(issue.createdAt || issue.updatedAt, issueStartDate, issueEndDate);
    return matchesQuery && matchesStatus && matchesPriority && matchesDate;
  });

  const equipmentQuery = equipmentSearch.trim().toLowerCase();
  const filteredEquipment = equipment.filter((eq) => {
    const matchesQuery = !equipmentQuery
      || `${eq.name} ${eq.category} ${eq.location || ''} ${eq.id}`.toLowerCase().includes(equipmentQuery);
    const matchesHealth = equipmentHealthFilter === 'all' || eq.healthStatus === equipmentHealthFilter;
    const matchesDate = inDateRange(eq.createdAt || eq.recordedAt, equipmentStartDate, equipmentEndDate);
    return matchesQuery && matchesHealth && matchesDate;
  });

  const contractorQuery = contractorSearch.trim().toLowerCase();
  const filteredContractors = contractors.filter((contractor) => {
    const matchesQuery = !contractorQuery
      || `${contractor.name} ${contractor.email || ''} ${contractor.phone || ''}`.toLowerCase().includes(contractorQuery);
    const matchesDate = inDateRange(contractor.createdAt, contractorStartDate, contractorEndDate);
    return matchesQuery && matchesDate;
  });
  const activeContractors = contractors.filter((contractor) => contractor?.binding?.status !== 'suspended');
  const avatarUrl = user?.avatarUrl || user?.avatar_url || user?.profile?.avatarUrl;
  const initials = (user?.name || 'User')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0])
    .join('')
    .toUpperCase();

  const totalEquipmentCount = Math.max(stats?.totalEquipment || 0, equipment.length);
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
                    <DialogDescription>Review your details and contact info.</DialogDescription>
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
                <div className="text-sm font-semibold text-white">{user?.name || 'Facility Manager'}</div>
                <div className="text-xs text-white/70">{companyId}</div>
              </div>
            </div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-white/50 group-data-[collapsible=icon]:hidden">Facility Manager</div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={activeTab === 'issues'} onClick={() => setActiveTab('issues')}>
                    <AlertCircle />
                    <span>Issues</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={activeTab === 'equipment'} onClick={() => setActiveTab('equipment')}>
                    <Package />
                    <span>Equipment</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={activeTab === 'procedures'} onClick={() => setActiveTab('procedures')}>
                    <ClipboardList />
                    <span>Procedures</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={activeTab === 'consumables'} onClick={() => setActiveTab('consumables')}>
                    <FlaskConical />
                    <span>Consumables</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={activeTab === 'contractors'} onClick={() => setActiveTab('contractors')}>
                    <Users />
                    <span>Contractors</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
            <SidebarSeparator />
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border px-6 py-4 text-xs text-white/60 group-data-[collapsible=icon]:hidden">
            Facility Manager
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="min-h-screen bg-background flex flex-col">
          <header className="sticky top-0 z-30 border-b border-white/70 bg-white/85 px-6 py-4 backdrop-blur shadow-[0_12px_30px_-24px_rgba(15,23,42,0.5)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-1 items-center gap-3">
                <SidebarTrigger className="hidden md:inline-flex" />
                <div className="flex w-full max-w-md items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-3 py-2 shadow-sm">
                  <Search className="h-4 w-4 text-slate-400" />
                  <Input
                    value={globalSearch}
                    onChange={(e) => setGlobalSearch(e.target.value)}
                    placeholder="Search issues, equipment, contractors..."
                    className="h-6 border-0 bg-transparent p-0 text-sm text-slate-700 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {companyBindings.length > 1 && (
                  <Select value={companyId} onValueChange={onCompanyChange}>
                    <SelectTrigger className="w-[200px]">
                      <Building2 className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companyBindings.map((binding) => (
                        <SelectItem key={binding.companyId} value={binding.companyId}>
                          {binding.companyId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="icon" className="relative" aria-label="Notifications">
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
                      <DialogDescription>Issue updates and contractor responses.</DialogDescription>
                    </DialogHeader>
                    <NotificationsPanel
                      accessToken={accessToken}
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

          <main className="flex-1 overflow-y-auto">
            <div className="px-6 py-6 pb-24 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Equipment</CardTitle>
              <Package className="w-4 h-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalEquipmentCount}</div>
              <div className="text-xs text-slate-500 mt-1">
                <span className="text-green-600">o</span> {stats?.healthyEquipment || 0} Healthy
                <span className="text-yellow-600 ml-2">o</span> {stats?.concerningEquipment || 0} Warning
                <span className="text-red-600 ml-2">o</span> {stats?.criticalEquipment || 0} Critical
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Issues</CardTitle>
              <AlertCircle className="w-4 h-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.openIssues || 0}</div>
              <p className="text-xs text-red-600 mt-1">{stats?.criticalIssues || 0} Critical</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
              <CheckCircle className="w-4 h-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {issues.filter(i => i.status === 'completed').length}
              </div>
              <p className="text-xs text-slate-500 mt-1">Awaiting your review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Assigned Contractors</CardTitle>
              <Package className="w-4 h-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{contractors.length}</div>
            </CardContent>
          </Card>
        </div>

            <TabsContent value="issues" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Issues</CardTitle>
                    <CardDescription className="text-xs text-slate-500">Track and manage facility issues</CardDescription>
                  </div>
                  <Dialog open={isCreateIssueOpen} onOpenChange={setIsCreateIssueOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Report Issue
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Report New Issue</DialogTitle>
                        <DialogDescription>Report an equipment issue or general task</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleCreateIssue} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="issue-type">Task Type</Label>
                          <Select
                            value={issueData.taskType}
                            onValueChange={(value) => setIssueData({ ...issueData, taskType: value, equipmentId: value === 'general' ? '' : issueData.equipmentId })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="equipment">Equipment Issue</SelectItem>
                              <SelectItem value="general">General Task</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {issueData.taskType === 'general' ? (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="issue-title">Task Title</Label>
                              <Input
                                id="issue-title"
                                value={issueData.title}
                                onChange={(e) => setIssueData({ ...issueData, title: e.target.value })}
                                placeholder="Generator maintenance"
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="issue-facility">Facility</Label>
                              <Select
                                value={issueData.facilityId}
                                onValueChange={(value) => setIssueData({ ...issueData, facilityId: value })}
                                required
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select facility" />
                                </SelectTrigger>
                                <SelectContent>
                                  {facilities.map((facility) => (
                                    <SelectItem key={facility.id} value={facility.id}>
                                      {facility.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </>
                        ) : (
                          <div className="space-y-2">
                            <Label htmlFor="issue-equipment">Equipment</Label>
                            <Select
                              value={issueData.equipmentId}
                              onValueChange={(value) => setIssueData({ ...issueData, equipmentId: value })}
                              required
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select equipment" />
                              </SelectTrigger>
                              <SelectContent>
                                {equipment.map((eq) => (
                                  <SelectItem key={eq.id} value={eq.id}>
                                    {eq.name} - {eq.category}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label htmlFor="issue-description">Description</Label>
                          <Textarea
                            id="issue-description"
                            value={issueData.description}
                            onChange={(e) => setIssueData({ ...issueData, description: e.target.value })}
                            placeholder="Describe the issue..."
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="issue-priority">Priority</Label>
                          <Select
                            value={issueData.priority}
                            onValueChange={(value) => setIssueData({ ...issueData, priority: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="issue-sla">Target completion (SLA)</Label>
                          <Input
                            id="issue-sla"
                            type="datetime-local"
                            value={issueData.slaDeadline}
                            onChange={(e) => setIssueData({ ...issueData, slaDeadline: e.target.value })}
                          />
                        </div>
                        <Button type="submit" className="w-full">Report Issue</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
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
                    <Label className="text-xs text-slate-500">Status</Label>
                    <Select value={issueStatusFilter} onValueChange={setIssueStatusFilter}>
                      <SelectTrigger className="h-8 w-[150px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="created">Created</SelectItem>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="awaiting_parts">Awaiting Parts</SelectItem>
                        <SelectItem value="escalated">Escalated</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Priority</Label>
                    <Select value={issuePriorityFilter} onValueChange={setIssuePriorityFilter}>
                      <SelectTrigger className="h-8 w-[140px]">
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
                  <Button
                    variant="outline"
                    className="h-8"
                    onClick={() => downloadCsv(
                      `issues-${companyId}.csv`,
                      [
                        { label: 'Issue', value: (row: any) => row.title || row.equipmentName || row.id },
                        { label: 'Priority', value: (row: any) => row.priority },
                        { label: 'Status', value: (row: any) => row.status },
                        { label: 'Assigned', value: (row: any) => row.assignedTo ? getContractorName(row.assignedTo) : '-' },
                        { label: 'Created', value: (row: any) => row.createdAt || row.updatedAt || '-' },
                      ] as ExportColumn<any>[],
                      filteredIssues
                    )}
                  >
                    Download CSV
                  </Button>
                  <Button
                    variant="outline"
                    className="h-8"
                    onClick={() => printTable(
                      'Issues',
                      [
                        { label: 'Issue', value: (row: any) => row.title || row.equipmentName || row.id },
                        { label: 'Priority', value: (row: any) => row.priority },
                        { label: 'Status', value: (row: any) => row.status },
                        { label: 'Assigned', value: (row: any) => row.assignedTo ? getContractorName(row.assignedTo) : '-' },
                        { label: 'Created', value: (row: any) => row.createdAt || row.updatedAt || '-' },
                      ] as ExportColumn<any>[],
                      filteredIssues,
                      `${issueStartDate || 'All'} to ${issueEndDate || 'All'}`
                    )}
                  >
                    Print PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Issue</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIssues.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-slate-500">
                          No issues reported
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredIssues.map((issue) => (
                        <TableRow
                          key={issue.id}
                          className="cursor-pointer"
                          onClick={() => setSelectedIssue(issue)}
                        >
                          <TableCell>
                            <div className="font-medium text-slate-900">{issue.equipmentName}</div>
                            <div className="text-xs text-slate-500">{issue.description}</div>
                            <div className="text-xs text-slate-400">ID: {issue.id}</div>
                          </TableCell>
                          <TableCell>{getPriorityBadge(issue.priority)}</TableCell>
                          <TableCell>{getStatusBadge(issue.status)}</TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {issue.assignedTo ? getContractorName(issue.assignedTo) : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                              {!issue.assignedTo && issue.status === 'created' && (
                                <Select onValueChange={(contractorId) => handleAssignContractor(issue.id, contractorId)}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Assign contractor" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {activeContractors.map((contractor) => (
                                      <SelectItem key={contractor.id} value={contractor.id}>
                                        {contractor.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              {issue.assignedTo && !['completed', 'approved', 'closed'].includes(issue.status) && (
                                <Select value={issue.assignedTo} onValueChange={(contractorId) => handleAssignContractor(issue.id, contractorId)}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Change contractor" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {activeContractors.map((contractor) => (
                                      <SelectItem key={contractor.id} value={contractor.id}>
                                        {contractor.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              {issue.status === 'completed' && (
                                <Button size="sm" onClick={() => setSelectedIssue(issue)}>
                                  Review & Approve
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

            <TabsContent value="equipment" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Equipment</CardTitle>
                    <CardDescription className="text-xs text-slate-500">Manage facility equipment</CardDescription>
                  </div>
                  <Dialog open={isCreateEquipmentOpen} onOpenChange={setIsCreateEquipmentOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Register Equipment
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Register New Equipment</DialogTitle>
                        <DialogDescription>Add equipment to your facility</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleCreateEquipment} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="eq-name">Equipment Name</Label>
                            <Input
                              id="eq-name"
                              value={equipmentData.name}
                              onChange={(e) => setEquipmentData({ ...equipmentData, name: e.target.value })}
                              placeholder="Industrial Oven"
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="eq-category">Category</Label>
                            <Input
                              id="eq-category"
                              value={equipmentData.category}
                              onChange={(e) => setEquipmentData({ ...equipmentData, category: e.target.value })}
                              placeholder="e.g., Kitchen, HVAC, Electrical"
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="eq-facility">Facility</Label>
                          <Select
                            value={equipmentData.facilityId}
                            onValueChange={(value) => setEquipmentData({ ...equipmentData, facilityId: value })}
                            required
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select facility" />
                            </SelectTrigger>
                            <SelectContent>
                              {facilities.map((facility) => (
                                <SelectItem key={facility.id} value={facility.id}>
                                  {facility.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="eq-brand">Brand</Label>
                            <Input
                              id="eq-brand"
                              value={equipmentData.brand}
                              onChange={(e) => setEquipmentData({ ...equipmentData, brand: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="eq-model">Model</Label>
                            <Input
                              id="eq-model"
                              value={equipmentData.model}
                              onChange={(e) => setEquipmentData({ ...equipmentData, model: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="eq-serial">Serial Number</Label>
                          <Input
                            id="eq-serial"
                            value={equipmentData.serialNumber}
                            onChange={(e) => setEquipmentData({ ...equipmentData, serialNumber: e.target.value })}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="eq-location">Location in Facility</Label>
                          <Input
                            id="eq-location"
                            value={equipmentData.location}
                            onChange={(e) => setEquipmentData({ ...equipmentData, location: e.target.value })}
                            placeholder="Kitchen Area A"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="eq-contractor">Assigned Contractor (Optional)</Label>
                          <Select
                            value={equipmentData.contractorId}
                            onValueChange={(value) => setEquipmentData({ ...equipmentData, contractorId: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select contractor" />
                            </SelectTrigger>
                            <SelectContent>
                              {activeContractors.map((contractor) => (
                                <SelectItem key={contractor.id} value={contractor.id}>
                                  {contractor.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <Button type="submit" className="w-full">Register Equipment</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-xs text-slate-500">Search</Label>
                    <Input
                      value={equipmentSearch}
                      onChange={(e) => setEquipmentSearch(e.target.value)}
                      placeholder="Search equipment"
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Health</Label>
                    <Select value={equipmentHealthFilter} onValueChange={setEquipmentHealthFilter}>
                      <SelectTrigger className="h-8 w-[140px]">
                        <SelectValue placeholder="Health" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="green">Good</SelectItem>
                        <SelectItem value="yellow">Concerning</SelectItem>
                        <SelectItem value="red">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">From</Label>
                    <Input
                      type="date"
                      value={equipmentStartDate}
                      onChange={(e) => setEquipmentStartDate(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">To</Label>
                    <Input
                      type="date"
                      value={equipmentEndDate}
                      onChange={(e) => setEquipmentEndDate(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <EquipmentImportDialog
                    companyId={companyId}
                    accessToken={accessToken}
                    onImported={loadDashboardData}
                  />
                  <Button
                    variant="outline"
                    className="h-8"
                    onClick={() => downloadCsv(
                      `equipment-${companyId}.csv`,
                      [
                        { label: 'Equipment', value: (row: any) => row.name },
                        { label: 'Category', value: (row: any) => row.category || '-' },
                        { label: 'Health', value: (row: any) => row.healthStatus || '-' },
                        { label: 'Location', value: (row: any) => row.location || '-' },
                        { label: 'Recorded By', value: (row: any) => row.recordedBy?.name || '-' },
                        { label: 'Recorded At', value: (row: any) => row.createdAt || row.recordedAt || '-' },
                      ] as ExportColumn<any>[],
                      filteredEquipment
                    )}
                  >
                    Download CSV
                  </Button>
                  <Button
                    variant="outline"
                    className="h-8"
                    onClick={() => printTable(
                      'Equipment Registry',
                      [
                        { label: 'Equipment', value: (row: any) => row.name },
                        { label: 'Category', value: (row: any) => row.category || '-' },
                        { label: 'Health', value: (row: any) => row.healthStatus || '-' },
                        { label: 'Location', value: (row: any) => row.location || '-' },
                        { label: 'Recorded By', value: (row: any) => row.recordedBy?.name || '-' },
                        { label: 'Recorded At', value: (row: any) => row.createdAt || row.recordedAt || '-' },
                      ] as ExportColumn<any>[],
                      filteredEquipment,
                      `${equipmentStartDate || 'All'} to ${equipmentEndDate || 'All'}`
                    )}
                  >
                    Print PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Equipment</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Health</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Recorded By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEquipment.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-slate-500">
                          No equipment registered
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredEquipment.map((eq) => (
                        <TableRow
                          key={eq.id}
                          className="cursor-pointer"
                          onClick={() => setSelectedEquipment(eq)}
                        >
                          <TableCell>
                            <div className="font-medium text-slate-900">{eq.name}</div>
                            <div className="text-xs text-slate-500">{eq.brand || '-'} {eq.model || ''}</div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">{eq.category || '-'}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-2 text-xs text-slate-600">
                              <span className={`h-2.5 w-2.5 rounded-full ${
                                eq.healthStatus === 'red' ? 'bg-red-500' :
                                eq.healthStatus === 'yellow' ? 'bg-yellow-400' : 'bg-primary'
                              }`} />
                              {eq.healthStatus === 'red' ? 'Critical' : eq.healthStatus === 'yellow' ? 'Concerning' : 'Good'}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">{eq.location || '-'}</TableCell>
                          <TableCell className="text-sm text-slate-600">{eq.recordedBy?.name || '-'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
</CardContent>
            </Card>
          </TabsContent>

            <TabsContent value="procedures" className="space-y-4">
              <ProceduresPanel
                companyId={companyId}
                accessToken={accessToken}
                canEdit={activeRole === 'facility_manager' || activeRole === 'company_admin'}
              />
            </TabsContent>

            <TabsContent value="consumables" className="space-y-4">
              <ConsumablesPanel
                companyId={companyId}
                accessToken={accessToken}
                canEdit={activeRole === 'facility_manager' || activeRole === 'company_admin'}
                canManage={activeRole === 'company_admin'}
                equipment={equipment}
              />
            </TabsContent>

            <TabsContent value="contractors" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Assigned Contractors</CardTitle>
                <CardDescription className="text-xs text-slate-500">Contractors working on your facilities</CardDescription>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-xs text-slate-500">Search</Label>
                    <Input
                      value={contractorSearch}
                      onChange={(e) => setContractorSearch(e.target.value)}
                      placeholder="Search contractors"
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">From</Label>
                    <Input
                      type="date"
                      value={contractorStartDate}
                      onChange={(e) => setContractorStartDate(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">To</Label>
                    <Input
                      type="date"
                      value={contractorEndDate}
                      onChange={(e) => setContractorEndDate(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="h-8"
                    onClick={() => downloadCsv(
                      `contractors-${companyId}.csv`,
                      [
                        { label: 'Name', value: (row: any) => row.name },
                        { label: 'Email', value: (row: any) => row.email || '-' },
                        { label: 'Phone', value: (row: any) => row.phone || '-' },
                        {
                          label: 'Specialization',
                          value: (row: any) => row.specialization || (Array.isArray(row.skills) ? row.skills.join(', ') : row.skills) || '-'
                        },
                      ] as ExportColumn<any>[],
                      filteredContractors
                    )}
                  >
                    Download CSV
                  </Button>
                  <Button
                    variant="outline"
                    className="h-8"
                    onClick={() => printTable(
                      'Contractors',
                      [
                        { label: 'Name', value: (row: any) => row.name },
                        { label: 'Email', value: (row: any) => row.email || '-' },
                        { label: 'Phone', value: (row: any) => row.phone || '-' },
                        {
                          label: 'Specialization',
                          value: (row: any) => row.specialization || (Array.isArray(row.skills) ? row.skills.join(', ') : row.skills) || '-'
                        },
                      ] as ExportColumn<any>[],
                      filteredContractors,
                      `${contractorStartDate || 'All'} to ${contractorEndDate || 'All'}`
                    )}
                  >
                    Print PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Specialization</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContractors.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-sm text-slate-500">
                          No contractors assigned
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredContractors.map((contractor) => (
                        <TableRow key={contractor.id}>
                          <TableCell>
                            <div className="font-medium text-slate-900">{contractor.name}</div>
                            <div className="text-xs text-slate-500">Contractor</div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            <div>{contractor.email || '-'}</div>
                            <div className="text-xs text-slate-500">{contractor.phone || '-'}</div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {contractor.specialization || (Array.isArray(contractor.skills) ? contractor.skills.join(', ') : contractor.skills) || '-'}
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

      {/* Issue Detail/Approval Dialog */}
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
                  title="Reported By"
                  name={selectedIssue.reportedBy.name}
                  role={selectedIssue.reportedBy.role}
                  branch={selectedIssue.reportedBy.branch}
                  contact={selectedIssue.reportedBy.contact}
                />
              )}

              <IssueTimeline issue={selectedIssue} />

              {selectedIssue.contractorResponse && (
                <div className="p-3 border rounded-lg">
                  <h4 className="font-semibold mb-2">Contractor Response</h4>
                  <div className="text-sm text-slate-600 space-y-1">
                    <p><span className="font-medium">Decision:</span> {selectedIssue.contractorResponse.decision}</p>
                    <p><span className="font-medium">Proposed cost:</span> {selectedIssue.contractorResponse.proposedCost || 0}</p>
                    {selectedIssue.contractorResponse.reason && (
                      <p><span className="font-medium">Reason:</span> {selectedIssue.contractorResponse.reason}</p>
                    )}
                    {selectedIssue.contractorResponse.proposal && (
                      <p><span className="font-medium">Proposal:</span> {selectedIssue.contractorResponse.proposal}</p>
                    )}
                  </div>
                  {renderAttachmentList(selectedIssue.contractorResponse.proposalAttachments)}
                </div>
              )}

              {selectedIssue.completion && (
                <div className="p-3 border rounded-lg">
                  <h4 className="font-semibold mb-2">Completion Report</h4>
                  <div className="text-sm text-slate-600 space-y-1">
                    <p><span className="font-medium">Final cost:</span> {selectedIssue.completion.finalCost || 0}</p>
                    <p><span className="font-medium">Execution report:</span> {selectedIssue.completion.executionReport}</p>
                    {selectedIssue.completion.workPerformed && (
                      <p><span className="font-medium">Work performed:</span> {selectedIssue.completion.workPerformed}</p>
                    )}
                  </div>
                  {renderAttachmentList(selectedIssue.completion.reportAttachments)}
                  {selectedIssue.completion.proofDocuments?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {selectedIssue.completion.proofDocuments.map((doc: string, index: number) => (
                        <a
                          key={`${doc}-${index}`}
                          href={doc}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-xs text-blue-600 hover:underline"
                        >
                          Proof Document {index + 1}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedIssue.status === 'completed' && (
                <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-semibold">Approve Completion</h4>
                  <div className="space-y-2">
                    <Label htmlFor="feedback">Feedback (Optional)</Label>
                    <Textarea
                      id="feedback"
                      value={issueUpdateData.feedback}
                      onChange={(e) => setIssueUpdateData({ ...issueUpdateData, feedback: e.target.value })}
                      placeholder="Provide feedback on the work completed..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rating">Rating (1-5)</Label>
                    <Select
                      value={issueUpdateData.rating.toString()}
                      onValueChange={(value) => setIssueUpdateData({ ...issueUpdateData, rating: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Rate the work" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5 - Excellent</SelectItem>
                        <SelectItem value="4">4 - Good</SelectItem>
                        <SelectItem value="3">3 - Satisfactory</SelectItem>
                        <SelectItem value="2">2 - Poor</SelectItem>
                        <SelectItem value="1">1 - Very Poor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => handleApproveIssue(selectedIssue.id)} className="w-full">
                    Approve & Close Issue
                  </Button>
                </div>
              )}

              <ActivityLog 
                entityType="issue"
                entityId={selectedIssue.id}
                accessToken={accessToken}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Equipment Detail Dialog */}
      {selectedEquipment && (
        <Dialog open={!!selectedEquipment} onOpenChange={() => setSelectedEquipment(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Equipment Details</DialogTitle>
              <DialogDescription>Equipment ID: {selectedEquipment.id}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">{selectedEquipment.name}</h3>
                <div className="text-sm text-slate-600 space-y-1">
                  <p><span className="font-medium">Category:</span> {selectedEquipment.category}</p>
                  <p><span className="font-medium">Brand:</span> {selectedEquipment.brand} {selectedEquipment.model}</p>
                  {selectedEquipment.serialNumber && <p><span className="font-medium">Serial:</span> {selectedEquipment.serialNumber}</p>}
                  {selectedEquipment.location && <p><span className="font-medium">Location:</span> {selectedEquipment.location}</p>}
                </div>
              </div>

                {selectedEquipment.recordedBy && (
                  <ContactCard 
                    title="Recorded By"
                    name={selectedEquipment.recordedBy.name}
                    role={selectedEquipment.recordedBy.role}
                    branch={selectedEquipment.recordedBy.branch}
                    contact={selectedEquipment.recordedBy.contact}
                  />
                )}

                <EquipmentReplacementDialog
                  equipment={selectedEquipment}
                  accessToken={accessToken}
                  canEdit={activeRole === 'facility_manager' || activeRole === 'company_admin'}
                  onReplaced={loadDashboardData}
                />

                <EquipmentMaintenancePanel
                  equipmentId={selectedEquipment.id}
                  accessToken={accessToken}
                  canEdit={activeRole === 'facility_manager' || activeRole === 'company_admin'}
                />

                <ProcedureChecklistPanel
                  companyId={companyId}
                  equipmentId={selectedEquipment.id}
                  equipmentCategory={selectedEquipment.category}
                  accessToken={accessToken}
                  canEdit={activeRole === 'facility_manager' || activeRole === 'company_admin'}
                />

                <ActivityLog 
                  entityType="equipment"
                  entityId={selectedEquipment.id}
                  accessToken={accessToken}
                  title="Equipment History"
                />
            </div>
          </DialogContent>
        </Dialog>
      )}
      <MobileBottomNav
        activeId={activeTab}
        items={[
          { id: 'issues', label: 'Issues', icon: <AlertCircle className="h-4 w-4" />, onClick: () => setActiveTab('issues') },
          { id: 'equipment', label: 'Assets', icon: <Package className="h-4 w-4" />, onClick: () => setActiveTab('equipment') },
          { id: 'procedures', label: 'Plans', icon: <ClipboardList className="h-4 w-4" />, onClick: () => setActiveTab('procedures') },
          { id: 'consumables', label: 'Stock', icon: <FlaskConical className="h-4 w-4" />, onClick: () => setActiveTab('consumables') },
          { id: 'contractors', label: 'Vendors', icon: <Users className="h-4 w-4" />, onClick: () => setActiveTab('contractors') },
        ]}
      />
        </SidebarInset>
      </Tabs>
    </SidebarProvider>
  );
}
