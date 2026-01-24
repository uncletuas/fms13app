import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.ts";

const app = new Hono();

// Create Supabase clients
const getSupabaseAdmin = () => createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const getSupabaseClient = () => createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
);

const getSupabaseAuthClient = () => {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const key = anonKey || serviceKey;
  return createClient(url, key);
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'FMS13 <onboarding@updates.opaltechservices.com>';
const ATTACHMENTS_BUCKET = Deno.env.get('ATTACHMENTS_BUCKET')
  ?? Deno.env.get('SUPABASE_ATTACHMENTS_BUCKET')
  ?? 'fms13-attachments';
const FUNCTION_BASE_URL = `${(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')}/functions/v1/make-server-fc558f72`;
const ACTION_BASE_URL = (Deno.env.get('ACTION_BASE_URL') ?? FUNCTION_BASE_URL).replace(/\/$/, '');

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Helper function to verify user
const verifyUser = async (request: Request) => {
  const accessToken = request.headers.get('Authorization')?.split(' ')[1];
  if (!accessToken) {
    return { error: 'No token provided', user: null };
  }
  
  const supabase = getSupabaseAuthClient();
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  
  if (error || !user) {
    console.log('Verify user error:', error?.message || error);
    return { error: 'Unauthorized', user: null };
  }
  
  return { error: null, user };
};

// Generate unique IDs
const generateId = (prefix: string) => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const generateShortId = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const reserveShortId = async (userId: string) => {
  if (!userId) return '';
  const existingProfile = await kv.get(`user:${userId}`);
  if (existingProfile?.shortId) {
    const normalized = String(existingProfile.shortId).toUpperCase();
    const mapped = await kv.get(`user-short:${normalized}`);
    if (!mapped) {
      await kv.set(`user-short:${normalized}`, userId);
    }
    return normalized;
  }
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const shortId = generateShortId();
    const taken = await kv.get(`user-short:${shortId}`);
    if (!taken) {
      await kv.set(`user-short:${shortId}`, userId);
      return shortId;
    }
  }
  const fallback = generateShortId();
  await kv.set(`user-short:${fallback}`, userId);
  return fallback;
};

const ensureShortId = async (profile: any) => {
  if (!profile?.id) return profile;
  if (profile.shortId) return profile;
  const shortId = await reserveShortId(profile.id);
  const updated = { ...profile, shortId };
  await kv.set(`user:${profile.id}`, updated);
  return updated;
};

const resolveUserId = async (value: string) => {
  if (!value) return value;
  const trimmed = value.trim();
  if (trimmed.length === 6) {
    const mapped = await kv.get(`user-short:${trimmed.toUpperCase()}`);
    if (mapped) {
      return mapped;
    }
  }
  return trimmed;
};

const ensureUserProfile = async (user: any) => {
  if (!user?.id) return null;
  const existing = await kv.get(`user:${user.id}`);
  if (existing) {
    return await ensureShortId(existing);
  }
  const shortId = await reserveShortId(user.id);
  const profile = {
    id: user.id,
    email: user.email || '',
    name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
    phone: '',
    createdAt: new Date().toISOString(),
    createdBy: user.id,
    isGlobalUser: true,
    shortId
  };
  await kv.set(`user:${user.id}`, profile);
  await upsertUserProfile(profile);
  return profile;
};

const createAuthUser = async (params: { email: string; password: string; metadata?: Record<string, any> }) => {
  const adminKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (adminKey) {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: params.email,
      password: params.password,
      user_metadata: params.metadata || {},
      email_confirm: true
    });
    if (!error && data?.user) {
      return { user: data.user, session: null, error: null };
    }
    console.log('Admin create user failed, falling back to signUp:', error?.message || error);
  }

  const supabaseClient = getSupabaseClient();
  const { data, error } = await supabaseClient.auth.signUp({
    email: params.email,
    password: params.password,
    options: { data: params.metadata || {} }
  });
  if (error || !data.user) {
    return { user: null, session: null, error: error?.message || 'Signup failed' };
  }
  return { user: data.user, session: data.session || null, error: null };
};

const upsertRecord = async (table: string, values: any, options?: { onConflict?: string }) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from(table).upsert(values, options);
    if (error) {
      console.log(`Upsert ${table} error:`, error.message);
    }
  } catch (error) {
    console.log(`Upsert ${table} exception:`, error);
  }
};

const insertRecord = async (table: string, values: any) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from(table).insert(values);
    if (error) {
      console.log(`Insert ${table} error:`, error.message);
    }
  } catch (error) {
    console.log(`Insert ${table} exception:`, error);
  }
};

const upsertCompanyRecord = async (company: any) => {
  if (!company?.id) return;
  await upsertRecord('fms13_companies', {
    id: company.id,
    name: company.name,
    address: company.address || null,
    phone: company.phone || null,
    industry: company.industry || null,
    created_by: company.createdBy || null,
    created_at: company.createdAt || new Date().toISOString(),
  }, { onConflict: 'id' });
};

const upsertUserProfile = async (profile: any) => {
  if (!profile?.id) return;
  await upsertRecord('fms13_user_profiles', {
    id: profile.id,
    email: profile.email || null,
    name: profile.name || null,
    phone: profile.phone || null,
    role: profile.role || null,
    avatar_url: profile.avatarUrl || null,
    skills: profile.skills || null,
    specialization: profile.specialization || null,
    profile_complete: profile.profileComplete ?? null,
    is_global_user: profile.isGlobalUser ?? null,
    created_at: profile.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
};

const upsertCompanyUser = async (binding: any) => {
  if (!binding?.companyId || !binding?.userId) return;
  await upsertRecord('fms13_company_users', {
    company_id: binding.companyId,
    user_id: binding.userId,
    role: binding.role,
    facility_ids: binding.facilityIds || [],
    created_at: binding.assignedAt || new Date().toISOString(),
  }, { onConflict: 'company_id,user_id,role' });
};

const upsertCompanyContractor = async (params: {
  companyId: string;
  contractorId: string;
  status?: string;
  suspendedAt?: string | null;
  resumedAt?: string | null;
  suspendedBy?: string | null;
  suspensionReason?: string | null;
}) => {
  if (!params.companyId || !params.contractorId) return;
  await upsertRecord('fms13_company_contractors', {
    company_id: params.companyId,
    contractor_id: params.contractorId,
    status: params.status || 'active',
    suspended_at: params.suspendedAt || null,
    resumed_at: params.resumedAt || null,
    suspended_by: params.suspendedBy || null,
    suspension_reason: params.suspensionReason || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id,contractor_id' });
};

const upsertEquipmentRecord = async (equipment: any) => {
  if (!equipment?.id) return;
  await upsertRecord('fms13_equipment', {
    id: equipment.id,
    company_id: equipment.companyId,
    facility_id: equipment.facilityId,
    name: equipment.name,
    category: equipment.category,
    brand: equipment.brand || null,
    model: equipment.model || null,
    serial_number: equipment.serialNumber || null,
    status: equipment.status || null,
    health_status: equipment.healthStatus || null,
    location: equipment.location || null,
    contractor_id: equipment.contractorId || null,
    created_by: equipment.recordedBy?.userId || equipment.createdBy || null,
    recorded_by_name: equipment.recordedBy?.name || null,
    recorded_by_role: equipment.recordedBy?.role || null,
    created_at: equipment.createdAt || equipment.recordedAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
};

const upsertIssueRecord = async (issue: any) => {
  if (!issue?.id) return;
  await upsertRecord('fms13_issues', {
    id: issue.id,
    company_id: issue.companyId,
    facility_id: issue.facilityId,
    equipment_id: issue.equipmentId || null,
    equipment_name: issue.equipmentName || null,
    title: issue.title || null,
    description: issue.description || null,
    priority: issue.priority || null,
    status: issue.status || null,
    task_type: issue.taskType || null,
    reported_by_id: issue.reportedBy?.userId || null,
    reported_by_name: issue.reportedBy?.name || null,
    reported_by_role: issue.reportedBy?.role || null,
    reported_by_contact: issue.reportedBy?.contact || null,
    assigned_to: issue.assignedTo || null,
    assigned_at: issue.assignedAt || null,
    responded_at: issue.respondedAt || issue.contractorResponse?.respondedAt || null,
    accepted_at: issue.acceptedAt || null,
    rejected_at: issue.rejectedAt || null,
    completed_at: issue.completedAt || issue.completion?.completedAt || null,
    approved_at: issue.approvedAt || null,
    closed_at: issue.closedAt || null,
    sla_deadline: issue.slaDeadline || null,
    execution_metrics: issue.executionMetrics || null,
    created_at: issue.createdAt || new Date().toISOString(),
    updated_at: issue.updatedAt || new Date().toISOString(),
  }, { onConflict: 'id' });
};

const insertEquipmentHistory = async (params: {
  equipmentId: string;
  action: string;
  details?: any;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
}) => {
  if (!params.equipmentId) return;
  await insertRecord('fms13_equipment_history', {
    equipment_id: params.equipmentId,
    action: params.action,
    details: params.details || null,
    actor_id: params.actorId || null,
    actor_name: params.actorName || null,
    actor_role: params.actorRole || null,
    created_at: new Date().toISOString(),
  });
};

const insertIssueEvent = async (params: {
  issueId: string;
  action: string;
  status?: string | null;
  details?: any;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
}) => {
  if (!params.issueId) return;
  await insertRecord('fms13_issue_events', {
    issue_id: params.issueId,
    action: params.action,
    status: params.status || null,
    details: params.details || null,
    actor_id: params.actorId || null,
    actor_name: params.actorName || null,
    actor_role: params.actorRole || null,
    created_at: new Date().toISOString(),
  });
};

const insertAuditLog = async (params: {
  entityType: string;
  entityId: string;
  action: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  companyId?: string;
  details?: any;
}) => {
  await insertRecord('fms13_audit_logs', {
    entity_type: params.entityType,
    entity_id: params.entityId,
    action_type: params.action,
    actor_id: params.userId || null,
    actor_name: params.userName || null,
    actor_role: params.userRole || null,
    company_id: params.companyId || null,
    details: params.details || null,
    created_at: new Date().toISOString(),
  });
};

const updateVendorMetrics = async (params: {
  companyId: string;
  contractorId: string;
  responseMinutes?: number | null;
  completionMinutes?: number | null;
  delayed?: boolean;
  incrementTotal?: boolean;
}) => {
  if (!params.companyId || !params.contractorId) return;
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('fms13_vendor_metrics')
      .select('*')
      .eq('company_id', params.companyId)
      .eq('contractor_id', params.contractorId)
      .maybeSingle();

    if (error) {
      console.log('Fetch vendor metrics error:', error.message);
    }

    const existing = data || {
      company_id: params.companyId,
      contractor_id: params.contractorId,
      avg_response_minutes: null,
      avg_completion_minutes: null,
      response_count: 0,
      completion_count: 0,
      delayed_jobs_count: 0,
      total_jobs: 0,
    };

    const responseCount = params.responseMinutes !== undefined && params.responseMinutes !== null
      ? (existing.response_count || 0) + 1
      : existing.response_count || 0;
    const completionCount = params.completionMinutes !== undefined && params.completionMinutes !== null
      ? (existing.completion_count || 0) + 1
      : existing.completion_count || 0;

    const avgResponse = params.responseMinutes !== undefined && params.responseMinutes !== null
      ? Math.round(((existing.avg_response_minutes || 0) * (responseCount - 1) + params.responseMinutes) / responseCount)
      : existing.avg_response_minutes;

    const avgCompletion = params.completionMinutes !== undefined && params.completionMinutes !== null
      ? Math.round(((existing.avg_completion_minutes || 0) * (completionCount - 1) + params.completionMinutes) / completionCount)
      : existing.avg_completion_minutes;

    const totalJobs = params.incrementTotal ? (existing.total_jobs || 0) + 1 : existing.total_jobs || 0;
    const delayedJobs = params.delayed ? (existing.delayed_jobs_count || 0) + 1 : existing.delayed_jobs_count || 0;

    await upsertRecord('fms13_vendor_metrics', {
      company_id: params.companyId,
      contractor_id: params.contractorId,
      avg_response_minutes: avgResponse,
      avg_completion_minutes: avgCompletion,
      response_count: responseCount,
      completion_count: completionCount,
      delayed_jobs_count: delayedJobs,
      total_jobs: totalJobs,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,contractor_id' });
  } catch (error) {
    console.log('Update vendor metrics exception:', error);
  }
};

const getContractorStatus = async (companyId?: string, contractorId?: string) => {
  if (!companyId || !contractorId) return 'active';
  const binding = await kv.get(`user-company:${contractorId}:${companyId}`);
  return binding?.status || 'active';
};

const notifySupervisors = async (companyId?: string, activity?: any) => {
  if (!companyId || !activity) return;
  try {
    const bindings = await kv.getByPrefix('user-company:');
    const supervisors = bindings.filter((binding: any) => binding.companyId === companyId && binding.role === 'facility_supervisor');
    if (!supervisors.length) return;

    const notifications = supervisors.map((binding: any) => ({
      id: generateId('NOT'),
      userId: binding.userId,
      companyId,
      message: `${activity.userName || 'User'} ${activity.action.replace(/_/g, ' ')} ${activity.entityType} ${activity.entityId}`,
      type: 'supervisor_alert',
      entityType: activity.entityType,
      entityId: activity.entityId,
      read: false,
      timestamp: new Date().toISOString()
    }));

    await kv.mset(
      notifications.map((n: any) => `notification:${n.id}`),
      notifications
    );
  } catch (error) {
    console.log('Notify supervisors error:', error);
  }
};

// Activity logging helper
const logActivity = async (params: {
  entityType: 'company' | 'facility' | 'equipment' | 'issue' | 'user';
  entityId: string;
  action: string;
  userId: string;
  userName: string;
  userRole: string;
  details?: any;
  companyId?: string;
}) => {
  const activityId = generateId('ACT');
  const activity = {
    id: activityId,
    ...params,
    timestamp: new Date().toISOString(),
  };
  await kv.set(`activity:${params.entityType}:${params.entityId}:${activityId}`, activity);
  await insertAuditLog(params);
  if (params.entityType === 'equipment') {
    await insertEquipmentHistory({
      equipmentId: params.entityId,
      action: params.action,
      details: params.details,
      actorId: params.userId,
      actorName: params.userName,
      actorRole: params.userRole,
    });
  }
  if (params.entityType === 'issue') {
    await insertIssueEvent({
      issueId: params.entityId,
      action: params.action,
      status: params.details?.status || null,
      details: params.details,
      actorId: params.userId,
      actorName: params.userName,
      actorRole: params.userRole,
    });
  }
  if (params.details?.equipmentId && params.entityType !== 'equipment') {
    await insertEquipmentHistory({
      equipmentId: params.details.equipmentId,
      action: params.action,
      details: { issueId: params.entityId, ...params.details },
      actorId: params.userId,
      actorName: params.userName,
      actorRole: params.userRole,
    });
  }
  await notifySupervisors(params.companyId, activity);
  return activity;
};

// Get user profile with company context
const getUserProfile = async (userId: string) => {
  const profile = await kv.get(`user:${userId}`);
  if (!profile) {
    return null;
  }
  return await ensureShortId(profile);
};

// Check user access to company
const checkCompanyAccess = async (userId: string, companyId: string) => {
  const binding = await kv.get(`user-company:${userId}:${companyId}`);
  return binding;
};

const sanitizeFileName = (name: string) => {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
};

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const diffMinutes = (start?: string | null, end?: string | null) => {
  if (!start || !end) return null;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return null;
  return Math.round((endTime - startTime) / 60000);
};

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const computeExecutionMetrics = (issue: any) => {
  const respondedAt = issue.respondedAt || issue.contractorResponse?.respondedAt || null;
  const acceptedAt = issue.acceptedAt || (issue.contractorResponse?.decision === 'accepted' ? respondedAt : null);
  const completedAt = issue.completedAt || issue.completion?.completedAt || null;
  const approvedAt = issue.approvedAt || null;
  return {
    responseMinutes: diffMinutes(issue.assignedAt, respondedAt),
    executionMinutes: diffMinutes(acceptedAt || respondedAt || issue.assignedAt, completedAt),
    totalMinutes: diffMinutes(issue.createdAt, completedAt),
    approvalMinutes: diffMinutes(completedAt, approvedAt),
  };
};

const buildDecisionLinks = (issueId: string, token: string) => {
  const base = `${ACTION_BASE_URL}/issues/${issueId}/respond-email?token=${encodeURIComponent(token)}`;
  return {
    actionUrl: base,
    acceptUrl: `${base}&decision=accepted`,
    rejectUrl: `${base}&decision=rejected`,
  };
};

const sendEmail = async (params: { to: string | string[]; subject: string; html: string; text?: string }) => {
  if (!RESEND_API_KEY) {
    console.log('Resend API key not configured; skipping email.');
    return;
  }

  const toList = Array.isArray(params.to) ? params.to : [params.to];
  if (toList.length === 0) {
    return;
  }
  const payload = {
    from: RESEND_FROM,
    to: toList,
    subject: params.subject,
    html: params.html,
    text: params.text || stripHtml(params.html),
  };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.log('Resend email error:', errorText);
  }
};

const parseCsv = (csvText: string) => {
  const rows: string[][] = [];
  const lines = csvText.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
  for (const line of lines) {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
        continue;
      }
      current += char;
    }
    values.push(current);
    rows.push(values);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map((header, index) => {
    const cleaned = index === 0 ? header.replace(/^\ufeff/, '') : header;
    return cleaned.trim();
  });
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] ?? '';
    });
    return obj;
  });
};

const getUserEmail = async (userId: string) => {
  const profile = await kv.get(`user:${userId}`);
  if (profile?.email) {
    return profile.email;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) {
    console.log('Lookup user email error:', error.message);
    return null;
  }
  return data?.user?.email || null;
};

const getCompanyAdminEmails = async (companyId: string) => {
  const bindings = await kv.getByPrefix('user-company:');
  const adminBindings = bindings.filter((binding: any) => binding.companyId === companyId && binding.role === 'company_admin');
  const emails = await Promise.all(adminBindings.map((binding: any) => getUserEmail(binding.userId)));
  return emails.filter((email: string | null) => email);
};

const buildInvitationEmail = (params: {
  companyName: string;
  invitedByName?: string;
  categories?: string[];
  facilityIds?: string[];
  actionUrl?: string;
}) => {
  const facilityLine = params.facilityIds && params.facilityIds.length
    ? `<li><strong>Facilities:</strong> ${params.facilityIds.join(', ')}</li>`
    : '';
  const categoryLine = params.categories && params.categories.length
    ? `<li><strong>Scope:</strong> ${params.categories.join(', ')}</li>`
    : '';
  const actionLine = params.actionUrl
    ? `<p><a href="${params.actionUrl}" style="display: inline-block; background: #0f766e; color: #fff; padding: 10px 16px; border-radius: 6px; text-decoration: none;">Review invitation</a></p>`
    : '';

  return {
    subject: `Invitation to join ${params.companyName} on FMS13`,
    html: `
      <p>You have been invited to join ${params.companyName} as a contractor.</p>
      <p><strong>Invited by:</strong> ${params.invitedByName || 'Company admin'}</p>
      ${facilityLine || categoryLine ? `<ul>${facilityLine}${categoryLine}</ul>` : ''}
      ${actionLine}
      <p>Next steps:</p>
      <ol>
        <li>Open the invitation link.</li>
        <li>Review the details and choose Accept or Decline.</li>
      </ol>
      <p>Accepting the invitation adds the company to your switcher.</p>
    `
  };
};

const ensureAttachmentsBucket = async (supabaseAdmin: ReturnType<typeof createClient>) => {
  const { data, error } = await supabaseAdmin.storage.getBucket(ATTACHMENTS_BUCKET);
  if (!data && error) {
    const { error: createError } = await supabaseAdmin.storage.createBucket(ATTACHMENTS_BUCKET, {
      public: true,
    });
    if (createError) {
      console.log('Create bucket error:', createError.message);
    }
  }
};

// Health check endpoint
app.get("/make-server-fc558f72/health", (c) => {
  return c.json({ status: "ok" });
});

// ============================================
// ATTACHMENTS ROUTES
// ============================================

