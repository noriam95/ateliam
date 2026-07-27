alter table public.organization_systems
  add column if not exists modality text;

update public.organization_systems
set modality = case
  when modality = 'Documento' then 'Documentos e comunicações'
  else 'Sistemas corporativos'
end
where modality is null
   or modality not in (
     'Sistemas corporativos',
     'Ferramentas auxiliares',
     'Documentos e comunicações',
     'Fontes externas'
   );

alter table public.organization_systems
  alter column modality set default 'Sistemas corporativos',
  alter column modality set not null;

alter table public.organization_systems
  drop constraint if exists organization_systems_modality_check;

alter table public.organization_systems
  add constraint organization_systems_modality_check
  check (modality in (
    'Sistemas corporativos',
    'Ferramentas auxiliares',
    'Documentos e comunicações',
    'Fontes externas'
  ));

notify pgrst, 'reload schema';
