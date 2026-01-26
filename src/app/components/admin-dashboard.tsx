import { useState, useEffect } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Badge } from '@/app/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { ContactCard } from '@/app/components/contact-card';
import { Checkbox } from '@/app/components/ui/checkbox';
import { ActivityLog } from '@/app/components/activity-log';
import { ProfileSettings } from '@/app/components/profile-settings';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import { IssueTimeline } from '@/app/components/issue-timeline';
import { EquipmentImportDialog } from '@/app/components/equipment-import-dialog';
import { EquipmentMaintenancePanel } from '@/app/components/equipment-maintenance-panel';
import { EquipmentReplacementDialog } from '@/app/components/equipment-replacement-dialog';
import { AdminIntelligencePanel } from '@/app/components/admin-intelligence-panel';
import { ReportsPanel } from '@/app/components/reports-panel';
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
import { downloadCsv, inDateRange, printTable, ExportColumn } from '@/app/components/table-export';
import { toast } from 'sonner';
import { AlertCircle, Bell, Building2, ClipboardList, FlaskConical, LayoutGrid, LineChart, LogOut, Package, Plus, Search, UserPlus, Users } from 'lucide-react';
import { projectId } from '/utils/supabase/info';
import { getAuthHeaders } from '/utils/supabase/auth';

interface AdminDashboardProps {
  user: any;
  accessToken: string;
  onLogout: () => void;
  companyId: string;
  companyBindings: any[];
  onCompanyChange: (companyId: string) => void;
  onProfileUpdate: (profile: any) => void;
  readOnly?: boolean;
}