app.post("/make-server-fc558f72/uploads", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const formData = await c.req.formData();
    const issueId = formData.get('issueId')?.toString();
    const kind = formData.get('kind')?.toString() || 'general';
    const file = formData.get('file');

    if (!issueId || !(file instanceof File)) {
      return c.json({ error: 'Issue ID and file are required' }, 400);
    }

    const issue = await kv.get(`issue:${issueId}`);
    if (!issue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    const binding = await checkCompanyAccess(user.id, issue.companyId);
    if (!binding) {
      return c.json({ error: 'No access to this issue' }, 403);
    }

    if (binding.role === 'contractor' && issue.assignedTo !== user.id) {
      return c.json({ error: 'Only assigned contractors can upload attachments' }, 403);
    }

    const supabaseAdmin = getSupabaseAdmin();
    await ensureAttachmentsBucket(supabaseAdmin);

    const safeName = sanitizeFileName(file.name);
    const path = `${issue.companyId}/${issueId}/${kind}/${Date.now()}-${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin
      .storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.log('Upload error:', uploadError.message);
      return c.json({ error: 'Failed to upload attachment' }, 500);
    }

    const { data: publicData } = supabaseAdmin.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path);
    return c.json({
      success: true,
      attachment: {
        url: publicData.publicUrl,
        path,
        name: file.name,
        type: file.type,
        size: file.size
      }
    });
  } catch (error) {
    console.log('Upload attachment error:', error);
    return c.json({ error: 'Failed to upload attachment' }, 500);
  }
});

// ============================================
// AUTH ROUTES
// ============================================

// Signup
app.post("/make-server-fc558f72/auth/signup", async (c) => {
  try {
    const { email, password, name, role, phone, companyId, skills, specialization } = await c.req.json();
    
    if (!email || !password || !name) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const { user: createdUser, error: createError } = await createAuthUser({
      email,
      password,
      metadata: { name }
    });

    if (createError || !createdUser) {
      console.log('Signup error:', createError);
      return c.json({ error: createError || 'Signup failed' }, 400);
    }

    // Store user profile in KV (global user)
    const userProfile = {
      id: createdUser.id,
      email,
      name,
      phone: phone || '',
      createdAt: new Date().toISOString(),
      createdBy: createdUser.id,
      isGlobalUser: true,
      // Contractor-specific fields
      skills: skills || [],
      specialization: specialization || '',
      profileComplete: !!(skills && specialization)
    };
    const shortId = await reserveShortId(createdUser.id);
    const finalizedProfile = { ...userProfile, shortId };

    await kv.set(`user:${createdUser.id}`, finalizedProfile);
    await upsertUserProfile(finalizedProfile);

    // Log account creation
    await logActivity({
      entityType: 'user',
      entityId: createdUser.id,
      action: 'account_created',
      userId: createdUser.id,
      userName: name,
      userRole: 'new_user',
      details: { email, timestamp: new Date().toISOString() }
    });

    // If role and companyId provided, create user-company binding
    if (role && companyId) {
      await kv.set(`user-company:${createdUser.id}:${companyId}`, {
        userId: createdUser.id,
        companyId,
        role,
        assignedAt: new Date().toISOString(),
        assignedBy: createdUser.id,
        facilityIds: [], // For facility managers
      });
      await upsertCompanyUser({
        userId: createdUser.id,
        companyId,
        role,
        assignedAt: new Date().toISOString(),
        facilityIds: [],
      });

      // Log activity
      await logActivity({
        entityType: 'user',
      entityId: createdUser.id,
      action: 'user_created',
      userId: createdUser.id,
      userName: name,
      userRole: role,
      companyId,
      details: { email, role }
    });
    }

    return c.json({ 
      success: true, 
      user: { 
        id: createdUser.id, 
        email, 
        name,
        phone: phone || '',
        skills: skills || [],
        specialization: specialization || '',
        shortId
      } 
    });
  } catch (error) {
    console.log('Signup exception:', error);
    return c.json({ error: 'Signup failed' }, 500);
  }
});

// Signin
app.post("/make-server-fc558f72/auth/signin", async (c) => {
  try {
    const { email, password } = await c.req.json();
    
    if (!email || !password) {
      return c.json({ error: 'Email and password required' }, 400);
    }

    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.log('Signin error:', error);
      return c.json({ error: error.message }, 401);
    }
    if (!data.session?.access_token) {
      return c.json({ error: 'Login failed' }, 401);
    }

    // Get or create user profile
    const userProfile = await ensureUserProfile(data.user);
    const fallbackShortId = userProfile?.shortId || await reserveShortId(data.user.id);
    const fallbackProfile = userProfile || {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.name,
      shortId: fallbackShortId
    };

    // Get all company bindings for this user
    const allBindings = await kv.getByPrefix(`user-company:${data.user.id}:`);

    return c.json({ 
      success: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
      user: fallbackProfile,
      companyBindings: allBindings
    });
  } catch (error) {
    console.log('Signin exception:', error);
    return c.json({ error: 'Signin failed' }, 500);
  }
});

// Company admin onboarding (register account + company in one step)
app.post("/make-server-fc558f72/onboarding/company-admin", async (c) => {
  try {
    const { company, admin } = await c.req.json();

    if (!company?.name || !admin?.email || !admin?.password || !admin?.name) {
      return c.json({ error: 'Company name and admin details required' }, 400);
    }
    const { user: createdUser, session: createdSession, error: createError } = await createAuthUser({
      email: admin.email,
      password: admin.password,
      metadata: { name: admin.name, role: 'company_admin' }
    });

    if (createError || !createdUser) {
      console.log('Company admin signup error:', createError);
      return c.json({ error: createError || 'Signup failed' }, 400);
    }

    const userId = createdUser.id;
    const shortId = await reserveShortId(userId);
    const userProfile = {
      id: userId,
      email: admin.email,
      name: admin.name,
      role: 'company_admin',
      phone: admin.phone || '',
      createdAt: new Date().toISOString(),
      createdBy: userId,
      isGlobalUser: true,
      shortId
    };

    await kv.set(`user:${userId}`, userProfile);
    await upsertUserProfile(userProfile);

    const companyId = generateId('COM');
    const companyRecord = {
      id: companyId,
      name: company.name,
      address: company.address || '',
      phone: company.phone || '',
      industry: company.industry || '',
      createdAt: new Date().toISOString(),
      createdBy: userId,
      status: 'active'
    };

    await kv.set(`company:${companyId}`, companyRecord);
    await upsertCompanyRecord(companyRecord);

    const binding = {
      userId,
      companyId,
      role: 'company_admin',
      assignedAt: new Date().toISOString(),
    };

    await kv.set(`user-company:${userId}:${companyId}`, binding);
    await upsertCompanyUser(binding);

    await logActivity({
      entityType: 'company',
      entityId: companyId,
      action: 'company_created',
      userId,
      userName: admin.name,
      userRole: 'company_admin',
      companyId,
      details: { companyName: company.name }
    });

    await logActivity({
      entityType: 'user',
      entityId: userId,
      action: 'account_created',
      userId,
      userName: admin.name,
      userRole: 'company_admin',
      companyId,
      details: { email: admin.email }
    });

    let accessToken = createdSession?.access_token || null;
    let refreshToken = createdSession?.refresh_token || null;
    let expiresIn = createdSession?.expires_in || null;

    if (!accessToken) {
      const supabaseClient = getSupabaseClient();
      const { data: sessionData, error: sessionError } = await supabaseClient.auth.signInWithPassword({
        email: admin.email,
        password: admin.password,
      });

      if (sessionError || !sessionData.session?.access_token) {
        console.log('Company admin session error:', sessionError);
        return c.json({ error: 'Login failed' }, 401);
      }

      accessToken = sessionData.session.access_token;
      refreshToken = sessionData.session.refresh_token;
      expiresIn = sessionData.session.expires_in;
    }

    return c.json({
      success: true,
      accessToken,
      refreshToken,
      expiresIn,
      user: userProfile,
      company: companyRecord,
      companyId,
      companyBindings: [binding]
    });
  } catch (error) {
    console.log('Company admin onboarding exception:', error);
    return c.json({ error: 'Onboarding failed' }, 500);
  }
});

// Contractor onboarding (register account + profile)
app.post("/make-server-fc558f72/onboarding/contractor", async (c) => {
  try {
    const { email, password, name, phone, skills, specialization } = await c.req.json();

    if (!email || !password || !name) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    const { user: createdUser, session: createdSession, error: createError } = await createAuthUser({
      email,
      password,
      metadata: { name, role: 'contractor' }
    });

    if (createError || !createdUser) {
      console.log('Contractor signup error:', createError);
      return c.json({ error: createError || 'Signup failed' }, 400);
    }

    const userId = createdUser.id;
    const shortId = await reserveShortId(userId);
    const userProfile = {
      id: userId,
      email,
      name,
      role: 'contractor',
      phone: phone || '',
      createdAt: new Date().toISOString(),
      createdBy: userId,
      isGlobalUser: true,
      skills: skills || [],
      specialization: specialization || '',
      profileComplete: !!(skills && specialization),
      shortId
    };

    await kv.set(`user:${userId}`, userProfile);
    await upsertUserProfile(userProfile);

    await logActivity({
      entityType: 'user',
      entityId: userId,
      action: 'account_created',
      userId,
      userName: name,
      userRole: 'contractor',
      details: { email }
    });

    let accessToken = createdSession?.access_token || null;
    let refreshToken = createdSession?.refresh_token || null;
    let expiresIn = createdSession?.expires_in || null;

    if (!accessToken) {
      const supabaseClient = getSupabaseClient();
      const { data: sessionData, error: sessionError } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (sessionError || !sessionData.session?.access_token) {
        console.log('Contractor session error:', sessionError);
        return c.json({ error: 'Login failed' }, 401);
      }

      accessToken = sessionData.session.access_token;
      refreshToken = sessionData.session.refresh_token;
      expiresIn = sessionData.session.expires_in;
    }

    return c.json({
      success: true,
      accessToken,
      refreshToken,
      expiresIn,
      user: userProfile,
      companyBindings: []
    });
  } catch (error) {
    console.log('Contractor onboarding exception:', error);
    return c.json({ error: 'Onboarding failed' }, 500);
  }
});

// Get current user session
app.get("/make-server-fc558f72/auth/session", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    
    if (error || !user) {
      return c.json({ error: 'No active session' }, 401);
    }

    const userProfile = await ensureUserProfile(user);
    const fallbackShortId = userProfile?.shortId || await reserveShortId(user.id);
    const fallbackProfile = userProfile || {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name,
      shortId: fallbackShortId
    };
    const allBindings = await kv.getByPrefix(`user-company:${user.id}:`);

    return c.json({ 
      success: true,
      user: fallbackProfile,
      companyBindings: allBindings
    });
  } catch (error) {
    console.log('Session check exception:', error);
    return c.json({ error: 'Session check failed' }, 500);
  }
});

// ============================================
// COMPANY ROUTES (Multi-tenant)
// ============================================

// Register company (system admin or self-registration)
app.post("/make-server-fc558f72/companies", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { name, address, phone, industry, adminName } = await c.req.json();
    
    if (!name) {
      return c.json({ error: 'Company name required' }, 400);
    }

    const companyId = generateId('COM');
    const company = {
      id: companyId,
      name,
      address: address || '',
      phone: phone || '',
      industry: industry || '',
      createdAt: new Date().toISOString(),
      createdBy: user.id,
      status: 'active'
    };

    await kv.set(`company:${companyId}`, company);

    // Create company admin binding for the current user
    await kv.set(`user-company:${user.id}:${companyId}`, {
      userId: user.id,
      companyId,
      role: 'company_admin',
      assignedAt: new Date().toISOString(),
    });

    const userProfile = await ensureUserProfile(user);
    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    // Log activity
    await logActivity({
      entityType: 'company',
      entityId: companyId,
      action: 'company_created',
      userId: user.id,
      userName: userProfile?.name || adminName,
      userRole: 'company_admin',
      companyId,
      details: { companyName: name }
    });

    return c.json({ success: true, company, companyId });
  } catch (error) {
    console.log('Create company error:', error);
    return c.json({ error: 'Failed to create company' }, 500);
  }
});

// Get all companies (system admin only)
app.get("/make-server-fc558f72/companies", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Check if system admin
    const userProfile = await ensureUserProfile(user);
    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }
    const allBindings = await kv.getByPrefix(`user-company:${user.id}:`);
    
    // System admin can see all, otherwise only companies they belong to
    let companies = await kv.getByPrefix('company:');
    
    const isSystemAdmin = allBindings.some((b: any) => b.role === 'system_admin');
    if (!isSystemAdmin) {
      const userCompanyIds = allBindings.map((b: any) => b.companyId);
      companies = companies.filter((c: any) => userCompanyIds.includes(c.id));
    }

    return c.json({ success: true, companies });
  } catch (error) {
    console.log('Get companies error:', error);
    return c.json({ error: 'Failed to get companies' }, 500);
  }
});

// Get single company
app.get("/make-server-fc558f72/companies/:id", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const companyId = c.req.param('id');
    
    // Check access
    const binding = await checkCompanyAccess(user.id, companyId);
    if (!binding) {
      return c.json({ error: 'No access to this company' }, 403);
    }

    const company = await kv.get(`company:${companyId}`);
    if (!company) {
      return c.json({ error: 'Company not found' }, 404);
    }

    return c.json({ success: true, company });
  } catch (error) {
    console.log('Get company error:', error);
    return c.json({ error: 'Failed to get company' }, 500);
  }
});

// ============================================
// FACILITIES ROUTES
// ============================================

// Create facility (company admin only)
app.post("/make-server-fc558f72/facilities", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { name, location, companyId, address, phone } = await c.req.json();
    
    if (!name || !location || !companyId) {
      return c.json({ error: 'Name, location, and company required' }, 400);
    }

    // Check company admin access
    const binding = await checkCompanyAccess(user.id, companyId);
    if (!binding || binding.role !== 'company_admin') {
      return c.json({ error: 'Only company admins can create facilities' }, 403);
    }

    const userProfile = await ensureUserProfile(user);
    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    const facilityId = generateId('FAC');
    const facility = {
      id: facilityId,
      name,
      location,
      companyId,
      address: address || '',
      phone: phone || '',
      createdAt: new Date().toISOString(),
      createdBy: {
        userId: user.id,
        name: userProfile.name,
        role: 'company_admin',
        contact: userProfile.phone || userProfile.email
      }
    };

    await kv.set(`facility:${facilityId}`, facility);

    // Log activity
    await logActivity({
      entityType: 'facility',
      entityId: facilityId,
      action: 'facility_created',
      userId: user.id,
      userName: userProfile.name,
      userRole: 'company_admin',
      companyId,
      details: { facilityName: name, location }
    });

    return c.json({ success: true, facility });
  } catch (error) {
    console.log('Create facility error:', error);
    return c.json({ error: 'Failed to create facility' }, 500);
  }
});

// Get all facilities (company-scoped)
app.get("/make-server-fc558f72/facilities", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const companyId = c.req.query('companyId');
    
    if (companyId) {
      // Check access to this company
      const binding = await checkCompanyAccess(user.id, companyId);
      if (!binding) {
        return c.json({ error: 'No access to this company' }, 403);
      }
    }

    const allFacilities = await kv.getByPrefix('facility:');
    
    // Get user's company bindings
    const userBindings = await kv.getByPrefix(`user-company:${user.id}:`);
    const userCompanyIds = userBindings.map((b: any) => b.companyId);
    
    // Filter facilities by company access
    let facilities = allFacilities.filter((f: any) => userCompanyIds.includes(f.companyId));
    
    if (companyId) {
      facilities = facilities.filter((f: any) => f.companyId === companyId);
    }

    return c.json({ success: true, facilities });
  } catch (error) {
    console.log('Get facilities error:', error);
    return c.json({ error: 'Failed to get facilities' }, 500);
  }
});

// Get single facility
app.get("/make-server-fc558f72/facilities/:id", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const facilityId = c.req.param('id');
    const facility = await kv.get(`facility:${facilityId}`);

    if (!facility) {
      return c.json({ error: 'Facility not found' }, 404);
    }

    // Check company access
    const binding = await checkCompanyAccess(user.id, facility.companyId);
    if (!binding) {
      return c.json({ error: 'No access to this facility' }, 403);
    }

    return c.json({ success: true, facility });
  } catch (error) {
    console.log('Get facility error:', error);
    return c.json({ error: 'Failed to get facility' }, 500);
  }
});

// ============================================
// EQUIPMENT ROUTES
// ============================================

// Create equipment (facility manager or company admin)
app.post("/make-server-fc558f72/equipment", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { 
      name, 
      category, 
      brand, 
      model, 
      serialNumber, 
      installDate, 
      warrantyPeriod, 
      facilityId,
      companyId,
      contractorId,
      location 
    } = await c.req.json();
    
    if (!name || !category || !facilityId || !companyId) {
      return c.json({ error: 'Name, category, facility, and company required' }, 400);
    }

    // Check access
    const binding = await checkCompanyAccess(user.id, companyId);
    if (!binding || (binding.role !== 'facility_manager' && binding.role !== 'company_admin')) {
      return c.json({ error: 'Only facility managers and company admins can create equipment' }, 403);
    }

    const userProfile = await ensureUserProfile(user);
    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    const facility = await kv.get(`facility:${facilityId}`);
    if (!facility || facility.companyId !== companyId) {
      return c.json({ error: 'Facility not found for this company' }, 404);
    }

    let resolvedContractorId: string | null = null;
    if (contractorId) {
      resolvedContractorId = await resolveUserId(String(contractorId));
      const contractorProfile = await kv.get(`user:${resolvedContractorId}`);
      if (!contractorProfile) {
        return c.json({ error: 'Assigned contractor not found' }, 404);
      }
    }

    const equipmentId = generateId('EQP');
    const equipment = {
      id: equipmentId,
      name,
      category,
      brand: brand || '',
      model: model || '',
      serialNumber: serialNumber || '',
      installDate: installDate || '',
      warrantyPeriod: warrantyPeriod || '',
      facilityId,
      companyId,
      contractorId: resolvedContractorId || null,
      location: location || '',
      status: 'active',
      healthStatus: 'green',
      createdAt: new Date().toISOString(),
      // CRITICAL: Store who recorded it with full details
      recordedBy: {
        userId: user.id,
        name: userProfile.name,
        role: binding.role,
        branch: facility.name,
        contact: {
          phone: userProfile.phone || '',
          email: userProfile.email || '',
        }
      }
    };

    await kv.set(`equipment:${equipmentId}`, equipment);
    await upsertEquipmentRecord(equipment);

    // Log activity
    await logActivity({
      entityType: 'equipment',
      entityId: equipmentId,
      action: 'equipment_created',
      userId: user.id,
      userName: userProfile.name,
      userRole: binding.role,
      companyId,
      details: { equipmentName: name, category, facility: facility.name }
    });

    const adminEmails = await getCompanyAdminEmails(companyId);
    if (adminEmails.length > 0) {
      await sendEmail({
        to: adminEmails,
        subject: `New equipment registered: ${name}`,
        html: `
          <p>New equipment has been registered for ${facility.name}.</p>
          <ul>
            <li><strong>Name:</strong> ${name}</li>
            <li><strong>Category:</strong> ${category}</li>
            <li><strong>Facility:</strong> ${facility.name}</li>
            <li><strong>Recorded by:</strong> ${userProfile.name}</li>
          </ul>
        `
      });
    }

    return c.json({ success: true, equipment });
  } catch (error) {
    console.log('Create equipment error:', error);
    return c.json({ error: 'Failed to create equipment' }, 500);
  }
});

  // Bulk import equipment (CSV/Excel)
  app.post("/make-server-fc558f72/equipment/import", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const contentType = c.req.header('content-type') || '';
    let rows: any[] = [];
    let companyId = '';

    if (contentType.includes('multipart/form-data')) {
      const form = await c.req.formData();
        const file = form.get('file');
        companyId = String(form.get('companyId') || '');
        if (!(file instanceof File)) {
          return c.json({ error: 'CSV file is required' }, 400);
        }
      const buffer = await file.arrayBuffer();
      const csvText = new TextDecoder().decode(buffer);
      rows = parseCsv(csvText);
    } else {
      const payload = await c.req.json();
      rows = payload.equipment || [];
      companyId = payload.companyId || '';
    }

    if (!companyId || !Array.isArray(rows) || rows.length === 0) {
      return c.json({ error: 'Company ID and equipment rows are required' }, 400);
    }

    const binding = await checkCompanyAccess(user.id, companyId);
    if (!binding || (binding.role !== 'facility_manager' && binding.role !== 'company_admin')) {
      return c.json({ error: 'Only facility managers and company admins can import equipment' }, 403);
    }

    const userProfile = await kv.get(`user:${user.id}`);
    const now = new Date().toISOString();
    const created: any[] = [];
    const errors: any[] = [];
    const normalizeKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '_');
    const mapHealthStatus = (value?: string) => {
      if (!value) return '';
      const normalized = value.toLowerCase();
      if (['critical', 'red'].includes(normalized)) return 'red';
      if (['concerning', 'warning', 'yellow'].includes(normalized)) return 'yellow';
      if (['good', 'healthy', 'green'].includes(normalized)) return 'green';
      return normalized;
    };

      const allFacilities = await kv.getByPrefix('facility:');
      const facilityById = new Map<string, any>();
      const facilityByName = new Map<string, any>();
      allFacilities
        .filter((facility: any) => facility.companyId === companyId)
        .forEach((facility: any) => {
          facilityById.set(facility.id, facility);
          if (facility.name) {
            facilityByName.set(facility.name.toLowerCase(), facility);
          }
        });

      const existingEquipment = await kv.getByPrefix('equipment:');
      const existingSerialKeys = new Set(
        existingEquipment
          .filter((eq: any) => eq.companyId === companyId && eq.serialNumber)
          .map((eq: any) => `${eq.facilityId}:${String(eq.serialNumber).trim().toLowerCase()}`)
      );
      const importSerialKeys = new Set<string>();

      for (const [index, row] of rows.entries()) {
        const normalizedRow = Object.fromEntries(
          Object.entries(row).map(([key, value]) => [normalizeKey(key), value])
        );
        const name = normalizedRow.name || normalizedRow.equipment || normalizedRow.equipment_name;
      const category = normalizedRow.category || normalizedRow.equipment_category;
      const facilityValue =
        normalizedRow.facility_id || normalizedRow.facility || normalizedRow.facility_name || normalizedRow.branch;
      const facilityIdValue = facilityValue ? String(facilityValue).trim() : '';
      const facility = facilityById.get(facilityIdValue) || facilityByName.get(facilityIdValue.toLowerCase());

        if (!name || !category || !facility) {
          errors.push({ row: index + 2, error: 'name, category, and facility are required' });
          continue;
        }

        const serialNumberRaw = normalizedRow.serialnumber || normalizedRow.serial_number || '';
        const serialKey = serialNumberRaw
          ? `${facility.id}:${String(serialNumberRaw).trim().toLowerCase()}`
          : '';
        if (serialKey) {
          if (existingSerialKeys.has(serialKey)) {
            errors.push({ row: index + 2, error: 'duplicate serialNumber for facility' });
            continue;
          }
          if (importSerialKeys.has(serialKey)) {
            errors.push({ row: index + 2, error: 'duplicate serialNumber in file' });
            continue;
          }
          importSerialKeys.add(serialKey);
        }

        const contractorIdRaw = normalizedRow.contractorid || normalizedRow.contractor_id || '';
        let resolvedContractorId = '';
        if (contractorIdRaw) {
          resolvedContractorId = await resolveUserId(String(contractorIdRaw));
          const contractorProfile = await kv.get(`user:${resolvedContractorId}`);
          if (!contractorProfile) {
            errors.push({ row: index + 2, error: 'assigned contractor not found' });
            continue;
          }
        }

        const equipmentId = generateId('EQP');
        const equipment = {
          id: equipmentId,
          name: String(name).trim(),
          category: String(category).trim(),
          brand: normalizedRow.brand || '',
          model: normalizedRow.model || '',
          serialNumber: serialNumberRaw || '',
        installDate: normalizedRow.installdate || normalizedRow.install_date || '',
        warrantyPeriod: normalizedRow.warrantyperiod || normalizedRow.warranty_period || '',
        contractorId: resolvedContractorId || null,
        location: normalizedRow.location || '',
        companyId,
        facilityId: facility.id,
        status: normalizedRow.status || 'active',
        healthStatus: mapHealthStatus(normalizedRow.healthstatus || normalizedRow.health_status) || 'green',
        recordedBy: {
          userId: user.id,
          name: userProfile.name,
          role: binding.role,
          contact: {
            phone: userProfile.phone || '',
            email: userProfile.email || '',
          }
        },
        createdAt: now,
        updatedAt: now,
        };

        await kv.set(`equipment:${equipmentId}`, equipment);
        await upsertEquipmentRecord(equipment);

        await logActivity({
          entityType: 'equipment',
          entityId: equipmentId,
          action: 'equipment_imported',
        userId: user.id,
        userName: userProfile.name,
        userRole: binding.role,
        companyId,
        details: { equipmentName: name, category, facility: facility.name }
      });

        created.push(equipment);
      }

      await logActivity({
        entityType: 'company',
        entityId: companyId,
        action: 'equipment_bulk_upload',
        userId: user.id,
        userName: userProfile.name,
        userRole: binding.role,
        companyId,
        details: {
          totalRows: rows.length,
          imported: created.length,
          failed: errors.length,
          timestamp: now
        }
      });

    const adminEmails = await getCompanyAdminEmails(companyId);
    if (adminEmails.length > 0 && created.length > 0) {
      const names = created.slice(0, 5).map((item) => item.name).join(', ');
      await sendEmail({
        to: adminEmails,
        subject: `Equipment imported (${created.length})`,
        html: `
          <p>${created.length} equipment records were imported.</p>
          <p><strong>Preview:</strong> ${names}${created.length > 5 ? '...' : ''}</p>
        `
      });
    }

    return c.json({ success: true, created, errors });
  } catch (error) {
    console.log('Import equipment error:', error);
    return c.json({ error: 'Failed to import equipment' }, 500);
  }
});

// Get all equipment (company-scoped)
app.get("/make-server-fc558f72/equipment", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const companyId = c.req.query('companyId');
    const facilityId = c.req.query('facilityId');
    
    const allEquipment = await kv.getByPrefix('equipment:');
    
    // Get user's company bindings
    const userBindings = await kv.getByPrefix(`user-company:${user.id}:`);
    const userCompanyIds = userBindings.map((b: any) => b.companyId);
    
    // Filter by company access
    let equipment = allEquipment.filter((eq: any) => userCompanyIds.includes(eq.companyId));
    
    if (companyId) {
      equipment = equipment.filter((eq: any) => eq.companyId === companyId);
    }
    
    if (facilityId) {
      equipment = equipment.filter((eq: any) => eq.facilityId === facilityId);
    }

    return c.json({ success: true, equipment });
  } catch (error) {
    console.log('Get equipment error:', error);
    return c.json({ error: 'Failed to get equipment' }, 500);
  }
});

// Get single equipment
app.get("/make-server-fc558f72/equipment/:id", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const equipmentId = c.req.param('id');
    const equipment = await kv.get(`equipment:${equipmentId}`);

    if (!equipment) {
      return c.json({ error: 'Equipment not found' }, 404);
    }

    // Check company access
    const binding = await checkCompanyAccess(user.id, equipment.companyId);
    if (!binding) {
      return c.json({ error: 'No access to this equipment' }, 403);
    }

    return c.json({ success: true, equipment });
  } catch (error) {
    console.log('Get equipment error:', error);
    return c.json({ error: 'Failed to get equipment' }, 500);
  }
});

// Update equipment
app.put("/make-server-fc558f72/equipment/:id", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const equipmentId = c.req.param('id');
    const updates = await c.req.json();
    
    const equipment = await kv.get(`equipment:${equipmentId}`);
    if (!equipment) {
      return c.json({ error: 'Equipment not found' }, 404);
    }

    // Check access
    const binding = await checkCompanyAccess(user.id, equipment.companyId);
    if (!binding) {
      return c.json({ error: 'No access to this equipment' }, 403);
    }

    const userProfile = await kv.get(`user:${user.id}`);

    const updatedEquipment = {
      ...equipment,
      ...updates,
      // Preserve original recordedBy
      recordedBy: equipment.recordedBy,
      updatedAt: new Date().toISOString()
    };

    await kv.set(`equipment:${equipmentId}`, updatedEquipment);

    // Log activity
    await logActivity({
      entityType: 'equipment',
      entityId: equipmentId,
      action: 'equipment_updated',
      userId: user.id,
      userName: userProfile.name,
      userRole: binding.role,
      companyId: equipment.companyId,
      details: { updates }
    });

    return c.json({ success: true, equipment: updatedEquipment });
  } catch (error) {
    console.log('Update equipment error:', error);
    return c.json({ error: 'Failed to update equipment' }, 500);
  }
  });

  // Equipment history (audit trail)
  app.get("/make-server-fc558f72/equipment/:id/history", async (c) => {
    try {
      const { error, user } = await verifyUser(c.req.raw);
      if (error || !user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const equipmentId = c.req.param('id');
      const equipment = await kv.get(`equipment:${equipmentId}`);
      if (!equipment) {
        return c.json({ error: 'Equipment not found' }, 404);
      }

      const binding = await checkCompanyAccess(user.id, equipment.companyId);
      if (!binding || (binding.role !== 'facility_manager' && binding.role !== 'company_admin')) {
        return c.json({ error: 'Only facility managers can complete checklists' }, 403);
      }

      const supabaseAdmin = getSupabaseAdmin();
      const { data, error: dbError } = await supabaseAdmin
        .from('fms13_equipment_history')
        .select('*')
        .eq('equipment_id', equipmentId)
        .order('created_at', { ascending: false });

      if (dbError) {
        console.log('Equipment history error:', dbError.message);
      }

      return c.json({ success: true, history: data || [] });
    } catch (error) {
      console.log('Get equipment history error:', error);
      return c.json({ error: 'Failed to get equipment history' }, 500);
    }
  });

  // Maintenance schedules
  app.get("/make-server-fc558f72/maintenance-schedules", async (c) => {
    try {
      const { error, user } = await verifyUser(c.req.raw);
      if (error || !user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const equipmentId = c.req.query('equipmentId');
      if (!equipmentId) {
        return c.json({ error: 'Equipment ID required' }, 400);
      }

      const equipment = await kv.get(`equipment:${equipmentId}`);
      if (!equipment) {
        return c.json({ error: 'Equipment not found' }, 404);
      }

      const binding = await checkCompanyAccess(user.id, equipment.companyId);
      if (!binding) {
        return c.json({ error: 'No access to this equipment' }, 403);
      }

      const supabaseAdmin = getSupabaseAdmin();
      const { data, error: dbError } = await supabaseAdmin
        .from('fms13_maintenance_schedules')
        .select('*')
        .eq('equipment_id', equipmentId)
        .order('created_at', { ascending: false });

      if (dbError) {
        console.log('Maintenance schedules error:', dbError.message);
      }

      const now = Date.now();
      const schedules = data || [];
      for (const schedule of schedules) {
        if (schedule.next_due_at && new Date(schedule.next_due_at).getTime() <= now) {
          const lastNotified = await kv.get(`maintenance-notified:${schedule.id}`);
          const lastTime = lastNotified ? new Date(lastNotified).getTime() : 0;
          if (!lastTime || now - lastTime > 24 * 60 * 60 * 1000) {
            const bindings = await kv.getByPrefix('user-company:');
            const facilityManagers = bindings.filter((binding: any) => binding.companyId === equipment.companyId && binding.role === 'facility_manager');
            const supervisors = bindings.filter((binding: any) => binding.companyId === equipment.companyId && binding.role === 'facility_supervisor');
            const recipients = [...facilityManagers, ...supervisors];
            for (const manager of recipients) {
              const notificationId = generateId('NOT');
              await kv.set(`notification:${notificationId}`, {
                id: notificationId,
                userId: manager.userId,
                companyId: equipment.companyId,
                message: `Maintenance due for ${equipment.name}`,
                type: 'maintenance_due',
                equipmentId,
                read: false,
                timestamp: new Date().toISOString()
              });
            }
            await kv.set(`maintenance-notified:${schedule.id}`, new Date().toISOString());
          }
        }
      }

      return c.json({ success: true, schedules });
    } catch (error) {
      console.log('Get maintenance schedules error:', error);
      return c.json({ error: 'Failed to get maintenance schedules' }, 500);
    }
  });

  app.post("/make-server-fc558f72/maintenance-schedules", async (c) => {
    try {
      const { error, user } = await verifyUser(c.req.raw);
      if (error || !user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const {
        equipmentId,
        scheduleType,
        intervalMonths,
        intervalHours,
        nextDueAt,
        nextDueHours,
      } = await c.req.json();

      if (!equipmentId || !scheduleType) {
        return c.json({ error: 'Equipment ID and schedule type required' }, 400);
      }

      const equipment = await kv.get(`equipment:${equipmentId}`);
      if (!equipment) {
        return c.json({ error: 'Equipment not found' }, 404);
      }

      const binding = await checkCompanyAccess(user.id, equipment.companyId);
      if (!binding || (binding.role !== 'facility_manager' && binding.role !== 'company_admin')) {
        return c.json({ error: 'Only facility managers can schedule maintenance' }, 403);
      }

      const userProfile = await kv.get(`user:${user.id}`);
      const supabaseAdmin = getSupabaseAdmin();
      const { data, error: dbError } = await supabaseAdmin
        .from('fms13_maintenance_schedules')
        .insert({
          equipment_id: equipmentId,
          schedule_type: scheduleType,
          interval_months: intervalMonths || null,
          interval_hours: intervalHours || null,
          next_due_at: nextDueAt || null,
          next_due_hours: nextDueHours || null,
          created_by: user.id,
          created_by_name: userProfile?.name || '',
          created_by_role: binding.role,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('*')
        .maybeSingle();

      if (dbError) {
        console.log('Create maintenance schedule error:', dbError.message);
        return c.json({ error: 'Failed to create maintenance schedule' }, 500);
      }

      await logActivity({
        entityType: 'equipment',
        entityId: equipmentId,
        action: 'maintenance_scheduled',
        userId: user.id,
        userName: userProfile?.name || 'User',
        userRole: binding.role,
        companyId: equipment.companyId,
        details: { scheduleType, intervalMonths, intervalHours, nextDueAt, nextDueHours }
      });

      return c.json({ success: true, schedule: data });
    } catch (error) {
      console.log('Create maintenance schedule exception:', error);
      return c.json({ error: 'Failed to create maintenance schedule' }, 500);
    }
  });

  app.post("/make-server-fc558f72/maintenance-schedules/:id/complete", async (c) => {
    try {
      const { error, user } = await verifyUser(c.req.raw);
      if (error || !user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const scheduleId = c.req.param('id');
      const { notes, nextDueAt, nextDueHours, status } = await c.req.json();
      const resolvedStatus = ['completed', 'missed', 'delayed'].includes(status) ? status : 'completed';

      const supabaseAdmin = getSupabaseAdmin();
      const { data: schedule, error: scheduleError } = await supabaseAdmin
        .from('fms13_maintenance_schedules')
        .select('*')
        .eq('id', scheduleId)
        .maybeSingle();

      if (scheduleError || !schedule) {
        return c.json({ error: 'Schedule not found' }, 404);
      }

      const equipment = await kv.get(`equipment:${schedule.equipment_id}`);
      if (!equipment) {
        return c.json({ error: 'Equipment not found' }, 404);
      }

      const binding = await checkCompanyAccess(user.id, equipment.companyId);
      if (!binding || (binding.role !== 'facility_manager' && binding.role !== 'company_admin')) {
        return c.json({ error: 'Only facility managers can complete maintenance' }, 403);
      }

      const userProfile = await kv.get(`user:${user.id}`);
      const completedAt = new Date().toISOString();
      await supabaseAdmin.from('fms13_maintenance_events').insert({
        schedule_id: scheduleId,
        equipment_id: schedule.equipment_id,
        status: resolvedStatus,
        due_at: schedule.next_due_at || null,
        completed_at: completedAt,
        completed_by: user.id,
        completed_by_name: userProfile?.name || '',
        completed_by_role: binding.role,
        notes: notes || ''
      });

      let updatedNextDueAt = schedule.next_due_at;
      let updatedNextDueHours = schedule.next_due_hours;
      if (schedule.schedule_type === 'time' && schedule.interval_months) {
        const baseDate = schedule.next_due_at ? new Date(schedule.next_due_at) : new Date();
        updatedNextDueAt = addMonths(baseDate, schedule.interval_months).toISOString();
      }
      if (schedule.schedule_type === 'usage' && schedule.interval_hours) {
        updatedNextDueHours = nextDueHours ?? schedule.next_due_hours;
      }
      if (nextDueAt) {
        updatedNextDueAt = nextDueAt;
      }

      await supabaseAdmin
        .from('fms13_maintenance_schedules')
        .update({
          next_due_at: updatedNextDueAt || null,
          next_due_hours: updatedNextDueHours || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', scheduleId);

      await logActivity({
        entityType: 'equipment',
        entityId: schedule.equipment_id,
        action: `maintenance_${resolvedStatus}`,
        userId: user.id,
        userName: userProfile?.name || 'User',
        userRole: binding.role,
        companyId: equipment.companyId,
        details: { scheduleId, notes: notes || '', status: resolvedStatus }
      });

      return c.json({ success: true });
    } catch (error) {
      console.log('Complete maintenance error:', error);
      return c.json({ error: 'Failed to complete maintenance' }, 500);
    }
  });

  // Maintenance procedures
  app.get("/make-server-fc558f72/procedures", async (c) => {
    try {
      const { error, user } = await verifyUser(c.req.raw);
      if (error || !user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const category = c.req.query('category') || '';
      const companyId = c.req.query('companyId') || '';
      if (!companyId) {
        return c.json({ error: 'Company ID required' }, 400);
      }

      const binding = await checkCompanyAccess(user.id, companyId);
      if (!binding) {
        return c.json({ error: 'No access to this company' }, 403);
      }

      const supabaseAdmin = getSupabaseAdmin();
      const { data: procedures, error: procError } = await supabaseAdmin
        .from('fms13_procedures')
        .select('*')
        .eq('company_id', companyId)
        .ilike('equipment_category', category ? category : '%');

      if (procError) {
        return c.json({ error: 'Failed to load procedures' }, 500);
      }

      const procedureIds = (procedures || []).map((proc: any) => proc.id);
      const { data: versions } = await supabaseAdmin
        .from('fms13_procedure_versions')
        .select('*')
        .in('procedure_id', procedureIds.length ? procedureIds : ['']);
      const { data: checklistItems } = await supabaseAdmin
        .from('fms13_procedure_checklist_items')
        .select('*')
        .in('procedure_version_id', (versions || []).map((v: any) => v.id).length ? (versions || []).map((v: any) => v.id) : ['']);

      const latestVersions = new Map<string, any>();
      (versions || []).forEach((version: any) => {
        const existing = latestVersions.get(version.procedure_id);
        if (!existing || version.version > existing.version) {
          latestVersions.set(version.procedure_id, version);
        }
      });

      const checklistByVersion = new Map<string, any[]>();
      (checklistItems || []).forEach((item: any) => {
        const list = checklistByVersion.get(item.procedure_version_id) || [];
        list.push(item);
        checklistByVersion.set(item.procedure_version_id, list);
      });

      const enriched = (procedures || []).map((proc: any) => {
        const latest = latestVersions.get(proc.id);
        return {
          ...proc,
          latestVersion: latest || null,
          checklist: latest ? (checklistByVersion.get(latest.id) || []) : []
        };
      });

      return c.json({ success: true, procedures: enriched });
    } catch (error) {
      console.log('Get procedures error:', error);
      return c.json({ error: 'Failed to get procedures' }, 500);
    }
  });

  app.post("/make-server-fc558f72/procedures", async (c) => {
    try {
      const { error, user } = await verifyUser(c.req.raw);
      if (error || !user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const formData = await c.req.formData();
      const equipmentCategory = formData.get('equipmentCategory')?.toString() || '';
      const companyId = formData.get('companyId')?.toString() || '';
      const title = formData.get('title')?.toString() || '';
      const description = formData.get('description')?.toString() || '';
      const checklistRaw = formData.get('checklist')?.toString() || '[]';
      const checklist = JSON.parse(checklistRaw);
      const document = formData.get('document');

      if (!title || !companyId) {
        return c.json({ error: 'Title and company ID are required' }, 400);
      }

      const userProfile = await kv.get(`user:${user.id}`);
      const binding = await checkCompanyAccess(user.id, companyId);
      if (!binding || (binding.role !== 'facility_manager' && binding.role !== 'company_admin')) {
        return c.json({ error: 'Only facility managers can create procedures' }, 403);
      }
      const supabaseAdmin = getSupabaseAdmin();

      const { data: procedure, error: procError } = await supabaseAdmin
        .from('fms13_procedures')
        .insert({
          company_id: companyId,
          equipment_category: equipmentCategory,
          title,
          description,
          created_by: user.id,
          created_by_name: userProfile?.name || '',
          created_by_role: userProfile?.role || ''
        })
        .select('*')
        .maybeSingle();

      if (procError || !procedure) {
        return c.json({ error: 'Failed to create procedure' }, 500);
      }

      let documentPath = null;
      let documentUrl = null;
      if (document instanceof File) {
        await ensureAttachmentsBucket(supabaseAdmin);
        const safeName = sanitizeFileName(document.name);
        const path = `procedures/${procedure.id}/v1-${Date.now()}-${safeName}`;
        const bytes = new Uint8Array(await document.arrayBuffer());
        const { error: uploadError } = await supabaseAdmin
          .storage
          .from(ATTACHMENTS_BUCKET)
          .upload(path, bytes, { contentType: document.type, upsert: false });
        if (!uploadError) {
          const { data: publicData } = supabaseAdmin.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path);
          documentPath = path;
          documentUrl = publicData.publicUrl;
        }
      }

      const { data: version, error: versionError } = await supabaseAdmin
        .from('fms13_procedure_versions')
        .insert({
          procedure_id: procedure.id,
          version: 1,
          document_path: documentPath,
          document_url: documentUrl,
          created_by: user.id,
          created_by_name: userProfile?.name || '',
          created_by_role: userProfile?.role || ''
        })
        .select('*')
        .maybeSingle();

      if (versionError || !version) {
        return c.json({ error: 'Failed to create procedure version' }, 500);
      }

      if (Array.isArray(checklist) && checklist.length > 0) {
        const items = checklist.map((item: string, index: number) => ({
          procedure_version_id: version.id,
          item,
          position: index + 1
        }));
        await supabaseAdmin.from('fms13_procedure_checklist_items').insert(items);
      }

      await logActivity({
        entityType: 'company',
        entityId: companyId,
        action: 'procedure_created',
        userId: user.id,
        userName: userProfile?.name || 'User',
        userRole: binding.role,
        companyId,
        details: { procedureId: procedure.id, title, equipmentCategory }
      });

      return c.json({ success: true, procedure, version });
    } catch (error) {
      console.log('Create procedure error:', error);
      return c.json({ error: 'Failed to create procedure' }, 500);
    }
  });

  app.post("/make-server-fc558f72/procedures/:id/versions", async (c) => {
    try {
      const { error, user } = await verifyUser(c.req.raw);
      if (error || !user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const procedureId = c.req.param('id');
      const formData = await c.req.formData();
      const checklistRaw = formData.get('checklist')?.toString() || '[]';
      const checklist = JSON.parse(checklistRaw);
      const document = formData.get('document');

      const supabaseAdmin = getSupabaseAdmin();
      const { data: procedure } = await supabaseAdmin
        .from('fms13_procedures')
        .select('*')
        .eq('id', procedureId)
        .maybeSingle();
      if (!procedure) {
        return c.json({ error: 'Procedure not found' }, 404);
      }

      const binding = await checkCompanyAccess(user.id, procedure.company_id);
      if (!binding || (binding.role !== 'facility_manager' && binding.role !== 'company_admin')) {
        return c.json({ error: 'Only facility managers can update procedures' }, 403);
      }

      const { data: existingVersions } = await supabaseAdmin
        .from('fms13_procedure_versions')
        .select('version')
        .eq('procedure_id', procedureId)
        .order('version', { ascending: false })
        .limit(1);
      const nextVersion = existingVersions?.[0]?.version ? existingVersions[0].version + 1 : 1;

      let documentPath = null;
      let documentUrl = null;
      if (document instanceof File) {
        await ensureAttachmentsBucket(supabaseAdmin);
        const safeName = sanitizeFileName(document.name);
        const path = `procedures/${procedureId}/v${nextVersion}-${Date.now()}-${safeName}`;
        const bytes = new Uint8Array(await document.arrayBuffer());
        const { error: uploadError } = await supabaseAdmin
          .storage
          .from(ATTACHMENTS_BUCKET)
          .upload(path, bytes, { contentType: document.type, upsert: false });
        if (!uploadError) {
          const { data: publicData } = supabaseAdmin.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path);
          documentPath = path;
          documentUrl = publicData.publicUrl;
        }
      }

      const userProfile = await kv.get(`user:${user.id}`);
      const { data: version, error: versionError } = await supabaseAdmin
        .from('fms13_procedure_versions')
        .insert({
          procedure_id: procedureId,
          version: nextVersion,
          document_path: documentPath,
          document_url: documentUrl,
          created_by: user.id,
          created_by_name: userProfile?.name || '',
          created_by_role: userProfile?.role || ''
        })
        .select('*')
        .maybeSingle();

      if (versionError || !version) {
        return c.json({ error: 'Failed to create version' }, 500);
      }

      if (Array.isArray(checklist) && checklist.length > 0) {
        const items = checklist.map((item: string, index: number) => ({
          procedure_version_id: version.id,
          item,
          position: index + 1
        }));
        await supabaseAdmin.from('fms13_procedure_checklist_items').insert(items);
      }

      await logActivity({
        entityType: 'company',
        entityId: procedure.company_id,
        action: 'procedure_version_created',
        userId: user.id,
        userName: userProfile?.name || 'User',
        userRole: binding.role,
        companyId: procedure.company_id,
        details: { procedureId, version: version.version }
      });

      return c.json({ success: true, version });
    } catch (error) {
      console.log('Create procedure version error:', error);
      return c.json({ error: 'Failed to create version' }, 500);
    }
  });

  app.post("/make-server-fc558f72/procedures/:id/checklist/complete", async (c) => {
    try {
      const { error, user } = await verifyUser(c.req.raw);
      if (error || !user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const procedureId = c.req.param('id');
      const { equipmentId, responses } = await c.req.json();

      if (!equipmentId) {
        return c.json({ error: 'Equipment ID required' }, 400);
      }

      const equipment = await kv.get(`equipment:${equipmentId}`);
      if (!equipment) {
        return c.json({ error: 'Equipment not found' }, 404);
      }

      const binding = await checkCompanyAccess(user.id, equipment.companyId);
      if (!binding) {
        return c.json({ error: 'No access to this equipment' }, 403);
      }

      const supabaseAdmin = getSupabaseAdmin();
      const { data: procedure } = await supabaseAdmin
        .from('fms13_procedures')
        .select('*')
        .eq('id', procedureId)
        .maybeSingle();
      if (!procedure || procedure.company_id !== equipment.companyId) {
        return c.json({ error: 'Procedure not found for this company' }, 404);
      }
      const { data: latestVersion } = await supabaseAdmin
        .from('fms13_procedure_versions')
        .select('*')
        .eq('procedure_id', procedureId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestVersion) {
        return c.json({ error: 'Procedure version not found' }, 404);
      }

      const userProfile = await kv.get(`user:${user.id}`);
      await supabaseAdmin.from('fms13_checklist_completions').insert({
        equipment_id: equipmentId,
        procedure_version_id: latestVersion.id,
        completed_by: user.id,
        completed_by_name: userProfile?.name || '',
        completed_by_role: binding.role,
        completed_at: new Date().toISOString(),
        responses: responses || {}
      });

      await logActivity({
        entityType: 'equipment',
        entityId: equipmentId,
        action: 'maintenance_checklist_completed',
        userId: user.id,
        userName: userProfile?.name || 'User',
        userRole: binding.role,
        companyId: equipment.companyId,
        details: { procedureId }
      });

      return c.json({ success: true });
    } catch (error) {
      console.log('Complete checklist error:', error);
      return c.json({ error: 'Failed to complete checklist' }, 500);
    }
  });

  // Equipment replacement
  app.post("/make-server-fc558f72/equipment/:id/replace", async (c) => {
    try {
      const { error, user } = await verifyUser(c.req.raw);
      if (error || !user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const equipmentId = c.req.param('id');
      const { reason, newEquipment } = await c.req.json();

      const equipment = await kv.get(`equipment:${equipmentId}`);
      if (!equipment) {
        return c.json({ error: 'Equipment not found' }, 404);
      }

      const binding = await checkCompanyAccess(user.id, equipment.companyId);
      if (!binding || (binding.role !== 'facility_manager' && binding.role !== 'company_admin')) {
        return c.json({ error: 'Only facility managers can replace equipment' }, 403);
      }

      const userProfile = await kv.get(`user:${user.id}`);
      const facility = await kv.get(`facility:${equipment.facilityId}`);
      const replacementId = generateId('EQP');
      const createdAt = new Date().toISOString();
      const replacement = {
        id: replacementId,
        name: newEquipment?.name || `${equipment.name} (Replacement)`,
        category: newEquipment?.category || equipment.category,
        brand: newEquipment?.brand || equipment.brand || '',
        model: newEquipment?.model || equipment.model || '',
        serialNumber: newEquipment?.serialNumber || '',
        installDate: newEquipment?.installDate || '',
        warrantyPeriod: newEquipment?.warrantyPeriod || '',
        facilityId: newEquipment?.facilityId || equipment.facilityId,
        companyId: equipment.companyId,
        contractorId: newEquipment?.contractorId || equipment.contractorId || null,
        location: newEquipment?.location || equipment.location || '',
        status: 'active',
        healthStatus: 'green',
        createdAt,
        recordedBy: {
          userId: user.id,
          name: userProfile?.name || '',
          role: binding.role,
          branch: facility?.name || equipment.facilityId,
          contact: {
            phone: userProfile?.phone || '',
            email: userProfile?.email || '',
          }
        }
      };

      await kv.set(`equipment:${replacementId}`, replacement);
      await upsertEquipmentRecord(replacement);

      const updatedEquipment = {
        ...equipment,
        status: 'replaced',
        replacedAt: createdAt,
        replacementId
      };
      await kv.set(`equipment:${equipmentId}`, updatedEquipment);
      await upsertEquipmentRecord(updatedEquipment);

      await insertRecord('fms13_equipment_replacements', {
        company_id: equipment.companyId,
        old_equipment_id: equipmentId,
        new_equipment_id: replacementId,
        reason: reason || '',
        replaced_at: createdAt,
        replaced_by: user.id,
        replaced_by_name: userProfile?.name || '',
        replaced_by_role: binding.role
      });

      const allIssues = await kv.getByPrefix('issue:');
      const affectedIssues = allIssues.filter((issue: any) =>
        issue.equipmentId === equipmentId
        && issue.companyId === equipment.companyId
        && !['completed', 'approved', 'closed'].includes(issue.status)
      );
      for (const issue of affectedIssues) {
        const updatedIssue = {
          ...issue,
          equipmentId: replacementId,
          equipmentName: replacement.name,
          updatedAt: new Date().toISOString()
        };
        await kv.set(`issue:${issue.id}`, updatedIssue);
        await upsertIssueRecord(updatedIssue);
        await logActivity({
          entityType: 'issue',
          entityId: issue.id,
          action: 'issue_reassigned_equipment',
          userId: user.id,
          userName: userProfile?.name || '',
          userRole: binding.role,
          companyId: equipment.companyId,
          details: { oldEquipmentId: equipmentId, newEquipmentId: replacementId }
        });
      }

      await logActivity({
        entityType: 'equipment',
        entityId: equipmentId,
        action: 'equipment_replaced',
        userId: user.id,
        userName: userProfile?.name || '',
        userRole: binding.role,
        companyId: equipment.companyId,
        details: { replacementId, reason: reason || '' }
      });

      return c.json({ success: true, replacement });
    } catch (error) {
      console.log('Replace equipment error:', error);
      return c.json({ error: 'Failed to replace equipment' }, 500);
    }
  });

  // Consumables module
  app.get("/make-server-fc558f72/modules", async (c) => {
    try {
      const { error, user } = await verifyUser(c.req.raw);
      if (error || !user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const companyId = c.req.query('companyId');
      if (!companyId) {
        return c.json({ error: 'Company ID required' }, 400);
      }

      const binding = await checkCompanyAccess(user.id, companyId);
      if (!binding) {
        return c.json({ error: 'No access to this company' }, 403);
      }

      const supabaseAdmin = getSupabaseAdmin();
      const { data } = await supabaseAdmin
        .from('fms13_company_modules')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

      return c.json({ success: true, modules: data || { consumables_enabled: false } });
    } catch (error) {
      console.log('Get modules error:', error);
      return c.json({ error: 'Failed to get modules' }, 500);
    }
  });

  app.put("/make-server-fc558f72/modules", async (c) => {
    try {
      const { error, user } = await verifyUser(c.req.raw);
      if (error || !user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const { companyId, consumablesEnabled } = await c.req.json();
      if (!companyId) {
        return c.json({ error: 'Company ID required' }, 400);
      }

      const binding = await checkCompanyAccess(user.id, companyId);
      if (!binding || binding.role !== 'company_admin') {
        return c.json({ error: 'Company admin access required' }, 403);
      }

      await upsertRecord('fms13_company_modules', {
        company_id: companyId,
        consumables_enabled: !!consumablesEnabled,
        updated_at: new Date().toISOString()
      }, { onConflict: 'company_id' });

      const adminProfile = await kv.get(`user:${user.id}`);
      await logActivity({
        entityType: 'company',
        entityId: companyId,
        action: 'module_updated',
        userId: user.id,
        userName: adminProfile?.name || 'Admin',
        userRole: binding.role,
        companyId,
        details: { consumablesEnabled: !!consumablesEnabled }
      });

      return c.json({ success: true });
    } catch (error) {
      console.log('Update modules error:', error);
      return c.json({ error: 'Failed to update modules' }, 500);
    }
  });

  app.post("/make-server-fc558f72/consumables", async (c) => {
    try {
      const { error, user } = await verifyUser(c.req.raw);
      if (error || !user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const { companyId, name, unit } = await c.req.json();
      if (!companyId || !name) {
        return c.json({ error: 'Company ID and name required' }, 400);
      }

      const binding = await checkCompanyAccess(user.id, companyId);
      if (!binding || binding.role !== 'company_admin') {
        return c.json({ error: 'Company admin access required' }, 403);
      }

      const supabaseAdmin = getSupabaseAdmin();
      const { data: moduleConfig } = await supabaseAdmin
        .from('fms13_company_modules')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      if (!moduleConfig?.consumables_enabled) {
        return c.json({ error: 'Consumables module is disabled' }, 400);
      }

      const adminProfile = await kv.get(`user:${user.id}`);
      const { data, error: dbError } = await supabaseAdmin
        .from('fms13_consumables')
        .insert({
          company_id: companyId,
          name,
          unit: unit || null,
          created_by: user.id,
          created_by_name: adminProfile?.name || '',
          created_by_role: binding.role
        })
        .select('*')
        .maybeSingle();

      if (dbError) {
        return c.json({ error: 'Failed to create consumable' }, 500);
      }

      await logActivity({
        entityType: 'company',
        entityId: companyId,
        action: 'consumable_created',
        userId: user.id,
        userName: adminProfile?.name || 'Admin',
        userRole: binding.role,
        companyId,
        details: { consumableId: data?.id, name }
      });

      return c.json({ success: true, consumable: data });
    } catch (error) {
      console.log('Create consumable error:', error);
      return c.json({ error: 'Failed to create consumable' }, 500);
    }
  });

  app.get("/make-server-fc558f72/consumables", async (c) => {
    try {
      const { error, user } = await verifyUser(c.req.raw);
      if (error || !user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const companyId = c.req.query('companyId');
      if (!companyId) {
        return c.json({ error: 'Company ID required' }, 400);
      }

      const binding = await checkCompanyAccess(user.id, companyId);
      if (!binding) {
        return c.json({ error: 'No access to this company' }, 403);
      }

      const supabaseAdmin = getSupabaseAdmin();
      const { data: moduleConfig } = await supabaseAdmin
        .from('fms13_company_modules')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      if (!moduleConfig?.consumables_enabled) {
        return c.json({ success: true, consumables: [], enabled: false });
      }

      const { data, error: dbError } = await supabaseAdmin
        .from('fms13_consumables')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (dbError) {
        return c.json({ error: 'Failed to load consumables' }, 500);
      }

      return c.json({ success: true, consumables: data || [], enabled: true });
    } catch (error) {
      console.log('Get consumables error:', error);
      return c.json({ error: 'Failed to get consumables' }, 500);
    }
  });

  app.get("/make-server-fc558f72/consumables/events", async (c) => {
    try {
      const { error, user } = await verifyUser(c.req.raw);
      if (error || !user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const companyId = c.req.query('companyId');
      const consumableId = c.req.query('consumableId');
      const equipmentId = c.req.query('equipmentId');
      const startDate = c.req.query('startDate');
      const endDate = c.req.query('endDate');

      if (!companyId) {
        return c.json({ error: 'Company ID required' }, 400);
      }

      const binding = await checkCompanyAccess(user.id, companyId);
      if (!binding) {
        return c.json({ error: 'No access to this company' }, 403);
      }

      const supabaseAdmin = getSupabaseAdmin();
      let query = supabaseAdmin
        .from('fms13_consumable_events')
        .select('*')
        .eq('company_id', companyId);

      if (consumableId) {
        query = query.eq('consumable_id', consumableId);
      }
      if (equipmentId) {
        query = query.eq('equipment_id', equipmentId);
      }
      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      const { data, error: dbError } = await query.order('created_at', { ascending: false });
      if (dbError) {
        return c.json({ error: 'Failed to load consumable events' }, 500);
      }

      return c.json({ success: true, events: data || [] });
    } catch (error) {
      console.log('Get consumable events error:', error);
      return c.json({ error: 'Failed to get consumable events' }, 500);
    }
  });

  app.post("/make-server-fc558f72/consumables/events", async (c) => {
    try {
      const { error, user } = await verifyUser(c.req.raw);
      if (error || !user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const { consumableId, equipmentId, quantity, notes, companyId } = await c.req.json();
      if (!consumableId || !companyId) {
        return c.json({ error: 'Consumable ID and company ID required' }, 400);
      }

      const binding = await checkCompanyAccess(user.id, companyId);
      if (!binding) {
        return c.json({ error: 'No access to this company' }, 403);
      }

      const supabaseAdmin = getSupabaseAdmin();
      const { data: moduleConfig } = await supabaseAdmin
        .from('fms13_company_modules')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      if (!moduleConfig?.consumables_enabled) {
        return c.json({ error: 'Consumables module is disabled' }, 400);
      }

      const userProfile = await kv.get(`user:${user.id}`);
      await insertRecord('fms13_consumable_events', {
        company_id: companyId,
        consumable_id: consumableId,
        equipment_id: equipmentId || null,
        quantity: quantity || 0,
        notes: notes || '',
        actor_id: user.id,
        actor_name: userProfile?.name || '',
        actor_role: binding.role,
        created_at: new Date().toISOString()
      });

      await logActivity({
        entityType: equipmentId ? 'equipment' : 'company',
        entityId: equipmentId || companyId,
        action: 'consumable_logged',
        userId: user.id,
        userName: userProfile?.name || 'User',
        userRole: binding.role,
        companyId,
        details: { consumableId, quantity: quantity || 0 }
      });

      return c.json({ success: true });
    } catch (error) {
      console.log('Consumable event error:', error);
      return c.json({ error: 'Failed to log consumable event' }, 500);
    }
  });

  // ============================================
  // ISSUES ROUTES
  // ============================================

// Create issue (with AI suggestion)
app.post("/make-server-fc558f72/issues", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { equipmentId, title, description, priority, images, suggestedPriority, companyId, facilityId, slaDeadline } = await c.req.json();
    
    if (!description) {
      return c.json({ error: 'Description required' }, 400);
    }

    let equipment = null;
    let resolvedCompanyId = companyId;
    let resolvedFacilityId = facilityId;
    let equipmentName = title;
    let assignedTo = null;

      if (equipmentId) {
        equipment = await kv.get(`equipment:${equipmentId}`);
        if (!equipment) {
          return c.json({ error: 'Equipment not found' }, 404);
        }
        resolvedCompanyId = equipment.companyId;
        resolvedFacilityId = equipment.facilityId;
        equipmentName = equipment.name;
        assignedTo = equipment.contractorId || null;
        if (assignedTo) {
          const contractorStatus = await getContractorStatus(resolvedCompanyId, assignedTo);
          if (contractorStatus === 'suspended') {
            assignedTo = null;
          }
        }
      }

    if (!resolvedCompanyId || !resolvedFacilityId || !equipmentName) {
      return c.json({ error: 'Company, facility, and title are required for non-equipment tasks' }, 400);
    }

    // Check company access
    const binding = await checkCompanyAccess(user.id, resolvedCompanyId);
    if (!binding) {
      return c.json({ error: 'No access to this company' }, 403);
    }

    const userProfile = await kv.get(`user:${user.id}`);
    const facility = await kv.get(`facility:${resolvedFacilityId}`);

    const issueId = generateId('ISS');
    const finalPriority = priority || suggestedPriority || 'medium';
    
    const assignedAt = assignedTo ? new Date().toISOString() : null;
    const emailDecisionToken = assignedTo ? generateId('TOK') : null;
    const emailDecisionExpiresAt = assignedTo
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const parsedSlaDeadline = slaDeadline ? new Date(slaDeadline) : null;
    const resolvedSlaDeadline = parsedSlaDeadline && !Number.isNaN(parsedSlaDeadline.getTime())
      ? parsedSlaDeadline.toISOString()
      : new Date(Date.now() + (finalPriority === 'high' ? 4 : finalPriority === 'medium' ? 24 : 72) * 60 * 60 * 1000).toISOString();

    const issue = {
      id: issueId,
      taskType: equipmentId ? 'equipment' : 'general',
      title: equipmentId ? null : equipmentName,
      equipmentId: equipmentId || null,
      equipmentName,
      companyId: resolvedCompanyId,
      facilityId: resolvedFacilityId,
      description,
      priority: finalPriority,
      aiSuggestedPriority: suggestedPriority || null,
      status: 'created',
      // CRITICAL: Store reporter identity permanently
      reportedBy: {
        userId: user.id,
        name: userProfile.name,
        role: binding.role,
        branch: facility?.name || '',
        contact: {
          phone: userProfile.phone || '',
          email: userProfile.email || '',
        }
      },
      assignedTo,
      assignedAt,
      respondedAt: null,
      acceptedAt: null,
      rejectedAt: null,
      completedAt: null,
      approvedAt: null,
      closedAt: null,
      emailDecisionToken,
      emailDecisionExpiresAt,
      executionMetrics: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      images: images || [],
      slaDeadline: resolvedSlaDeadline
    };

    await kv.set(`issue:${issueId}`, issue);
    await upsertIssueRecord(issue);

      if (equipmentId && equipment) {
        // Update equipment health status based on priority
        const healthStatus = finalPriority === 'high' ? 'red' : finalPriority === 'medium' ? 'yellow' : 'green';
        await kv.set(`equipment:${equipmentId}`, {
          ...equipment,
          status: 'under_maintenance',
          healthStatus
        });
        await upsertEquipmentRecord({
          ...equipment,
          status: 'under_maintenance',
          healthStatus
        });
      }

    // Log activity
    await logActivity({
      entityType: 'issue',
      entityId: issueId,
      action: 'issue_created',
      userId: user.id,
      userName: userProfile.name,
      userRole: binding.role,
      companyId: resolvedCompanyId,
      details: { description, priority: finalPriority, equipmentName }
    });

    if (equipmentId) {
      await logActivity({
        entityType: 'equipment',
        entityId: equipmentId,
        action: 'issue_created',
        userId: user.id,
        userName: userProfile.name,
        userRole: binding.role,
        companyId: resolvedCompanyId,
        details: { issueId, equipmentName, priority: finalPriority }
      });
    }

    // Auto-assign if contractor exists
      if (assignedTo) {
        const updatedIssue = {
          ...issue,
          status: 'assigned',
          assignedAt: assignedAt || new Date().toISOString(),
          emailDecisionToken: emailDecisionToken || generateId('TOK'),
          emailDecisionExpiresAt: emailDecisionExpiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };
        await kv.set(`issue:${issueId}`, updatedIssue);
        await upsertIssueRecord(updatedIssue);
        await updateVendorMetrics({
          companyId: resolvedCompanyId,
          contractorId: assignedTo,
          incrementTotal: true
        });

      // Create notification for contractor
      const notificationId = generateId('NOT');
      await kv.set(`notification:${notificationId}`, {
        id: notificationId,
        userId: assignedTo,
        companyId: resolvedCompanyId,
        message: `New issue assigned: ${equipmentName} - ${description}`,
        type: 'new_issue',
        issueId,
        priority: finalPriority,
        read: false,
        timestamp: new Date().toISOString()
      });

      // Log assignment activity
      await logActivity({
        entityType: 'issue',
        entityId: issueId,
        action: 'issue_assigned',
        userId: 'system',
        userName: 'System',
        userRole: 'system',
        companyId: resolvedCompanyId,
        details: { contractorId: assignedTo }
      });
      if (equipmentId) {
        await logActivity({
          entityType: 'equipment',
          entityId: equipmentId,
          action: 'issue_assigned',
          userId: 'system',
          userName: 'System',
          userRole: 'system',
          companyId: resolvedCompanyId,
          details: { issueId, contractorId: assignedTo }
        });
      }

      const contractorEmail = await getUserEmail(assignedTo);
        if (contractorEmail) {
          const decisionLinks = buildDecisionLinks(issueId, updatedIssue.emailDecisionToken);
          await sendEmail({
            to: contractorEmail,
            subject: `New task assigned: ${equipmentName}`,
            html: `
              <p>You have been assigned a new task.</p>
              <ul>
                <li><strong>Task:</strong> ${equipmentName}</li>
                <li><strong>Priority:</strong> ${finalPriority}</li>
                <li><strong>Description:</strong> ${description}</li>
              </ul>
            <p>Respond now:</p>
            <p>
              <a href="${decisionLinks.acceptUrl}">Accept task</a> |
              <a href="${decisionLinks.rejectUrl}">Reject task</a>
            </p>
            <p>Or review details: <a href="${decisionLinks.actionUrl}">Open request</a></p>
            `
          });
        }
    }

    const adminEmails = await getCompanyAdminEmails(resolvedCompanyId);
    if (adminEmails.length > 0) {
      await sendEmail({
        to: adminEmails,
        subject: `New issue reported: ${equipmentName}`,
        html: `
          <p>A new issue has been reported.</p>
          <ul>
            <li><strong>Task:</strong> ${equipmentName}</li>
            <li><strong>Priority:</strong> ${finalPriority}</li>
            <li><strong>Description:</strong> ${description}</li>
            <li><strong>Reported by:</strong> ${userProfile.name}</li>
          </ul>
        `
      });
    }

    return c.json({ success: true, issue });
  } catch (error) {
    console.log('Create issue error:', error);
    return c.json({ error: 'Failed to create issue' }, 500);
  }
});

// Get all issues (company-scoped)
app.get("/make-server-fc558f72/issues", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const companyId = c.req.query('companyId');
    const status = c.req.query('status');
    const facilityId = c.req.query('facilityId');
    
    let allIssues = await kv.getByPrefix('issue:');

    // Get user's company bindings
    const userBindings = await kv.getByPrefix(`user-company:${user.id}:`);
    
    if (companyId) {
      const binding = userBindings.find((b: any) => b.companyId === companyId);
      if (!binding) {
        return c.json({ error: 'No access to this company' }, 403);
      }

      // Filter by company and role
      allIssues = allIssues.filter((issue: any) => issue.companyId === companyId);
      
      if (binding.role === 'contractor') {
        // Contractors only see issues assigned to them
        allIssues = allIssues.filter((issue: any) => issue.assignedTo === user.id);
      }
    } else {
      // Filter by all companies user has access to
      const userCompanyIds = userBindings.map((b: any) => b.companyId);
      allIssues = allIssues.filter((issue: any) => userCompanyIds.includes(issue.companyId));
      
      // If user is contractor in any company, filter assigned issues
      const contractorBindings = userBindings.filter((b: any) => b.role === 'contractor');
      if (contractorBindings.length > 0) {
        allIssues = allIssues.filter((issue: any) => issue.assignedTo === user.id);
      }
    }

    // Filter by status
    if (status) {
      allIssues = allIssues.filter((issue: any) => issue.status === status);
    }

    // Filter by facility
    if (facilityId) {
      allIssues = allIssues.filter((issue: any) => issue.facilityId === facilityId);
    }

    // Sort by creation date (newest first)
    allIssues.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return c.json({ success: true, issues: allIssues });
  } catch (error) {
    console.log('Get issues error:', error);
    return c.json({ error: 'Failed to get issues' }, 500);
  }
});

// Get single issue
app.get("/make-server-fc558f72/issues/:id", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const issueId = c.req.param('id');
    const issue = await kv.get(`issue:${issueId}`);

    if (!issue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    // Check company access
    const binding = await checkCompanyAccess(user.id, issue.companyId);
    if (!binding) {
      return c.json({ error: 'No access to this issue' }, 403);
    }

    return c.json({ success: true, issue });
  } catch (error) {
    console.log('Get issue error:', error);
    return c.json({ error: 'Failed to get issue' }, 500);
  }
});

// Update issue status (with role-based state transitions)
app.put("/make-server-fc558f72/issues/:id", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const issueId = c.req.param('id');
    const { status, feedback, rating, notes } = await c.req.json();
    
    const issue = await kv.get(`issue:${issueId}`);
    if (!issue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    // Check company access
    const binding = await checkCompanyAccess(user.id, issue.companyId);
    if (!binding) {
      return c.json({ error: 'No access to this issue' }, 403);
    }

    const userProfile = await kv.get(`user:${user.id}`);

    // Validate state transitions based on role
    if (status === 'completed' && binding.role !== 'contractor') {
      return c.json({ error: 'Only contractors can mark issues as completed' }, 403);
    }

    if (status === 'approved' && binding.role !== 'facility_manager' && binding.role !== 'company_admin') {
      return c.json({ error: 'Only facility managers can approve issues' }, 403);
    }

    if (status === 'closed' && (issue.status !== 'approved')) {
      return c.json({ error: 'Issues must be approved before closing' }, 400);
    }

    const now = new Date().toISOString();
    const updatedIssue = {
      ...issue,
      status: status || issue.status,
      feedback,
      rating,
      notes,
      updatedAt: now
    };
    if (status === 'approved') {
      updatedIssue.approvedAt = now;
      updatedIssue.approvedBy = {
        userId: user.id,
        name: userProfile.name,
        role: binding.role,
      };
    }
    if (status === 'closed') {
      updatedIssue.closedAt = now;
    }
    updatedIssue.executionMetrics = computeExecutionMetrics(updatedIssue);

    // If issue is approved or closed, update equipment status
    if (status === 'approved' || status === 'closed') {
      const equipment = await kv.get(`equipment:${issue.equipmentId}`);
      if (equipment) {
        await kv.set(`equipment:${issue.equipmentId}`, {
          ...equipment,
          status: 'active',
          healthStatus: 'green'
        });
      }
    }

    await kv.set(`issue:${issueId}`, updatedIssue);
    await upsertIssueRecord(updatedIssue);

    // Log activity
    await logActivity({
      entityType: 'issue',
      entityId: issueId,
      action: `issue_${status || 'updated'}`,
      userId: user.id,
      userName: userProfile.name,
      userRole: binding.role,
      companyId: issue.companyId,
      details: { status, feedback, rating, notes }
    });
    if (issue.equipmentId) {
      await logActivity({
        entityType: 'equipment',
        entityId: issue.equipmentId,
        action: `issue_${status || 'updated'}`,
        userId: user.id,
        userName: userProfile.name,
        userRole: binding.role,
        companyId: issue.companyId,
        details: { issueId, status, feedback, rating }
      });
    }

    // Create notification
    const targetUserId = status === 'completed' ? issue.reportedBy.userId : issue.assignedTo;
    if (targetUserId && targetUserId !== user.id) {
      const notificationId = generateId('NOT');
      await kv.set(`notification:${notificationId}`, {
        id: notificationId,
        userId: targetUserId,
        companyId: issue.companyId,
        message: `Issue ${issueId} status updated to: ${status}`,
        type: 'status_update',
        issueId,
        read: false,
        timestamp: new Date().toISOString()
      });
    }

    if (status && ['approved', 'closed'].includes(status) && issue.assignedTo) {
      const contractorEmail = await getUserEmail(issue.assignedTo);
      if (contractorEmail) {
        await sendEmail({
          to: contractorEmail,
          subject: `Issue ${status}: ${issue.equipmentName}`,
          html: `
            <p>The issue has been ${status}.</p>
            <ul>
              <li><strong>Task:</strong> ${issue.equipmentName}</li>
              <li><strong>Status:</strong> ${status}</li>
            </ul>
          `
        });
      }
    }

    return c.json({ success: true, issue: updatedIssue });
  } catch (error) {
    console.log('Update issue error:', error);
    return c.json({ error: 'Failed to update issue' }, 500);
  }
});

// Assign contractor to issue
app.post("/make-server-fc558f72/issues/:id/assign", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const issueId = c.req.param('id');
    const { contractorId } = await c.req.json();
    const resolvedContractorId = await resolveUserId(contractorId);
    if (!resolvedContractorId) {
      return c.json({ error: 'Contractor ID required' }, 400);
    }
    
    const issue = await kv.get(`issue:${issueId}`);
    if (!issue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    // Check company access
    const binding = await checkCompanyAccess(user.id, issue.companyId);
    if (!binding || (binding.role !== 'facility_manager' && binding.role !== 'company_admin')) {
      return c.json({ error: 'Only facility managers can assign contractors' }, 403);
    }

    const userProfile = await kv.get(`user:${user.id}`);

      if (['completed', 'approved', 'closed'].includes(issue.status)) {
        return c.json({ error: 'Cannot reassign a completed or closed issue' }, 400);
      }

      const contractorProfile = await kv.get(`user:${resolvedContractorId}`);
      if (!contractorProfile) {
        return c.json({ error: 'Contractor not found' }, 404);
      }

      const contractorStatus = await getContractorStatus(issue.companyId, resolvedContractorId);
      if (contractorStatus === 'suspended') {
        return c.json({ error: 'Contractor is suspended for this company' }, 403);
      }

      const previousAssignee = issue.assignedTo || null;
      const isReassign = previousAssignee && previousAssignee !== resolvedContractorId;
      const assignedAt = new Date().toISOString();
      const emailDecisionToken = generateId('TOK');
      const emailDecisionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const updatedIssue = {
      ...issue,
      assignedTo: resolvedContractorId,
      status: 'assigned',
      assignedAt,
      emailDecisionToken,
      emailDecisionExpiresAt,
      updatedAt: new Date().toISOString()
      };
      if (isReassign) {
        updatedIssue.contractorResponse = null;
        updatedIssue.completion = null;
        updatedIssue.respondedAt = null;
        updatedIssue.acceptedAt = null;
        updatedIssue.rejectedAt = null;
        updatedIssue.completedAt = null;
        updatedIssue.executionMetrics = null;
      }

      await kv.set(`issue:${issueId}`, updatedIssue);
      await upsertIssueRecord(updatedIssue);
      await updateVendorMetrics({
        companyId: issue.companyId,
        contractorId: resolvedContractorId,
        incrementTotal: true
      });

    // Log activity
    await logActivity({
      entityType: 'issue',
      entityId: issueId,
      action: isReassign ? 'contractor_reassigned' : 'contractor_assigned',
      userId: user.id,
      userName: userProfile.name,
      userRole: binding.role,
      companyId: issue.companyId,
      details: { contractorId: resolvedContractorId, previousAssignee }
    });
    if (issue.equipmentId) {
      await logActivity({
        entityType: 'equipment',
        entityId: issue.equipmentId,
        action: isReassign ? 'contractor_reassigned' : 'contractor_assigned',
        userId: user.id,
        userName: userProfile.name,
        userRole: binding.role,
        companyId: issue.companyId,
        details: { issueId, contractorId: resolvedContractorId, previousAssignee }
      });
    }

    // Notify contractor
    const notificationId = generateId('NOT');
    await kv.set(`notification:${notificationId}`, {
      id: notificationId,
      userId: resolvedContractorId,
      companyId: issue.companyId,
      message: `New issue assigned: ${issue.equipmentName} - ${issue.description}`,
      type: 'new_assignment',
      issueId,
      priority: issue.priority,
      read: false,
      timestamp: new Date().toISOString()
    });

    const contractorEmail = await getUserEmail(resolvedContractorId);
      if (contractorEmail) {
        const decisionLinks = buildDecisionLinks(issueId, emailDecisionToken);
        await sendEmail({
          to: contractorEmail,
          subject: `Task assigned: ${issue.equipmentName}`,
          html: `
            <p>You have been assigned a task.</p>
            <ul>
              <li><strong>Task:</strong> ${issue.equipmentName}</li>
              <li><strong>Priority:</strong> ${issue.priority}</li>
              <li><strong>Description:</strong> ${issue.description}</li>
            </ul>
          <p>Respond now:</p>
          <p>
            <a href="${decisionLinks.acceptUrl}">Accept task</a> |
            <a href="${decisionLinks.rejectUrl}">Reject task</a>
          </p>
          <p>Or review details: <a href="${decisionLinks.actionUrl}">Open request</a></p>
          `
        });
      }

    if (isReassign && previousAssignee) {
      const previousEmail = await getUserEmail(previousAssignee);
      if (previousEmail) {
        await sendEmail({
          to: previousEmail,
          subject: `Task reassigned: ${issue.equipmentName}`,
          html: `
            <p>This task has been reassigned to another contractor.</p>
            <ul>
              <li><strong>Task:</strong> ${issue.equipmentName}</li>
              <li><strong>Issue ID:</strong> ${issue.id}</li>
            </ul>
          `
        });
      }
    }

    return c.json({ success: true, issue: updatedIssue });
  } catch (error) {
    console.log('Assign contractor error:', error);
    return c.json({ error: 'Failed to assign contractor' }, 500);
  }
});

// ============================================
// USER MANAGEMENT ROUTES
// ============================================

// Create facility manager (company admin only)
app.post("/make-server-fc558f72/users/facility-manager", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { email, password, name, phone, companyId, facilityIds } = await c.req.json();
    
    if (!email || !password || !name || !companyId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Check company admin access
    const binding = await checkCompanyAccess(user.id, companyId);
    if (!binding || binding.role !== 'company_admin') {
      return c.json({ error: 'Only company admins can create facility managers' }, 403);
    }

    const { user: createdUser, error: createError } = await createAuthUser({
      email,
      password,
      metadata: { name, role: 'facility_manager' }
    });

    if (createError || !createdUser) {
      console.log('Create facility manager error:', createError);
      return c.json({ error: createError || 'Signup failed' }, 400);
    }

    const shortId = await reserveShortId(createdUser.id);
    const managerProfile = {
      id: createdUser.id,
      email,
      name,
      role: 'facility_manager',
      phone: phone || '',
      createdAt: new Date().toISOString(),
      createdBy: user.id,
      isGlobalUser: true,
      shortId
    };

    await kv.set(`user:${createdUser.id}`, managerProfile);
    await upsertUserProfile(managerProfile);

    const managerBinding = {
      userId: createdUser.id,
      companyId,
      role: 'facility_manager',
      facilityIds: facilityIds || [],
      assignedAt: new Date().toISOString(),
      assignedBy: user.id
    };

    await kv.set(`user-company:${createdUser.id}:${companyId}`, managerBinding);
    await upsertCompanyUser(managerBinding);

    const userProfile = await kv.get(`user:${user.id}`);

    // Log activity
    await logActivity({
      entityType: 'user',
      entityId: createdUser.id,
      action: 'facility_manager_created',
      userId: user.id,
      userName: userProfile.name,
      userRole: 'company_admin',
      companyId,
      details: { email, name, facilityIds }
    });

    return c.json({ 
      success: true, 
      user: { id: createdUser.id, email, name, phone: phone || '', shortId } 
    });
  } catch (error) {
    console.log('Create facility manager exception:', error);
    return c.json({ error: 'Failed to create facility manager' }, 500);
  }
});

// Create facility supervisor (company admin only)
app.post("/make-server-fc558f72/users/facility-supervisor", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { email, password, name, phone, companyId } = await c.req.json();

    if (!email || !password || !name || !companyId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const binding = await checkCompanyAccess(user.id, companyId);
    if (!binding || binding.role !== 'company_admin') {
      return c.json({ error: 'Only company admins can create facility supervisors' }, 403);
    }

    const { user: createdUser, error: createError } = await createAuthUser({
      email,
      password,
      metadata: { name, role: 'facility_supervisor' }
    });

    if (createError || !createdUser) {
      console.log('Create facility supervisor error:', createError);
      return c.json({ error: createError || 'Signup failed' }, 400);
    }

    const userId = createdUser.id;
    const shortId = await reserveShortId(userId);
    const userProfile = {
      id: userId,
      email,
      name,
      role: 'facility_supervisor',
      phone: phone || '',
      createdAt: new Date().toISOString(),
      createdBy: user.id,
      isGlobalUser: true,
      shortId
    };

    await kv.set(`user:${userId}`, userProfile);
    await upsertUserProfile(userProfile);

    const supervisorBinding = {
      userId,
      companyId,
      role: 'facility_supervisor',
      assignedAt: new Date().toISOString(),
      assignedBy: user.id,
      facilityIds: [],
    };

    await kv.set(`user-company:${userId}:${companyId}`, supervisorBinding);
    await upsertCompanyUser(supervisorBinding);

    const adminProfile = await kv.get(`user:${user.id}`);
    await logActivity({
      entityType: 'user',
      entityId: userId,
      action: 'facility_supervisor_created',
      userId: user.id,
      userName: adminProfile?.name || 'Admin',
      userRole: 'company_admin',
      companyId,
      details: { email }
    });

    return c.json({ success: true, supervisor: userProfile });
  } catch (error) {
    console.log('Create facility supervisor exception:', error);
    return c.json({ error: 'Failed to create facility supervisor' }, 500);
  }
});

// Assign contractor to company (company admin) - Now creates invitation
app.post("/make-server-fc558f72/users/assign-contractor", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { contractorId, companyId, facilityIds, categories } = await c.req.json();
    const resolvedContractorId = await resolveUserId(contractorId);
    
    if (!resolvedContractorId || !companyId) {
      return c.json({ error: 'Contractor ID and company ID required' }, 400);
    }

    // Check company admin access
    const binding = await checkCompanyAccess(user.id, companyId);
    if (!binding || binding.role !== 'company_admin') {
      return c.json({ error: 'Only company admins can assign contractors' }, 403);
    }

    // Check if contractor user exists
    const contractorProfile = await kv.get(`user:${resolvedContractorId}`);
    if (!contractorProfile) {
      return c.json({ error: 'Contractor not found. Please ensure they have registered.' }, 404);
    }

    // Create invitation instead of direct assignment
    const company = await kv.get(`company:${companyId}`);
    const userProfile = await kv.get(`user:${user.id}`);

    const invitationId = generateId('INV');
    const emailDecisionToken = generateId('TOK');
    const invitation = {
      id: invitationId,
        contractorId: resolvedContractorId,
      companyId,
      companyName: company.name,
      facilityIds: facilityIds || [],
      categories: categories || [],
      invitedBy: user.id,
      invitedByName: userProfile.name,
      status: 'pending',
      emailDecisionToken,
      createdAt: new Date().toISOString()
    };

    await kv.set(`contractor-invitation:${invitationId}`, invitation);

    // Create notification for contractor
    const notificationId = generateId('NOT');
    await kv.set(`notification:${notificationId}`, {
      id: notificationId,
      userId: resolvedContractorId,
      companyId,
      message: `${company.name} has invited you to join as a contractor`,
      type: 'contractor_invitation',
      invitationId,
      read: false,
      timestamp: new Date().toISOString()
    });

    // Log activity
    await logActivity({
      entityType: 'user',
      entityId: resolvedContractorId,
      action: 'contractor_invited',
      userId: user.id,
      userName: userProfile.name,
      userRole: 'company_admin',
      companyId,
      details: { invitationId, contractorName: contractorProfile.name }
    });

    const contractorEmail = await getUserEmail(resolvedContractorId);
    if (contractorEmail) {
      const actionUrl = `${ACTION_BASE_URL}/contractor-invitations/${invitationId}/respond-email?token=${encodeURIComponent(emailDecisionToken)}`;
      const invitationEmail = buildInvitationEmail({
        companyName: company.name,
        invitedByName: userProfile.name,
        categories,
        facilityIds,
        actionUrl
      });
      await sendEmail({
        to: contractorEmail,
        subject: invitationEmail.subject,
        html: invitationEmail.html
      });
    }

    return c.json({ success: true, message: 'Invitation sent to contractor', invitation });
  } catch (error) {
    console.log('Assign contractor error:', error);
    return c.json({ error: 'Failed to assign contractor' }, 500);
  }
});

// Get contractors for a company
app.get("/make-server-fc558f72/contractors", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const companyId = c.req.query('companyId');

    if (companyId) {
      // Check access
      const binding = await checkCompanyAccess(user.id, companyId);
      if (!binding) {
        return c.json({ error: 'No access to this company' }, 403);
      }

      // Get all contractor bindings for this company
      const allBindings = await kv.getByPrefix('user-company:');
      const companyContractorBindings = allBindings.filter((b: any) => 
        b.companyId === companyId && b.role === 'contractor'
      );

      // Get contractor profiles
      const contractors = await Promise.all(
        companyContractorBindings.map(async (binding: any) => {
          const profile = await kv.get(`user:${binding.userId}`);
          const safeProfile = profile ? await ensureShortId(profile) : null;
          return {
            ...(safeProfile || { id: binding.userId }),
            binding: {
              facilityIds: binding.facilityIds,
              categories: binding.categories,
              status: binding.status || 'active',
              suspendedAt: binding.suspendedAt || null
            }
          };
        })
      );

      const contractorIds = contractors.map((contractor) => contractor.id).filter(Boolean);
      let metricsById = new Map<string, any>();
      if (contractorIds.length > 0) {
        const supabaseAdmin = getSupabaseAdmin();
        const { data: metrics } = await supabaseAdmin
          .from('fms13_vendor_metrics')
          .select('*')
          .eq('company_id', companyId)
          .in('contractor_id', contractorIds);
        metricsById = new Map((metrics || []).map((metric: any) => [metric.contractor_id, metric]));
      }

      const enriched = contractors.map((contractor) => ({
        ...contractor,
        performance: metricsById.get(contractor.id) || null
      }));

      return c.json({ success: true, contractors: enriched });
    } else {
      // Get all contractors (global)
      const allUsers = await kv.getByPrefix('user:');
      const allBindings = await kv.getByPrefix('user-company:');
      
      const contractorUserIds = allBindings
        .filter((b: any) => b.role === 'contractor')
        .map((b: any) => b.userId);
      
      const contractors = await Promise.all(
        allUsers
          .filter((u: any) => contractorUserIds.includes(u.id))
          .map(async (u: any) => await ensureShortId(u))
      );

      return c.json({ success: true, contractors });
    }
  } catch (error) {
    console.log('Get contractors error:', error);
    return c.json({ error: 'Failed to get contractors' }, 500);
  }
});

// Suspend contractor (company admin)
app.post("/make-server-fc558f72/contractors/:contractorId/suspend", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const contractorId = c.req.param('contractorId');
    const resolvedContractorId = await resolveUserId(contractorId);
    const { companyId, reason } = await c.req.json();
    if (!companyId) {
      return c.json({ error: 'Company ID required' }, 400);
    }
    if (!resolvedContractorId) {
      return c.json({ error: 'Contractor ID required' }, 400);
    }

    const adminBinding = await checkCompanyAccess(user.id, companyId);
    if (!adminBinding || adminBinding.role !== 'company_admin') {
      return c.json({ error: 'Company admin access required' }, 403);
    }

    const contractorBinding = await kv.get(`user-company:${resolvedContractorId}:${companyId}`);
    if (!contractorBinding || contractorBinding.role !== 'contractor') {
      return c.json({ error: 'Contractor not found for this company' }, 404);
    }

    const suspendedAt = new Date().toISOString();
    const updatedBinding = {
      ...contractorBinding,
      status: 'suspended',
      suspendedAt,
      suspendedBy: user.id,
      suspensionReason: reason || ''
    };

    await kv.set(`user-company:${resolvedContractorId}:${companyId}`, updatedBinding);
    await upsertCompanyContractor({
      companyId,
      contractorId: resolvedContractorId,
      status: 'suspended',
      suspendedAt,
      suspendedBy: user.id,
      suspensionReason: reason || ''
    });

    const adminProfile = await kv.get(`user:${user.id}`);
    await logActivity({
      entityType: 'user',
      entityId: resolvedContractorId,
      action: 'contractor_suspended',
      userId: user.id,
      userName: adminProfile?.name || 'Admin',
      userRole: adminBinding.role,
      companyId,
      details: { reason: reason || '' }
    });

    const notificationId = generateId('NOT');
    await kv.set(`notification:${notificationId}`, {
      id: notificationId,
      userId: resolvedContractorId,
      companyId,
      message: 'Your contractor access has been suspended by the company admin.',
      type: 'contractor_suspended',
      read: false,
      timestamp: suspendedAt
    });

    return c.json({ success: true, status: 'suspended' });
  } catch (error) {
    console.log('Suspend contractor error:', error);
    return c.json({ error: 'Failed to suspend contractor' }, 500);
  }
});

// Resume contractor (company admin)
app.post("/make-server-fc558f72/contractors/:contractorId/resume", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const contractorId = c.req.param('contractorId');
    const resolvedContractorId = await resolveUserId(contractorId);
    const { companyId } = await c.req.json();
    if (!companyId) {
      return c.json({ error: 'Company ID required' }, 400);
    }
    if (!resolvedContractorId) {
      return c.json({ error: 'Contractor ID required' }, 400);
    }

    const adminBinding = await checkCompanyAccess(user.id, companyId);
    if (!adminBinding || adminBinding.role !== 'company_admin') {
      return c.json({ error: 'Company admin access required' }, 403);
    }

    const contractorBinding = await kv.get(`user-company:${resolvedContractorId}:${companyId}`);
    if (!contractorBinding || contractorBinding.role !== 'contractor') {
      return c.json({ error: 'Contractor not found for this company' }, 404);
    }

    const resumedAt = new Date().toISOString();
    const updatedBinding = {
      ...contractorBinding,
      status: 'active',
      resumedAt,
      suspendedAt: null,
      suspendedBy: null,
      suspensionReason: ''
    };

    await kv.set(`user-company:${resolvedContractorId}:${companyId}`, updatedBinding);
    await upsertCompanyContractor({
      companyId,
      contractorId: resolvedContractorId,
      status: 'active',
      resumedAt,
      suspendedAt: null,
      suspendedBy: null,
      suspensionReason: null
    });

    const adminProfile = await kv.get(`user:${user.id}`);
    await logActivity({
      entityType: 'user',
      entityId: resolvedContractorId,
      action: 'contractor_resumed',
      userId: user.id,
      userName: adminProfile?.name || 'Admin',
      userRole: adminBinding.role,
      companyId,
      details: {}
    });

    const notificationId = generateId('NOT');
    await kv.set(`notification:${notificationId}`, {
      id: notificationId,
      userId: resolvedContractorId,
      companyId,
      message: 'Your contractor access has been restored.',
      type: 'contractor_resumed',
      read: false,
      timestamp: resumedAt
    });

    return c.json({ success: true, status: 'active' });
  } catch (error) {
    console.log('Resume contractor error:', error);
    return c.json({ error: 'Failed to resume contractor' }, 500);
  }
});

// Remove contractor from company (company admin)
app.delete("/make-server-fc558f72/contractors/:contractorId", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const contractorId = c.req.param('contractorId');
    const resolvedContractorId = await resolveUserId(contractorId);
    const companyId = c.req.query('companyId');

    if (!companyId) {
      return c.json({ error: 'Company ID required' }, 400);
    }
    if (!resolvedContractorId) {
      return c.json({ error: 'Contractor ID required' }, 400);
    }

    const binding = await checkCompanyAccess(user.id, companyId);
    if (!binding || binding.role !== 'company_admin') {
      return c.json({ error: 'Company admin access required' }, 403);
    }

    const contractorBinding = await kv.get(`user-company:${resolvedContractorId}:${companyId}`);
    if (!contractorBinding || contractorBinding.role !== 'contractor') {
      return c.json({ error: 'Contractor not found for this company' }, 404);
    }

    await kv.del(`user-company:${resolvedContractorId}:${companyId}`);

    const allIssues = await kv.getByPrefix('issue:');
    const assignedIssues = allIssues.filter((issue: any) => 
      issue.companyId === companyId && issue.assignedTo === resolvedContractorId
    );

    for (const issue of assignedIssues) {
      await kv.set(`issue:${issue.id}`, {
        ...issue,
        assignedTo: null,
        status: issue.status === 'in_progress' ? 'created' : issue.status,
        updatedAt: new Date().toISOString()
      });
    }

    const allEquipment = await kv.getByPrefix('equipment:');
    const assignedEquipment = allEquipment.filter((eq: any) => 
      eq.companyId === companyId && eq.contractorId === resolvedContractorId
    );

    for (const eq of assignedEquipment) {
      await kv.set(`equipment:${eq.id}`, {
        ...eq,
        contractorId: null,
        updatedAt: new Date().toISOString()
      });
    }

    const adminProfile = await kv.get(`user:${user.id}`);
    await logActivity({
      entityType: 'user',
      entityId: resolvedContractorId,
      action: 'contractor_removed',
      userId: user.id,
      userName: adminProfile?.name || 'Admin',
      userRole: 'company_admin',
      companyId,
      details: { contractorId: resolvedContractorId, reassignedIssues: assignedIssues.length, unassignedEquipment: assignedEquipment.length }
    });

    return c.json({ success: true });
  } catch (error) {
    console.log('Remove contractor error:', error);
    return c.json({ error: 'Failed to remove contractor' }, 500);
  }
});

// Get all users for a company (company admin)
app.get("/make-server-fc558f72/users", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const companyId = c.req.query('companyId');

    if (!companyId) {
      return c.json({ error: 'Company ID required' }, 400);
    }

    // Check company access (admin or supervisor)
    const binding = await checkCompanyAccess(user.id, companyId);
    if (!binding || (binding.role !== 'company_admin' && binding.role !== 'facility_supervisor')) {
      return c.json({ error: 'Company admin access required' }, 403);
    }

    // Get all bindings for this company
    const allBindings = await kv.getByPrefix('user-company:');
    const companyBindings = allBindings.filter((b: any) => b.companyId === companyId);

    // Get user profiles
    const users = await Promise.all(
      companyBindings.map(async (binding: any) => {
        const profile = await kv.get(`user:${binding.userId}`);
        const safeProfile = profile ? await ensureShortId(profile) : null;
        return {
          ...(safeProfile || { id: binding.userId }),
          role: binding.role,
          facilityIds: binding.facilityIds,
          categories: binding.categories
        };
      })
    );

    return c.json({ success: true, users });
  } catch (error) {
    console.log('Get users error:', error);
    return c.json({ error: 'Failed to get users' }, 500);
  }
});

// Update user profile (company admin updates facility manager)
app.put("/make-server-fc558f72/users/:id", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userId = c.req.param('id');
    const resolvedUserId = await resolveUserId(userId);
    const { companyId, name, phone, facilityIds, password } = await c.req.json();

    if (!companyId) {
      return c.json({ error: 'Company ID required' }, 400);
    }

    const adminBinding = await checkCompanyAccess(user.id, companyId);
    if (!adminBinding || adminBinding.role !== 'company_admin') {
      return c.json({ error: 'Company admin access required' }, 403);
    }

    if (!resolvedUserId) {
      return c.json({ error: 'User ID required' }, 400);
    }

    const targetBinding = await kv.get(`user-company:${resolvedUserId}:${companyId}`);
    if (!targetBinding || targetBinding.role !== 'facility_manager') {
      return c.json({ error: 'Facility manager not found for this company' }, 404);
    }

    const targetProfile = await kv.get(`user:${resolvedUserId}`);
    if (!targetProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

      const updatedProfile = {
        ...targetProfile,
        name: name || targetProfile.name,
        phone: phone || targetProfile.phone,
        updatedAt: new Date().toISOString()
      };

      await kv.set(`user:${resolvedUserId}`, updatedProfile);
      await upsertUserProfile(updatedProfile);

      if (Array.isArray(facilityIds)) {
        await kv.set(`user-company:${resolvedUserId}:${companyId}`, {
          ...targetBinding,
          facilityIds
        });
        await upsertCompanyUser({
          ...targetBinding,
          companyId,
          userId: resolvedUserId,
          facilityIds,
          assignedAt: targetBinding.assignedAt,
        });
      }

    if (password) {
      const supabaseAdmin = getSupabaseAdmin();
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(resolvedUserId, { password });
      if (updateError) {
        return c.json({ error: updateError.message }, 400);
      }
    }

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin.auth.admin.updateUserById(resolvedUserId, {
      user_metadata: { name: updatedProfile.name }
    });

    const adminProfile = await kv.get(`user:${user.id}`);
    await logActivity({
      entityType: 'user',
      entityId: resolvedUserId,
      action: 'facility_manager_updated',
      userId: user.id,
      userName: adminProfile?.name || 'Admin',
      userRole: 'company_admin',
      companyId,
      details: { name, phone, facilityIds }
    });

    return c.json({ success: true, user: updatedProfile });
  } catch (error) {
    console.log('Update user error:', error);
    return c.json({ error: 'Failed to update user' }, 500);
  }
});

// ============================================
// ACTIVITY LOG ROUTES
// ============================================

// Get activity log for an entity
app.get("/make-server-fc558f72/activity/:entityType/:entityId", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const entityType = c.req.param('entityType');
    const entityId = c.req.param('entityId');
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error: dbError } = await supabaseAdmin
      .from('fms13_audit_logs')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });

    if (!dbError && data && data.length > 0) {
      const activities = data.map((row: any) => ({
        id: row.id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        action: row.action_type,
        userId: row.actor_id,
        userName: row.actor_name,
        userRole: row.actor_role,
        details: row.details,
        companyId: row.company_id,
        timestamp: row.created_at
      }));
      return c.json({ success: true, activities });
    }

    const activities = await kv.getByPrefix(`activity:${entityType}:${entityId}:`);
    activities.sort((a: any, b: any) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return c.json({ success: true, activities });
  } catch (error) {
    console.log('Get activity log error:', error);
    return c.json({ error: 'Failed to get activity log' }, 500);
  }
});

// ============================================
// NOTIFICATIONS ROUTES
// ============================================

// Get user notifications (company-scoped)
app.get("/make-server-fc558f72/notifications", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const companyId = c.req.query('companyId');

    const allNotifications = await kv.getByPrefix('notification:');
    let userNotifications = allNotifications.filter((n: any) => n.userId === user.id);

    if (companyId) {
      userNotifications = userNotifications.filter((n: any) => n.companyId === companyId);
    }

    userNotifications.sort((a: any, b: any) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return c.json({ success: true, notifications: userNotifications });
  } catch (error) {
    console.log('Get notifications error:', error);
    return c.json({ error: 'Failed to get notifications' }, 500);
  }
});

// Mark notification as read
app.put("/make-server-fc558f72/notifications/:id/read", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const notificationId = c.req.param('id');
    const notification = await kv.get(`notification:${notificationId}`);

    if (!notification) {
      return c.json({ error: 'Notification not found' }, 404);
    }

    if (notification.userId !== user.id) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    await kv.set(`notification:${notificationId}`, {
      ...notification,
      read: true
    });

    return c.json({ success: true });
  } catch (error) {
    console.log('Mark notification read error:', error);
    return c.json({ error: 'Failed to mark notification as read' }, 500);
  }
});

// ============================================
// DASHBOARD STATS ROUTES
// ============================================

// Get dashboard statistics (company-aware)
app.get("/make-server-fc558f72/dashboard/stats", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const companyId = c.req.query('companyId');
    
    if (!companyId) {
      return c.json({ error: 'Company ID required' }, 400);
    }

    // Check access
    const binding = await checkCompanyAccess(user.id, companyId);
    if (!binding) {
      return c.json({ error: 'No access to this company' }, 403);
    }

    const facilities = await kv.getByPrefix('facility:');
    const allEquipment = await kv.getByPrefix('equipment:');
    const allIssues = await kv.getByPrefix('issue:');

    // Filter by company
    const companyFacilities = facilities.filter((f: any) => f.companyId === companyId);
    const companyEquipment = allEquipment.filter((e: any) => e.companyId === companyId);
    const companyIssues = allIssues.filter((i: any) => i.companyId === companyId);

    let stats: any = {};

    if (binding.role === 'company_admin') {
      stats = {
        totalFacilities: companyFacilities.length,
        totalEquipment: companyEquipment.length,
        totalIssues: companyIssues.length,
        openIssues: companyIssues.filter((i: any) => 
          !['approved', 'closed'].includes(i.status)
        ).length,
        criticalIssues: companyIssues.filter((i: any) => 
          i.priority === 'high' && !['approved', 'closed'].includes(i.status)
        ).length,
        healthyEquipment: companyEquipment.filter((e: any) => e.healthStatus === 'green').length,
        concerningEquipment: companyEquipment.filter((e: any) => e.healthStatus === 'yellow').length,
        criticalEquipment: companyEquipment.filter((e: any) => e.healthStatus === 'red').length,
      };
    } else if (binding.role === 'facility_manager') {
      const managerFacilityIds = binding.facilityIds || [];
      const effectiveFacilityIds = managerFacilityIds.length
        ? managerFacilityIds
        : companyFacilities.map((facility: any) => facility.id);
      const facilityEquipment = companyEquipment.filter((e: any) => 
        effectiveFacilityIds.includes(e.facilityId)
      );
      const facilityIssues = companyIssues.filter((i: any) => 
        effectiveFacilityIds.includes(i.facilityId)
      );

      stats = {
        totalFacilities: effectiveFacilityIds.length,
        totalEquipment: facilityEquipment.length,
        totalIssues: facilityIssues.length,
        openIssues: facilityIssues.filter((i: any) => 
          !['approved', 'closed'].includes(i.status)
        ).length,
        criticalIssues: facilityIssues.filter((i: any) => 
          i.priority === 'high' && !['approved', 'closed'].includes(i.status)
        ).length,
        healthyEquipment: facilityEquipment.filter((e: any) => e.healthStatus === 'green').length,
        concerningEquipment: facilityEquipment.filter((e: any) => e.healthStatus === 'yellow').length,
        criticalEquipment: facilityEquipment.filter((e: any) => e.healthStatus === 'red').length,
      };
    } else if (binding.role === 'contractor') {
      const assignedIssues = companyIssues.filter((i: any) => i.assignedTo === user.id);

      stats = {
        totalAssigned: assignedIssues.length,
        pending: assignedIssues.filter((i: any) => ['created', 'assigned'].includes(i.status)).length,
        inProgress: assignedIssues.filter((i: any) => i.status === 'in_progress').length,
        awaitingParts: assignedIssues.filter((i: any) => i.status === 'awaiting_parts').length,
        completed: assignedIssues.filter((i: any) => 
          ['completed', 'approved', 'closed'].includes(i.status)
        ).length,
        avgRating: assignedIssues
          .filter((i: any) => i.rating)
          .reduce((acc: number, i: any, _, arr: any[]) => acc + i.rating / arr.length, 0) || 0
      };
    }

    return c.json({ success: true, stats });
  } catch (error) {
    console.log('Get dashboard stats error:', error);
    return c.json({ error: 'Failed to get dashboard stats' }, 500);
  }
});

// Check SLA violations and send escalation alerts
app.get("/make-server-fc558f72/sla/check", async (c) => {
  try {
    const allIssues = await kv.getByPrefix('issue:');
    const now = new Date();
    
    const violations = allIssues.filter((issue: any) => {
      return !['completed', 'approved', 'closed'].includes(issue.status) && 
             issue.slaDeadline && 
             new Date(issue.slaDeadline) < now;
    });

    // Create escalation notifications
    for (const issue of violations) {
      // Notify contractor
      if (issue.assignedTo) {
        const notificationId = generateId('NOT');
        await kv.set(`notification:${notificationId}`, {
          id: notificationId,
          userId: issue.assignedTo,
          companyId: issue.companyId,
          message: `SLA VIOLATION: Issue ${issue.id} has exceeded its deadline`,
          type: 'sla_violation',
          issueId: issue.id,
          priority: 'high',
          read: false,
          timestamp: new Date().toISOString()
        });
      }

      // Notify reporter (facility manager)
      if (issue.reportedBy?.userId) {
        const notificationId = generateId('NOT');
        await kv.set(`notification:${notificationId}`, {
          id: notificationId,
          userId: issue.reportedBy.userId,
          companyId: issue.companyId,
          message: `SLA ALERT: Issue ${issue.id} has not been resolved on time`,
          type: 'sla_alert',
          issueId: issue.id,
          priority: 'high',
          read: false,
          timestamp: new Date().toISOString()
        });
      }

      // Notify company admins
      const companyBindings = await kv.getByPrefix(`user-company:`);
      const adminBindings = companyBindings.filter((b: any) => 
        b.companyId === issue.companyId && b.role === 'company_admin'
      );

      for (const binding of adminBindings) {
        const notificationId = generateId('NOT');
        await kv.set(`notification:${notificationId}`, {
          id: notificationId,
          userId: binding.userId,
          companyId: issue.companyId,
          message: `ESCALATION: Issue ${issue.id} requires immediate attention (SLA violated)`,
          type: 'escalation',
          issueId: issue.id,
          priority: 'critical',
          read: false,
          timestamp: new Date().toISOString()
        });
      }

      // Update issue status to escalated
      await kv.set(`issue:${issue.id}`, {
        ...issue,
        status: 'escalated',
        escalatedAt: new Date().toISOString()
      });
    }

    return c.json({ success: true, violations: violations.length });
  } catch (error) {
    console.log('SLA check error:', error);
    return c.json({ error: 'Failed to check SLA' }, 500);
  }
});

// ============================================
// CONTRACTOR INVITATION & APPROVAL ROUTES
// ============================================

// Create contractor invitation (company admin sends invitation by contractor ID)
app.post("/make-server-fc558f72/contractor-invitations", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { contractorId, companyId, facilityIds, categories } = await c.req.json();
    const resolvedContractorId = await resolveUserId(contractorId);
    
    if (!resolvedContractorId || !companyId) {
      return c.json({ error: 'Contractor ID and company ID required' }, 400);
    }

    // Check company admin access
    const binding = await checkCompanyAccess(user.id, companyId);
    if (!binding || binding.role !== 'company_admin') {
      return c.json({ error: 'Only company admins can invite contractors' }, 403);
    }

    // Check if contractor user exists
    const contractorProfile = await kv.get(`user:${resolvedContractorId}`);
    if (!contractorProfile) {
      return c.json({ error: 'Contractor not found' }, 404);
    }

    // Check if already invited or assigned
    const existingBinding = await kv.get(`user-company:${resolvedContractorId}:${companyId}`);
    if (existingBinding) {
      return c.json({ error: 'Contractor already assigned to this company' }, 400);
    }

    const allInvitations = await kv.getByPrefix('contractor-invitation:');
    const existingInvitation = allInvitations.find((inv: any) => 
      inv.contractorId === resolvedContractorId && 
      inv.companyId === companyId && 
      inv.status === 'pending'
    );
    
    if (existingInvitation) {
      return c.json({ error: 'Invitation already sent and pending' }, 400);
    }

    const company = await kv.get(`company:${companyId}`);
    const userProfile = await kv.get(`user:${user.id}`);

    const invitationId = generateId('INV');
    const emailDecisionToken = generateId('TOK');
    const invitation = {
      id: invitationId,
      contractorId: resolvedContractorId,
      companyId,
      companyName: company.name,
      facilityIds: facilityIds || [],
      categories: categories || [],
      invitedBy: user.id,
      invitedByName: userProfile.name,
      status: 'pending',
      emailDecisionToken,
      createdAt: new Date().toISOString()
    };

    await kv.set(`contractor-invitation:${invitationId}`, invitation);

    // Create notification for contractor
    const notificationId = generateId('NOT');
    await kv.set(`notification:${notificationId}`, {
      id: notificationId,
      userId: resolvedContractorId,
      companyId,
      message: `${company.name} has invited you to join as a contractor`,
      type: 'contractor_invitation',
      invitationId,
      read: false,
      timestamp: new Date().toISOString()
    });

    // Log activity
    await logActivity({
      entityType: 'user',
      entityId: resolvedContractorId,
      action: 'contractor_invited',
      userId: user.id,
      userName: userProfile.name,
      userRole: 'company_admin',
      companyId,
      details: { invitationId, contractorName: contractorProfile.name }
    });

    const contractorEmail = await getUserEmail(resolvedContractorId);
    if (contractorEmail) {
      const actionUrl = `${ACTION_BASE_URL}/contractor-invitations/${invitationId}/respond-email?token=${encodeURIComponent(emailDecisionToken)}`;
      const invitationEmail = buildInvitationEmail({
        companyName: company.name,
        invitedByName: userProfile.name,
        categories,
        facilityIds,
        actionUrl
      });
      await sendEmail({
        to: contractorEmail,
        subject: invitationEmail.subject,
        html: invitationEmail.html
      });
    }

    return c.json({ success: true, invitation });
  } catch (error) {
    console.log('Create contractor invitation error:', error);
    return c.json({ error: 'Failed to create invitation' }, 500);
  }
});

// Get contractor invitations (pending approvals)
app.get("/make-server-fc558f72/contractor-invitations", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const companyId = c.req.query('companyId');

    // Get all invitations
    let allInvitations = await kv.getByPrefix('contractor-invitation:');

    if (companyId) {
      // Company admin viewing their sent invitations
      const binding = await checkCompanyAccess(user.id, companyId);
      if (!binding || binding.role !== 'company_admin') {
        return c.json({ error: 'Only company admins can view invitations' }, 403);
      }
      allInvitations = allInvitations.filter((inv: any) => inv.companyId === companyId);
    } else {
      // Contractor viewing their received invitations
      allInvitations = allInvitations.filter((inv: any) => inv.contractorId === user.id);
    }

    allInvitations.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return c.json({ success: true, invitations: allInvitations });
  } catch (error) {
    console.log('Get contractor invitations error:', error);
    return c.json({ error: 'Failed to get invitations' }, 500);
  }
});

// Email-based contractor invitation response (secure action page)
app.get("/make-server-fc558f72/contractor-invitations/:id/respond-email", async (c) => {
  try {
    const invitationId = c.req.param('id');
    const token = c.req.query('token');

    if (!token) {
      return c.html('<p>Missing response token.</p>', 400);
    }

    const invitation = await kv.get(`contractor-invitation:${invitationId}`);
    if (!invitation) {
      return c.html('<p>Invitation not found.</p>', 404);
    }

    if (invitation.emailDecisionToken !== token) {
      return c.html('<p>This response link is invalid.</p>', 403);
    }

    if (invitation.status !== 'pending') {
      return c.html('<p>This invitation has already been responded to.</p>', 200);
    }

    const actionUrl = `${ACTION_BASE_URL}/contractor-invitations/${invitationId}/respond-email?token=${encodeURIComponent(token)}`;
    const facilityLine = invitation.facilityIds?.length
      ? `<p><strong>Facilities:</strong> ${invitation.facilityIds.join(', ')}</p>`
      : '';
    const categoryLine = invitation.categories?.length
      ? `<p><strong>Scope:</strong> ${invitation.categories.join(', ')}</p>`
      : '';

    return c.html(`
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Respond to invitation</title>
        </head>
        <body style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px;">
          <div style="max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
            <h2 style="margin-top: 0;">Contractor invitation</h2>
            <p style="color: #475569;">${invitation.companyName || 'Company'} invitation</p>
            <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
              <p><strong>Company:</strong> ${invitation.companyName || '-'}</p>
              <p><strong>Invited by:</strong> ${invitation.invitedByName || 'Company admin'}</p>
              ${facilityLine}
              ${categoryLine}
            </div>
            <div style="display: grid; gap: 16px;">
              <form method="POST" action="${actionUrl}" style="border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px;">
                <h3 style="margin-top: 0;">Accept invitation</h3>
                <input type="hidden" name="decision" value="approved" />
                <button type="submit" style="margin-top: 12px; background: #0f766e; color: #fff; border: none; padding: 10px 16px; border-radius: 6px;">Accept</button>
              </form>
              <form method="POST" action="${actionUrl}" style="border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px;">
                <h3 style="margin-top: 0;">Reject invitation</h3>
                <input type="hidden" name="decision" value="rejected" />
                <label style="display: block; font-size: 14px; margin-bottom: 6px;">Reason (optional)</label>
                <textarea name="reason" rows="3" style="width: 100%; padding: 8px; border: 1px solid #cbd5f5; border-radius: 6px;"></textarea>
                <button type="submit" style="margin-top: 12px; background: #b91c1c; color: #fff; border: none; padding: 10px 16px; border-radius: 6px;">Reject</button>
              </form>
            </div>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.log('Email invitation response page error:', error);
    return c.html('<p>Failed to load response page.</p>', 500);
  }
});

