-- Lifevault: Dokumente, Volltextsuche, privater Speicher, RLS (nur eigene Daten)
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  status text not null default 'processing' check (status in ('processing','ready','error')),
  error text,
  cluster text,
  title text,
  doc_type text,
  sender text,
  doc_date date,
  received_at timestamptz not null default now(),
  summary text,
  key_facts jsonb not null default '[]'::jsonb,
  deadlines jsonb not null default '[]'::jsonb,
  amounts jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  full_text text,
  fts tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_user_idx on public.documents (user_id, received_at desc);
create index documents_cluster_idx on public.documents (user_id, cluster);
create index documents_fts_idx on public.documents using gin (fts);

create or replace function public.documents_fts_update() returns trigger
language plpgsql set search_path = public as $$
begin
  new.fts := to_tsvector('german', coalesce(new.title,'') || ' ' || coalesce(new.sender,'') || ' ' || coalesce(new.doc_type,'') || ' ' || coalesce(new.summary,'') || ' ' || coalesce(array_to_string(new.tags,' '),'') || ' ' || coalesce(new.key_facts::text,'') || ' ' || coalesce(new.full_text,''));
  new.updated_at := now();
  return new;
end $$;
create trigger documents_fts before insert or update on public.documents for each row execute function public.documents_fts_update();

alter table public.documents enable row level security;
create policy "own documents select" on public.documents for select to authenticated using (user_id = (select auth.uid()));
create policy "own documents insert" on public.documents for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own documents update" on public.documents for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own documents delete" on public.documents for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.search_documents(q text, max_results int default 8)
returns setof public.documents
language sql stable security invoker set search_path = public
as $$
  select d.* from public.documents d
  where d.status = 'ready' and d.fts @@ websearch_to_tsquery('german', q)
  order by ts_rank(d.fts, websearch_to_tsquery('german', q)) desc
  limit greatest(1, least(max_results, 20));
$$;

insert into storage.buckets (id, name, public, file_size_limit) values ('documents', 'documents', false, 52428800)
on conflict (id) do nothing;
create policy "own files read" on storage.objects for select to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files insert" on storage.objects for insert to authenticated with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files delete" on storage.objects for delete to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
