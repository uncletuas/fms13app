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

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
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
  return activity;
};

// Get user profile with company context
const getUserProfile = async (userId: string) => {
  return await kv.get(`user:${userId}`);
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
  const base = `${FUNCTION_BASE_URL}/issues/${issueId}/respond-email?token=${encodeURIComponent(token)}`;
  return {
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
}) => {
  const facilityLine = params.facilityIds && params.facilityIds.length
    ? `<li><strong>Facilities:</strong> ${params.facilityIds.join(', ')}</li>`
    : '';
  const categoryLine = params.categories && params.categories.length
    ? `<li><strong>Scope:</strong> ${params.categories.join(', ')}</li>`
    : '';

  return {
    subject: `Invitation to join ${params.companyName} on FMS13`,
    html: `
      <p>You have been invited to join ${params.companyName} as a contractor.</p>
      <p><strong>Invited by:</strong> ${params.invitedByName || 'Company admin'}</p>
      ${facilityLine || categoryLine ? `<ul>${facilityLine}${categoryLine}</ul>` : ''}
      <p>Next steps:</p>
      <ol>
        <li>Sign in to your FMS13 account.</li>
        <li>Open the Notifications page.</li>
        <li>Review the invitation and choose Accept or Decline.</li>
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

    const supabase = getSupabaseAdmin();
    
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true
    });

    if (error) {
      console.log('Signup error:', error);
      return c.json({ error: error.message }, 400);
    }

    // Store user profile in KV (global user)
    const userProfile = {
      id: data.user.id,
      email,
      name,
      phone: phone || '',
      createdAt: new Date().toISOString(),
      createdBy: data.user.id,
      isGlobalUser: true,
      // Contractor-specific fields
      skills: skills || [],
      specialization: specialization || '',
      profileComplete: !!(skills && specialization)
    };

    await kv.set(`user:${data.user.id}`, userProfile);

    // Log account creation
    await logActivity({
      entityType: 'user',
      entityId: data.user.id,
      action: 'account_created',
      userId: data.user.id,
      userName: name,
      userRole: 'new_user',
      details: { email, timestamp: new Date().toISOString() }
    });

    // If role and companyId provided, create user-company binding
    if (role && companyId) {
      await kv.set(`user-company:${data.user.id}:${companyId}`, {
        userId: data.user.id,
        companyId,
        role,
        assignedAt: new Date().toISOString(),
        assignedBy: data.user.id,
        facilityIds: [], // For facility managers
      });

      // Log activity
      await logActivity({
        entityType: 'user',
        entityId: data.user.id,
        action: 'user_created',
        userId: data.user.id,
        userName: name,
        userRole: role,
        companyId,
        details: { email, role }
      });
    }

    return c.json({ 
      success: true, 
      user: { 
        id: data.user.id, 
        email, 
        name,
        phone: phone || '',
        skills: skills || [],
        specialization: specialization || ''
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

    // Get user profile
    const userProfile = await kv.get(`user:${data.user.id}`);

    // Get all company bindings for this user
    const allBindings = await kv.getByPrefix(`user-company:${data.user.id}:`);

    return c.json({ 
      success: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
      user: userProfile || {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name,
      },
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

    const supabaseAdmin = getSupabaseAdmin();

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: admin.email,
      password: admin.password,
      user_metadata: { name: admin.name, role: 'company_admin' },
      email_confirm: true
    });

    if (createError || !created.user) {
      console.log('Company admin signup error:', createError);
      return c.json({ error: createError?.message || 'Signup failed' }, 400);
    }

    const userId = created.user.id;
    const userProfile = {
      id: userId,
      email: admin.email,
      name: admin.name,
      role: 'company_admin',
      phone: admin.phone || '',
      createdAt: new Date().toISOString(),
      createdBy: userId,
      isGlobalUser: true,
    };

    await kv.set(`user:${userId}`, userProfile);

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

    const binding = {
      userId,
      companyId,
      role: 'company_admin',
      assignedAt: new Date().toISOString(),
    };

    await kv.set(`user-company:${userId}:${companyId}`, binding);

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

    const supabaseClient = getSupabaseClient();
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.signInWithPassword({
      email: admin.email,
      password: admin.password,
    });

    if (sessionError || !sessionData.session?.access_token) {
      console.log('Company admin session error:', sessionError);
      return c.json({ error: 'Login failed' }, 401);
    }

    return c.json({
      success: true,
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
      expiresIn: sessionData.session.expires_in,
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

    const supabaseAdmin = getSupabaseAdmin();

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, role: 'contractor' },
      email_confirm: true
    });

    if (createError || !created.user) {
      console.log('Contractor signup error:', createError);
      return c.json({ error: createError?.message || 'Signup failed' }, 400);
    }

    const userId = created.user.id;
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
      profileComplete: !!(skills && specialization)
    };

    await kv.set(`user:${userId}`, userProfile);

    await logActivity({
      entityType: 'user',
      entityId: userId,
      action: 'account_created',
      userId,
      userName: name,
      userRole: 'contractor',
      details: { email }
    });

    const supabaseClient = getSupabaseClient();
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (sessionError || !sessionData.session?.access_token) {
      console.log('Contractor session error:', sessionError);
      return c.json({ error: 'Login failed' }, 401);
    }

    return c.json({
      success: true,
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
      expiresIn: sessionData.session.expires_in,
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

    const userProfile = await kv.get(`user:${user.id}`);
    const allBindings = await kv.getByPrefix(`user-company:${user.id}:`);

    return c.json({ 
      success: true,
      user: userProfile || {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name,
      },
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

    const userProfile = await kv.get(`user:${user.id}`);

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
    const userProfile = await kv.get(`user:${user.id}`);
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

    const userProfile = await kv.get(`user:${user.id}`);

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

    const userProfile = await kv.get(`user:${user.id}`);
    const facility = await kv.get(`facility:${facilityId}`);

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
      contractorId: contractorId || null,
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
        return c.json({ error: 'Spreadsheet file is required' }, 400);
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

      const equipmentId = generateId('EQP');
      const equipment = {
        id: equipmentId,
        name: String(name).trim(),
        category: String(category).trim(),
        brand: normalizedRow.brand || '',
        model: normalizedRow.model || '',
        serialNumber: normalizedRow.serialnumber || normalizedRow.serial_number || '',
        installDate: normalizedRow.installdate || normalizedRow.install_date || '',
        warrantyPeriod: normalizedRow.warrantyperiod || normalizedRow.warranty_period || '',
        contractorId: normalizedRow.contractorid || normalizedRow.contractor_id || '',
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

    const { equipmentId, title, description, priority, images, suggestedPriority, companyId, facilityId } = await c.req.json();
    
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
      slaDeadline: new Date(Date.now() + (finalPriority === 'high' ? 4 : finalPriority === 'medium' ? 24 : 72) * 60 * 60 * 1000).toISOString()
    };

    await kv.set(`issue:${issueId}`, issue);

    if (equipmentId && equipment) {
      // Update equipment health status based on priority
      const healthStatus = finalPriority === 'high' ? 'red' : finalPriority === 'medium' ? 'yellow' : 'green';
      await kv.set(`equipment:${equipmentId}`, {
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

    const previousAssignee = issue.assignedTo || null;
    const isReassign = previousAssignee && previousAssignee !== contractorId;
    const assignedAt = new Date().toISOString();
    const emailDecisionToken = generateId('TOK');
    const emailDecisionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const updatedIssue = {
      ...issue,
      assignedTo: contractorId,
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

    // Log activity
    await logActivity({
      entityType: 'issue',
      entityId: issueId,
      action: isReassign ? 'contractor_reassigned' : 'contractor_assigned',
      userId: user.id,
      userName: userProfile.name,
      userRole: binding.role,
      companyId: issue.companyId,
      details: { contractorId, previousAssignee }
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
        details: { issueId, contractorId, previousAssignee }
      });
    }

    // Notify contractor
    const notificationId = generateId('NOT');
    await kv.set(`notification:${notificationId}`, {
      id: notificationId,
      userId: contractorId,
      companyId: issue.companyId,
      message: `New issue assigned: ${issue.equipmentName} - ${issue.description}`,
      type: 'new_assignment',
      issueId,
      priority: issue.priority,
      read: false,
      timestamp: new Date().toISOString()
    });

    const contractorEmail = await getUserEmail(contractorId);
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

    const supabase = getSupabaseAdmin();
    
    const { data, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      email_confirm: true
    });

    if (createError) {
      console.log('Create facility manager error:', createError);
      return c.json({ error: createError.message }, 400);
    }

    // Store user profile
    await kv.set(`user:${data.user.id}`, {
      id: data.user.id,
      email,
      name,
      phone: phone || '',
      createdAt: new Date().toISOString(),
      isGlobalUser: true
    });

    // Create company binding
    await kv.set(`user-company:${data.user.id}:${companyId}`, {
      userId: data.user.id,
      companyId,
      role: 'facility_manager',
      facilityIds: facilityIds || [],
      assignedAt: new Date().toISOString(),
    });

    const userProfile = await kv.get(`user:${user.id}`);

    // Log activity
    await logActivity({
      entityType: 'user',
      entityId: data.user.id,
      action: 'facility_manager_created',
      userId: user.id,
      userName: userProfile.name,
      userRole: 'company_admin',
      companyId,
      details: { email, name, facilityIds }
    });

    return c.json({ 
      success: true, 
      user: { id: data.user.id, email, name, phone: phone || '' } 
    });
  } catch (error) {
    console.log('Create facility manager exception:', error);
    return c.json({ error: 'Failed to create facility manager' }, 500);
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
    
    if (!contractorId || !companyId) {
      return c.json({ error: 'Contractor ID and company ID required' }, 400);
    }

    // Check company admin access
    const binding = await checkCompanyAccess(user.id, companyId);
    if (!binding || binding.role !== 'company_admin') {
      return c.json({ error: 'Only company admins can assign contractors' }, 403);
    }

    // Check if contractor user exists
    const contractorProfile = await kv.get(`user:${contractorId}`);
    if (!contractorProfile) {
      return c.json({ error: 'Contractor not found. Please ensure they have registered.' }, 404);
    }

    // Create invitation instead of direct assignment
    const company = await kv.get(`company:${companyId}`);
    const userProfile = await kv.get(`user:${user.id}`);

    const invitationId = generateId('INV');
    const invitation = {
      id: invitationId,
      contractorId,
      companyId,
      companyName: company.name,
      facilityIds: facilityIds || [],
      categories: categories || [],
      invitedBy: user.id,
      invitedByName: userProfile.name,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    await kv.set(`contractor-invitation:${invitationId}`, invitation);

    // Create notification for contractor
    const notificationId = generateId('NOT');
    await kv.set(`notification:${notificationId}`, {
      id: notificationId,
      userId: contractorId,
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
      entityId: contractorId,
      action: 'contractor_invited',
      userId: user.id,
      userName: userProfile.name,
      userRole: 'company_admin',
      companyId,
      details: { invitationId, contractorName: contractorProfile.name }
    });

    const contractorEmail = await getUserEmail(contractorId);
    if (contractorEmail) {
      const invitationEmail = buildInvitationEmail({
        companyName: company.name,
        invitedByName: userProfile.name,
        categories,
        facilityIds
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
          return {
            ...profile,
            binding: {
              facilityIds: binding.facilityIds,
              categories: binding.categories
            }
          };
        })
      );

      return c.json({ success: true, contractors });
    } else {
      // Get all contractors (global)
      const allUsers = await kv.getByPrefix('user:');
      const allBindings = await kv.getByPrefix('user-company:');
      
      const contractorUserIds = allBindings
        .filter((b: any) => b.role === 'contractor')
        .map((b: any) => b.userId);
      
      const contractors = allUsers.filter((u: any) => contractorUserIds.includes(u.id));

      return c.json({ success: true, contractors });
    }
  } catch (error) {
    console.log('Get contractors error:', error);
    return c.json({ error: 'Failed to get contractors' }, 500);
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
    const companyId = c.req.query('companyId');

    if (!companyId) {
      return c.json({ error: 'Company ID required' }, 400);
    }

    const binding = await checkCompanyAccess(user.id, companyId);
    if (!binding || binding.role !== 'company_admin') {
      return c.json({ error: 'Company admin access required' }, 403);
    }

    const contractorBinding = await kv.get(`user-company:${contractorId}:${companyId}`);
    if (!contractorBinding || contractorBinding.role !== 'contractor') {
      return c.json({ error: 'Contractor not found for this company' }, 404);
    }

    await kv.del(`user-company:${contractorId}:${companyId}`);

    const allIssues = await kv.getByPrefix('issue:');
    const assignedIssues = allIssues.filter((issue: any) => 
      issue.companyId === companyId && issue.assignedTo === contractorId
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
      eq.companyId === companyId && eq.contractorId === contractorId
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
      entityId: contractorId,
      action: 'contractor_removed',
      userId: user.id,
      userName: adminProfile?.name || 'Admin',
      userRole: 'company_admin',
      companyId,
      details: { contractorId, reassignedIssues: assignedIssues.length, unassignedEquipment: assignedEquipment.length }
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

    // Check company admin access
    const binding = await checkCompanyAccess(user.id, companyId);
    if (!binding || binding.role !== 'company_admin') {
      return c.json({ error: 'Company admin access required' }, 403);
    }

    // Get all bindings for this company
    const allBindings = await kv.getByPrefix('user-company:');
    const companyBindings = allBindings.filter((b: any) => b.companyId === companyId);

    // Get user profiles
    const users = await Promise.all(
      companyBindings.map(async (binding: any) => {
        const profile = await kv.get(`user:${binding.userId}`);
        return {
          ...profile,
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
    const { companyId, name, phone, facilityIds, password } = await c.req.json();

    if (!companyId) {
      return c.json({ error: 'Company ID required' }, 400);
    }

    const adminBinding = await checkCompanyAccess(user.id, companyId);
    if (!adminBinding || adminBinding.role !== 'company_admin') {
      return c.json({ error: 'Company admin access required' }, 403);
    }

    const targetBinding = await kv.get(`user-company:${userId}:${companyId}`);
    if (!targetBinding || targetBinding.role !== 'facility_manager') {
      return c.json({ error: 'Facility manager not found for this company' }, 404);
    }

    const targetProfile = await kv.get(`user:${userId}`);
    if (!targetProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    const updatedProfile = {
      ...targetProfile,
      name: name || targetProfile.name,
      phone: phone || targetProfile.phone,
      updatedAt: new Date().toISOString()
    };

    await kv.set(`user:${userId}`, updatedProfile);

    if (Array.isArray(facilityIds)) {
      await kv.set(`user-company:${userId}:${companyId}`, {
        ...targetBinding,
        facilityIds
      });
    }

    if (password) {
      const supabaseAdmin = getSupabaseAdmin();
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
      if (updateError) {
        return c.json({ error: updateError.message }, 400);
      }
    }

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { name: updatedProfile.name }
    });

    const adminProfile = await kv.get(`user:${user.id}`);
    await logActivity({
      entityType: 'user',
      entityId: userId,
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

    const activities = await kv.getByPrefix(`activity:${entityType}:${entityId}:`);
    
    // Sort by timestamp (newest first)
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
    
    if (!contractorId || !companyId) {
      return c.json({ error: 'Contractor ID and company ID required' }, 400);
    }

    // Check company admin access
    const binding = await checkCompanyAccess(user.id, companyId);
    if (!binding || binding.role !== 'company_admin') {
      return c.json({ error: 'Only company admins can invite contractors' }, 403);
    }

    // Check if contractor user exists
    const contractorProfile = await kv.get(`user:${contractorId}`);
    if (!contractorProfile) {
      return c.json({ error: 'Contractor not found' }, 404);
    }

    // Check if already invited or assigned
    const existingBinding = await kv.get(`user-company:${contractorId}:${companyId}`);
    if (existingBinding) {
      return c.json({ error: 'Contractor already assigned to this company' }, 400);
    }

    const allInvitations = await kv.getByPrefix('contractor-invitation:');
    const existingInvitation = allInvitations.find((inv: any) => 
      inv.contractorId === contractorId && 
      inv.companyId === companyId && 
      inv.status === 'pending'
    );
    
    if (existingInvitation) {
      return c.json({ error: 'Invitation already sent and pending' }, 400);
    }

    const company = await kv.get(`company:${companyId}`);
    const userProfile = await kv.get(`user:${user.id}`);

    const invitationId = generateId('INV');
    const invitation = {
      id: invitationId,
      contractorId,
      companyId,
      companyName: company.name,
      facilityIds: facilityIds || [],
      categories: categories || [],
      invitedBy: user.id,
      invitedByName: userProfile.name,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    await kv.set(`contractor-invitation:${invitationId}`, invitation);

    // Create notification for contractor
    const notificationId = generateId('NOT');
    await kv.set(`notification:${notificationId}`, {
      id: notificationId,
      userId: contractorId,
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
      entityId: contractorId,
      action: 'contractor_invited',
      userId: user.id,
      userName: userProfile.name,
      userRole: 'company_admin',
      companyId,
      details: { invitationId, contractorName: contractorProfile.name }
    });

    const contractorEmail = await getUserEmail(contractorId);
    if (contractorEmail) {
      const invitationEmail = buildInvitationEmail({
        companyName: company.name,
        invitedByName: userProfile.name,
        categories,
        facilityIds
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

// Approve/Reject contractor invitation
app.post("/make-server-fc558f72/contractor-invitations/:id/respond", async (c) => {
  try {
    const { error, user } = await verifyUser(c.req.raw);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const invitationId = c.req.param('id');
    const { status } = await c.req.json(); // 'approved' or 'rejected'

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
      respondedAt: new Date().toISOString()
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
        assignedAt: new Date().toISOString(),
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

    const userProfile = await kv.get(`user:${user.id}`);
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
    const profile = await kv.get(`user:${userId}`);

    if (!profile) {
      return c.json({ error: 'Profile not found' }, 404);
    }

    return c.json({ success: true, profile });
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

// Email-based job response (accept/reject)
app.get("/make-server-fc558f72/issues/:id/respond-email", async (c) => {
  try {
    const issueId = c.req.param('id');
    const decision = c.req.query('decision');
    const token = c.req.query('token');

    if (!decision || !['accepted', 'rejected'].includes(decision)) {
      return c.html('<p>Invalid decision link.</p>', 400);
    }

    const issue = await kv.get(`issue:${issueId}`);
    if (!issue) {
      return c.html('<p>Issue not found.</p>', 404);
    }

    if (!token || issue.emailDecisionToken !== token) {
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

    const contractorProfile = await kv.get(`user:${issue.assignedTo}`);
    if (!contractorProfile) {
      return c.html('<p>Contractor profile not found.</p>', 404);
    }

    const respondedAt = new Date().toISOString();
    const responseId = generateId('RESP');
    const jobResponse = {
      id: responseId,
      issueId,
      contractorId: issue.assignedTo,
      contractorName: contractorProfile.name,
      decision,
      reason: decision === 'rejected' ? 'Rejected via email' : 'Accepted via email',
      proposedCost: 0,
      proposal: '',
      proposalAttachments: [],
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