app.post("/make-server-fc558f72/contractor-invitations/:id/respond-email", async (c) => {
  try {
    const invitationId = c.req.param('id');
    const token = c.req.query('token');
    if (!token) {
      return c.html('<p>Missing response token.</p>', 400);
    }

    const formData = await c.req.formData();
    const decision = formData.get('decision')?.toString();
    const reason = formData.get('reason')?.toString() || '';

    if (!decision || !['approved', 'rejected'].includes(decision)) {
      return c.html('<p>Invalid decision.</p>', 400);
    }

    const invitation = await kv.get(`contractor-invitation:${invitationId}`);
    if (!invitation) {
      return c.html('<p>Invitation not found.</p>', 404);
    }

    if (invitation.emailDecisionToken !== token) {
      return c.html('<p>This response link is invalid.</p>', 403);
    }

    if (invitation.status !== 'pending') {
      return c.html('<p>This invitation has already been responded to.</p>', 200);
    }

    await kv.set(`contractor-invitation:${invitationId}`, {
      ...invitation,
      status: decision,
      respondedAt: new Date().toISOString(),
      responseReason: reason || '',
      emailDecisionToken: null
    });

    const contractorProfile = await kv.get(`user:${invitation.contractorId}`);
    const actorName = contractorProfile?.name || 'Contractor';

    if (decision === 'approved') {
      await kv.set(`user-company:${invitation.contractorId}:${invitation.companyId}`, {
        userId: invitation.contractorId,
        companyId: invitation.companyId,
        role: 'contractor',
        facilityIds: invitation.facilityIds || [],
        categories: invitation.categories || [],
        status: 'active',
        assignedAt: new Date().toISOString(),
      });
      await upsertCompanyUser({
        userId: invitation.contractorId,
        companyId: invitation.companyId,
        role: 'contractor',
        facilityIds: invitation.facilityIds || [],
        assignedAt: new Date().toISOString(),
      });
      await upsertCompanyContractor({
        companyId: invitation.companyId,
        contractorId: invitation.contractorId,
        status: 'active'
      });

      await logActivity({
        entityType: 'user',
        entityId: invitation.contractorId,
        action: 'contractor_approved_invitation',
        userId: invitation.contractorId,
        userName: actorName,
        userRole: 'contractor',
        companyId: invitation.companyId,
        details: { invitationId }
      });

      const notificationId = generateId('NOT');
      await kv.set(`notification:${notificationId}`, {
        id: notificationId,
        userId: invitation.invitedBy,
        companyId: invitation.companyId,
        message: `Contractor ${actorName} accepted your invitation`,
        type: 'contractor_approved',
        read: false,
        timestamp: new Date().toISOString()
      });
    } else {
      await logActivity({
        entityType: 'user',
        entityId: invitation.contractorId,
        action: 'contractor_rejected_invitation',
        userId: invitation.contractorId,
        userName: actorName,
        userRole: 'contractor',
        companyId: invitation.companyId,
        details: { invitationId, reason }
      });

      const notificationId = generateId('NOT');
      await kv.set(`notification:${notificationId}`, {
        id: notificationId,
        userId: invitation.invitedBy,
        companyId: invitation.companyId,
        message: `Contractor ${actorName} declined your invitation`,
        type: 'contractor_rejected',
        read: false,
        timestamp: new Date().toISOString()
      });
    }

    return c.html(`<p>Invitation ${decision === 'approved' ? 'accepted' : 'rejected'} successfully.</p>`);
  } catch (error) {
    console.log('Email invitation response error:', error);
    return c.html('<p>Failed to respond to invitation.</p>', 500);
  }
});

