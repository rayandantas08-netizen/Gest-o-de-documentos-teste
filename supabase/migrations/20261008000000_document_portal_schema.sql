-- Esquema inicial do portal Núcleo. Nenhum dado real é inserido.
-- Arquivos binários permanecem fora do banco; Drive OAuth será etapa separada.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'editor', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  job_title text,
  department text,
  company_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table public.document_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  category text,
  validity_months integer check (validity_months is null or validity_months between 1 and 600),
  is_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique (organization_id, name)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid references public.people(id) on delete restrict,
  document_type_id uuid references public.document_types(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 2 and 200),
  expires_on date,
  review_status text not null default 'pending' check (review_status in ('pending', 'verified', 'rejected')),
  drive_file_id text,
  drive_file_name text,
  mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  check ((drive_file_id is null) = (drive_file_name is null))
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_table text not null check (entity_table in ('people', 'document_types', 'documents')),
  entity_id uuid not null,
  action text not null check (action in ('insert', 'update')),
  changed_fields text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index people_org_name_idx on public.people (organization_id, full_name) where is_active;
create index document_types_org_name_idx on public.document_types (organization_id, name);
create index documents_org_expiry_idx on public.documents (organization_id, expires_on);
create index documents_org_person_idx on public.documents (organization_id, person_id);
create index documents_org_type_idx on public.documents (organization_id, document_type_id);
create index audit_events_org_created_idx on public.audit_events (organization_id, created_at desc);

create or replace function private.has_org_role(p_organization_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.organization_members as m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role = any (p_roles)
  );
$function$;
revoke all on function private.has_org_role(uuid, text[]) from public, anon;
grant execute on function private.has_org_role(uuid, text[]) to authenticated;

create or replace function private.stamp_record_actor()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  end if;
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$function$;
revoke all on function private.stamp_record_actor() from public, anon, authenticated;

create or replace function private.record_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_new jsonb;
  v_old jsonb := '{}'::jsonb;
  v_org uuid;
  v_entity_id uuid;
  v_action text;
  v_changed text[];
begin
  v_new := to_jsonb(new);
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
  end if;
  v_org := (v_new ->> 'organization_id')::uuid;
  v_entity_id := (v_new ->> 'id')::uuid;
  v_action := lower(tg_op);

  select coalesce(array_agg(keys.key order by keys.key), array[]::text[])
    into v_changed
  from jsonb_object_keys(v_new) as keys(key)
  where (v_old -> keys.key) is distinct from (v_new -> keys.key)
    and keys.key not in ('created_at', 'updated_at', 'created_by', 'updated_by');

  insert into public.audit_events (
    organization_id, actor_user_id, entity_table, entity_id, action, changed_fields
  ) values (
    v_org, (select auth.uid()), tg_table_name, v_entity_id, v_action, v_changed
  );
  return new;
end;
$function$;
revoke all on function private.record_audit_event() from public, anon, authenticated;

create trigger people_stamp_actor before insert or update on public.people
for each row execute function private.stamp_record_actor();
create trigger document_types_stamp_actor before insert or update on public.document_types
for each row execute function private.stamp_record_actor();
create trigger documents_stamp_actor before insert or update on public.documents
for each row execute function private.stamp_record_actor();

create trigger people_audit after insert or update on public.people
for each row execute function private.record_audit_event();
create trigger document_types_audit after insert or update on public.document_types
for each row execute function private.record_audit_event();
create trigger documents_audit after insert or update on public.documents
for each row execute function private.record_audit_event();

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.people enable row level security;
alter table public.document_types enable row level security;
alter table public.documents enable row level security;
alter table public.audit_events enable row level security;

revoke all on table public.organizations, public.organization_members, public.people,
  public.document_types, public.documents, public.audit_events from anon, authenticated;
grant select on table public.organizations, public.organization_members to authenticated;
grant select, insert, update on table public.people, public.document_types, public.documents to authenticated;
grant select on table public.audit_events to authenticated;

drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations
for select to authenticated
using (private.has_org_role(id, array['owner', 'manager', 'editor', 'viewer']));

drop policy if exists organization_members_self_read on public.organization_members;
create policy organization_members_self_read on public.organization_members
for select to authenticated
using (user_id = (select auth.uid()) and is_active);

create policy people_member_read on public.people
for select to authenticated
using (private.has_org_role(organization_id, array['owner', 'manager', 'editor', 'viewer']));
create policy people_editor_insert on public.people
for insert to authenticated
with check (private.has_org_role(organization_id, array['owner', 'manager', 'editor']));
create policy people_editor_update on public.people
for update to authenticated
using (private.has_org_role(organization_id, array['owner', 'manager', 'editor']))
with check (private.has_org_role(organization_id, array['owner', 'manager', 'editor']));

create policy document_types_member_read on public.document_types
for select to authenticated
using (private.has_org_role(organization_id, array['owner', 'manager', 'editor', 'viewer']));
create policy document_types_editor_insert on public.document_types
for insert to authenticated
with check (private.has_org_role(organization_id, array['owner', 'manager', 'editor']));
create policy document_types_editor_update on public.document_types
for update to authenticated
using (private.has_org_role(organization_id, array['owner', 'manager', 'editor']))
with check (private.has_org_role(organization_id, array['owner', 'manager', 'editor']));

create policy documents_member_read on public.documents
for select to authenticated
using (private.has_org_role(organization_id, array['owner', 'manager', 'editor', 'viewer']));
create policy documents_editor_insert on public.documents
for insert to authenticated
with check (private.has_org_role(organization_id, array['owner', 'manager', 'editor']));
create policy documents_editor_update on public.documents
for update to authenticated
using (private.has_org_role(organization_id, array['owner', 'manager', 'editor']))
with check (private.has_org_role(organization_id, array['owner', 'manager', 'editor']));

create policy audit_managers_read on public.audit_events
for select to authenticated
using (private.has_org_role(organization_id, array['owner', 'manager']));
