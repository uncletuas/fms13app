import { useState, useEffect } from 'react';
import { AuthPage } from '@/app/components/auth-page';
import { AdminDashboard } from '@/app/components/admin-dashboard';
import { FacilityManagerDashboard } from '@/app/components/facility-manager-dashboard';
import { ContractorDashboard } from '@/app/components/contractor-dashboard';
import { CompanySelector } from '@/app/components/company-selector';
import { Toaster } from '@/app/components/ui/sonner';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { projectId } from '/utils/supabase/info';
import { supabase } from '/utils/supabase/client';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [companyBindings, setCompanyBindings] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);

  const persistProfile = (userData: any, bindings: any[]) => {
    localStorage.setItem('userProfile', JSON.stringify(userData));
    localStorage.setItem('companyBindings', JSON.stringify(bindings));
  };

  const loadStoredProfile = () => {
    try {
      const rawUser = localStorage.getItem('userProfile');
      const rawBindings = localStorage.getItem('companyBindings');
      return {
        user: rawUser ? JSON.parse(rawUser) : null,
        bindings: rawBindings ? JSON.parse(rawBindings) : [],
      };
    } catch (error) {
      return { user: null, bindings: [] };
    }
  };

  const bootstrapSession = async (token: string) => {
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/auth/session`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success && data.user) {
        setUser(data.user);
        setCompanyBindings(data.companyBindings || []);
        persistProfile(data.user, data.companyBindings || []);

        const savedCompany = localStorage.getItem('selectedCompanyId');
        if (savedCompany && data.companyBindings?.find((b: any) => b.companyId === savedCompany)) {
          setSelectedCompany(savedCompany);
          const binding = data.companyBindings.find((b: any) => b.companyId === savedCompany);
          setCurrentRole(binding?.role);
        } else if (data.companyBindings?.length > 0) {
          setSelectedCompany(data.companyBindings[0].companyId);
          setCurrentRole(data.companyBindings[0].role);
        } else if (data.user?.role === 'contractor') {
          setCurrentRole('contractor');
        }
        return;
      }
    } catch (error) {
      console.error('Session bootstrap error:', error);
    }

    const cached = loadStoredProfile();
    if (cached.user) {
      setUser(cached.user);
      setCompanyBindings(cached.bindings || []);
      if (cached.bindings?.length > 0) {
        setSelectedCompany(cached.bindings[0].companyId);
        setCurrentRole(cached.bindings[0].role);
      }
    }
  };

  useEffect(() => {
    const initSession = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (token) {
        setAccessToken(token);
        await bootstrapSession(token);
      }

      setIsLoading(false);
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
        setAccessToken('');
        setCompanyBindings([]);
        setSelectedCompany(null);
        setCurrentRole(null);
        localStorage.removeItem('userProfile');
        localStorage.removeItem('companyBindings');
        localStorage.removeItem('selectedCompanyId');
      } else if (session.access_token) {
        setAccessToken(session.access_token);
      }
    });

    initSession();

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleLoginSuccess = (userData: any, token: string, refreshToken: string, bindings: any[]) => {
    setUser(userData);
    setAccessToken(token);
    setCompanyBindings(bindings || []);
    persistProfile(userData, bindings || []);
    
    // Auto-select first company if available
    if (bindings && bindings.length > 0) {
      setSelectedCompany(bindings[0].companyId);
      setCurrentRole(bindings[0].role);
      localStorage.setItem('selectedCompanyId', bindings[0].companyId);
    } else if (userData?.role === 'contractor') {
      setCurrentRole('contractor');
    }
  };

  const handleProfileUpdate = (updatedProfile: any) => {
    setUser(updatedProfile);
    persistProfile(updatedProfile, companyBindings);
  };

  const handleLogout = () => {
    supabase.auth.signOut();
    setUser(null);
    setAccessToken('');
    setCompanyBindings([]);
    setSelectedCompany(null);
    setCurrentRole(null);
    localStorage.removeItem('userProfile');
    localStorage.removeItem('companyBindings');
    localStorage.removeItem('selectedCompanyId');
  };

  const handleCompanyChange = (companyId: string) => {
    setSelectedCompany(companyId);
    const binding = companyBindings.find((b: any) => b.companyId === companyId);
    setCurrentRole(binding?.role || currentRole);
    localStorage.setItem('selectedCompanyId', companyId);
  };

  const effectiveBindings = companyBindings.length
    ? companyBindings
    : selectedCompany && currentRole
      ? [{ companyId: selectedCompany, role: currentRole }]
      : [];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg text-slate-600">Loading...</div>
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

  // Multi-company users need to select a company (skip for contractors who can switch in-dashboard)
  if (effectiveBindings.length > 1 && !selectedCompany && currentRole !== 'contractor') {
    return (
      <>
        <CompanySelector 
          companyBindings={effectiveBindings}
          accessToken={accessToken}
          onSelectCompany={handleCompanyChange}
          onLogout={handleLogout}
        />
        <Toaster />
      </>
    );
  }

  // No company bindings - show contractor invitation state or support notice
  if (companyBindings.length === 0 && (!selectedCompany || !currentRole)) {
    if (user?.role === 'contractor') {
      return (
        <>
          <ContractorDashboard 
            user={user} 
            accessToken={accessToken} 
            onLogout={handleLogout}
            companyId={selectedCompany}
            companyBindings={effectiveBindings}
            onCompanyChange={handleCompanyChange}
            onProfileUpdate={handleProfileUpdate}
            onInvitationHandled={() => bootstrapSession(accessToken)}
          />
          <Toaster />
        </>
      );
    }

    return (
      <>
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <Card className="w-full max-w-lg bg-white/90 text-slate-900">
            <CardHeader>
              <CardTitle>Company setup required</CardTitle>
              <CardDescription>
                Your account is active but not linked to a company yet. Please contact your system administrator.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={handleLogout} className="w-full">
                Logout
              </Button>
            </CardContent>
          </Card>
        </div>
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
          companyBindings={effectiveBindings}
          onCompanyChange={handleCompanyChange}
          onProfileUpdate={handleProfileUpdate}
        />
      )}
      {currentRole === 'facility_supervisor' && (
        <AdminDashboard 
          user={user} 
          accessToken={accessToken} 
          onLogout={handleLogout}
          companyId={selectedCompany!}
          companyBindings={effectiveBindings}
          onCompanyChange={handleCompanyChange}
          onProfileUpdate={handleProfileUpdate}
          readOnly
        />
      )}
      {currentRole === 'facility_manager' && (
        <FacilityManagerDashboard 
          user={user} 
          accessToken={accessToken} 
          onLogout={handleLogout}
          companyId={selectedCompany!}
          companyBindings={effectiveBindings}
          onCompanyChange={handleCompanyChange}
          onProfileUpdate={handleProfileUpdate}
        />
      )}
      {currentRole === 'contractor' && (
        <ContractorDashboard 
          user={user} 
          accessToken={accessToken} 
          onLogout={handleLogout}
          companyId={selectedCompany}
          companyBindings={effectiveBindings}
          onCompanyChange={handleCompanyChange}
          onProfileUpdate={handleProfileUpdate}
          onInvitationHandled={() => bootstrapSession(accessToken)}
        />
      )}
      <Toaster />
    </>
  );
}
