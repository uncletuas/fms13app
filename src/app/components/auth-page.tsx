import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { toast } from 'sonner';
import { Building2, ShieldCheck, Users, Wrench } from 'lucide-react';
import { projectId } from '/utils/supabase/info';
import { supabase } from '/utils/supabase/client';

interface AuthPageProps {
  onLoginSuccess: (user: any, accessToken: string, refreshToken: string, companyBindings: any[]) => void;
}

export function AuthPage({ onLoginSuccess }: AuthPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loginData, setLoginData] = useState({
    email: '',
    password: ''
  });

  const [companyData, setCompanyData] = useState({
    name: '',
    address: '',
    phone: '',
    industry: ''
  });

  const [adminData, setAdminData] = useState({
    name: '',
    email: '',
    phone: '',
    password: ''
  });

  const [contractorData, setContractorData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    skills: '',
    specialization: ''
  });

  const applySession = async (accessToken: string, refreshToken: string) => {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      console.error('Supabase session error:', error);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });

      const data = await response.json();

      if (!data.success) {
        toast.error(data.error || 'Login failed');
        return;
      }

      await applySession(data.accessToken, data.refreshToken);
      toast.success('Welcome back!');
      onLoginSuccess(data.user, data.accessToken, data.refreshToken, data.companyBindings || []);
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Server connection failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompanyOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/onboarding/company-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: companyData,
          admin: adminData,
        })
      });

      const data = await response.json();

      if (!data.success) {
        toast.error(data.error || 'Registration failed');
        return;
      }

      await applySession(data.accessToken, data.refreshToken);
      toast.success('Company created. Welcome to FMS.13!');
      onLoginSuccess(data.user, data.accessToken, data.refreshToken, data.companyBindings || []);
    } catch (error) {
      console.error('Company onboarding error:', error);
      toast.error('Unable to create your company. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleContractorOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const skillsArray = contractorData.skills
        .split(',')
        .map((skill) => skill.trim())
        .filter((skill) => skill.length > 0);

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/onboarding/contractor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: contractorData.email,
          password: contractorData.password,
          name: contractorData.name,
          phone: contractorData.phone,
          skills: skillsArray,
          specialization: contractorData.specialization,
        })
      });

      const data = await response.json();

      if (!data.success) {
        toast.error(data.error || 'Registration failed');
        return;
      }

      await applySession(data.accessToken, data.refreshToken);
      toast.success('Contractor account created!');
      onLoginSuccess(data.user, data.accessToken, data.refreshToken, data.companyBindings || []);
    } catch (error) {
      console.error('Contractor onboarding error:', error);
      toast.error('Unable to register. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[1.1fr,1fr] lg:items-center">
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
              <Building2 className="h-7 w-7 text-white" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/60">FMS.13</p>
              <h1 className="text-3xl font-semibold text-white">Facility Management System</h1>
            </div>
          </div>

          <p className="text-lg text-white/80">
            Operate every branch with security, audit trails, and fast contractor response. 
            Built for multi-tenant operations with zero implicit access.
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              <p className="mt-3 text-sm font-medium">Zero implicit access</p>
              <p className="mt-2 text-xs text-white/60">Invitation + approval enforced</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <Users className="h-5 w-5 text-sky-300" />
              <p className="mt-3 text-sm font-medium">Multi-branch control</p>
              <p className="mt-2 text-xs text-white/60">Company, facilities, roles</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <Wrench className="h-5 w-5 text-amber-300" />
              <p className="mt-3 text-sm font-medium">Contractor workflows</p>
              <p className="mt-2 text-xs text-white/60">Accept, execute, report</p>
            </div>
          </div>
        </div>

        <Card className="border-white/10 bg-white/95 text-slate-900 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold">Secure Access</CardTitle>
            <CardDescription>Sign in or register with the correct role.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="admin">Company Admin</TabsTrigger>
                <TabsTrigger value="contractor">Contractor</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@company.com"
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Signing in...' : 'Sign In'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="admin">
                <form onSubmit={handleCompanyOnboarding} className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Company details</p>
                      <p className="text-xs text-slate-500">Create your company record and primary admin.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company-name">Company name</Label>
                      <Input
                        id="company-name"
                        type="text"
                        placeholder="Chicken Republic - Port Harcourt"
                        value={companyData.name}
                        onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="company-industry">Industry</Label>
                        <Input
                          id="company-industry"
                          type="text"
                          placeholder="Food & Beverage"
                          value={companyData.industry}
                          onChange={(e) => setCompanyData({ ...companyData, industry: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="company-phone">Company phone</Label>
                        <Input
                          id="company-phone"
                          type="tel"
                          placeholder="+234 xxx xxx xxxx"
                          value={companyData.phone}
                          onChange={(e) => setCompanyData({ ...companyData, phone: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company-address">Address</Label>
                      <Input
                        id="company-address"
                        type="text"
                        placeholder="Port Harcourt, Nigeria"
                        value={companyData.address}
                        onChange={(e) => setCompanyData({ ...companyData, address: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Admin profile</p>
                      <p className="text-xs text-slate-500">This account controls your facilities and staff.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="admin-name">Full name</Label>
                      <Input
                        id="admin-name"
                        type="text"
                        placeholder="Jane Admin"
                        value={adminData.name}
                        onChange={(e) => setAdminData({ ...adminData, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="admin-email">Email</Label>
                      <Input
                        id="admin-email"
                        type="email"
                        placeholder="admin@company.com"
                        value={adminData.email}
                        onChange={(e) => setAdminData({ ...adminData, email: e.target.value })}
                        required
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="admin-phone">Phone</Label>
                        <Input
                          id="admin-phone"
                          type="tel"
                          placeholder="+234 xxx xxx xxxx"
                          value={adminData.phone}
                          onChange={(e) => setAdminData({ ...adminData, phone: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="admin-password">Password</Label>
                        <Input
                          id="admin-password"
                          type="password"
                          value={adminData.password}
                          onChange={(e) => setAdminData({ ...adminData, password: e.target.value })}
                          required
                          minLength={6}
                        />
                      </div>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Creating account...' : 'Create Company Account'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="contractor">
                <form onSubmit={handleContractorOnboarding} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="contractor-name">Full name</Label>
                    <Input
                      id="contractor-name"
                      type="text"
                      placeholder="John Contractor"
                      value={contractorData.name}
                      onChange={(e) => setContractorData({ ...contractorData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contractor-email">Email</Label>
                    <Input
                      id="contractor-email"
                      type="email"
                      placeholder="contractor@example.com"
                      value={contractorData.email}
                      onChange={(e) => setContractorData({ ...contractorData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="contractor-phone">Phone</Label>
                      <Input
                        id="contractor-phone"
                        type="tel"
                        placeholder="+234 xxx xxx xxxx"
                        value={contractorData.phone}
                        onChange={(e) => setContractorData({ ...contractorData, phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contractor-password">Password</Label>
                      <Input
                        id="contractor-password"
                        type="password"
                        value={contractorData.password}
                        onChange={(e) => setContractorData({ ...contractorData, password: e.target.value })}
                        required
                        minLength={6}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contractor-skills">Skills (comma-separated)</Label>
                    <Input
                      id="contractor-skills"
                      type="text"
                      placeholder="Plumbing, Electrical, HVAC"
                      value={contractorData.skills}
                      onChange={(e) => setContractorData({ ...contractorData, skills: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contractor-specialization">Specialization</Label>
                    <Input
                      id="contractor-specialization"
                      type="text"
                      placeholder="Commercial kitchen equipment"
                      value={contractorData.specialization}
                      onChange={(e) => setContractorData({ ...contractorData, specialization: e.target.value })}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Creating account...' : 'Register as Contractor'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
