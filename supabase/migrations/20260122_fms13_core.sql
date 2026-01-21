create extension if not exists "pgcrypto";

create table if not exists public.fms13_companies (
  id text primary key,
  name text not null,
  address text,
  phone text,
  industry text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.fms13_user_profiles (
  id uuid primary key,
  email text,
  name text,
  phone text,
  role text,
  avatar_url text,
  skills text[],
  specialization text,
  profile_complete boolean,
  is_global_user boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.fms13_company_users (
  id bigserial primary key,
  company_id text not null,
  user_id uuid not null,
  role text not null,
  facility_ids text[] default '{}'::text[],
  created_at timestamptz not null default now(),
  unique (company_id, user_id, role)
);

create table if not exists public.fms13_company_contractors (
  id bigserial primary key,
  company_id text not null,
  contractor_id uuid not null,
  status text not null default 'active',
  suspended_at timestamptz,
  resumed_at timestamptz,
  suspended_by uuid,
  suspension_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, contractor_id)
);

create table if not exists public.fms13_equipment (
  id text primary key,
  company_id text not null,
  facility_id text not null,
  name text not null,
  category text not null,
  brand text,
  model text,
  serial_number text,
  status text,
  health_status text,
  location text,
  contractor_id uuid,
  created_by uuid,
  recorded_by_name text,
  recorded_by_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists fms13_equipment_serial_facility_unique
  on public.fms13_equipment (facility_id, serial_number)
  where serial_number is not null and serial_number <> '';

create table if not exists public.fms13_equipment_history (
  id bigserial primary key,
  equipment_id text not null,
  action text not null,
  details jsonb,
  actor_id uuid,
  actor_name text,
  actor_role text,
  created_at timestamptz not null default now()
);

create table if not exists public.fms13_issues (
  id text primary key,
  company_id text not null,
  facility_id text not null,
  equipment_id text,
  equipment_name text,
  title text,
  description text,
  priority text,
  status text,
  task_type text,
  reported_by_id uuid,
  reported_by_name text,
  reported_by_role text,
  reported_by_contact jsonb,
  assigned_to uuid,
  assigned_at timestamptz,
  responded_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  completed_at timestamptz,
  approved_at timestamptz,
  closed_at timestamptz,
  sla_deadline timestamptz,
  execution_metrics jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fms13_issue_events (
  id bigserial primary key,
  issue_id text not null,
  action text not null,
  status text,
  details jsonb,
  actor_id uuid,
  actor_name text,
  actor_role text,
  created_at timestamptz not null default now()
);

create table if not exists public.fms13_audit_logs (
  id bigserial primary key,
  entity_type text not null,
  entity_id text not null,
  action_type text not null,
  actor_id uuid,
  actor_name text,
  actor_role text,
  company_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.fms13_vendor_metrics (
  id bigserial primary key,
  company_id text not null,
  contractor_id uuid not null,
  avg_response_minutes int,
  avg_completion_minutes int,
  response_count int not null default 0,
  completion_count int not null default 0,
  delayed_jobs_count int,
  total_jobs int,
  updated_at timestamptz not null default now(),
  unique (company_id, contractor_id)
);

create table if not exists public.fms13_maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  equipment_id text not null,
  schedule_type text not null,
  interval_months int,
  interval_hours int,
  next_due_at timestamptz,
  next_due_hours int,
  status text not null default 'active',
  created_by uuid,
  created_by_name text,
  created_by_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fms13_maintenance_events (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid,
  equipment_id text,
  status text,
  due_at timestamptz,
  completed_at timestamptz,
  completed_by uuid,
  completed_by_name text,
  completed_by_role text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.fms13_procedures (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  equipment_category text,
  title text not null,
  description text,
  created_by uuid,
  created_by_name text,
  created_by_role text,
  created_at timestamptz not null default now()
);

create table if not exists public.fms13_procedure_versions (
  id uuid primary key default gen_random_uuid(),
  procedure_id uuid not null,
  version int not null,
  document_path text,
  document_url text,
  created_by uuid,
  created_by_name text,
  created_by_role text,
  created_at timestamptz not null default now()
);

create table if not exists public.fms13_procedure_checklist_items (
  id uuid primary key default gen_random_uuid(),
  procedure_version_id uuid not null,
  item text not null,
  position int not null
);

create table if not exists public.fms13_checklist_completions (
  id uuid primary key default gen_random_uuid(),
  equipment_id text not null,
  procedure_version_id uuid not null,
  completed_by uuid,
  completed_by_name text,
  completed_by_role text,
  completed_at timestamptz not null default now(),
  responses jsonb
);

create table if not exists public.fms13_equipment_replacements (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  old_equipment_id text not null,
  new_equipment_id text not null,
  reason text,
  replaced_at timestamptz not null default now(),
  replaced_by uuid,
  replaced_by_name text,
  replaced_by_role text
);

create table if not exists public.fms13_company_modules (
  company_id text primary key,
  consumables_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fms13_consumables (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  name text not null,
  unit text,
  created_by uuid,
  created_by_name text,
  created_by_role text,
  created_at timestamptz not null default now()
);

create table if not exists public.fms13_consumable_events (
  id uuid primary key default gen_random_uuid(),
  consumable_id uuid,
  equipment_id text,
  quantity numeric,
  notes text,
  actor_id uuid,
  actor_name text,
  actor_role text,
  created_at timestamptz not null default now()
);

create index if not exists fms13_equipment_company_idx on public.fms13_equipment (company_id);
create index if not exists fms13_issues_company_idx on public.fms13_issues (company_id);
create index if not exists fms13_audit_logs_company_idx on public.fms13_audit_logs (company_id);

alter table public.fms13_procedures add column if not exists company_id text;
alter table public.fms13_vendor_metrics add column if not exists response_count int;
alter table public.fms13_vendor_metrics add column if not exists completion_count int;
alter table public.fms13_consumable_events add column if not exists company_id text;
