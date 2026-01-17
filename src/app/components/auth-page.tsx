import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { toast } from 'sonner';
import { Building2 } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface AuthPageProps {
  onLoginSuccess: (user: any, accessToken: string, companyBindings: any[]) => void;
}

export function AuthPage({ onLoginSuccess }: AuthPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [companyData, setCompanyData] = useState({
    name: '',
    address: '',
    phone: '',
    industry: '',
    adminEmail: '',
    adminName: '',
    adminPassword: '',
    adminPhone: ''
  });
  const [loginData, setLoginData] = useState({
    email: '',
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

  const handleRegisterCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Create admin user account (company will be set up after login)
      const signupResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({
          email: companyData.adminEmail,
          password: companyData.adminPassword,
          name: companyData.adminName,
          phone: companyData.adminPhone
        })
      });

      const signupData = await signupResponse.json();

      if (signupData.error) {
        toast.error(signupData.error);
        setIsLoading(false);
        return;
      }

      toast.success('Admin account created successfully! Please log in to set up your company.');
      
      // Switch to login tab and pre-fill email
      setLoginData({ email: companyData.adminEmail, password: '' });
      
      // Reset form
      setCompanyData({
        name: '',
        address: '',
        phone: '',
        industry: '',
        adminEmail: '',
        adminName: '',
        adminPassword: '',
        adminPhone: ''
      });
    } catch (error: any) {
      console.error('Admin registration error:', error);
      toast.error('Failed to register admin account. Please ensure the server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/auth/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(loginData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success('Login successful!');
        onLoginSuccess(data.user, data.accessToken, data.companyBindings || []);
      }
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error('Server connection failed. Please ensure the Supabase Edge Function is deployed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterContractor = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Parse skills from comma-separated string
      const skillsArray = contractorData.skills
        .split(',')
        .map(skill => skill.trim())
        .filter(skill => skill.length > 0);

      // Create contractor user account
      const signupResponse = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({
          email: contractorData.email,
          password: contractorData.password,
          name: contractorData.name,
          phone: contractorData.phone,
          skills: skillsArray,
          specialization: contractorData.specialization
        })
      });

      const signupData = await signupResponse.json();

      if (signupData.error) {
        toast.error(signupData.error);
        setIsLoading(false);
        return;
      }

      toast.success('Contractor account created successfully! Please log in to access your account.');
      
      // Switch to login tab and pre-fill email
      setLoginData({ email: contractorData.email, password: '' });
      
      // Reset form
      setContractorData({
        name: '',
        email: '',
        phone: '',
        password: '',
        skills: '',
        specialization: ''
      });
    } catch (error: any) {
      console.error('Contractor registration error:', error);
      toast.error('Failed to register contractor account. Please ensure the server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">FMS.13</CardTitle>
              <CardDescription>Facility Management System</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="admin">Register Company</TabsTrigger>
              <TabsTrigger value="contractor">Register Contractor</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
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
                  {isLoading ? 'Logging in...' : 'Login'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="admin">
              <form onSubmit={handleRegisterCompany} className="space-y-4">
                <p className="text-sm text-gray-600 mb-4">
                  Create an admin account. You'll set up your company details after logging in.
                </p>
                
                <div className="space-y-2">
                  <Label htmlFor="admin-name">Name</Label>
                  <Input
                    id="admin-name"
                    type="text"
                    placeholder="John Doe"
                    value={companyData.adminName}
                    onChange={(e) => setCompanyData({ ...companyData, adminName: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-email">Email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    placeholder="admin@company.com"
                    value={companyData.adminEmail}
                    onChange={(e) => setCompanyData({ ...companyData, adminEmail: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-phone">Phone</Label>
                  <Input
                    id="admin-phone"
                    type="tel"
                    placeholder="+234 xxx xxx xxxx"
                    value={companyData.adminPhone}
                    onChange={(e) => setCompanyData({ ...companyData, adminPhone: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-password">Password</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    value={companyData.adminPassword}
                    onChange={(e) => setCompanyData({ ...companyData, adminPassword: e.target.value })}
                    required
                    minLength={6}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Registering...' : 'Register as Admin'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="contractor">
              <form onSubmit={handleRegisterContractor} className="space-y-4">
                <p className="text-sm text-gray-600 mb-4">
                  Register as a contractor. You'll receive your unique Contractor ID after registration.
                </p>
                
                <div className="space-y-2">
                  <Label htmlFor="contractor-name">Name</Label>
                  <Input
                    id="contractor-name"
                    type="text"
                    placeholder="John Smith"
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

                <div className="space-y-2">
                  <Label htmlFor="contractor-skills">Skills (comma-separated)</Label>
                  <Input
                    id="contractor-skills"
                    type="text"
                    placeholder="e.g., Plumbing, Electrical"
                    value={contractorData.skills}
                    onChange={(e) => setContractorData({ ...contractorData, skills: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contractor-specialization">Specialization</Label>
                  <Input
                    id="contractor-specialization"
                    type="text"
                    placeholder="e.g., HVAC"
                    value={contractorData.specialization}
                    onChange={(e) => setContractorData({ ...contractorData, specialization: e.target.value })}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Registering...' : 'Register as Contractor'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}