// Approve/Reject contractor invitation
app.post("/make-server-fc558f72/contractor-invitations/:id/respond", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const invitationId = c.req.param('id');
    const { status, reason } = await c.req.json(); // 'approved' or 'rejected'

    const invitation = await kv.get(`contractor-invitation:${invitationId}`);
    
    if (!invitation) {
      return c.json({ error: 'Invitation not found' }, 404);
    }

    if (invitation.contractorId !== user.id) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    if (invitation.status !== 'pending') {
      return c.json({ error: 'Invitation already responded to' }, 400);
    }

    // Update invitation status
    await kv.set(`contractor-invitation:${invitationId}`, {
      ...invitation,
      status,
      respondedAt: new Date().toISOString(),
      responseReason: reason || '',
      emailDecisionToken: null
    });

    const userProfile = await kv.get(`user:${user.id}`);

    if (status === 'approved') {
      // Create user-company binding
      await kv.set(`user-company:${user.id}:${invitation.companyId}`, {
        userId: user.id,
        companyId: invitation.companyId,
        role: 'contractor',
        facilityIds: invitation.facilityIds || [],
        categories: invitation.categories || [],
        status: 'active',
        assignedAt: new Date().toISOString(),
      });
      await upsertCompanyUser({
        userId: user.id,
        companyId: invitation.companyId,
        role: 'contractor',
        facilityIds: invitation.facilityIds || [],
        assignedAt: new Date().toISOString(),
      });
      await upsertCompanyContractor({
        companyId: invitation.companyId,
        contractorId: user.id,
        status: 'active'
      });

      // Log activity
      await logActivity({
        entityType: 'user',
        entityId: user.id,
        action: 'contractor_approved_invitation',
        userId: user.id,
        userName: userProfile?.name || 'Contractor',
        userRole: 'contractor',
        companyId: invitation.companyId,
        details: { invitationId }
      });

      // Notify admin
      const notificationId = generateId('NOT');
      await kv.set(`notification:${notificationId}`, {
        id: notificationId,
        userId: invitation.invitedBy,
        companyId: invitation.companyId,
        message: `Contractor ${userProfile?.name} accepted your invitation`,
        type: 'contractor_approved',
        read: false,
        timestamp: new Date().toISOString()
      });
    } else {
      await logActivity({
        entityType: 'user',
        entityId: user.id,
        action: 'contractor_rejected_invitation',
        userId: user.id,
        userName: userProfile?.name || 'Contractor',
        userRole: 'contractor',
        companyId: invitation.companyId,
        details: { invitationId, reason: reason || '' }
      });
      // Notify admin of rejection
      const notificationId = generateId('NOT');
      await kv.set(`notification:${notificationId}`, {
        id: notificationId,
        userId: invitation.invitedBy,
        companyId: invitation.companyId,
        message: `Contractor ${userProfile?.name} declined your invitation`,
        type: 'contractor_rejected',
        read: false,
        timestamp: new Date().toISOString()
      });
    }

    return c.json({ success: true });
  } catch (error) {
    console.log('Respond to invitation error:', error);
    return c.json({ error: 'Failed to respond to invitation' }, 500);
  }
});

