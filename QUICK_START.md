# FMS.13 Quick Start Guide

Get your multi-tenant Facility Management System up and running in 5 minutes!

---

## ⚡ Prerequisites

- ✅ Node.js installed (v18 or higher)
- ✅ Supabase account ([Sign up free](https://supabase.com))
- ✅ Supabase project created

---

## 🚀 Step 1: Deploy Backend (2 minutes)

### Install Supabase CLI

```bash
npm install -g supabase
```

### Login & Link

```bash
# Login to Supabase
supabase login

# Link your project (get project ID from Supabase dashboard URL)
supabase link --project-ref YOUR_PROJECT_ID
```

### Deploy Edge Function

```bash
supabase functions deploy make-server-fc558f72
```

✅ Done! Your backend is live.

### Verify

```bash
curl https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-fc558f72/health
```

Expected: `{"status":"ok"}`

---

## 🎨 Step 2: Configure Frontend (1 minute)

### Update Supabase Credentials

Edit `/utils/supabase/info.tsx`:

```typescript
export const projectId = 'YOUR_PROJECT_ID'; // From Supabase dashboard
export const publicAnonKey = 'YOUR_ANON_KEY'; // From Supabase → Settings → API
```

Get these from: Supabase Dashboard → Settings → API

---

## 🏃 Step 3: Run Locally (30 seconds)

```bash
# Install dependencies (if not already done)
npm install

# Start development server
npm run dev
```

Open: `http://localhost:5173`

---

## 👥 Step 4: Create Your First Company (1 minute)

### Register Company

1. Click **"Register Company"** tab
2. Fill in:
   - **Company Name**: Test Company
   - **Industry**: Technology
   - **Admin Name**: Your Name
   - **Admin Email**: admin@test.com
   - **Admin Password**: Test123456
3. Click **"Register Company"**

✅ You're now logged in as Company Admin!

---

## 🏢 Step 5: Set Up Your First Facility (30 seconds)

### Create Facility

1. Click **"Facilities"** tab
2. Click **"Add Facility"**
3. Fill in:
   - **Name**: HQ Office
   - **Location**: New York
   - **Address**: 123 Broadway, NY
4. Click **"Create Facility"**

---

## 👨‍💼 Step 6: Add Facility Manager (30 seconds)

1. Go to **"Team"** tab
2. Under "Facility Managers", click **"Add Manager"**
3. Fill in:
   - **Name**: John Manager
   - **Email**: manager@test.com
   - **Phone**: +1 555 123 4567
   - **Password**: Manager123
4. Click **"Create Manager"**

---

## 🔧 Step 7: Test Facility Manager Flow (2 minutes)

### Login as Facility Manager

1. **Logout** from admin account (top-right)
2. **Login** with:
   - Email: manager@test.com
   - Password: Manager123

### Register Equipment

1. Go to **"Equipment"** tab
2. Click **"Register Equipment"**
3. Fill in:
   - **Name**: Industrial Oven
   - **Category**: Kitchen
   - **Facility**: HQ Office
   - **Brand**: Samsung
   - **Model**: XYZ-2000
4. Click **"Register Equipment"**

👁️ **Notice**: Your contact info is automatically recorded!

### Report an Issue

1. Go to **"Issues"** tab
2. Click **"Report Issue"**
3. Fill in:
   - **Equipment**: Industrial Oven
   - **Description**: Oven not heating properly
   - **Priority**: High
4. Click **"Report Issue"**

👁️ **Notice**: Your contact info is captured as reporter!

---

## 👷 Step 8: Test Contractor Flow (2 minutes)

### Create Contractor Account

For demo purposes, we'll create a contractor via signup:

1. **Logout** from facility manager
2. On login page, click **"Register Company"** tab (we'll use signup for demo)
3. Actually, let's use the admin to assign a contractor...

### Better Way: Admin Assigns Contractor

1. **Login as Admin** (admin@test.com / Test123456)
2. Go to **"Team"** → **"Contractors"**
3. Click **"Assign Contractor"**
4. For demo, you'd need a contractor user ID

**Note**: For full contractor testing, you'll need to create a contractor user account first. The system is designed for contractors to self-register, then admins assign them to companies.

---

## 🎯 What You've Achieved

✅ **Multi-tenant system** deployed and running
✅ **Company registered** with admin access
✅ **Facility created** with full details
✅ **Facility Manager** created and tested
✅ **Equipment registered** with transparency (recorder info captured)
✅ **Issue reported** with accountability (reporter info captured)

---

## 🔍 Key Features to Explore

### Transparency & Accountability

Every record shows:
- **Who created it** (name, role, contact)
- **When it was created**
- **Full activity timeline**

### Contact Access

Click on any user's name to see:
- ☎️ **Click-to-call** button
- 📧 **Click-to-email** button
- 📍 **Branch/location** info

### Activity Logs

Open any equipment or issue to see:
- Full audit trail
- Every action logged
- Who did what, when

### Multi-Company Support

Contractors can work across multiple companies:
- Company switcher in header
- Data fully isolated
- No cross-contamination

---

## 🧪 Test Scenarios

### Scenario 1: Equipment Lifecycle
1. Register equipment as FM
2. View equipment details
3. Check activity log
4. Verify recorder contact info

### Scenario 2: Issue Lifecycle
1. Report issue as FM
2. Assign contractor (if available)
3. Update status (requires contractor account)
4. Approve completion (as FM)
5. View full audit trail

### Scenario 3: Multi-User Collaboration
1. Create multiple FMs
2. Create multiple facilities
3. Test access controls
4. Verify data isolation

---

## 🛠️ Troubleshooting

### Frontend Can't Connect to Backend

**Error**: "Server connection failed"

**Fix**:
1. Verify Edge Function deployed: `supabase functions logs make-server-fc558f72`
2. Check `/utils/supabase/info.tsx` has correct project ID
3. Test health endpoint: `curl https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-fc558f72/health`

### "Unauthorized" Errors

**Fix**:
1. Logout and login again
2. Check browser console for errors
3. Verify `accessToken` in localStorage

### Can't See Data

**Fix**:
1. Check you're in the right company context
2. Verify user role has access to that data
3. Check browser console for API errors

---

## 📚 Next Steps

### Production Deployment
- See **[DEPLOYMENT_GUIDE.md](/DEPLOYMENT_GUIDE.md)** for full production setup

### Understanding the Architecture
- See **[FMS13_UPGRADE_SUMMARY.md](/FMS13_UPGRADE_SUMMARY.md)** for complete technical details

### Adding More Users
1. Create more facility managers via Admin dashboard
2. Create contractors (self-registration + admin assignment)
3. Test multi-company workflows

### Customization
- Modify equipment categories in facility manager dashboard
- Adjust SLA timeframes in backend (currently: High=4h, Medium=24h, Low=72h)
- Add custom fields to equipment or issues

---

## 🎉 Success!

You now have a **fully operational multi-tenant facility management system** with:

✅ Complete transparency (who recorded/reported everything)
✅ Full accountability (activity logs for all actions)
✅ Contact management (click-to-call/email)
✅ Role-based access (admin, FM, contractor)
✅ SLA monitoring (automatic escalation)
✅ Enterprise-grade architecture

**Ready for production deployment!**

---

## 💡 Tips

### For Demo/Testing
- Use temporary email addresses (temp-mail.org)
- Create multiple user accounts for testing
- Test on both desktop and mobile

### For Production
- Use real email addresses
- Enable email verification (configure Supabase Auth)
- Set up proper password policies
- Configure SLA monitoring cron job

### For Best Experience
- Use Chrome or Firefox for full feature support
- Enable notifications for real-time updates
- Test click-to-call on mobile device

---

**Questions?** Check the comprehensive guides:
- 📖 [Full Deployment Guide](/DEPLOYMENT_GUIDE.md)
- 🏗️ [Architecture Summary](/FMS13_UPGRADE_SUMMARY.md)

**Happy Managing!** 🚀
