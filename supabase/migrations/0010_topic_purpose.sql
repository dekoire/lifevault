alter table public.documents
  add column if not exists topic text,
  add column if not exists purpose text check (purpose in ('zu_erledigen','wichtig','info')),
  add column if not exists topic_manual boolean not null default false;
create index if not exists documents_cluster_topic_idx on public.documents (user_id, cluster, topic);
