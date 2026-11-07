-- LiquidChat database schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default 'Новый пользователь',
  bio text not null default '',
  avatar_url text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('dm','group','channel')),
  username text unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_members (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key(chat_id,user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (length(content) between 1 and 10000),
  created_at timestamptz not null default now()
);
create index if not exists messages_chat_created_idx on public.messages(chat_id,created_at);

-- Ban list stores normalized identifiers. Only service role / trusted server may read or write.
-- Explicit admin allowlist. Username alone never grants administrator privileges.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;

create table if not exists public.banned_identities (
  id bigint generated always as identity primary key,
  email text,
  phone text,
  banned_user_id uuid,
  reason text,
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);
alter table public.banned_identities enable row level security;

-- Reject a new Auth account if its email or phone is banned.
create or replace function public.reject_banned_signup()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if exists (
    select 1 from public.banned_identities b
    where (new.email is not null and lower(b.email)=lower(new.email))
       or (new.phone is not null and b.phone=new.phone)
  ) then
    raise exception 'This email address or phone number cannot be used to register.';
  end if;
  return new;
end;
$$;
drop trigger if exists liquidchat_ban_signup on auth.users;
create trigger liquidchat_ban_signup before insert on auth.users
for each row execute function public.reject_banned_signup();

alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;

-- SECURITY DEFINER helpers avoid recursive RLS checks on chat_members.
create or replace function public.is_chat_member(target_chat uuid, target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.chat_members m where m.chat_id=target_chat and m.user_id=target_user);
$$;
create or replace function public.has_chat_role(target_chat uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.chat_members m where m.chat_id=target_chat and m.user_id=auth.uid() and m.role=any(allowed_roles));
$$;

create policy "Profiles are searchable by signed-in users" on public.profiles
for select to authenticated using (true);
create policy "Users create own profile" on public.profiles
for insert to authenticated with check (auth.uid()=id);
create policy "Users update own profile" on public.profiles
for update to authenticated using (auth.uid()=id) with check (auth.uid()=id);

create policy "Members can see chats" on public.chats
for select to authenticated using (
  public.is_chat_member(id)
);
create policy "Authenticated users create chats" on public.chats
for insert to authenticated with check (created_by=auth.uid());
create policy "Chat owners update chats" on public.chats
for update to authenticated using (
  public.has_chat_role(id, array['owner','admin'])
) with check (
  public.has_chat_role(id, array['owner','admin'])
);

create policy "Members see membership" on public.chat_members
for select to authenticated using (
  public.is_chat_member(chat_id)
);
create policy "Creator adds members" on public.chat_members
for insert to authenticated with check (
  user_id=auth.uid()
  or exists(select 1 from public.chats c where c.id=chat_id and c.created_by=auth.uid())
);

create policy "Chat members read messages" on public.messages
for select to authenticated using (
  public.is_chat_member(messages.chat_id)
);
create policy "Members send messages" on public.messages
for insert to authenticated with check (
  sender_id=auth.uid() and public.is_chat_member(messages.chat_id) and exists(select 1 from public.chats c where c.id=messages.chat_id and c.type <> 'channel')
  or sender_id=auth.uid() and public.has_chat_role(messages.chat_id, array['owner','admin'])
);

-- Public avatar bucket. Users may upload only into their own UUID folder.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('avatars','avatars',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "Avatar images are public" on storage.objects for select using (bucket_id='avatars');
create policy "Upload own avatar" on storage.objects for insert to authenticated
with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Update own avatar" on storage.objects for update to authenticated
using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);

-- Enable Realtime for live messages (ignore error if already added).
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; when undefined_object then null;
end $$;
