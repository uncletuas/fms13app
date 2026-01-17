import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { Badge } from '@/app/components/ui/badge';
import { User, Mail, Phone, Briefcase, Award } from 'lucide-react';
import { projectId } from '/utils/supabase/info';

interface UserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  accessToken: string;
}

export function UserDetailModal({ isOpen, onClose, userId, accessToken }: UserDetailModalProps) {
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen && userId) {
      loadProfile();
    }
  }, [isOpen, userId]);

  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-fc558f72/profile/${userId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = await response.json();
      
      if (data.success) {
        setProfile(data.profile);
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>User Contact Details</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-gray-500">Loading...</div>
        ) : profile ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 pb-4 border-b">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">{profile.name}</h3>
                <p className="text-sm text-gray-500">ID: {profile.id}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="font-medium">{profile.email}</p>
                </div>
              </div>

              {profile.phone && (
                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Phone</p>
                    <p className="font-medium">{profile.phone}</p>
                  </div>
                </div>
              )}

              {profile.specialization && (
                <div className="flex items-start gap-3">
                  <Briefcase className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Specialization</p>
                    <p className="font-medium">{profile.specialization}</p>
                  </div>
                </div>
              )}

              {profile.skills && profile.skills.length > 0 && (
                <div className="flex items-start gap-3">
                  <Award className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Skills</p>
                    <div className="flex flex-wrap gap-2">
                      {profile.skills.map((skill: string, index: number) => (
                        <Badge key={index} variant="secondary">{skill}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {profile.createdAt && (
                <div className="pt-3 border-t">
                  <p className="text-xs text-gray-500">
                    Member since {new Date(profile.createdAt).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-gray-500">Profile not found</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