// ============================================
// PROFILE ROUTES
// ============================================

// Update profile (self)
app.put("/make-server-fc558f72/profile", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { name, phone, skills, specialization, avatarUrl, avatarPath } = await c.req.json();

    const userProfile = await ensureUserProfile(user);
    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    const nextSkills = skills ?? userProfile.skills ?? [];
    const nextSpecialization = specialization ?? userProfile.specialization ?? '';
    const isContractor = (userProfile.role || '') === 'contractor';

    const updatedProfile = {
      ...userProfile,
      name: name || userProfile.name,
      phone: phone || userProfile.phone,
      skills: nextSkills,
      specialization: nextSpecialization,
      avatarUrl: avatarUrl || userProfile.avatarUrl || '',
      avatarPath: avatarPath || userProfile.avatarPath || '',
      profileComplete: isContractor ? !!(nextSkills.length && nextSpecialization) : userProfile.profileComplete,
      updatedAt: new Date().toISOString()
    };

    await kv.set(`user:${user.id}`, updatedProfile);
    await upsertUserProfile(updatedProfile);
    await upsertUserProfile(updatedProfile);

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: { name: updatedProfile.name }
    });

    // Log activity
    await logActivity({
      entityType: 'user',
      entityId: user.id,
      action: 'profile_updated',
      userId: user.id,
      userName: updatedProfile.name,
      userRole: userProfile.role || 'user',
      details: { skills: nextSkills, specialization: nextSpecialization, timestamp: new Date().toISOString() }
    });

    return c.json({ success: true, profile: updatedProfile });
  } catch (error) {
    console.log('Update profile error:', error);
    return c.json({ error: 'Failed to update profile' }, 500);
  }
});

