import { useState, useEffect } from 'react';
import { AuthPage } from '@/app/components/auth-page';
import { AdminDashboard } from '@/app/components/admin-dashboard';
import { FacilityManagerDashboard } from '@/app/components/facility-manager-dashboard';
import { ContractorDashboard } from '@/app/components/contractor-dashboard';
import { CompanySelector } from '@/app/components/company-selector';
import { CompanySetupWizard } from '@/app/components/company-setup-wizard';
import { ContractorInvitations } from '@/app/components/contractor-invitations';
import { Toaster } from '@/app/components/ui/sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [companyBindings, setCompanyBindings] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [showContractorInvitations, setShowContractorInvitations] = useState(false);

  useEffect(() => {
    // Check for existing session
    const checkSession = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/auth/session`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          const data = await response.json();
          if (data.success && data.user) {
            setUser(data.user);
            setAccessToken(token);
            setCompanyBindings(data.companyBindings || []);
            
            // Restore selected company from localStorage
            const savedCompany = localStorage.getItem('selectedCompanyId');
            if (savedCompany && data.companyBindings?.find((b: any) => b.companyId === savedCompany)) {
              setSelectedCompany(savedCompany);
              const binding = data.companyBindings.find((b: any) => b.companyId === savedCompany);
              setCurrentRole(binding?.role);
            } else if (data.companyBindings?.length > 0) {
              // Auto-select first company
              setSelectedCompany(data.companyBindings[0].companyId);
              setCurrentRole(data.companyBindings[0].role);
            }
          } else {
            localStorage.removeItem('accessToken');
          }
        } catch (error) {
          console.error('Session check error:', error);
          localStorage.removeItem('accessToken');
        }
      }
      setIsLoading(false);
    };

    checkSession();
  }, []);

  const handleLoginSuccess = (userData: any, token: string, bindings: any[]) => {
    setUser(userData);
    setAccessToken(token);
    setCompanyBindings(bindings || []);
    localStorage.setItem('accessToken', token);
    
    // Auto-select first company if available
    if (bindings && bindings.length > 0) {
      setSelectedCompany(bindings[0].companyId);
      setCurrentRole(bindings[0].role);
      localStorage.setItem('selectedCompanyId', bindings[0].companyId);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setAccessToken('');
    setCompanyBindings([]);
    setSelectedCompany(null);
    setCurrentRole(null);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('selectedCompanyId');
  };

  const handleCompanyChange = (companyId: string) => {
    setSelectedCompany(companyId);
    const binding = companyBindings.find((b: any) => b.companyId === companyId);
    setCurrentRole(binding?.role);
    localStorage.setItem('selectedCompanyId', companyId);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthPage onLoginSuccess={handleLoginSuccess} />
        <Toaster />
      </>
    );
  }

  // Multi-company users need to select a company
  if (companyBindings.length > 1 && !selectedCompany) {
    return (
      <>
        <CompanySelector 
          companyBindings={companyBindings}
          onSelectCompany={handleCompanyChange}
          onLogout={handleLogout}
        />
        <Toaster />
      </>
    );
  }

  // No company bindings - show company setup wizard for new admins
  if (companyBindings.length === 0) {
    return (
      <>
        <CompanySetupWizard
          user={user}
          accessToken={accessToken}
          onSetupComplete={async () => {
            // Refresh session to get new company bindings
            const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/auth/session`, {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            });
            const data = await response.json();
            if (data.success) {
              setCompanyBindings(data.companyBindings || []);
              if (data.companyBindings?.length > 0) {
                setSelectedCompany(data.companyBindings[0].companyId);
                setCurrentRole(data.companyBindings[0].role);
                localStorage.setItem('selectedCompanyId', data.companyBindings[0].companyId);
              }
            }
          }}
          onLogout={handleLogout}
        />
        <Toaster />
      </>
    );
  }

  return (
    <>
      {currentRole === 'company_admin' && (
        <AdminDashboard 
          user={user} 
          accessToken={accessToken} 
          onLogout={handleLogout}
          companyId={selectedCompany!}
          companyBindings={companyBindings}
          onCompanyChange={handleCompanyChange}
        />
      )}
      {currentRole === 'facility_manager' && (
        <FacilityManagerDashboard 
          user={user} 
          accessToken={accessToken} 
          onLogout={handleLogout}
          companyId={selectedCompany!}
          companyBindings={companyBindings}
          onCompanyChange={handleCompanyChange}
        />
      )}
      {currentRole === 'contractor' && (
        <ContractorDashboard 
          user={user} 
          accessToken={accessToken} 
          onLogout={handleLogout}
          companyId={selectedCompany!}
          companyBindings={companyBindings}
          onCompanyChange={handleCompanyChange}
        />
      )}
      <Toaster />
    </>
  );
}