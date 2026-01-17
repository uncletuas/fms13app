import { useState, useEffect } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { Badge } from '@/app/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { ContactCard } from '@/app/components/contact-card';
import { ActivityLog } from '@/app/components/activity-log';
import { JobActionModal } from '@/app/components/job-action-modal';
import { UserDetailModal } from '@/app/components/user-detail-modal';
import { toast } from 'sonner';
import { Wrench, Clock, CheckCircle, AlertCircle, LogOut, Building2, User, ClipboardCheck, FileCheck } from 'lucide-react';
import { projectId } from '/utils/supabase/info';

interface ContractorDashboardProps {
  user: any;
  accessToken: string;
  onLogout: () => void;
  companyId: string;
  companyBindings: any[];
  onCompanyChange: (companyId: string) => void;
}

export function ContractorDashboard({ user, accessToken, onLogout, companyId, companyBindings, onCompanyChange }: ContractorDashboardProps) {
  const [stats, setStats] = useState<any>(null);
  const [issues, setIssues] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [selectedIssue, setSelectedIssue] = useState<any>(null);

  useEffect(() => {
    if (companyId) {
      loadDashboardData();
    }
  }, [companyId]);

  const loadDashboardData = async () => {
    try {
      const [statsRes, issuesRes, companyRes] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/dashboard/stats?companyId=${companyId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/issues?companyId=${companyId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/companies/${companyId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
      ]);

      const [statsData, issuesData, companyData] = await Promise.all([
        statsRes.json(),
        issuesRes.json(),
        companyRes.json()
      ]);

      if (statsData.success) setStats(statsData.stats);
      if (issuesData.success) setIssues(issuesData.issues);
      if (companyData.success) setCompany(companyData.company);
    } catch (error) {
      console.error('Dashboard load error:', error);
      toast.error('Failed to load dashboard data');
    }
  };

  const handleUpdateIssueStatus = async (issueId: string, newStatus: string) => {
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/issues/${issueId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
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

  const pendingIssues = sortedIssues.filter(i => ['created', 'assigned'].includes(i.status));
  const inProgressIssues = sortedIssues.filter(i => ['in_progress', 'awaiting_parts'].includes(i.status));
  const completedIssues = sortedIssues.filter(i => ['completed', 'approved', 'closed'].includes(i.status));
  const escalatedIssues = sortedIssues.filter(i => i.status === 'escalated');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contractor Dashboard</h1>
            <p className="text-sm text-gray-500">{company?.name || 'Loading...'} - {user.name}</p>
          </div>
          <div className="flex gap-2">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Assigned</CardTitle>
              <Wrench className="w-4 h-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalAssigned || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="w-4 h-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats?.pending || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Wrench className="w-4 h-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats?.inProgress || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats?.completed || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Rating</CardTitle>
              <AlertCircle className="w-4 h-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {stats?.avgRating ? stats.avgRating.toFixed(1) : '-'}
              </div>
              <p className="text-xs text-gray-500 mt-1">Out of 5.0</p>
            </CardContent>
          </Card>
        </div>

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
        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pending">
              Pending ({pendingIssues.length})
            </TabsTrigger>
            <TabsTrigger value="inprogress">
              In Progress ({inProgressIssues.length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed ({completedIssues.length})
            </TabsTrigger>
            {escalatedIssues.length > 0 && (
              <TabsTrigger value="escalated" className="text-red-600">
                Escalated ({escalatedIssues.length})
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="pending" className="space-y-3">
            {pendingIssues.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500 text-center py-4">No pending issues</p>
                </CardContent>
              </Card>
            ) : (
              pendingIssues.map((issue) => (
                <Card 
                  key={issue.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedIssue(issue)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{issue.equipmentName}</CardTitle>
                        <CardDescription>{issue.description}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        {getPriorityBadge(issue.priority)}
                        {getStatusBadge(issue.status)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {issue.reportedBy && (
                      <div className="mb-3">
                        <p className="text-xs text-gray-500 mb-2">Reported by:</p>
                        <div className="text-sm">
                          <span className="font-medium">{issue.reportedBy.name}</span> ({issue.reportedBy.role})
                          <br />
                          <span className="text-gray-600">{issue.reportedBy.branch}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-3 border-t">
                      <span className="text-xs text-gray-500">
                        {new Date(issue.createdAt).toLocaleDateString()} at {new Date(issue.createdAt).toLocaleTimeString()}
                      </span>
                      <Button 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateIssueStatus(issue.id, 'in_progress');
                        }}
                      >
                        Start Work
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="inprogress" className="space-y-3">
            {inProgressIssues.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500 text-center py-4">No issues in progress</p>
                </CardContent>
              </Card>
            ) : (
              inProgressIssues.map((issue) => (
                <Card 
                  key={issue.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedIssue(issue)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{issue.equipmentName}</CardTitle>
                        <CardDescription>{issue.description}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        {getPriorityBadge(issue.priority)}
                        {getStatusBadge(issue.status)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {issue.reportedBy && (
                      <div className="mb-3">
                        <p className="text-xs text-gray-500 mb-1">Contact for questions:</p>
                        <ContactCard 
                          name={issue.reportedBy.name}
                          role={issue.reportedBy.role}
                          branch={issue.reportedBy.branch}
                          contact={issue.reportedBy.contact}
                          compact
                        />
                      </div>
                    )}
                    <div className="flex gap-2 pt-3 border-t">
                      {issue.status === 'in_progress' && (
                        <>
                          <Button 
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateIssueStatus(issue.id, 'awaiting_parts');
                            }}
                            className="flex-1"
                          >
                            Awaiting Parts
                          </Button>
                          <Button 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateIssueStatus(issue.id, 'completed');
                            }}
                            className="flex-1"
                          >
                            Mark Complete
                          </Button>
                        </>
                      )}
                      {issue.status === 'awaiting_parts' && (
                        <Button 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateIssueStatus(issue.id, 'in_progress');
                          }}
                          className="w-full"
                        >
                          Resume Work
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-3">
            {completedIssues.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500 text-center py-4">No completed issues</p>
                </CardContent>
              </Card>
            ) : (
              completedIssues.map((issue) => (
                <Card 
                  key={issue.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedIssue(issue)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{issue.equipmentName}</CardTitle>
                        <CardDescription>{issue.description}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        {getPriorityBadge(issue.priority)}
                        {getStatusBadge(issue.status)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      {issue.rating && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">Rating:</span>
                          <span className="font-medium text-yellow-600">{'★'.repeat(issue.rating)}{'☆'.repeat(5 - issue.rating)}</span>
                        </div>
                      )}
                      {issue.feedback && (
                        <div>
                          <span className="text-gray-600">Feedback:</span>
                          <p className="text-gray-800 mt-1">{issue.feedback}</p>
                        </div>
                      )}
                      <div className="text-xs text-gray-500 pt-2 border-t">
                        Completed on {new Date(issue.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {escalatedIssues.length > 0 && (
            <TabsContent value="escalated" className="space-y-3">
              {escalatedIssues.map((issue) => (
                <Card 
                  key={issue.id}
                  className="border-red-300 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedIssue(issue)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertCircle className="w-5 h-5 text-red-600" />
                          <span className="text-xs font-semibold text-red-600 uppercase">SLA Violation</span>
                        </div>
                        <CardTitle className="text-lg">{issue.equipmentName}</CardTitle>
                        <CardDescription>{issue.description}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        {getPriorityBadge(issue.priority)}
                        {getStatusBadge(issue.status)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {issue.reportedBy && (
                      <div className="mb-3">
                        <ContactCard 
                          name={issue.reportedBy.name}
                          role={issue.reportedBy.role}
                          branch={issue.reportedBy.branch}
                          contact={issue.reportedBy.contact}
                          compact
                        />
                      </div>
                    )}
                    <div className="bg-red-50 p-3 rounded mt-3">
                      <p className="text-sm text-red-800 font-medium">
                        This issue has exceeded its SLA deadline and requires immediate attention.
                      </p>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateIssueStatus(issue.id, 'in_progress');
                        }}
                        className="flex-1"
                      >
                        Start Work
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          )}
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
                  title="Reported By (Contact for Questions)"
                  name={selectedIssue.reportedBy.name}
                  role={selectedIssue.reportedBy.role}
                  branch={selectedIssue.reportedBy.branch}
                  contact={selectedIssue.reportedBy.contact}
                />
              )}

              {selectedIssue.slaDeadline && (
                <div className="p-3 bg-gray-50 rounded">
                  <p className="text-sm">
                    <span className="font-medium">SLA Deadline:</span>{' '}
                    {new Date(selectedIssue.slaDeadline).toLocaleString()}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                {['created', 'assigned'].includes(selectedIssue.status) && (
                  <Button 
                    onClick={() => handleUpdateIssueStatus(selectedIssue.id, 'in_progress')}
                    className="flex-1"
                  >
                    Start Work
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
                      onClick={() => handleUpdateIssueStatus(selectedIssue.id, 'completed')}
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
    </div>
  );
}