// Upload profile avatar
app.post("/make-server-fc558f72/profile/avatar", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return c.json({ error: 'Avatar file is required' }, 400);
    }

    const supabaseAdmin = getSupabaseAdmin();
    await ensureAttachmentsBucket(supabaseAdmin);

    const safeName = sanitizeFileName(file.name);
    const path = `profiles/${user.id}/${Date.now()}-${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin
      .storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: true });

    if (uploadError) {
      console.log('Avatar upload error:', uploadError.message);
      return c.json({ error: 'Failed to upload avatar' }, 500);
    }

    const { data: publicData } = supabaseAdmin.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path);
    const userProfile = await kv.get(`user:${user.id}`);

    const updatedProfile = {
      ...userProfile,
      avatarUrl: publicData.publicUrl,
      avatarPath: path,
      updatedAt: new Date().toISOString()
    };

    await kv.set(`user:${user.id}`, updatedProfile);

    return c.json({ success: true, profile: updatedProfile });
  } catch (error) {
    console.log('Upload avatar error:', error);
    return c.json({ error: 'Failed to upload avatar' }, 500);
  }
});

// Update password (self)
app.post("/make-server-fc558f72/profile/password", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { newPassword } = await c.req.json();
    if (!newPassword || newPassword.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400);
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword
    });

    if (updateError) {
      return c.json({ error: updateError.message }, 400);
    }

    return c.json({ success: true });
  } catch (error) {
    console.log('Update password error:', error);
    return c.json({ error: 'Failed to update password' }, 500);
  }
});

// Get user profile by ID (for viewing contact details)
app.get("/make-server-fc558f72/profile/:userId", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userId = c.req.param('userId');
    const resolvedUserId = await resolveUserId(userId);
    if (!resolvedUserId) {
      return c.json({ error: 'User ID required' }, 400);
    }
    const profile = await kv.get(`user:${resolvedUserId}`);

    if (!profile) {
      return c.json({ error: 'Profile not found' }, 404);
    }

    const safeProfile = await ensureShortId(profile);
    return c.json({ success: true, profile: safeProfile });
  } catch (error) {
    console.log('Get profile error:', error);
    return c.json({ error: 'Failed to get profile' }, 500);
  }
});

// ============================================
// JOB ACCEPTANCE & COMPLETION ROUTES
// ============================================

// Accept or reject job assignment
app.post("/make-server-fc558f72/issues/:id/respond", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const issueId = c.req.param('id');
    const { decision, reason, proposedCost, proposal, proposalAttachments } = await c.req.json();

    if (!decision || !['accepted', 'rejected'].includes(decision)) {
      return c.json({ error: 'Valid decision required (accepted or rejected)' }, 400);
    }

    const issue = await kv.get(`issue:${issueId}`);
    if (!issue) {
      return c.json({ error: 'Job not found' }, 404);
    }

    // Check if contractor is assigned to this job
    if (issue.assignedTo !== user.id) {
      return c.json({ error: 'You are not assigned to this job' }, 403);
    }

    const contractorStatus = await getContractorStatus(issue.companyId, user.id);
    if (contractorStatus === 'suspended') {
      return c.json({ error: 'Your account is suspended for this company' }, 403);
    }

    const userProfile = await kv.get(`user:${user.id}`);

    // Create job response record
    const responseId = generateId('RESP');
    const respondedAt = new Date().toISOString();
    const jobResponse = {
      id: responseId,
      issueId,
      contractorId: user.id,
      contractorName: userProfile.name,
      decision,
      reason: reason || '',
      proposedCost: proposedCost || 0,
      proposal: proposal || '',
      proposalAttachments: proposalAttachments || [],
      respondedAt
    };

    await kv.set(`job-response:${responseId}`, jobResponse);

    // Update issue status based on decision
    const updatedIssue = {
      ...issue,
      contractorResponse: jobResponse,
      status: decision === 'accepted' ? 'in_progress' : 'rejected',
      respondedAt,
      acceptedAt: decision === 'accepted' ? respondedAt : issue.acceptedAt || null,
      rejectedAt: decision === 'rejected' ? respondedAt : issue.rejectedAt || null,
      emailDecisionToken: null,
      emailDecisionExpiresAt: null,
      updatedAt: new Date().toISOString()
    };
    updatedIssue.executionMetrics = computeExecutionMetrics(updatedIssue);

    await kv.set(`issue:${issueId}`, updatedIssue);
    await upsertIssueRecord(updatedIssue);
    if (updatedIssue.executionMetrics?.responseMinutes !== null && updatedIssue.executionMetrics?.responseMinutes !== undefined) {
      await updateVendorMetrics({
        companyId: updatedIssue.companyId,
        contractorId: updatedIssue.assignedTo,
        responseMinutes: updatedIssue.executionMetrics.responseMinutes
      });
    }

    // Log activity
    await logActivity({
      entityType: 'issue',
      entityId: issueId,
      action: `job_${decision}`,
      userId: user.id,
      userName: userProfile.name,
      userRole: 'contractor',
      companyId: issue.companyId,
      details: { decision, reason, proposedCost, timestamp: new Date().toISOString() }
    });
    if (issue.equipmentId) {
      await logActivity({
        entityType: 'equipment',
        entityId: issue.equipmentId,
        action: `job_${decision}`,
        userId: user.id,
        userName: userProfile.name,
        userRole: 'contractor',
        companyId: issue.companyId,
        details: { issueId, decision, proposedCost }
      });
    }

    // Notify reporter
    if (issue.reportedBy?.userId) {
      const notificationId = generateId('NOT');
      await kv.set(`notification:${notificationId}`, {
        id: notificationId,
        userId: issue.reportedBy.userId,
        companyId: issue.companyId,
        message: `Contractor ${userProfile.name} ${decision} job ${issueId}`,
        type: `job_${decision}`,
        issueId,
        read: false,
        timestamp: new Date().toISOString()
      });

      const reporterEmail = await getUserEmail(issue.reportedBy.userId);
      if (reporterEmail) {
        await sendEmail({
          to: reporterEmail,
          subject: `Job ${decision}: ${issue.equipmentName}`,
          html: `
            <p>Contractor ${userProfile.name} has ${decision} the job.</p>
            <ul>
              <li><strong>Task:</strong> ${issue.equipmentName}</li>
              <li><strong>Decision:</strong> ${decision}</li>
              <li><strong>Proposed cost:</strong> ${proposedCost || 0}</li>
              ${reason ? `<li><strong>Reason:</strong> ${reason}</li>` : ''}
            </ul>
          `
        });
      }
    }

    return c.json({ success: true, response: jobResponse });
  } catch (error) {
    console.log('Job response error:', error);
    return c.json({ error: 'Failed to respond to job' }, 500);
  }
});

// Email-based job response (secure action page)
app.get("/make-server-fc558f72/issues/:id/respond-email", async (c) => {
  try {
    const issueId = c.req.param('id');
    const token = c.req.query('token');
    const presetDecision = c.req.query('decision');

    if (!token) {
      return c.html('<p>Missing response token.</p>', 400);
    }

    const issue = await kv.get(`issue:${issueId}`);
    if (!issue) {
      return c.html('<p>Issue not found.</p>', 404);
    }

    if (issue.emailDecisionToken !== token) {
      return c.html('<p>This response link is invalid.</p>', 403);
    }

    if (issue.emailDecisionExpiresAt && new Date(issue.emailDecisionExpiresAt) < new Date()) {
      return c.html('<p>This response link has expired.</p>', 410);
    }

    if (issue.contractorResponse || issue.respondedAt) {
      return c.html('<p>This job has already been responded to.</p>', 200);
    }

    const company = issue.companyId ? await kv.get(`company:${issue.companyId}`) : null;
    const jobLabel = issue.taskType === 'general' || !issue.equipmentId ? 'Task' : 'Equipment';
    const actionUrl = `${ACTION_BASE_URL}/issues/${issueId}/respond-email?token=${encodeURIComponent(token)}`;

    return c.html(`
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Respond to job</title>
        </head>
        <body style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px;">
          <div style="max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
            <h2 style="margin-top: 0;">Job response</h2>
            <p style="color: #475569;">${company?.name ? `${company.name} • ` : ''}${jobLabel} request</p>
            <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
              <p><strong>${jobLabel}:</strong> ${issue.equipmentName || issue.title || issue.id}</p>
              <p><strong>Priority:</strong> ${issue.priority || '-'}</p>
              <p><strong>Description:</strong> ${issue.description || '-'}</p>
            </div>
            <div style="display: grid; gap: 16px;">
              <form method="POST" action="${actionUrl}" enctype="multipart/form-data" style="border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px;">
                <h3 style="margin-top: 0;">Accept job</h3>
                <input type="hidden" name="decision" value="accepted" />
                <label style="display: block; font-size: 14px; margin-bottom: 6px;">Proposed cost</label>
                <input name="proposedCost" type="number" step="0.01" style="width: 100%; padding: 8px; border: 1px solid #cbd5f5; border-radius: 6px;" />
                <label style="display: block; font-size: 14px; margin: 12px 0 6px;">Proposal / work plan</label>
                <textarea name="proposal" rows="4" style="width: 100%; padding: 8px; border: 1px solid #cbd5f5; border-radius: 6px;"></textarea>
                <label style="display: block; font-size: 14px; margin: 12px 0 6px;">Attach quote (optional)</label>
                <input name="proposalFile" type="file" multiple />
                <button type="submit" style="margin-top: 12px; background: #0f766e; color: #fff; border: none; padding: 10px 16px; border-radius: 6px;">Accept</button>
              </form>
              <form method="POST" action="${actionUrl}" enctype="multipart/form-data" style="border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px;">
                <h3 style="margin-top: 0;">Reject job</h3>
                <input type="hidden" name="decision" value="rejected" />
                <label style="display: block; font-size: 14px; margin-bottom: 6px;">Reason for rejection</label>
                <textarea name="reason" rows="3" style="width: 100%; padding: 8px; border: 1px solid #cbd5f5; border-radius: 6px;" required></textarea>
                <button type="submit" style="margin-top: 12px; background: #b91c1c; color: #fff; border: none; padding: 10px 16px; border-radius: 6px;">Reject</button>
              </form>
            </div>
            ${presetDecision ? `<p style="margin-top: 16px; color: #64748b;">You opened a ${presetDecision} link. Please submit the matching form.</p>` : ''}
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.log('Email job response page error:', error);
    return c.html('<p>Failed to load response page.</p>', 500);
  }
});

