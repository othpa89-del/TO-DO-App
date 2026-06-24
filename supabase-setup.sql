-- ===========================================================================
--  TO DO APP – Datenbank-Setup für Supabase
--  Supabase-Projekt -> SQL Editor -> dieses Skript einfügen -> RUN
-- ===========================================================================

-- 1) Tabelle: ein Schlüssel/Wert pro Nutzer
create table if not exists public.kv (
  user_id    uuid        not null references auth.users on delete cascade,
  key        text        not null,
  value      text,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- 2) Zugriffsschutz: jeder sieht/ändert NUR seine eigenen Zeilen
alter table public.kv enable row level security;

drop policy if exists "kv_select_own" on public.kv;
drop policy if exists "kv_insert_own" on public.kv;
drop policy if exists "kv_update_own" on public.kv;
drop policy if exists "kv_delete_own" on public.kv;

create policy "kv_select_own" on public.kv
  for select using (auth.uid() = user_id);
create policy "kv_insert_own" on public.kv
  for insert with check (auth.uid() = user_id);
create policy "kv_update_own" on public.kv
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "kv_delete_own" on public.kv
  for delete using (auth.uid() = user_id);

-- 3) Realtime für Live-Updates aktivieren
alter publication supabase_realtime add table public.kv;
