import { useState, useEffect } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Badge } from '@/app/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { ContactCard } from '@/app/components/contact-card';
import { ActivityLog } from '@/app/components/activity-log';
import { ProfileSettings } from '@/app/components/profile-settings';
import { toast } from 'sonner';
import { Package, AlertCircle, LogOut, Plus, CheckCircle } from 'lucide-react';
import { projectId } from '/utils/supabase/info';

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
    priority: 'medium'
  });

  const [issueUpdateData, setIssueUpdateData] = useState({
    feedback: '',
    rating: 0
  });

  useEffect(() => {
    if (companyId) {
      loadDashboardData();
    }
  }, [companyId]);

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
      const [statsRes, facilitiesRes, equipmentRes, issuesRes, contractorsRes] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/dashboard/stats?companyId=${companyId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          cache: 'no-store'
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/facilities?companyId=${companyId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          cache: 'no-store'
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/equipment?companyId=${companyId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          cache: 'no-store'
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/issues?companyId=${companyId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          cache: 'no-store'
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/contractors?companyId=${companyId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          cache: 'no-store'
        })
      ]);

      const [statsData, facilitiesData, equipmentData, issuesData, contractorsData] = await Promise.all([
        statsRes.json(),
        facilitiesRes.json(),
        equipmentRes.json(),
        issuesRes.json(),
        contractorsRes.json()
      ]);

      if (statsData.success) setStats(statsData.stats);
      if (facilitiesData.success) setFacilities(facilitiesData.facilities);
      if (equipmentData.success) setEquipment(equipmentData.equipment);
      if (issuesData.success) setIssues(issuesData.issues);
      if (contractorsData.success) setContractors(contractorsData.contractors);
    } catch (error) {
      console.error('Dashboard load error:', error);
      toast.error('Failed to load dashboard data');
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
            taskType: 'general'
          }
        : {
            equipmentId: issueData.equipmentId,
            description: issueData.description,
            priority: issueData.priority,
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
        setIssueData({ taskType: 'equipment', title: '', equipmentId: '', facilityId: '', description: '', priority: 'medium' });
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
      closed: { label: 'Closed', className: 'bg-gray-100 text-gray-800' },
    };

    const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-800' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const priorityConfig: Record<string, { label: string; className: string }> = {
      high: { label: 'High', className: 'bg-red-500 text-white' },
      medium: { label: 'Medium', className: 'bg-yellow-500 text-white' },
      low: { label: 'Low', className: 'bg-green-500 text-white' },
    };

    const config = priorityConfig[priority] || { label: priority, className: 'bg-gray-500 text-white' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getContractorName = (contractorId: string | null) => {
    if (!contractorId) return 'Unassigned';
    const contractor = contractors.find((item) => item.id === contractorId);
    return contractor?.name || contractorId;
  };

  const renderAttachmentList = (attachments?: any[]) => {
    if (!attachments?.length) return null;
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

  const totalEquipmentCount = Math.max(stats?.totalEquipment || 0, equipment.length);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Facility Manager Dashboard</h1>
            <p className="text-sm text-gray-500">Welcome, {user.name}</p>
          </div>
          <div className="flex gap-2">
            {companyBindings.length > 1 && (
              <Select value={companyId} onValueChange={onCompanyChange}>
                <SelectTrigger className="w-[200px]">
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
            <Button variant="outline" onClick={onLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Equipment</CardTitle>
              <Package className="w-4 h-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalEquipmentCount}</div>
              <div className="text-xs text-gray-500 mt-1">
                <span className="text-green-600">●</span> {stats?.healthyEquipment || 0} Healthy
                <span className="text-yellow-600 ml-2">●</span> {stats?.concerningEquipment || 0} Warning
                <span className="text-red-600 ml-2">●</span> {stats?.criticalEquipment || 0} Critical
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Issues</CardTitle>
              <AlertCircle className="w-4 h-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.openIssues || 0}</div>
              <p className="text-xs text-red-600 mt-1">{stats?.criticalIssues || 0} Critical</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
              <CheckCircle className="w-4 h-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {issues.filter(i => i.status === 'completed').length}
              </div>
              <p className="text-xs text-gray-500 mt-1">Awaiting your review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Assigned Contractors</CardTitle>
              <Package className="w-4 h-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{contractors.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="issues" className="space-y-4">
          <TabsList>
            <TabsTrigger value="issues">Issues</TabsTrigger>
            <TabsTrigger value="equipment">Equipment</TabsTrigger>
            <TabsTrigger value="contractors">Contractors</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="issues" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Issues</CardTitle>
                    <CardDescription>Track and manage facility issues</CardDescription>
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
                        <Button type="submit" className="w-full">Report Issue</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {issues.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No issues reported</p>
                  ) : (
                    issues.map((issue) => (
                      <div 
                        key={issue.id} 
                        className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50"
                        onClick={() => setSelectedIssue(issue)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="font-medium">{issue.equipmentName}</div>
                          <div className="flex gap-2">
                            {getPriorityBadge(issue.priority)}
                            {getStatusBadge(issue.status)}
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">{issue.description}</p>
                        
                        {issue.reportedBy && (
                          <div className="mb-2">
                            <p className="text-xs text-gray-500 mb-1">Reported by:</p>
                            <div className="text-xs">
                              <span className="font-medium">{issue.reportedBy.name}</span> ({issue.reportedBy.role})
                              {issue.reportedBy.contact?.phone && (
                                <span className="text-gray-500"> • {issue.reportedBy.contact.phone}</span>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {issue.assignedTo && (
                          <div className="text-xs text-gray-500 mb-2">
                            Assigned to: <span className="font-medium">{getContractorName(issue.assignedTo)}</span>
                          </div>
                        )}

                        {!issue.assignedTo && issue.status === 'created' && (
                          <div className="mt-3 pt-3 border-t">
                            <Label className="text-xs">Assign Contractor:</Label>
                            <Select onValueChange={(contractorId) => handleAssignContractor(issue.id, contractorId)}>
                              <SelectTrigger className="mt-1">
                                <SelectValue placeholder="Select contractor" />
                              </SelectTrigger>
                              <SelectContent>
                                {contractors.map((contractor) => (
                                  <SelectItem key={contractor.id} value={contractor.id}>
                                    {contractor.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        
                        {issue.assignedTo && !['completed', 'approved', 'closed'].includes(issue.status) && (
                          <div className="mt-3 pt-3 border-t">
                            <Label className="text-xs">Change Contractor:</Label>
                            <Select value={issue.assignedTo} onValueChange={(contractorId) => handleAssignContractor(issue.id, contractorId)}>
                              <SelectTrigger className="mt-1">
                                <SelectValue placeholder="Select contractor" />
                              </SelectTrigger>
                              <SelectContent>
                                {contractors.map((contractor) => (
                                  <SelectItem key={contractor.id} value={contractor.id}>
                                    {contractor.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {issue.status === 'completed' && (
                          <div className="mt-3 pt-3 border-t">
                            <Button 
                              size="sm" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedIssue(issue);
                              }}
                              className="w-full"
                            >
                              Review & Approve
                            </Button>
                          </div>
                        )}
                        
                        <div className="text-xs text-gray-400 mt-2 pt-2 border-t flex items-center justify-between">
                          <span>Issue ID: {issue.id}</span>
                          <span>{new Date(issue.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="equipment" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Equipment</CardTitle>
                    <CardDescription>Manage facility equipment</CardDescription>
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
                              {contractors.map((contractor) => (
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
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {equipment.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No equipment registered</p>
                  ) : (
                    equipment.map((eq) => (
                      <div 
                        key={eq.id} 
                        className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50"
                        onClick={() => setSelectedEquipment(eq)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-semibold">{eq.name}</div>
                            <div className="text-sm text-gray-600">{eq.category} - {eq.brand} {eq.model}</div>
                          </div>
                          <div className={`w-4 h-4 rounded-full ${
                            eq.healthStatus === 'red' ? 'bg-red-500' :
                            eq.healthStatus === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'
                          }`} />
                        </div>
                        {eq.recordedBy && (
                          <div className="mt-3 pt-3 border-t text-xs text-gray-500">
                            Recorded by: <span className="font-medium">{eq.recordedBy.name}</span> ({eq.recordedBy.role})
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contractors" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Assigned Contractors</CardTitle>
                <CardDescription>Contractors working on your facilities</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {contractors.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No contractors assigned</p>
                  ) : (
                    contractors.map((contractor) => (
                      <div key={contractor.id} className="border rounded-lg p-3">
                        <ContactCard 
                          name={contractor.name}
                          role="contractor"
                          contact={{ phone: contractor.phone, email: contractor.email }}
                          compact
                        />
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profile">
            <ProfileSettings
              user={user}
              role={activeRole}
              accessToken={accessToken}
              onProfileUpdated={onProfileUpdate}
            />
          </TabsContent>
        </Tabs>
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
                <p className="text-sm text-gray-600">{selectedIssue.description}</p>
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

              {selectedIssue.contractorResponse && (
                <div className="p-3 border rounded-lg">
                  <h4 className="font-semibold mb-2">Contractor Response</h4>
                  <div className="text-sm text-gray-600 space-y-1">
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
                  <div className="text-sm text-gray-600 space-y-1">
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
                <div className="text-sm text-gray-600 space-y-1">
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

              <ActivityLog 
                entityType="equipment"
                entityId={selectedEquipment.id}
                accessToken={accessToken}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
