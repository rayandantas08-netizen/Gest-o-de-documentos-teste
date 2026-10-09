-- Impede que um documento de uma organização aponte para pessoa/tipo de outra.
alter table public.people
  add constraint people_organization_id_id_unique unique (organization_id, id);

alter table public.document_types
  add constraint document_types_organization_id_id_unique unique (organization_id, id);

alter table public.documents
  drop constraint if exists documents_person_id_fkey;

alter table public.documents
  add constraint documents_person_same_org_fkey
  foreign key (organization_id, person_id)
  references public.people (organization_id, id)
  on delete restrict;

alter table public.documents
  drop constraint if exists documents_document_type_id_fkey;

alter table public.documents
  add constraint documents_type_same_org_fkey
  foreign key (organization_id, document_type_id)
  references public.document_types (organization_id, id)
  on delete restrict;
