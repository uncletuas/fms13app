import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Building2, LogOut } from 'lucide-react';
import { projectId } from '/utils/supabase/info';

interface CompanySelectorProps {
  companyBindings: any[];
  accessToken: string;
  onSelectCompany: (companyId: string) => void;
  onLogout: () => void;
}

export function CompanySelector({ companyBindings, accessToken, onSelectCompany, onLogout }: CompanySelectorProps) {
  const [companies, setCompanies] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }
      
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/companies`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setCompanies(data.companies);
      }
    } catch (error) {
      console.error('Load companies error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    return 'bg-primary/10 text-primary border border-primary/20';
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'company_admin':
        return 'Admin';
      case 'facility_manager':
        return 'Facility Manager';
      case 'contractor':
        return 'Contractor';
      default:
        return role;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading companies...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Select Company</h1>
            <p className="text-slate-600 mt-2">Choose a company to access its dashboard</p>
          </div>
          <Button variant="outline" onClick={onLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {companyBindings.map((binding) => {
            const company = companies.find(c => c.id === binding.companyId);
            
            return (
              <Card 
                key={binding.companyId}
                className="cursor-pointer transition-colors hover:bg-accent/40"
                onClick={() => onSelectCompany(binding.companyId)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">{company?.name || 'Loading...'}</CardTitle>
                        <CardDescription>{company?.industry || ''}</CardDescription>
                      </div>
                    </div>
                    <Badge className={getRoleBadgeColor(binding.role)}>
                      {getRoleLabel(binding.role)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {company?.address && (
                    <p className="text-sm text-gray-600">{company.address}</p>
                  )}
                  {binding.facilityIds && binding.facilityIds.length > 0 && (
                    <p className="text-sm text-gray-500 mt-2">
                      Assigned to {binding.facilityIds.length} {binding.facilityIds.length === 1 ? 'facility' : 'facilities'}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
