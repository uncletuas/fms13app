import { useEffect, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
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

    const [activeTab, setActiveTab] = useState<'login' | 'admin' | 'contractor'>('login');

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
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#0f2b3a] via-[#184154] to-[#123644] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_55%)]" />
      <div className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <p className="text-xs uppercase tracking-[0.4em] text-white/70">FMS.13</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">User Login</h1>
          </div>

          <div className="rounded-[6px] bg-[#0b1a22]/90 p-6 shadow-[0_30px_60px_-40px_rgba(0,0,0,0.7)]">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="space-y-5">
              <TabsContent value="login">
                {recoveryMode ? (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reset-password" className="text-xs text-white/70">New password</Label>
                      <Input
                        id="reset-password"
                        type="password"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        required
                        className="h-11 rounded-md border border-white/10 bg-white/90 text-slate-900"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reset-confirm" className="text-xs text-white/70">Confirm password</Label>
                      <Input
                        id="reset-confirm"
                        type="password"
                        value={confirmResetPassword}
                        onChange={(e) => setConfirmResetPassword(e.target.value)}
                        required
                        className="h-11 rounded-md border border-white/10 bg-white/90 text-slate-900"
                      />
                    </div>
                    <Button type="submit" className="w-full rounded-md bg-primary text-white" disabled={isLoading}>
                      {isLoading ? 'Updating...' : 'Update Password'}
                    </Button>
                    <Button type="button" variant="ghost" className="w-full text-xs text-white/70" onClick={() => setRecoveryMode(false)}>
                      Back to login
                    </Button>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="login-email" className="text-xs text-white/70">Email ID</Label>
                        <Input
                          id="login-email"
                          type="email"
                          placeholder="you@company.com"
                          value={loginData.email}
                          onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                          required
                          className="h-11 rounded-md border border-white/10 bg-white/90 text-slate-900"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="login-password" className="text-xs text-white/70">Password</Label>
                        <Input
                          id="login-password"
                          type="password"
                          value={loginData.password}
                          onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                          required
                          className="h-11 rounded-md border border-white/10 bg-white/90 text-slate-900"
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-white/60">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" className="h-3 w-3" />
                          Remember me
                        </label>
                        <button type="button" className="text-xs text-white/70" onClick={() => setShowForgotPassword(true)}>
                          Forgot Password?
                        </button>
                      </div>
                      <Button type="submit" className="w-full rounded-md bg-primary text-white" disabled={isLoading}>
                        {isLoading ? 'Signing in...' : 'LOGIN'}
                      </Button>
                    </form>

                    {showForgotPassword && (
                      <form onSubmit={handleForgotPassword} className="space-y-3 rounded-md border border-white/10 bg-white/5 p-3">
                        <div className="space-y-2">
                          <Label htmlFor="reset-email" className="text-xs text-white/70">Reset email</Label>
                          <Input
                            id="reset-email"
                            type="email"
                            placeholder="you@company.com"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            required
                            className="h-10 rounded-md border border-white/10 bg-white/90 text-slate-900"
                          />
                        </div>
                        <Button type="submit" variant="outline" className="w-full rounded-md border-white/20 text-white" disabled={isLoading}>
                          {isLoading ? 'Sending...' : 'Send Reset Email'}
                        </Button>
                      </form>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="admin">
                <form onSubmit={handleCompanyOnboarding} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="company-name" className="text-xs text-white/70">Company name</Label>
                    <Input
                      id="company-name"
                      type="text"
                      placeholder="Kilimanjaro Restaurant - Port Harcourt"
                      value={companyData.name}
                      onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })}
                      required
                      className="h-10 rounded-md border border-white/10 bg-white/90 text-slate-900"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-name" className="text-xs text-white/70">Admin name</Label>
                    <Input
                      id="admin-name"
                      type="text"
                      placeholder="Jane Admin"
                      value={adminData.name}
                      onChange={(e) => setAdminData({ ...adminData, name: e.target.value })}
                      required
                      className="h-10 rounded-md border border-white/10 bg-white/90 text-slate-900"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="admin-email" className="text-xs text-white/70">Email</Label>
                      <Input
                        id="admin-email"
                        type="email"
                        placeholder="admin@company.com"
                        value={adminData.email}
                        onChange={(e) => setAdminData({ ...adminData, email: e.target.value })}
                        required
                        className="h-10 rounded-md border border-white/10 bg-white/90 text-slate-900"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="admin-password" className="text-xs text-white/70">Password</Label>
                      <Input
                        id="admin-password"
                        type="password"
                        value={adminData.password}
                        onChange={(e) => setAdminData({ ...adminData, password: e.target.value })}
                        required
                        minLength={6}
                        className="h-10 rounded-md border border-white/10 bg-white/90 text-slate-900"
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full rounded-md bg-primary text-white" disabled={isLoading}>
                    {isLoading ? 'Creating account...' : 'Create Company Account'}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full text-xs text-white/70" onClick={() => setActiveTab('login')}>
                    Back to login
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="contractor">
                <form onSubmit={handleContractorOnboarding} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="contractor-name" className="text-xs text-white/70">Full name</Label>
                    <Input
                      id="contractor-name"
                      type="text"
                      placeholder="John Contractor"
                      value={contractorData.name}
                      onChange={(e) => setContractorData({ ...contractorData, name: e.target.value })}
                      required
                      className="h-10 rounded-md border border-white/10 bg-white/90 text-slate-900"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contractor-email" className="text-xs text-white/70">Email</Label>
                    <Input
                      id="contractor-email"
                      type="email"
                      placeholder="contractor@example.com"
                      value={contractorData.email}
                      onChange={(e) => setContractorData({ ...contractorData, email: e.target.value })}
                      required
                      className="h-10 rounded-md border border-white/10 bg-white/90 text-slate-900"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="contractor-phone" className="text-xs text-white/70">Phone</Label>
                      <Input
                        id="contractor-phone"
                        type="tel"
                        placeholder="+234 xxx xxx xxxx"
                        value={contractorData.phone}
                        onChange={(e) => setContractorData({ ...contractorData, phone: e.target.value })}
                        className="h-10 rounded-md border border-white/10 bg-white/90 text-slate-900"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contractor-password" className="text-xs text-white/70">Password</Label>
                      <Input
                        id="contractor-password"
                        type="password"
                        value={contractorData.password}
                        onChange={(e) => setContractorData({ ...contractorData, password: e.target.value })}
                        required
                        minLength={6}
                        className="h-10 rounded-md border border-white/10 bg-white/90 text-slate-900"
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full rounded-md bg-primary text-white" disabled={isLoading}>
                    {isLoading ? 'Creating account...' : 'Register as Contractor'}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full text-xs text-white/70" onClick={() => setActiveTab('login')}>
                    Back to login
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </div>

          {activeTab === 'login' && (
            <Button
              type="button"
              className="mt-4 w-full rounded-[4px] bg-[#0b1a22]/80 text-white"
              onClick={() => setActiveTab('admin')}
            >
              REGISTER
            </Button>
          )}
          {activeTab !== 'login' && (
            <div className="mt-4 flex items-center justify-between text-xs text-white/70">
              <span>Need a contractor account?</span>
              <button type="button" className="text-white/80" onClick={() => setActiveTab(activeTab === 'contractor' ? 'admin' : 'contractor')}>
                Switch to {activeTab === 'contractor' ? 'Admin' : 'Contractor'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
