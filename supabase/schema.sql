
-- LIQUIDCHAT: создание и настройка структуры базы

-- 1. Создаём таблицы чатов
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  title text,
  type text not null default 'direct'
    check (type in ('direct', 'group', 'channel')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 2. Создаём таблицу участников
create table if not exists public.chat_members (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  unique (chat_id, user_id)
);

-- 3. Добавляем поддержку групповых сообщений
alter table public.messages
  add column if not exists chat_id uuid
  references public.chats(id) on delete cascade;

-- Старый receiver_id больше не обязателен
alter table public.messages
  alter column receiver_id drop not null;

-- 4. Индексы
create index if not exists idx_chat_members_user
  on public.chat_members(user_id);

create index if not exists idx_chat_members_chat
  on public.chat_members(chat_id);

create index if not exists idx_messages_chat
  on public.messages(chat_id, created_at);

create index if not exists idx_profiles_username
  on public.profiles(username);

-- 5. Функции проверки участия и прав
create or replace function public.is_chat_member(p_chat_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_members
    where chat_id = p_chat_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_chat(p_chat_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_members
    where chat_id = p_chat_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.is_chat_creator(p_chat_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chats
    where id = p_chat_id
      and created_by = auth.uid()
  );
$$;

-- 6. Включаем RLS
alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;

-- 7. Удаляем старые политики этих таблиц,
-- чтобы они не конфликтовали с новой схемой
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles', 'messages', 'chats', 'chat_members'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      p.policyname, p.schemaname, p.tablename
    );
  end loop;
end;
$$;

-- 8. Профили
create policy "Profiles readable"
on public.profiles
for select to authenticated
using (true);

create policy "Users create own profile"
on public.profiles
for insert to authenticated
with check (id = auth.uid());

create policy "Users update own profile"
on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- 9. Чаты
create policy "Members read chats"
on public.chats
for select to authenticated
using (public.is_chat_member(id));

create policy "Users create chats"
on public.chats
for insert to authenticated
with check (created_by = auth.uid());

-- 10. Участники чатов
create policy "Members read membership"
on public.chat_members
for select to authenticated
using (public.is_chat_member(chat_id));

create policy "Creators add members"
on public.chat_members
for insert to authenticated
with check (
  public.is_chat_creator(chat_id)
  or (
    user_id = auth.uid()
    and public.can_manage_chat(chat_id)
  )
);

-- 11. Сообщения
create policy "Members read messages"
on public.messages
for select to authenticated
using (public.is_chat_member(chat_id));

create policy "Members send messages"
on public.messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and chat_id is not null
  and public.is_chat_member(chat_id)
  and (
    not exists (
      select 1 from public.chats
      where id = chat_id and type = 'channel'
    )
    or public.can_manage_chat(chat_id)
  )
);

-- 12. Права на функции
grant execute on function public.is_chat_member(uuid)
to authenticated;

grant execute on function public.can_manage_chat(uuid)
to authenticated;

grant execute on function public.is_chat_creator(uuid)
to authenticated;
