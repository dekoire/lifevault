-- Chat-Verlauf: Gespräche anheften (oben) und merken (Stern). RLS „own chats“ gilt unverändert.
alter table public.chats add column if not exists pinned boolean not null default false;
alter table public.chats add column if not exists starred boolean not null default false;
