import { useState, useEffect } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Badge } from '@/app/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { ContactCard } from '@/app/components/contact-card';
import { Checkbox } from '@/app/components/ui/checkbox';
import { ActivityLog } from '@/app/components/activity-log';
import { toast } from 'sonner';
import { Building2, Package, AlertCircle, Users, LogOut, Plus, UserPlus, Settings } from 'lucide-react';
import { projectId } from '/utils/supabase/info';

interface AdminDashboardProps {
  user: any;
  accessToken: string;
  onLogout: () => void;
  companyId: string;
  companyBindings: any[];
  onCompanyChange: (companyId: string) => void;
}

export function AdminDashboard({ user, accessToken, onLogout, companyId, companyBindings, onCompanyChange }: AdminDashboardProps) {
  const [stats, setStats] = useState<any>(null);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [companyUsers, setCompanyUsers] = useState<any[]>([]);
  const [contractors, setContractors] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  
  const [isCreateFacilityOpen, setIsCreateFacilityOpen] = useState(false);
  const [isCreateFMOpen, setIsCreateFMOpen] = useState(false);
  const [isAssignContractorOpen, setIsAssignContractorOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<any>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<any>(null);
  
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
      const [statsRes, companyRes, facilitiesRes, issuesRes, equipmentRes, usersRes, contractorsRes] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/dashboard/stats?companyId=${companyId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          cache: 'no-store'
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/companies/${companyId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          cache: 'no-store'
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/facilities?companyId=${companyId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          cache: 'no-store'
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/issues?companyId=${companyId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          cache: 'no-store'
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/equipment?companyId=${companyId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          cache: 'no-store'
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/users?companyId=${companyId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          cache: 'no-store'
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/contractors?companyId=${companyId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          cache: 'no-store'
        })
      ]);

      const [statsData, companyData, facilitiesData, issuesData, equipmentData, usersData, contractorsData] = await Promise.all([
        statsRes.json(),
        companyRes.json(),
        facilitiesRes.json(),
        issuesRes.json(),
        equipmentRes.json(),
        usersRes.json(),
        contractorsRes.json()
      ]);

      if (statsData.success) setStats(statsData.stats);
      if (companyData.success) setCompany(companyData.company);
      if (facilitiesData.success) setFacilities(facilitiesData.facilities);
      if (issuesData.success) setIssues(issuesData.issues);
      if (equipmentData.success) setEquipment(equipmentData.equipment);
      if (usersData.success) setCompanyUsers(usersData.users);
      if (contractorsData.success) setContractors(contractorsData.contractors);
    } catch (error) {
      console.error('Dashboard load error:', error);
      toast.error('Failed to load dashboard data');
    }
  };

  const handleCreateFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/facilities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
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

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/users/facility-manager`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
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

  const handleAssignContractor = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/users/assign-contractor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Company Admin Dashboard</h1>
            <p className="text-sm text-gray-500">{company?.name || 'Loading...'} - {user.name}</p>
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
              <CardTitle className="text-sm font-medium">Total Facilities</CardTitle>
              <Building2 className="w-4 h-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalFacilities || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Equipment</CardTitle>
              <Package className="w-4 h-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalEquipment || 0}</div>
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
              <CardTitle className="text-sm font-medium">Team Members</CardTitle>
              <Users className="w-4 h-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{companyUsers.length}</div>
              <p className="text-xs text-gray-500 mt-1">{contractors.length} Contractors</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="facilities">Facilities</TabsTrigger>
            <TabsTrigger value="equipment">Equipment</TabsTrigger>
            <TabsTrigger value="issues">Issues</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Issues */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Issues</CardTitle>
                  <CardDescription>Latest reported issues</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {issues.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">No issues reported</p>
                    ) : (
                      issues.slice(0, 5).map((issue) => (
                        <div 
                          key={issue.id} 
                          className="border rounded-lg p-3 cursor-pointer hover:bg-gray-50"
                          onClick={() => setSelectedIssue(issue)}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="font-medium text-sm">{issue.equipmentName}</div>
                            <div className="flex gap-2">
                              {getPriorityBadge(issue.priority)}
                              {getStatusBadge(issue.status)}
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 mb-2">{issue.description}</p>
                          {issue.reportedBy && (
                            <div className="text-xs text-gray-500">
                              Reported by: <span className="font-medium">{issue.reportedBy.name}</span> ({issue.reportedBy.role})
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Critical Equipment */}
              <Card>
                <CardHeader>
                  <CardTitle>Equipment Health</CardTitle>
                  <CardDescription>Equipment requiring attention</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {equipment.filter(eq => eq.healthStatus !== 'green').length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">All equipment healthy</p>
                    ) : (
                      equipment.filter(eq => eq.healthStatus !== 'green').slice(0, 5).map((eq) => (
                        <div 
                          key={eq.id} 
                          className="border rounded-lg p-3 cursor-pointer hover:bg-gray-50"
                          onClick={() => setSelectedEquipment(eq)}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="font-medium text-sm">{eq.name}</div>
                              <div className="text-xs text-gray-500">{eq.category}</div>
                            </div>
                            <div className={`w-3 h-3 rounded-full ${
                              eq.healthStatus === 'red' ? 'bg-red-500' :
                              eq.healthStatus === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'
                            }`} />
                          </div>
                          {eq.recordedBy && (
                            <div className="text-xs text-gray-500">
                              Recorded by: <span className="font-medium">{eq.recordedBy.name}</span>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
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
                    <CardDescription>Manage company branches</CardDescription>
                  </div>
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
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {facilities.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No facilities yet</p>
                  ) : (
                    facilities.map((facility) => (
                      <div key={facility.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-semibold text-lg">{facility.name}</div>
                            <div className="text-sm text-gray-600">{facility.location}</div>
                            {facility.address && <div className="text-xs text-gray-500 mt-1">{facility.address}</div>}
                          </div>
                          <Badge>{facility.id}</Badge>
                        </div>
                        {facility.createdBy && (
                          <div className="mt-3 pt-3 border-t">
                            <ContactCard 
                              name={facility.createdBy.name}
                              role={facility.createdBy.role}
                              branch={facility.createdBy.branch || facility.name}
                              contact={facility.createdBy.contact}
                              compact
                            />
                          </div>
                        )}
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
                <CardTitle>Equipment Registry</CardTitle>
                <CardDescription>All equipment across facilities</CardDescription>
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
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs text-gray-500 mb-2">Recorded by:</p>
                            <ContactCard 
                              name={eq.recordedBy.name}
                              role={eq.recordedBy.role}
                              branch={eq.recordedBy.branch}
                              contact={eq.recordedBy.contact}
                              compact
                            />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="issues" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Issues</CardTitle>
                <CardDescription>Complete issue tracking</CardDescription>
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
                          <div className="mb-3">
                            <p className="text-xs text-gray-500 mb-2">Reported by:</p>
                            <ContactCard 
                              name={issue.reportedBy.name}
                              role={issue.reportedBy.role}
                              branch={issue.reportedBy.branch}
                              contact={issue.reportedBy.contact}
                              compact
                            />
                          </div>
                        )}
                        
                        <div className="text-xs text-gray-400 flex items-center justify-between pt-2 border-t">
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

          <TabsContent value="team" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Facility Managers */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Facility Managers</CardTitle>
                      <CardDescription>Manage facility staff</CardDescription>
                    </div>
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
                              <p className="text-xs text-gray-500">Create a facility before assigning a manager.</p>
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
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {companyUsers.filter(u => u.role === 'facility_manager').map((fm) => (
                      <div key={fm.id} className="border rounded-lg p-3">
                        <ContactCard 
                          name={fm.name}
                          role={fm.role}
                          contact={{ phone: fm.phone, email: fm.email }}
                          compact
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Contractors */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Contractors</CardTitle>
                      <CardDescription>Assigned contractors</CardDescription>
                    </div>
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
                              placeholder="User ID of contractor"
                              required
                            />
                            <p className="text-xs text-gray-500">Note: Contractor must have an existing account</p>
                          </div>
                          <Button type="submit" className="w-full">Assign Contractor</Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
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
            </div>
          </TabsContent>
        </Tabs>
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
