import { useEffect, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { toast } from 'sonner';
import { Building2, ShieldCheck, Users, Wrench } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
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
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash.includes('type=recovery')) {
      setRecoveryMode(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/auth/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'apikey': publicAnonKey,
        },
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const email = resetEmail || loginData.email;
      if (!email) {
        toast.error('Enter your email to reset your password');
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success('Password reset email sent');
      setShowForgotPassword(false);
      setResetEmail('');
    } catch (error) {
      console.error('Forgot password error:', error);
      toast.error('Unable to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (!resetPassword || resetPassword.length < 6) {
        toast.error('Password must be at least 6 characters');
        return;
      }
      if (resetPassword !== confirmResetPassword) {
        toast.error('Passwords do not match');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: resetPassword });
      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success('Password updated. Please sign in.');
      setRecoveryMode(false);
      setResetPassword('');
      setConfirmResetPassword('');
      window.location.hash = '';
    } catch (error) {
      console.error('Reset password error:', error);
      toast.error('Unable to update password');
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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'apikey': publicAnonKey,
        },
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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'apikey': publicAnonKey,
        },
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
    <div className="relative min-h-screen overflow-hidden bg-[#e2e7f2] text-foreground">
      <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-0 h-72 w-72 rounded-full bg-slate-300/50 blur-3xl" />

      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 lg:px-6">
        <div className="w-full rounded-[36px] border border-white/70 bg-white/80 shadow-[0_40px_90px_-50px_rgba(15,23,42,0.6)] backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/70 px-6 py-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#ef4444]" />
              <span className="h-3 w-3 rounded-full bg-[#f59e0b]" />
              <span className="h-3 w-3 rounded-full bg-[#10b981]" />
            </div>
            <div className="h-2 w-2 rounded-full bg-primary/40" />
          </div>

          <div className="grid gap-8 p-6 md:p-10 lg:grid-cols-[1.05fr,0.95fr]">
            <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1a3c5a] via-[#143552] to-[#0f2b43] p-8 text-white shadow-[0_30px_70px_-45px_rgba(15,23,42,0.8)]">
              <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute -right-16 top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute left-8 top-16 h-44 w-44 rounded-[28px] bg-gradient-to-br from-[#3c82a8] via-[#2b6c93] to-[#1d4b73] opacity-70 shadow-[0_24px_60px_-30px_rgba(7,14,24,0.8)]" />
              <div className="pointer-events-none absolute left-20 top-4 h-52 w-52 rounded-[32px] bg-gradient-to-br from-[#f0a12e] via-[#f7b94a] to-[#f8d27b] opacity-70 shadow-[0_26px_60px_-30px_rgba(10,10,10,0.6)]" />
              <div className="pointer-events-none absolute left-28 top-24 h-40 w-40 rounded-[28px] bg-gradient-to-br from-[#9ad0ec] via-[#6fb3d4] to-[#3c82a8] opacity-70 shadow-[0_26px_60px_-30px_rgba(10,10,10,0.6)]" />

              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-white/70">FMS.13</p>
                  <h1 className="text-3xl font-semibold">Facility Management System</h1>
                </div>
              </div>

              <p className="mt-6 text-lg text-white/80">
                Operate every branch with security, audit trails, and fast contractor response.
              </p>

              <div className="mt-8 space-y-3 text-sm text-white/80">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-4 w-4 text-white/80" />
                  <span>Zero implicit access, invitation-only visibility</span>
                </div>
                <div className="flex items-center gap-3">
                  <Users className="h-4 w-4 text-white/80" />
                  <span>Multi-branch control with full auditability</span>
                </div>
                <div className="flex items-center gap-3">
                  <Wrench className="h-4 w-4 text-white/80" />
                  <span>Contractor approvals, reports, and SLA tracking</span>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button className="rounded-full bg-white/15 text-white hover:bg-white/25">What to expect</Button>
                <Button variant="ghost" className="rounded-full border border-white/25 text-white hover:bg-white/10">
                  Explore modules
                </Button>
              </div>
            </section>

            <section className="flex items-center justify-center">
              <div className="w-full max-w-md rounded-[28px] border border-white/20 bg-white/10 p-6 text-white shadow-[0_20px_60px_-35px_rgba(15,23,42,0.7)] backdrop-blur">
                <CardHeader className="px-0 pt-0">
                  <CardTitle className="text-2xl font-semibold text-white">Log in to FMS.13</CardTitle>
                  <CardDescription className="text-white/70">Secure access for operations teams.</CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  <Tabs defaultValue="login" className="space-y-6">
                    <TabsList className="grid w-full grid-cols-3 bg-white/10">
                      <TabsTrigger value="login">Sign In</TabsTrigger>
                      <TabsTrigger value="admin">Admin</TabsTrigger>
                      <TabsTrigger value="contractor">Contractor</TabsTrigger>
                    </TabsList>

              <TabsContent value="login">
                {recoveryMode ? (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reset-password">New password</Label>
                      <Input
                        id="reset-password"
                        type="password"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reset-confirm">Confirm password</Label>
                      <Input
                        id="reset-confirm"
                        type="password"
                        value={confirmResetPassword}
                        onChange={(e) => setConfirmResetPassword(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? 'Updating...' : 'Update Password'}
                    </Button>
                  </form>
                ) : (
                  <div className="space-y-4">
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

                    <div className="text-right">
                      <Button
                        type="button"
                        variant="link"
                        className="px-0 text-sm"
                        onClick={() => setShowForgotPassword((prev) => !prev)}
                      >
                        Forgot password?
                      </Button>
                    </div>

                    {showForgotPassword && (
                      <form onSubmit={handleForgotPassword} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="space-y-2">
                          <Label htmlFor="reset-email">Reset email</Label>
                          <Input
                            id="reset-email"
                            type="email"
                            placeholder="you@company.com"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            required
                          />
                        </div>
                        <Button type="submit" variant="outline" className="w-full" disabled={isLoading}>
                          {isLoading ? 'Sending...' : 'Send Reset Email'}
                        </Button>
                      </form>
                    )}
                  </div>
                )}
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
                        placeholder="Kilimanjaro Restaurant - Port Harcourt"
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
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
