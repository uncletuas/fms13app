import { Phone, Mail, User, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';

interface ContactCardProps {
  title?: string;
  name: string;
  role: string;
  branch?: string;
  contact: {
    phone?: string;
    email?: string;
  };
  compact?: boolean;
}

export function ContactCard({ title, name, role, branch, contact, compact }: ContactCardProps) {
  const handleCall = () => {
    if (contact.phone) {
      window.location.href = `tel:${contact.phone}`;
    }
  };

  const handleEmail = () => {
    if (contact.email) {
      window.location.href = `mailto:${contact.email}`;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'company_admin':
        return 'bg-primary/10 text-primary border border-primary/20';
      case 'facility_manager':
        return 'bg-amber-100 text-amber-800';
      case 'facility_supervisor':
        return 'bg-slate-100 text-slate-700';
      case 'contractor':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getRoleLabel = (role: string) => {
    return role.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  if (compact) {
    return (
      <div className="flex items-center justify-between p-4 bg-white/80 rounded-2xl border border-slate-200/70 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.5)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shadow-[0_8px_16px_-12px_rgba(15,23,42,0.5)]">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">{name}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={getRoleBadgeColor(role)}>{getRoleLabel(role)}</Badge>
              {branch && <span className="text-xs text-slate-500">{branch}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {contact.phone && (
            <Button size="sm" variant="outline" onClick={handleCall}>
              <Phone className="w-4 h-4 mr-1" />
              Call
            </Button>
          )}
          {contact.email && (
            <Button size="sm" variant="outline" onClick={handleEmail}>
              <Mail className="w-4 h-4 mr-1" />
              Email
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title || 'Contact Information'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center shadow-[0_12px_24px_-16px_rgba(15,23,42,0.6)]">
            <User className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-lg">{name}</p>
            <Badge className={getRoleBadgeColor(role)}>{getRoleLabel(role)}</Badge>
          </div>
        </div>

        {branch && (
          <div className="flex items-center gap-2 text-slate-600">
            <MapPin className="w-4 h-4" />
            <span>{branch}</span>
          </div>
        )}

        <div className="space-y-2 pt-2 border-t border-slate-200/70">
          {contact.phone && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-600">
                <Phone className="w-4 h-4" />
                <span className="text-sm">{contact.phone}</span>
              </div>
              <Button size="sm" onClick={handleCall}>
                Call
              </Button>
            </div>
          )}
          
          {contact.email && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="w-4 h-4" />
                <span className="text-sm">{contact.email}</span>
              </div>
              <Button size="sm" onClick={handleEmail}>
                Email
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
