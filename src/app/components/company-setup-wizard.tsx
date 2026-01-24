import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { toast } from 'sonner';
import { Building2, ArrowRight, Check } from 'lucide-react';
import { projectId } from '/utils/supabase/info';

interface CompanySetupWizardProps {
  user: any;
  accessToken: string;
  onSetupComplete: (companyId?: string) => Promise<void>;
  onLogout: () => void;
}

export function CompanySetupWizard({ user, accessToken, onSetupComplete, onLogout }: CompanySetupWizardProps) {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(null);
  
  const [companyData, setCompanyData] = useState({
    name: '',
    address: '',
    phone: '',
    industry: ''
  });

  const parseJwtPayload = (token: string) => {
    try {
      const payload = token.split('.')[1];
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = atob(normalized);
      return JSON.parse(decoded);
    } catch (error) {
      return null;
    }
  };

  const isValidToken = (token: string | null) => {
    if (!token || token === 'undefined' || token === 'null') {
      return false;
    }
    if (token.split('.').length !== 3) {
      return false;
    }

    const payload = parseJwtPayload(token);
    if (!payload || !payload.sub || payload.role === 'anon') {
      return false;
    }

    const exp = Number(payload.exp || 0);
    if (exp && exp * 1000 <= Date.now()) {
      return false;
    }

    return true;
  };

  const getAuthToken = () => {
    if (isValidToken(accessToken)) {
      return accessToken;
    }
    const stored = localStorage.getItem('accessToken');
    return isValidToken(stored) ? stored : '';
  };

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const resolveCompanyId = async (initialId: string | null) => {
    if (initialId) {
      return initialId;
    }

    const normalize = (value: string) => value.trim().toLowerCase();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const token = getAuthToken();
        if (!token) {
          return null;
        }
        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/companies`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await response.json();

        if (data?.success && Array.isArray(data.companies) && data.companies.length > 0) {
          const normalizedName = normalize(companyData.name);
          const namedMatches = data.companies.filter((company: any) =>
            normalize(company?.name || '') === normalizedName
          );
          const candidates = namedMatches.length > 0 ? namedMatches : data.companies;

          const sorted = [...candidates].sort((a: any, b: any) => {
            const aTime = new Date(a?.createdAt || 0).getTime();
            const bTime = new Date(b?.createdAt || 0).getTime();
            return bTime - aTime;
          });

          const match = sorted[0];
          const resolvedId = match?.id || match?.companyId || null;
          if (resolvedId) {
            return resolvedId;
          }
        }
      } catch (error) {
        console.error('Company lookup error:', error);
      }

      await wait(800);
    }

    return null;
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const token = getAuthToken();
      if (!token) {
        toast.error('Session expired. Please log in again.');
        setIsLoading(false);
        return;
      }
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/companies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(companyData)
      });

      const data = await response.json();

      if (data.error) {
        toast.error(data.error);
        setIsLoading(false);
        return;
      }

      const responseCompanyId =
        data.company?.id ||
        data.company?.companyId ||
        data.companyId ||
        data.id ||
        null;
      toast.success('Company created successfully!');
      setStep(2);
      setIsLoading(false);
      setIsCompleting(true);

      const companyId = await resolveCompanyId(responseCompanyId);
      if (!companyId) {
        toast.error('Company created, but missing company ID.');
        setIsCompleting(false);
        return;
      }

      setCreatedCompanyId(companyId);
      localStorage.setItem('lastCreatedCompanyId', companyId);
      await onSetupComplete(companyId);
      setIsCompleting(false);
    } catch (error: any) {
      console.error('Company creation error:', error);
      toast.error('Failed to create company');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center shadow-[0_12px_24px_-16px_rgba(15,23,42,0.6)]">
              <Building2 className="w-7 h-7 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl font-semibold">Welcome to FMS.13</CardTitle>
              <CardDescription>Let's set up your facility management system</CardDescription>
            </div>
          </div>
          
          {/* Progress Steps */}
          <div className="flex items-center gap-2 mt-6">
            <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-primary text-white' : 'bg-white/80 border border-slate-200/70'}`}>
                {step > 1 ? <Check className="w-5 h-5" /> : '1'}
              </div>
              <span className="text-sm font-medium">Company Details</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400" />
            <div className={`flex items-center gap-2 ${step >= 2 ? 'text-primary' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-primary text-white' : 'bg-white/80 border border-slate-200/70'}`}>
                2
              </div>
              <span className="text-sm font-medium">Complete Setup</span>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {step === 1 && (
            <form onSubmit={handleCreateCompany} className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="company-name">Company Name *</Label>
                  <Input
                    id="company-name"
                    type="text"
                    placeholder="e.g., Kilimanjaro Restaurant"
                    value={companyData.name}
                    onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input
                    id="industry"
                    type="text"
                    placeholder="e.g., Food & Beverage"
                    value={companyData.industry}
                    onChange={(e) => setCompanyData({ ...companyData, industry: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    type="text"
                    placeholder="e.g., Port Harcourt, Nigeria"
                    value={companyData.address}
                    onChange={(e) => setCompanyData({ ...companyData, address: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Company Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+234 xxx xxx xxxx"
                    value={companyData.phone}
                    onChange={(e) => setCompanyData({ ...companyData, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={onLogout} className="flex-1">
                  Logout
                </Button>
                <Button type="submit" disabled={isLoading} className="flex-1">
                  {isLoading ? 'Creating...' : 'Continue'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Company Created Successfully!</h3>
                <p className="text-slate-600">
                  {isCompleting ? 'Opening your dashboard...' : 'Preparing your dashboard...'}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
