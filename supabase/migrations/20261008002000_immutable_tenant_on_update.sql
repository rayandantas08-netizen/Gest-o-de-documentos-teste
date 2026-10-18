-- Preserva a organização original do registro mesmo em chamadas diretas à Data API.
create or replace function private.prevent_organization_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;
revoke all on function private.prevent_organization_change() from public, anon, authenticated;

create trigger people_organization_immutable
before update of organization_id on public.people
for each row execute function private.prevent_organization_change();
create trigger document_types_organization_immutable
before update of organization_id on public.document_types
for each row execute function private.prevent_organization_change();
create trigger documents_organization_immutable
before update of organization_id on public.documents
for each row execute function private.prevent_organization_change();