export function AdminDashboard({ user, accessToken, onLogout, companyId, companyBindings, onCompanyChange, onProfileUpdate, readOnly }: AdminDashboardProps) {
  const isReadOnly = readOnly === true;
  const [stats, setStats] = useState<any>(null);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [companyUsers, setCompanyUsers] = useState<any[]>([]);
  const [contractors, setContractors] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [teamTab, setTeamTab] = useState('managers');
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [globalSearch, setGlobalSearch] = useState('');
  
  const [isCreateFacilityOpen, setIsCreateFacilityOpen] = useState(false);
  const [isCreateFMOpen, setIsCreateFMOpen] = useState(false);
  const [isAssignContractorOpen, setIsAssignContractorOpen] = useState(false);
  const [isEditFMOpen, setIsEditFMOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<any>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<any>(null);
  const [selectedFM, setSelectedFM] = useState<any>(null);

  const [issueSearch, setIssueSearch] = useState('');
  const [issueStatusFilter, setIssueStatusFilter] = useState('all');
  const [issuePriorityFilter, setIssuePriorityFilter] = useState('all');
  const [issueStartDate, setIssueStartDate] = useState('');
  const [issueEndDate, setIssueEndDate] = useState('');

  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [equipmentHealthFilter, setEquipmentHealthFilter] = useState('all');
  const [equipmentStartDate, setEquipmentStartDate] = useState('');
  const [equipmentEndDate, setEquipmentEndDate] = useState('');

  const [facilitySearch, setFacilitySearch] = useState('');

  const [managerSearch, setManagerSearch] = useState('');
  const [supervisorSearch, setSupervisorSearch] = useState('');
  const [contractorSearch, setContractorSearch] = useState('');

  const resolveImageUrl = (value?: string) => {
    if (!value) return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.includes('drive.google.com')) {
      const idMatch = trimmed.match(/\/d\/([^/]+)/) || trimmed.match(/[?&]id=([^&]+)/);
      if (idMatch?.[1]) {
        return `https://drive.google.com/uc?export=view&id=${idMatch[1]}`;
      }
    }
    return trimmed;
  };

  const buildAuthHeaders = async (extra?: Record<string, string>) => {
    const { headers, token } = await getAuthHeaders(accessToken);
    if (!token) {
      toast.error('Session expired. Please sign in again.');
      return null;
    }
    return { ...headers, ...extra };
  };
  
  const [facilityData, setFacilityData] = useState({ 
    name: '', 
    location: '', 
    address: '', 
    phone: '' 
  });
  
  const [fmData, setFmData] = useState({
    email: '',
    password: '',
    name: '',
    phone: '',
    facilityIds: [] as string[]
  });

  const [isCreateFSOpen, setIsCreateFSOpen] = useState(false);
  const [fsData, setFsData] = useState({
    email: '',
    password: '',
    name: '',
    phone: ''
  });

  const [fmEditData, setFmEditData] = useState({
    name: '',
    phone: '',
    facilityIds: [] as string[],
    password: ''
  });

  const [contractorAssignment, setContractorAssignment] = useState({
    contractorId: '',
    facilityIds: [] as string[],
    categories: [] as string[]
  });

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

      const [
        statsData,
        companyData,
        facilitiesData,
        issuesData,
        equipmentData,
        usersData,
        contractorsData
      ] = await Promise.all([
        fetchJson(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/dashboard/stats?companyId=${companyId}`),
        fetchJson(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/companies/${companyId}`),
        fetchJson(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/facilities?companyId=${companyId}`),
        fetchJson(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/issues?companyId=${companyId}`),
        fetchJson(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/equipment?companyId=${companyId}`),
        fetchJson(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/users?companyId=${companyId}`),
        fetchJson(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/contractors?companyId=${companyId}`)
      ]);

      if (statsData.success) setStats(statsData.stats);
      if (companyData.success) setCompany(companyData.company);
      if (facilitiesData.success) setFacilities(facilitiesData.facilities);
      if (issuesData.success) setIssues(issuesData.issues);
      if (equipmentData.success) setEquipment(equipmentData.equipment);
      if (usersData.success) setCompanyUsers(usersData.users);
      if (contractorsData.success) setContractors(contractorsData.contractors);
      if ([statsData, companyData, facilitiesData, issuesData, equipmentData, usersData, contractorsData].some((item) => item?.error)) {
        const firstError = [statsData, companyData, facilitiesData, issuesData, equipmentData, usersData, contractorsData]
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

  const handleCreateFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const headers = await buildAuthHeaders({ 'Content-Type': 'application/json' });
      if (!headers) return;
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/facilities`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...facilityData, companyId })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Facility created successfully');
        setIsCreateFacilityOpen(false);
        setFacilityData({ name: '', location: '', address: '', phone: '' });
        loadDashboardData();
      } else {
        toast.error(data.error || 'Failed to create facility');
      }
    } catch (error) {
      console.error('Create facility error:', error);
      toast.error('Failed to create facility');
    }
  };

  const handleCreateFacilityManager = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (fmData.facilityIds.length === 0) {
        toast.error('Select at least one facility for this manager');
        return;
      }

      const headers = await buildAuthHeaders({ 'Content-Type': 'application/json' });
      if (!headers) return;
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/users/facility-manager`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...fmData, companyId })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Facility Manager created successfully');
        setIsCreateFMOpen(false);
        setFmData({ email: '', password: '', name: '', phone: '', facilityIds: [] });
        loadDashboardData();
      } else {
        toast.error(data.error || 'Failed to create Facility Manager');
      }
    } catch (error) {
      console.error('Create FM error:', error);
      toast.error('Failed to create Facility Manager');
    }
  };

  const openEditFacilityManager = (manager: any) => {
    setSelectedFM(manager);
    setFmEditData({
      name: manager.name || '',
      phone: manager.phone || '',
      facilityIds: manager.facilityIds || [],
      password: ''
    });
    setIsEditFMOpen(true);
  };

  const handleUpdateFacilityManager = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFM) return;
    if (fmEditData.facilityIds.length === 0) {
      toast.error('Select at least one facility for this manager');
      return;
    }

    try {
      const headers = await buildAuthHeaders({ 'Content-Type': 'application/json' });
      if (!headers) return;
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/users/${selectedFM.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          companyId,
          name: fmEditData.name,
          phone: fmEditData.phone,
          facilityIds: fmEditData.facilityIds,
          password: fmEditData.password || undefined
        })
      });

      const data = await response.json();
      if (!data.success) {
        toast.error(data.error || 'Failed to update facility manager');
        return;
      }

      toast.success('Facility manager updated');
      setIsEditFMOpen(false);
      setSelectedFM(null);
      setFmEditData({ name: '', phone: '', facilityIds: [], password: '' });
      loadDashboardData();
    } catch (error) {
      console.error('Update FM error:', error);
      toast.error('Failed to update facility manager');
    }
  };

  const handleRemoveContractor = async (contractorId: string) => {
    const confirmRemove = window.confirm('Remove this contractor from your company-');
    if (!confirmRemove) return;

    try {
      const headers = await buildAuthHeaders();
      if (!headers) return;
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/contractors/${contractorId}?companyId=${companyId}`, {
        method: 'DELETE',
        headers
      });

      const data = await response.json();
      if (!data.success) {
        toast.error(data.error || 'Failed to remove contractor');
        return;
      }

      toast.success('Contractor removed');
      loadDashboardData();
    } catch (error) {
      console.error('Remove contractor error:', error);
      toast.error('Failed to remove contractor');
    }
  };

  const handleCreateFacilitySupervisor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!companyId) {
        toast.error('Select a company before creating a supervisor');
        return;
      }
      const headers = await buildAuthHeaders({ 'Content-Type': 'application/json' });
      if (!headers) return;
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/users/facility-supervisor`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...fsData, companyId })
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Company Supervisor created successfully');
        setIsCreateFSOpen(false);
        setFsData({ email: '', password: '', name: '', phone: '' });
        loadDashboardData();
      } else {
        toast.error(data.error || 'Failed to create Company Supervisor');
      }
    } catch (error) {
      console.error('Create supervisor error:', error);
      toast.error('Failed to create Company Supervisor');
    }
  };

  const handleToggleContractorStatus = async (contractor: any) => {
    const isSuspended = contractor?.binding?.status === 'suspended';
    const reason = isSuspended ? '' : (window.prompt('Reason for suspension (optional):') || '');
    try {
      const headers = await buildAuthHeaders({ 'Content-Type': 'application/json' });
      if (!headers) return;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/contractors/${contractor.id}/${isSuspended ? 'resume' : 'suspend'}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ companyId, reason })
        }
      );

      const data = await response.json();
      if (data.success) {
        toast.success(isSuspended ? 'Contractor resumed' : 'Contractor suspended');
        loadDashboardData();
      } else {
        toast.error(data.error || 'Failed to update contractor status');
      }
    } catch (error) {
      console.error('Update contractor status error:', error);
      toast.error('Failed to update contractor status');
    }
  };

  const toggleFacilityAssignment = (facilityId: string) => {
    setFmData((prev) => {
      const isSelected = prev.facilityIds.includes(facilityId);
      return {
        ...prev,
        facilityIds: isSelected
          ? prev.facilityIds.filter((id) => id !== facilityId)
          : [...prev.facilityIds, facilityId]
      };
    });
  };

  const toggleEditFacilityAssignment = (facilityId: string) => {
    setFmEditData((prev) => {
      const isSelected = prev.facilityIds.includes(facilityId);
      return {
        ...prev,
        facilityIds: isSelected
          ? prev.facilityIds.filter((id) => id !== facilityId)
          : [...prev.facilityIds, facilityId]
      };
    });
  };

  const handleAssignContractor = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const headers = await buildAuthHeaders({ 'Content-Type': 'application/json' });
      if (!headers) return;
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/users/assign-contractor`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...contractorAssignment, companyId })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Contractor assigned successfully');
        setIsAssignContractorOpen(false);
        setContractorAssignment({ contractorId: '', facilityIds: [], categories: [] });
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

  const formatMinutes = (value?: number | null) => {
    if (value === null || value === undefined) return '-';
    if (value < 60) return `${value}m`;
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return `${hours}h ${minutes}m`;
  };

  const issueQuery = issueSearch.trim().toLowerCase();
  const filteredIssues = issues.filter((issue) => {
    const matchesQuery = !issueQuery
      || `${issue.equipmentName} ${issue.description} ${issue.id} ${issue.reportedBy?.name || ''}`
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

  const facilityQuery = facilitySearch.trim().toLowerCase();
  const filteredFacilities = facilities.filter((facility) => {
    const matchesQuery = !facilityQuery
      || `${facility.name} ${facility.location || ''} ${facility.address || ''} ${facility.id}`
        .toLowerCase()
        .includes(facilityQuery);
    return matchesQuery;
  });

  const managerQuery = managerSearch.trim().toLowerCase();
  const filteredManagers = companyUsers
    .filter((user) => user.role === 'facility_manager')
    .filter((fm) => {
      const matchesQuery = !managerQuery
        || `${fm.name} ${fm.email || ''} ${fm.phone || ''}`.toLowerCase().includes(managerQuery);
      return matchesQuery;
    });

  const supervisorQuery = supervisorSearch.trim().toLowerCase();
  const filteredSupervisors = companyUsers
    .filter((user) => user.role === 'facility_supervisor')
    .filter((sup) => {
      const matchesQuery = !supervisorQuery
        || `${sup.name} ${sup.email || ''} ${sup.phone || ''}`.toLowerCase().includes(supervisorQuery);
      return matchesQuery;
    });

  const contractorQuery = contractorSearch.trim().toLowerCase();
  const filteredContractors = contractors.filter((contractor) => {
    const matchesQuery = !contractorQuery
      || `${contractor.name} ${contractor.email || ''} ${contractor.phone || ''}`.toLowerCase().includes(contractorQuery);
    return matchesQuery;
  });
  const avatarUrl = user?.avatarUrl || user?.avatar_url || user?.profile?.avatarUrl;
  const initials = (user?.name || 'User')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0])
    .join('')
    .toUpperCase();
  const roleLabel = isReadOnly ? 'Company Supervisor' : 'Company Admin';

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
                    <DialogDescription>Review and update your personal details.</DialogDescription>
                  </DialogHeader>
                  <ProfileSettings
                    user={user}
                    role={user?.role || (isReadOnly ? 'facility_supervisor' : 'company_admin')}
                    accessToken={accessToken}
                    onProfileUpdated={onProfileUpdate}
                  />
                </DialogContent>
              </Dialog>
              <div className="group-data-[collapsible=icon]:hidden">
                <div className="text-sm font-semibold text-white">{user?.name || 'Admin'}</div>
                <div className="text-xs text-white/70">{company?.name || companyId}</div>
              </div>
            </div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-white/50 group-data-[collapsible=icon]:hidden">{roleLabel}</div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
                    <LayoutGrid />
                    <span>Overview</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={activeTab === 'facilities'} onClick={() => setActiveTab('facilities')}>
                    <Building2 />
                    <span>Facilities</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={activeTab === 'equipment'} onClick={() => setActiveTab('equipment')}>
                    <Package />
                    <span>Equipment</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={activeTab === 'issues'} onClick={() => setActiveTab('issues')}>
                    <AlertCircle />
                    <span>Issues</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={activeTab === 'reports'} onClick={() => setActiveTab('reports')}>
                    <LineChart />
                    <span>Reports</span>
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
                  <SidebarMenuButton isActive={activeTab === 'team'} onClick={() => setActiveTab('team')}>
                    <Users />
                    <span>Team</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
            <SidebarSeparator />
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border px-6 py-4 text-xs text-white/60 group-data-[collapsible=icon]:hidden">
            {roleLabel} access
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="min-h-screen min-w-0 bg-background flex flex-col">
      {/* Header */}
        <header className="sticky top-0 z-30 border-b border-white/70 bg-white/85 px-4 py-4 sm:px-6 backdrop-blur shadow-[0_12px_30px_-24px_rgba(15,23,42,0.5)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-1 items-center gap-3">
              <SidebarTrigger className="hidden md:inline-flex" />
              <div className="flex w-full max-w-md items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-3 py-2 shadow-sm">
                <Search className="h-4 w-4 text-slate-400" />
                <Input
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="Search equipment, issues, contractors..."
                  className="h-6 border-0 bg-transparent p-0 text-sm text-slate-700 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
            {companyBindings.length > 1 && (
              <Select value={companyId} onValueChange={onCompanyChange}>
                <SelectTrigger className="w-full sm:w-[200px]">
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
                  <DialogDescription>Updates and audit alerts.</DialogDescription>
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

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="px-4 py-6 pb-24 sm:px-6 space-y-6">
        {activeTab === 'overview' && (
          <>
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="border-emerald-100 bg-emerald-50/80">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Facilities</CardTitle>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Building2 className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-slate-900">{stats?.totalFacilities || 0}</div>
            </CardContent>
          </Card>

          <Card className="border-sky-100 bg-sky-50/80">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Equipment</CardTitle>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <Package className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-slate-900">{stats?.totalEquipment || 0}</div>
              <div className="text-xs text-slate-500 mt-1">
                <span className="text-emerald-600">o</span> {stats?.healthyEquipment || 0} Healthy
                <span className="text-amber-600 ml-2">o</span> {stats?.concerningEquipment || 0} Warning
                <span className="text-rose-600 ml-2">o</span> {stats?.criticalEquipment || 0} Critical
              </div>
            </CardContent>
          </Card>

          <Card className="border-rose-100 bg-rose-50/80">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open Issues</CardTitle>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <AlertCircle className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-slate-900">{stats?.openIssues || 0}</div>
              <p className="text-xs text-rose-600 mt-1">{stats?.criticalIssues || 0} Critical</p>
            </CardContent>
          </Card>

          <Card className="border-amber-100 bg-amber-50/80">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">Team Members</CardTitle>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <Users className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-slate-900">{companyUsers.length}</div>
              <p className="text-xs text-slate-500 mt-1">{contractors.length} Contractors</p>
            </CardContent>
          </Card>
        </div>
          </>
        )}

            <TabsContent value="overview" className="space-y-6">
            <AdminIntelligencePanel
              facilities={facilities}
              equipment={equipment}
              issues={issues}
              contractors={contractors}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Issues */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Issues</CardTitle>
                  <CardDescription className="text-xs text-slate-500">Latest reported issues</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Issue</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reported By</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {issues.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-sm text-slate-500">
                            No issues reported
                          </TableCell>
                        </TableRow>
                      ) : (
                        issues.slice(0, 5).map((issue) => (
                          <TableRow
                            key={issue.id}
                            className="cursor-pointer"
                            onClick={() => setSelectedIssue(issue)}
                          >
                            <TableCell>
                              <div className="font-medium text-slate-900">{issue.equipmentName}</div>
                              <div className="text-xs text-slate-500">{issue.description}</div>
                            </TableCell>
                            <TableCell>{getPriorityBadge(issue.priority)}</TableCell>
                            <TableCell>{getStatusBadge(issue.status)}</TableCell>
                            <TableCell className="text-sm text-slate-600">
                              {issue.reportedBy ? issue.reportedBy.name : '-'}
                            </TableCell>
                            <TableCell className="text-sm text-slate-500">
                              {new Date(issue.createdAt).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Critical Equipment */}
              <Card>
                <CardHeader>
                  <CardTitle>Equipment Health</CardTitle>
                  <CardDescription className="text-xs text-slate-500">Equipment requiring attention</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Equipment</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Condition</TableHead>
                        <TableHead>Recorded By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {equipment.filter(eq => eq.healthStatus !== 'green').length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-sm text-slate-500">
                            All equipment healthy
                          </TableCell>
                        </TableRow>
                      ) : (
                        equipment.filter(eq => eq.healthStatus !== 'green').slice(0, 5).map((eq) => (
                          <TableRow
                            key={eq.id}
                            className="cursor-pointer"
                            onClick={() => setSelectedEquipment(eq)}
                          >
                            <TableCell>
                              <div className="font-medium text-slate-900">{eq.name}</div>
                              <div className="text-xs text-slate-500">{eq.category}</div>
                            </TableCell>
                            <TableCell className="text-sm text-slate-600">{eq.location || eq.facilityName || '-'}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center gap-2 text-xs text-slate-600">
                                <span className={`h-2.5 w-2.5 rounded-full ${
                                  eq.healthStatus === 'red' ? 'bg-red-500' :
                                  eq.healthStatus === 'yellow' ? 'bg-yellow-400' : 'bg-primary'
                                }`} />
                                {eq.healthStatus === 'red' ? 'Critical' : eq.healthStatus === 'yellow' ? 'Concerning' : 'Good'}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-slate-600">
                              {eq.recordedBy?.name || '-'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

            <TabsContent value="facilities" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Facilities</CardTitle>
                    <CardDescription className="text-xs text-slate-500">Manage company branches</CardDescription>
                  </div>
                  {!isReadOnly && (
                  <Dialog open={isCreateFacilityOpen} onOpenChange={setIsCreateFacilityOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Facility
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create New Facility</DialogTitle>
                        <DialogDescription>Add a new branch to your company</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleCreateFacility} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="facility-name">Facility Name</Label>
                          <Input
                            id="facility-name"
                            value={facilityData.name}
                            onChange={(e) => setFacilityData({ ...facilityData, name: e.target.value })}
                            placeholder="Port Harcourt Outlet 1"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="facility-location">Location</Label>
                          <Input
                            id="facility-location"
                            value={facilityData.location}
                            onChange={(e) => setFacilityData({ ...facilityData, location: e.target.value })}
                            placeholder="Port Harcourt"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="facility-address">Full Address</Label>
                          <Input
                            id="facility-address"
                            value={facilityData.address}
                            onChange={(e) => setFacilityData({ ...facilityData, address: e.target.value })}
                            placeholder="123 Main Street, Port Harcourt"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="facility-phone">Phone</Label>
                          <Input
                            id="facility-phone"
                            type="tel"
                            value={facilityData.phone}
                            onChange={(e) => setFacilityData({ ...facilityData, phone: e.target.value })}
                            placeholder="+234 xxx xxx xxxx"
                          />
                        </div>
                        <Button type="submit" className="w-full">Create Facility</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-xs text-slate-500">Search</Label>
                    <Input
                      value={facilitySearch}
                      onChange={(e) => setFacilitySearch(e.target.value)}
                      placeholder="Search facilities"
                      className="h-8"
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="h-8"
                    onClick={() => downloadCsv(
                      `facilities-${companyId}.csv`,
                      [
                        { label: 'Facility', value: (row: any) => row.name },
                        { label: 'Location', value: (row: any) => row.location || '-' },
                        { label: 'Address', value: (row: any) => row.address || '-' },
                        { label: 'ID', value: (row: any) => row.id },
                      ] as ExportColumn<any>[],
                      filteredFacilities
                    )}
                  >
                    Download CSV
                  </Button>
                  <Button
                    variant="outline"
                    className="h-8"
                    onClick={() => printTable(
                      'Facilities',
                      [
                        { label: 'Facility', value: (row: any) => row.name },
                        { label: 'Location', value: (row: any) => row.location || '-' },
                        { label: 'Address', value: (row: any) => row.address || '-' },
                        { label: 'ID', value: (row: any) => row.id },
                      ] as ExportColumn<any>[],
                      filteredFacilities,
                      'All time'
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
                      <TableHead>Facility</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Created By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFacilities.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-slate-500">
                          No facilities yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredFacilities.map((facility) => (
                        <TableRow key={facility.id}>
                          <TableCell>
                            <div className="font-medium text-slate-900">{facility.name}</div>
                            {facility.address && (
                              <div className="text-xs text-slate-500">{facility.address}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">{facility.location || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{facility.id}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {facility.createdBy?.name || '-'}
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
                <CardTitle>Equipment Registry</CardTitle>
                <CardDescription className="text-xs text-slate-500">All equipment across facilities</CardDescription>
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
                  <div className="min-w-[150px]">
                    <Label className="text-xs text-slate-500">Health</Label>
                    <Select value={equipmentHealthFilter} onValueChange={setEquipmentHealthFilter}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="All" />
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
                  {!isReadOnly && (
                    <EquipmentImportDialog
                      companyId={companyId}
                      accessToken={accessToken}
                      onImported={loadDashboardData}
                    />
                  )}
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
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200/70 bg-white/80 shadow-sm">
                                {eq.imageUrl ? (
                                  <img src={resolveImageUrl(eq.imageUrl)} alt={eq.name} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">IMG</div>
                                )}
                              </div>
                              <div>
                                <div className="font-medium text-slate-900">{eq.name}</div>
                                <div className="text-xs text-slate-500">
                                  {eq.brand || '-'} {eq.model || ''}
                                </div>
                              </div>
                            </div>
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

            <TabsContent value="issues" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Issues</CardTitle>
                <CardDescription className="text-xs text-slate-500">Complete issue tracking</CardDescription>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <Label className="text-xs text-slate-500">Search</Label>
                    <Input
                      value={issueSearch}
                      onChange={(e) => setIssueSearch(e.target.value)}
                      placeholder="Search issues"
                      className="h-8"
                    />
                  </div>
                  <div className="min-w-[150px]">
                    <Label className="text-xs text-slate-500">Status</Label>
                    <Select value={issueStatusFilter} onValueChange={setIssueStatusFilter}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="created">Created</SelectItem>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="awaiting_parts">Awaiting Parts</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[150px]">
                    <Label className="text-xs text-slate-500">Priority</Label>
                    <Select value={issuePriorityFilter} onValueChange={setIssuePriorityFilter}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="All" />
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
                        { label: 'Issue', value: (row: any) => row.equipmentName },
                        { label: 'Description', value: (row: any) => row.description },
                        { label: 'Priority', value: (row: any) => row.priority },
                        { label: 'Status', value: (row: any) => row.status },
                        { label: 'Reported By', value: (row: any) => row.reportedBy?.name || '-' },
                        { label: 'Created', value: (row: any) => row.createdAt },
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
                      'Issues Report',
                      [
                        { label: 'Issue', value: (row: any) => row.equipmentName },
                        { label: 'Description', value: (row: any) => row.description },
                        { label: 'Priority', value: (row: any) => row.priority },
                        { label: 'Status', value: (row: any) => row.status },
                        { label: 'Reported By', value: (row: any) => row.reportedBy?.name || '-' },
                        { label: 'Created', value: (row: any) => row.createdAt },
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
                      <TableHead>Reported By</TableHead>
                      <TableHead>Updated</TableHead>
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
                          </TableCell>
                          <TableCell>{getPriorityBadge(issue.priority)}</TableCell>
                          <TableCell>{getStatusBadge(issue.status)}</TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {issue.reportedBy?.name || '-'}
                          </TableCell>
                          <TableCell className="text-sm text-slate-500">
                            {new Date(issue.updatedAt || issue.createdAt).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <ReportsPanel
              companyId={companyId}
              facilities={facilities}
              equipment={equipment}
              issues={issues}
              contractors={contractors}
            />
          </TabsContent>

          <TabsContent value="procedures" className="space-y-4">
            <ProceduresPanel
              companyId={companyId}
              accessToken={accessToken}
              canEdit={!isReadOnly}
            />
          </TabsContent>

            <TabsContent value="consumables" className="space-y-4">
              <ConsumablesPanel
                companyId={companyId}
                accessToken={accessToken}
                canEdit={!isReadOnly}
                canManage={!isReadOnly}
                equipment={equipment}
              />
            </TabsContent>

                    <TabsContent value="team" className="space-y-4">
            <Tabs value={teamTab} onValueChange={setTeamTab} className="space-y-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="managers">Facility Managers</TabsTrigger>
                <TabsTrigger value="supervisors">Company Supervisors</TabsTrigger>
                <TabsTrigger value="contractors">Contractors</TabsTrigger>
              </TabsList>

              <TabsContent value="managers">
                {/* Facility Managers */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Facility Managers</CardTitle>
                        <CardDescription className="text-xs text-slate-500">Manage facility staff</CardDescription>
                      </div>
                      {!isReadOnly && (
                      <Dialog open={isCreateFMOpen} onOpenChange={setIsCreateFMOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm">
                            <UserPlus className="w-4 h-4 mr-2" />
                            Add Manager
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Create Facility Manager</DialogTitle>
                            <DialogDescription>Add a new facility manager to your team</DialogDescription>
                          </DialogHeader>
                          <form onSubmit={handleCreateFacilityManager} className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="fm-name">Full Name</Label>
                              <Input
                                id="fm-name"
                                value={fmData.name}
                                onChange={(e) => setFmData({ ...fmData, name: e.target.value })}
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="fm-email">Email</Label>
                              <Input
                                id="fm-email"
                                type="email"
                                value={fmData.email}
                                onChange={(e) => setFmData({ ...fmData, email: e.target.value })}
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="fm-phone">Phone</Label>
                              <Input
                                id="fm-phone"
                                type="tel"
                                value={fmData.phone}
                                onChange={(e) => setFmData({ ...fmData, phone: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Assigned Facilities</Label>
                              {facilities.length === 0 ? (
                                <p className="text-xs text-slate-500">Create a facility before assigning a manager.</p>
                              ) : (
                                <div className="space-y-2">
                                  {facilities.map((facility) => (
                                    <label key={facility.id} className="flex items-center gap-2 text-sm">
                                      <Checkbox
                                        checked={fmData.facilityIds.includes(facility.id)}
                                        onCheckedChange={() => toggleFacilityAssignment(facility.id)}
                                      />
                                      <span>{facility.name}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="fm-password">Password</Label>
                              <Input
                                id="fm-password"
                                type="password"
                                value={fmData.password}
                                onChange={(e) => setFmData({ ...fmData, password: e.target.value })}
                                required
                                minLength={6}
                              />
                            </div>
                            <Button type="submit" className="w-full">Create Manager</Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <div className="flex-1 min-w-[200px]">
                        <Label className="text-xs text-slate-500">Search</Label>
                        <Input
                          value={managerSearch}
                          onChange={(e) => setManagerSearch(e.target.value)}
                          placeholder="Search managers"
                          className="h-8"
                        />
                      </div>
                      <Button
                        variant="outline"
                        className="h-8"
                        onClick={() => downloadCsv(
                          `facility-managers-${companyId}.csv`,
                          [
                            { label: 'Name', value: (row) => row.name },
                            { label: 'Email', value: (row) => row.email || '-' },
                            { label: 'Phone', value: (row) => row.phone || '-' },
                            { label: 'Facilities', value: (row) => row.facilityIds?.length || 0 },
                          ],
                          filteredManagers
                        )}
                      >
                        Download CSV
                      </Button>
                      <Button
                        variant="outline"
                        className="h-8"
                        onClick={() => printTable(
                          'Facility Managers',
                          [
                            { label: 'Name', value: (row) => row.name },
                            { label: 'Email', value: (row) => row.email || '-' },
                            { label: 'Phone', value: (row) => row.phone || '-' },
                            { label: 'Facilities', value: (row) => row.facilityIds?.length || 0 },
                          ],
                          filteredManagers
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
                          <TableHead>Facilities</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredManagers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-sm text-slate-500">
                              No facility managers yet
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredManagers.map((fm) => (
                            <TableRow key={fm.id}>
                              <TableCell>
                                <div className="font-medium text-slate-900">{fm.name}</div>
                                <div className="text-xs text-slate-500">{fm.role}</div>
                              </TableCell>
                              <TableCell className="text-sm text-slate-600">
                                <div>{fm.email || '-'}</div>
                                <div className="text-xs text-slate-500">{fm.phone || '-'}</div>
                              </TableCell>
                              <TableCell className="text-sm text-slate-600">
                                {fm.facilityIds?.length ? `${fm.facilityIds.length} assigned` : '-'}
                              </TableCell>
                              <TableCell>
                                {!isReadOnly && (
                                  <Button size="sm" variant="outline" onClick={() => openEditFacilityManager(fm)}>
                                    Edit Profile
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="supervisors">
                {/* Company Supervisors */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Company Supervisors</CardTitle>
                        <CardDescription className="text-xs text-slate-500">Read-only oversight</CardDescription>
                      </div>
                      {!isReadOnly && (
                        <Dialog open={isCreateFSOpen} onOpenChange={setIsCreateFSOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <UserPlus className="w-4 h-4 mr-2" />
                              Add Supervisor
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Create Company Supervisor</DialogTitle>
                              <DialogDescription>Add a read-only supervisor account</DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleCreateFacilitySupervisor} className="space-y-4">
                              <div className="space-y-2">
                                <Label htmlFor="fs-name">Full Name</Label>
                                <Input
                                  id="fs-name"
                                  value={fsData.name}
                                  onChange={(e) => setFsData({ ...fsData, name: e.target.value })}
                                  required
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="fs-email">Email</Label>
                                <Input
                                  id="fs-email"
                                  type="email"
                                  value={fsData.email}
                                  onChange={(e) => setFsData({ ...fsData, email: e.target.value })}
                                  required
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="fs-phone">Phone</Label>
                                <Input
                                  id="fs-phone"
                                  value={fsData.phone}
                                  onChange={(e) => setFsData({ ...fsData, phone: e.target.value })}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="fs-password">Temporary Password</Label>
                                <Input
                                  id="fs-password"
                                  type="password"
                                  value={fsData.password}
                                  onChange={(e) => setFsData({ ...fsData, password: e.target.value })}
                                  required
                                />
                              </div>
                              <Button type="submit" className="w-full">Create Supervisor</Button>
                            </form>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 pb-3">
                      <Input
                        value={supervisorSearch}
                        onChange={(e) => setSupervisorSearch(e.target.value)}
                        placeholder="Search supervisors"
                        className="h-8"
                      />
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Contact</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSupervisors.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={2} className="text-center text-sm text-slate-500">
                              No supervisors yet
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredSupervisors.map((sup) => (
                            <TableRow key={sup.id}>
                              <TableCell>
                                <div className="font-medium text-slate-900">{sup.name}</div>
                                <div className="text-xs text-slate-500">{sup.role}</div>
                              </TableCell>
                              <TableCell className="text-sm text-slate-600">
                                <div>{sup.email || '-'}</div>
                                <div className="text-xs text-slate-500">{sup.phone || '-'}</div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="contractors">
                {/* Contractors */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Contractors</CardTitle>
                        <CardDescription className="text-xs text-slate-500">Assigned contractors</CardDescription>
                      </div>
                      {!isReadOnly && (
                      <Dialog open={isAssignContractorOpen} onOpenChange={setIsAssignContractorOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm">
                            <UserPlus className="w-4 h-4 mr-2" />
                            Assign Contractor
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Assign Contractor</DialogTitle>
                            <DialogDescription>Assign a contractor to your company</DialogDescription>
                          </DialogHeader>
                          <form onSubmit={handleAssignContractor} className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="contractor-id">Contractor ID</Label>
                              <Input
                                id="contractor-id"
                                value={contractorAssignment.contractorId}
                                onChange={(e) => setContractorAssignment({ ...contractorAssignment, contractorId: e.target.value })}
                                placeholder="6-character Contractor ID"
                                maxLength={6}
                                required
                              />
                              <p className="text-xs text-slate-500">Note: Contractor must have an existing account</p>
                            </div>
                            <Button type="submit" className="w-full">Assign Contractor</Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 flex flex-wrap items-end gap-3">
                        <div className="flex-1 min-w-[200px]">
                          <Label className="text-xs text-slate-500">Search</Label>
                          <Input
                            value={contractorSearch}
                            onChange={(e) => setContractorSearch(e.target.value)}
                            placeholder="Search contractors"
                            className="h-8"
                          />
                        </div>
                        <Button
                          variant="outline"
                          className="h-8"
                          onClick={() => downloadCsv(
                            `contractors-${companyId}.csv`,
                            [
                              { label: 'Name', value: (row) => row.name },
                              { label: 'Email', value: (row) => row.email || '-' },
                              { label: 'Phone', value: (row) => row.phone || '-' },
                              {
                                label: 'Specialization',
                                value: (row) => row.specialization || (Array.isArray(row.skills) ? row.skills.join(', ') : row.skills) || '-'
                              },
                              { label: 'Status', value: (row) => row?.binding?.status || 'active' },
                            ],
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
                            { label: 'Name', value: (row) => row.name },
                            { label: 'Email', value: (row) => row.email || '-' },
                            { label: 'Phone', value: (row) => row.phone || '-' },
                            {
                              label: 'Specialization',
                              value: (row) => row.specialization || (Array.isArray(row.skills) ? row.skills.join(', ') : row.skills) || '-'
                            },
                            { label: 'Status', value: (row) => row?.binding?.status || 'active' },
                          ],
                          filteredContractors
                        )}
                      >
                        Print PDF
                      </Button>
                      </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Specialization</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Performance</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredContractors.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-sm text-slate-500">
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
                              <TableCell>
                                <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs ${
                                  contractor?.binding?.status === 'suspended'
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {contractor?.binding?.status === 'suspended' ? 'Suspended' : 'Active'}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-slate-600">
                                <div>Response: {formatMinutes(contractor.performance?.avg_response_minutes)}</div>
                                <div>Completion: {formatMinutes(contractor.performance?.avg_completion_minutes)}</div>
                                <div>Missed SLA: {contractor.performance?.delayed_jobs_count ?? 0}</div>
                              </TableCell>
                              <TableCell>
                                {!isReadOnly && (
                                  <>
                                    <Button size="sm" variant="destructive" onClick={() => handleRemoveContractor(contractor.id)}>
                                      Remove
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="ml-2"
                                      onClick={() => handleToggleContractorStatus(contractor)}
                                    >
                                      {contractor?.binding?.status === 'suspended' ? 'Resume' : 'Suspend'}
                                    </Button>
                                  </>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>

          </div>
      </main>

      {selectedFM && (
        <Dialog open={isEditFMOpen} onOpenChange={(open) => {
          setIsEditFMOpen(open);
          if (!open) {
            setSelectedFM(null);
          }
        }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Facility Manager</DialogTitle>
              <DialogDescription>Update profile details, facilities, or reset password.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateFacilityManager} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fm-edit-name">Full Name</Label>
                <Input
                  id="fm-edit-name"
                  value={fmEditData.name}
                  onChange={(e) => setFmEditData({ ...fmEditData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fm-edit-email">Email</Label>
                <Input id="fm-edit-email" value={selectedFM.email || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fm-edit-phone">Phone</Label>
                <Input
                  id="fm-edit-phone"
                  value={fmEditData.phone}
                  onChange={(e) => setFmEditData({ ...fmEditData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Assigned Facilities</Label>
                {facilities.length === 0 ? (
                  <p className="text-xs text-slate-500">Create a facility before assigning a manager.</p>
                ) : (
                  <div className="space-y-2">
                    {facilities.map((facility) => (
                      <label key={facility.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={fmEditData.facilityIds.includes(facility.id)}
                          onCheckedChange={() => toggleEditFacilityAssignment(facility.id)}
                        />
                        <span>{facility.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="fm-edit-password">New Password (optional)</Label>
                <Input
                  id="fm-edit-password"
                  type="password"
                  value={fmEditData.password}
                  onChange={(e) => setFmEditData({ ...fmEditData, password: e.target.value })}
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full">Save Changes</Button>
            </form>
          </DialogContent>
        </Dialog>
      )}

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
                  title="Reported By"
                  name={selectedIssue.reportedBy.name}
                  role={selectedIssue.reportedBy.role}
                  branch={selectedIssue.reportedBy.branch}
                  contact={selectedIssue.reportedBy.contact}
                />
              )}

              <IssueTimeline issue={selectedIssue} />

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
                <div className="flex flex-wrap items-start gap-4">
                  <div className="h-24 w-24 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm">
                    {selectedEquipment.imageUrl ? (
                      <img src={resolveImageUrl(selectedEquipment.imageUrl)} alt={selectedEquipment.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">No image</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <h3 className="font-semibold mb-2">{selectedEquipment.name}</h3>
                    <div className="text-sm text-slate-600 space-y-1">
                  <p><span className="font-medium">Category:</span> {selectedEquipment.category}</p>
                  <p><span className="font-medium">Brand:</span> {selectedEquipment.brand} {selectedEquipment.model}</p>
                  {selectedEquipment.serialNumber && <p><span className="font-medium">Serial:</span> {selectedEquipment.serialNumber}</p>}
                    </div>
                  </div>
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
                  canEdit={!isReadOnly}
                  onReplaced={loadDashboardData}
                />

                <EquipmentMaintenancePanel
                  equipmentId={selectedEquipment.id}
                  accessToken={accessToken}
                  canEdit={!isReadOnly}
                />

                <ProcedureChecklistPanel
                  companyId={companyId}
                  equipmentId={selectedEquipment.id}
                  equipmentCategory={selectedEquipment.category}
                  accessToken={accessToken}
                  canEdit={!isReadOnly}
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
          { id: 'overview', label: 'Home', icon: <LayoutGrid className="h-4 w-4" />, onClick: () => setActiveTab('overview') },
          { id: 'facilities', label: 'Sites', icon: <Building2 className="h-4 w-4" />, onClick: () => setActiveTab('facilities') },
          { id: 'equipment', label: 'Assets', icon: <Package className="h-4 w-4" />, onClick: () => setActiveTab('equipment') },
          { id: 'issues', label: 'Issues', icon: <AlertCircle className="h-4 w-4" />, onClick: () => setActiveTab('issues') },
          { id: 'reports', label: 'Reports', icon: <LineChart className="h-4 w-4" />, onClick: () => setActiveTab('reports') },
        ]}
      />
        </SidebarInset>
      </Tabs>
    </SidebarProvider>
  );
}
