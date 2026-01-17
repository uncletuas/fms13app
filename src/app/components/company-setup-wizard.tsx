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

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const resolveCompanyId = async (initialId: string | null) => {
    if (initialId) {
      return initialId;
    }

    const normalize = (value: string) => value.trim().toLowerCase();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/companies`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
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
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/companies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">Welcome to FMS.13</CardTitle>
              <CardDescription>Let's set up your facility management system</CardDescription>
            </div>
          </div>
          
          {/* Progress Steps */}
          <div className="flex items-center gap-2 mt-6">
            <div className={`flex items-center gap-2 ${step >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                {step > 1 ? <Check className="w-5 h-5" /> : '1'}
              </div>
              <span className="text-sm font-medium">Company Details</span>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <div className={`flex items-center gap-2 ${step >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
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
                <p className="text-gray-600">
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
