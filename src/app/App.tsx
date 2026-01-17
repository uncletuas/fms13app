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
import { toast } from 'sonner';

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
  const applyCompanySelection = (companyId: string, role: string) => {
    setSelectedCompany(companyId);
    setCurrentRole(role);
    localStorage.setItem('selectedCompanyId', companyId);
  };

  const addLocalCompanyBinding = (companyId: string, role: string) => {
    setCompanyBindings((prev) => {
      if (prev.some((binding) => binding.companyId === companyId)) {
        return prev;
      }
      return [
        ...prev,
        {
          userId: user?.id,
          companyId,
          role,
          assignedAt: new Date().toISOString(),
        },
      ];
    });
  };

  const refreshSessionBindings = async () => {
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/auth/session`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      const data = await response.json();
      if (data.success) {
        const bindings = data.companyBindings || [];
        setCompanyBindings(bindings);
        if (bindings.length > 0) {
          applyCompanySelection(bindings[0].companyId, bindings[0].role);
        }
        return bindings;
      }
    } catch (error) {
      console.error('Session refresh error:', error);
    }

    return null;
  };

  const fetchFirstCompanyId = async () => {
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/companies`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      const data = await response.json();
      const firstCompany = data?.companies?.[0];
      return firstCompany?.id || firstCompany?.companyId || null;
    } catch (error) {
      console.error('Company fetch error:', error);
      return null;
    }
  };

  if (companyBindings.length === 0) {
    return (
      <>
        <CompanySetupWizard
          user={user}
          accessToken={accessToken}
          onSetupComplete={async (createdCompanyId?: string) => {
            const storedCompanyId = localStorage.getItem('lastCreatedCompanyId');
            const immediateCompanyId = createdCompanyId || storedCompanyId;

            if (immediateCompanyId) {
              addLocalCompanyBinding(immediateCompanyId, 'company_admin');
              applyCompanySelection(immediateCompanyId, 'company_admin');
              localStorage.removeItem('lastCreatedCompanyId');
            }

            const refreshedBindingsPromise = refreshSessionBindings();

            if (!immediateCompanyId) {
              const fallbackCompanyId = await fetchFirstCompanyId();
              if (fallbackCompanyId) {
                addLocalCompanyBinding(fallbackCompanyId, 'company_admin');
                applyCompanySelection(fallbackCompanyId, 'company_admin');
                localStorage.removeItem('lastCreatedCompanyId');
                return;
              }
            }

            const refreshedBindings = await refreshedBindingsPromise;
            if (!refreshedBindings || refreshedBindings.length === 0) {
              toast.error('Unable to load your dashboard. Please try again.');
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