app.post("/make-server-fc558f72/issues/:id/respond-email", async (c) => {
  try {
    const issueId = c.req.param('id');
    const token = c.req.query('token');
    if (!token) {
      return c.html('<p>Missing response token.</p>', 400);
    }

    const formData = await c.req.formData();
    const decision = formData.get('decision')?.toString();
    const reason = formData.get('reason')?.toString() || '';
    const proposedCost = parseFloat(formData.get('proposedCost')?.toString() || '0');
    const proposal = formData.get('proposal')?.toString() || '';

    if (!decision || !['accepted', 'rejected'].includes(decision)) {
      return c.html('<p>Invalid decision.</p>', 400);
    }
    if (decision === 'rejected' && !reason.trim()) {
      return c.html('<p>Rejection reason is required.</p>', 400);
    }

    const issue = await kv.get(`issue:${issueId}`);
    if (!issue) {
      return c.html('<p>Issue not found.</p>', 404);
    }

    if (issue.emailDecisionToken !== token) {
      return c.html('<p>This response link is invalid.</p>', 403);
    }

    if (issue.emailDecisionExpiresAt && new Date(issue.emailDecisionExpiresAt) < new Date()) {
      return c.html('<p>This response link has expired.</p>', 410);
    }

    if (issue.contractorResponse || issue.respondedAt) {
      return c.html('<p>This job has already been responded to.</p>', 200);
    }

    if (!issue.assignedTo) {
      return c.html('<p>This job is not assigned to a contractor.</p>', 400);
    }

    const contractorStatus = await getContractorStatus(issue.companyId, issue.assignedTo);
    if (contractorStatus === 'suspended') {
      return c.html('<p>Your account is suspended for this company.</p>', 403);
    }

    const contractorProfile = await kv.get(`user:${issue.assignedTo}`);
    if (!contractorProfile) {
      return c.html('<p>Contractor profile not found.</p>', 404);
    }

    const proposalAttachments: any[] = [];
    const files = formData.getAll('proposalFile').filter((file) => file instanceof File) as File[];
    if (files.length) {
      const supabaseAdmin = getSupabaseAdmin();
      await ensureAttachmentsBucket(supabaseAdmin);
      for (const file of files) {
        if (!file.name) continue;
        const safeName = sanitizeFileName(file.name);
        const path = `${issue.companyId}/${issueId}/email/proposal/${Date.now()}-${safeName}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { error: uploadError } = await supabaseAdmin
          .storage
          .from(ATTACHMENTS_BUCKET)
          .upload(path, bytes, { contentType: file.type, upsert: false });
        if (!uploadError) {
          const { data: publicData } = supabaseAdmin.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path);
          proposalAttachments.push({
            url: publicData.publicUrl,
            path,
            name: file.name,
            type: file.type,
            size: file.size
          });
        }
      }
    }

    const respondedAt = new Date().toISOString();
    const responseId = generateId('RESP');
    const jobResponse = {
      id: responseId,
      issueId,
      contractorId: issue.assignedTo,
      contractorName: contractorProfile.name,
      decision,
      reason: decision === 'rejected' ? reason : '',
      proposedCost: proposedCost || 0,
      proposal,
      proposalAttachments,
      respondedAt
    };

    await kv.set(`job-response:${responseId}`, jobResponse);

    const updatedIssue = {
      ...issue,
      contractorResponse: jobResponse,
      status: decision === 'accepted' ? 'in_progress' : 'rejected',
      respondedAt,
      acceptedAt: decision === 'accepted' ? respondedAt : null,
      rejectedAt: decision === 'rejected' ? respondedAt : null,
      emailDecisionToken: null,
      emailDecisionExpiresAt: null,
      updatedAt: respondedAt
    };
    updatedIssue.executionMetrics = computeExecutionMetrics(updatedIssue);

    await kv.set(`issue:${issueId}`, updatedIssue);
    await upsertIssueRecord(updatedIssue);

    if (updatedIssue.executionMetrics?.responseMinutes !== null && updatedIssue.executionMetrics?.responseMinutes !== undefined) {
      await updateVendorMetrics({
        companyId: updatedIssue.companyId,
        contractorId: updatedIssue.assignedTo,
        responseMinutes: updatedIssue.executionMetrics.responseMinutes
      });
    }

    await logActivity({
      entityType: 'issue',
      entityId: issueId,
      action: `job_${decision}`,
      userId: issue.assignedTo,
      userName: contractorProfile.name,
      userRole: 'contractor',
      companyId: issue.companyId,
      details: { decision, reason: jobResponse.reason }
    });
    if (issue.equipmentId) {
      await logActivity({
        entityType: 'equipment',
        entityId: issue.equipmentId,
        action: `job_${decision}`,
        userId: issue.assignedTo,
        userName: contractorProfile.name,
        userRole: 'contractor',
        companyId: issue.companyId,
        details: { issueId, decision }
      });
    }

    if (issue.reportedBy?.userId) {
      const notificationId = generateId('NOT');
      await kv.set(`notification:${notificationId}`, {
        id: notificationId,
        userId: issue.reportedBy.userId,
        companyId: issue.companyId,
        message: `Contractor ${contractorProfile.name} ${decision} job ${issueId}`,
        type: `job_${decision}`,
        issueId,
        read: false,
        timestamp: new Date().toISOString()
      });

      const reporterEmail = await getUserEmail(issue.reportedBy.userId);
      if (reporterEmail) {
        await sendEmail({
          to: reporterEmail,
          subject: `Job ${decision}: ${issue.equipmentName}`,
          html: `
            <p>Contractor ${contractorProfile.name} has ${decision} the job.</p>
            <ul>
              <li><strong>Task:</strong> ${issue.equipmentName}</li>
              <li><strong>Decision:</strong> ${decision}</li>
              ${decision === 'rejected' && reason ? `<li><strong>Reason:</strong> ${reason}</li>` : ''}
            </ul>
          `
        });
      }
    }

    return c.html(`
      <div style="font-family: Arial, sans-serif; padding: 24px;">
        <h2>Response recorded</h2>
        <p>You have ${decision} this job.</p>
        <p>You can log in to your dashboard for details.</p>
      </div>
    `);
  } catch (error) {
    console.log('Email job response error:', error);
    return c.html('<p>Failed to record your response.</p>', 500);
  }
});

// Complete job with report
app.post("/make-server-fc558f72/issues/:id/complete", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const issueId = c.req.param('id');
    const { executionReport, proofDocuments, finalCost, workPerformed, partsUsed, reportAttachments } = await c.req.json();

    if (!executionReport) {
      return c.json({ error: 'Execution report is required' }, 400);
    }

    const issue = await kv.get(`issue:${issueId}`);
    if (!issue) {
      return c.json({ error: 'Job not found' }, 404);
    }

    // Check if contractor is assigned to this job
    if (issue.assignedTo !== user.id) {
      return c.json({ error: 'You are not assigned to this job' }, 403);
    }

    const contractorStatus = await getContractorStatus(issue.companyId, user.id);
    if (contractorStatus === 'suspended') {
      return c.json({ error: 'Your account is suspended for this company' }, 403);
    }

    const userProfile = await kv.get(`user:${user.id}`);

    // Create completion record
    const completionId = generateId('COMP');
    const completion = {
      id: completionId,
      issueId,
      contractorId: user.id,
      contractorName: userProfile.name,
      executionReport,
      proofDocuments: proofDocuments || [],
      reportAttachments: reportAttachments || [],
      finalCost: finalCost || 0,
      workPerformed: workPerformed || '',
      partsUsed: partsUsed || [],
      completedAt: new Date().toISOString()
    };

    await kv.set(`job-completion:${completionId}`, completion);

    // Update issue status
    const updatedIssue = {
      ...issue,
      completion,
      status: 'completed',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    updatedIssue.executionMetrics = computeExecutionMetrics(updatedIssue);

    await kv.set(`issue:${issueId}`, updatedIssue);
    await upsertIssueRecord(updatedIssue);
    if (updatedIssue.executionMetrics?.executionMinutes !== null && updatedIssue.executionMetrics?.executionMinutes !== undefined) {
      const delayed = updatedIssue.slaDeadline
        ? new Date(updatedIssue.completedAt).getTime() > new Date(updatedIssue.slaDeadline).getTime()
        : false;
      await updateVendorMetrics({
        companyId: updatedIssue.companyId,
        contractorId: updatedIssue.assignedTo,
        completionMinutes: updatedIssue.executionMetrics.executionMinutes,
        delayed
      });
    }

    // Update equipment status if completed
    if (issue.equipmentId) {
      const equipment = await kv.get(`equipment:${issue.equipmentId}`);
      if (equipment) {
        await kv.set(`equipment:${issue.equipmentId}`, {
          ...equipment,
          status: 'active',
          healthStatus: 'green',
          lastMaintenance: new Date().toISOString()
        });
        await upsertEquipmentRecord({
          ...equipment,
          status: 'active',
          healthStatus: 'green',
          lastMaintenance: new Date().toISOString()
        });
      }
    }

    // Log activity
    await logActivity({
      entityType: 'issue',
      entityId: issueId,
      action: 'job_completed',
      userId: user.id,
      userName: userProfile.name,
      userRole: 'contractor',
      companyId: issue.companyId,
      details: { finalCost, timestamp: new Date().toISOString() }
    });
    if (issue.equipmentId) {
      await logActivity({
        entityType: 'equipment',
        entityId: issue.equipmentId,
        action: 'job_completed',
        userId: user.id,
        userName: userProfile.name,
        userRole: 'contractor',
        companyId: issue.companyId,
        details: { issueId, finalCost }
      });
    }

    // Notify reporter
    if (issue.reportedBy?.userId) {
      const notificationId = generateId('NOT');
      await kv.set(`notification:${notificationId}`, {
        id: notificationId,
        userId: issue.reportedBy.userId,
        companyId: issue.companyId,
        message: `Contractor ${userProfile.name} completed job ${issueId}`,
        type: 'job_completed',
        issueId,
        read: false,
        timestamp: new Date().toISOString()
      });

      const reporterEmail = await getUserEmail(issue.reportedBy.userId);
      if (reporterEmail) {
        await sendEmail({
          to: reporterEmail,
          subject: `Job completed: ${issue.equipmentName}`,
          html: `
            <p>Contractor ${userProfile.name} completed the job.</p>
            <ul>
              <li><strong>Task:</strong> ${issue.equipmentName}</li>
              <li><strong>Final cost:</strong> ${finalCost || 0}</li>
              <li><strong>Completion report:</strong> ${executionReport}</li>
            </ul>
          `
        });
      }
    }

    return c.json({ success: true, completion });
  } catch (error) {
    console.log('Job completion error:', error);
    return c.json({ error: 'Failed to complete job' }, 500);
  }
});

// ============================================
// CONTRACTOR REPORTS ROUTES
// ============================================

// Create contractor report
app.post("/make-server-fc558f72/reports", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { issueId, companyId, description, workCompleted, partsUsed, laborHours, documentUrl } = await c.req.json();
    
    if (!issueId || !companyId || !description) {
      return c.json({ error: 'Issue ID, company ID, and description required' }, 400);
    }

    // Check contractor access
    const binding = await checkCompanyAccess(user.id, companyId);
    if (!binding || binding.role !== 'contractor') {
      return c.json({ error: 'Only contractors can create reports' }, 403);
    }

    const userProfile = await kv.get(`user:${user.id}`);
    const issue = await kv.get(`issue:${issueId}`);

    if (!issue) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    const reportId = generateId('REP');
    const report = {
      id: reportId,
      issueId,
      companyId,
      facilityId: issue.facilityId,
      equipmentId: issue.equipmentId,
      description,
      workCompleted: workCompleted || '',
      partsUsed: partsUsed || [],
      laborHours: laborHours || 0,
      documentUrl: documentUrl || '',
      submittedBy: {
        userId: user.id,
        name: userProfile.name,
        contact: {
          phone: userProfile.phone || '',
          email: userProfile.email || ''
        }
      },
      createdAt: new Date().toISOString(),
      status: 'submitted'
    };

    await kv.set(`report:${reportId}`, report);

    // Log activity
    await logActivity({
      entityType: 'issue',
      entityId: issueId,
      action: 'report_submitted',
      userId: user.id,
      userName: userProfile.name,
      userRole: 'contractor',
      companyId,
      details: { reportId, description }
    });

    // Notify facility manager
    if (issue.reportedBy?.userId) {
      const notificationId = generateId('NOT');
      await kv.set(`notification:${notificationId}`, {
        id: notificationId,
        userId: issue.reportedBy.userId,
        companyId,
        message: `Contractor ${userProfile.name} submitted a report for issue ${issueId}`,
        type: 'report_submitted',
        issueId,
        reportId,
        read: false,
        timestamp: new Date().toISOString()
      });
    }

    return c.json({ success: true, report });
  } catch (error) {
    console.log('Create report error:', error);
    return c.json({ error: 'Failed to create report' }, 500);
  }
});

// Get reports
app.get("/make-server-fc558f72/reports", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const companyId = c.req.query('companyId');
    const issueId = c.req.query('issueId');

    if (!companyId) {
      return c.json({ error: 'Company ID required' }, 400);
    }

    // Check access
    const binding = await checkCompanyAccess(user.id, companyId);
    if (!binding) {
      return c.json({ error: 'No access to this company' }, 403);
    }

    let reports = await kv.getByPrefix('report:');
    reports = reports.filter((r: any) => r.companyId === companyId);

    if (issueId) {
      reports = reports.filter((r: any) => r.issueId === issueId);
    }

    // If contractor, only show their reports
    if (binding.role === 'contractor') {
      reports = reports.filter((r: any) => r.submittedBy.userId === user.id);
    }

    reports.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return c.json({ success: true, reports });
  } catch (error) {
    console.log('Get reports error:', error);
    return c.json({ error: 'Failed to get reports' }, 500);
  }
});

Deno.serve(app.fetch);
