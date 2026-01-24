import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Badge } from '@/app/components/ui/badge';
import { toast } from 'sonner';
import { Copy, Image as ImageIcon, Lock } from 'lucide-react';
import { projectId } from '/utils/supabase/info';

interface ProfileSettingsProps {
  user: any;
  role: string;
  accessToken: string;
  onProfileUpdated?: (profile: any) => void;
}

export function ProfileSettings({ user, role, accessToken, onProfileUpdated }: ProfileSettingsProps) {
  const [profile, setProfile] = useState<any>(user);
  const [isSaving, setIsSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const isFacilityManager = role === 'facility_manager';
  const contractorId = profile?.shortId || (profile?.id ? profile.id.slice(0, 6).toUpperCase() : '');

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [skills, setSkills] = useState((user?.skills || []).join(', '));
  const [specialization, setSpecialization] = useState(user?.specialization || '');

  useEffect(() => {
    setProfile(user);
    setName(user?.name || '');
    setPhone(user?.phone || '');
    setSkills((user?.skills || []).join(', '));
    setSpecialization(user?.specialization || '');
  }, [user]);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(contractorId);
      toast.success('Contractor ID copied');
    } catch (error) {
      toast.error('Unable to copy ID');
    }
  };

  const handleProfileSave = async () => {
    setIsSaving(true);
    try {
      const payload: any = {
        name,
        phone
      };

      if (role === 'contractor') {
        const skillsArray = skills
          .split(',')
          .map((skill) => skill.trim())
          .filter((skill) => skill.length > 0);
        payload.skills = skillsArray;
        payload.specialization = specialization;
      }

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!data.success) {
        toast.error(data.error || 'Failed to update profile');
        return;
      }

      setProfile(data.profile);
      onProfileUpdated?.(data.profile);
      toast.success('Profile updated');
    } catch (error) {
      console.error('Profile update error:', error);
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/profile/avatar`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      body: formData
    });

    const data = await response.json();
    if (!data.success) {
      toast.error(data.error || 'Failed to upload avatar');
      return;
    }

    setProfile(data.profile);
    onProfileUpdated?.(data.profile);
    toast.success('Profile image updated');
  };

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/profile/password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ newPassword })
      });

      const data = await response.json();
      if (!data.success) {
        toast.error(data.error || 'Failed to update password');
        return;
      }

      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated');
    } catch (error) {
      console.error('Password update error:', error);
      toast.error('Failed to update password');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
      <Card>
        <CardHeader>
          <CardTitle>Profile Details</CardTitle>
          <CardDescription>Update your profile information and contact details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-white/80 shadow-[0_12px_24px_-16px_rgba(15,23,42,0.6)]">
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-6 w-6 text-slate-400" />
              )}
            </div>
            <div>
              <Label htmlFor="avatar-upload">Profile image</Label>
              <Input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleAvatarUpload(file);
                  }
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-name">Full name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              disabled={isFacilityManager}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={profile?.email || ''} disabled />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-phone">Phone</Label>
            <Input
              id="profile-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+234 xxx xxx xxxx"
              disabled={isFacilityManager}
            />
          </div>

          {role === 'contractor' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="profile-specialization">Specialization</Label>
                <Input
                  id="profile-specialization"
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  placeholder="Commercial kitchen equipment"
                  disabled={isFacilityManager}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-skills">Skills (comma-separated)</Label>
                <Textarea
                  id="profile-skills"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="Plumbing, Electrical, HVAC"
                  rows={3}
                  disabled={isFacilityManager}
                />
              </div>
            </>
          )}

          {!isFacilityManager && (
            <Button onClick={handleProfileSave} disabled={isSaving} className="w-full">
              {isSaving ? 'Saving...' : 'Save Profile'}
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        {role === 'contractor' && (
          <Card>
            <CardHeader>
              <CardTitle>Contractor ID</CardTitle>
              <CardDescription>Share this ID with companies to get invited.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm shadow-[0_10px_24px_-18px_rgba(15,23,42,0.5)]">
                <span className="font-mono text-slate-700">{contractorId}</span>
                <Button size="sm" variant="outline" onClick={handleCopyId}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!isFacilityManager && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Password Settings
              </CardTitle>
              <CardDescription>Change your password from here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={handlePasswordChange} disabled={isSaving} className="w-full">
                Update Password
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Role</p>
              <p className="text-xs text-slate-500">Current access level</p>
            </div>
            <Badge>{role.replace('_', ' ')}</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
