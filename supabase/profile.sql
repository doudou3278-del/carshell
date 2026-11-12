-- =====================================================================
-- v3：个人主页（设备档案：昵称 + 头像），在 submit.sql 之后运行一次。
-- =====================================================================

create table if not exists public.cs_profiles (
  owner_hash text primary key,
  public_id  text not null unique,
  nickname   text not null check (char_length(nickname) between 1 and 20),
  avatar     text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.cs_profiles enable row level security;   -- only via functions
revoke all on public.cs_profiles from anon, authenticated;

-- New comments / cars automatically carry the device's avatar.
create or replace function public.cs_fill_avatar() returns trigger
language plpgsql security definer set search_path = public as $$
declare h text;
begin
  h := case when tg_table_name = 'cs_comments' then new.token_hash else new.owner_hash end;
  if h <> '' then
    new.avatar := coalesce((select avatar from cs_profiles where owner_hash = h and avatar <> ''), new.avatar);
  end if;
  return new;
end $$;
drop trigger if exists cs_comments_avatar on public.cs_comments;
create trigger cs_comments_avatar before insert on public.cs_comments for each row execute function public.cs_fill_avatar();
drop trigger if exists cs_cars_avatar on public.cs_cars;
create trigger cs_cars_avatar before insert on public.cs_cars for each row execute function public.cs_fill_avatar();

create or replace function public.cs_get_profile(p_token text)
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('public_id', left(cs_hash(p_token), 8), 'nickname', p.nickname, 'avatar', p.avatar)
  from (select 1) x left join cs_profiles p on p.owner_hash = cs_hash(p_token)
$$;

-- Save nickname/avatar and apply them to everything this device has posted.
create or replace function public.cs_save_profile(p_token text, p_nickname text, p_avatar text)
returns json
language plpgsql security definer set search_path = public as $$
declare h text; n text := btrim(coalesce(p_nickname,'')); a text := coalesce(p_avatar,'');
begin
  if p_token is null or char_length(p_token) < 24 then raise exception '无效的设备标识'; end if;
  if char_length(n) not between 1 and 20 then raise exception '昵称需要 1–20 个字'; end if;
  if a <> '' and a !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/carshell/uploads/[A-Za-z0-9_./-]+$'
    then raise exception '头像地址不正确'; end if;
  h := cs_hash(p_token);
  if (select count(*) from cs_profiles where updated_at > now() - interval '1 minute') >= 30 then raise exception '操作太频繁'; end if;
  insert into cs_profiles (owner_hash, public_id, nickname, avatar) values (h, left(h, 8), n, a)
  on conflict (owner_hash) do update set nickname = excluded.nickname, avatar = excluded.avatar, updated_at = now();
  update cs_cars set by_name = n, avatar = a where owner_hash = h;
  update cs_comments set nickname = n, avatar = a where token_hash = h;
  return json_build_object('public_id', left(h, 8), 'nickname', n, 'avatar', a);
end $$;

-- Admin: attach a mini-program-era uploader's cars to a device (so they show in that device's 我的车库).
create or replace function public.cs_claim(p_by_id text, p_token text)
returns int
language plpgsql security definer set search_path = public as $$
declare h text; n int;
begin
  if not public.is_admin() then raise exception '仅管理员可操作'; end if;
  if p_token is null or char_length(p_token) < 24 then raise exception '无效的设备标识'; end if;
  h := cs_hash(p_token);
  update cs_cars set owner_hash = h, by_id = left(h, 8) where by_id = p_by_id and owner_hash = '';
  get diagnostics n = row_count;
  return n;
end $$;

-- Comments posted from this device (for the 我的评论 list).
create or replace function public.cs_my_comments(p_token text)
returns table (id uuid, car_id text, content text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, car_id, content, created_at from cs_comments where token_hash = cs_hash(p_token) order by created_at desc limit 200
$$;

revoke execute on function public.cs_get_profile(text), public.cs_save_profile(text,text,text), public.cs_claim(text,text), public.cs_my_comments(text) from public;
grant execute on function public.cs_get_profile(text), public.cs_save_profile(text,text,text), public.cs_claim(text,text), public.cs_my_comments(text) to anon, authenticated;
