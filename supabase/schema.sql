-- =====================================================================
-- 头蚊字 Dou 车壳库 — Supabase schema（独立项目，与 douzi-shop 无关）
-- 在 Supabase → SQL Editor 运行一次，再运行 seed.sql 导入原小程序数据。
-- =====================================================================

-- Who may moderate (delete comments, hide cars)
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;   -- no policies: not readable through the API

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()); $$;
grant execute on function public.is_admin() to anon, authenticated;

create table if not exists public.cs_cars (
  id          text primary key,
  name        text not null,
  brand       text not null default '其他',
  model       text not null default '其他',
  scale       text not null default '1/28',
  wide        boolean not null default false,
  wide_link   text not null default '',
  len numeric, wb numeric, ft numeric, rt numeric,
  cover text not null default '', thumb text not null default '', ratio numeric default 1.33,
  finished text not null default '', scan text not null default '',
  parts jsonb not null default '[]'::jsonb,
  note text not null default '',
  by_name text not null default '车友', by_id text not null default '', avatar text not null default '',
  views int not null default 0,
  base_likes int not null default 0,
  like_count int not null default 0,
  week int not null default 0, week_key text not null default '',
  created_ms bigint not null default (extract(epoch from now())*1000)::bigint,
  status text not null default 'active' check (status in ('active','hidden'))
);

create table if not exists public.cs_comments (
  id uuid primary key default gen_random_uuid(),
  car_id text not null references public.cs_cars(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 300),
  nickname text not null check (char_length(nickname) between 1 and 20),
  avatar text not null default '',
  is_admin boolean not null default false,
  token_hash text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists cs_comments_car on public.cs_comments(car_id, created_at);

create table if not exists public.cs_likes (
  car_id text not null references public.cs_cars(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  primary key (car_id, token_hash)
);

-- ---------- Row level security ----------
alter table public.cs_cars     enable row level security;
alter table public.cs_comments enable row level security;
alter table public.cs_likes    enable row level security;   -- no policies: only via functions below

drop policy if exists "cs read cars"  on public.cs_cars;
drop policy if exists "cs admin cars" on public.cs_cars;
create policy "cs read cars"  on public.cs_cars for select using (status = 'active' or public.is_admin());
create policy "cs admin cars" on public.cs_cars for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "cs read comments"   on public.cs_comments;
drop policy if exists "cs admin comments"  on public.cs_comments;
create policy "cs read comments"  on public.cs_comments for select using (true);
create policy "cs admin comments" on public.cs_comments for delete using (public.is_admin());

-- Hide the per-device token hash from the public API.
revoke all on public.cs_comments from anon, authenticated;
grant select (id, car_id, content, nickname, avatar, is_admin, created_at) on public.cs_comments to anon, authenticated;
grant delete on public.cs_comments to authenticated;
revoke all on public.cs_likes from anon, authenticated;

-- ---------- helpers ----------
create or replace function public.cs_hash(p_token text) returns text
language sql immutable as $$ select encode(sha256(convert_to(coalesce(p_token,''), 'UTF8')), 'hex') $$;

-- Post a comment. Anyone may comment with a nickname; a random per-device token proves ownership later.
create or replace function public.cs_add_comment(p_car text, p_content text, p_nickname text, p_token text)
returns public.cs_comments
language plpgsql security definer set search_path = public as $$
declare h text; c text; n text; rec public.cs_comments;
begin
  if p_token is null or char_length(p_token) < 24 then raise exception '无效的设备标识'; end if;
  h := cs_hash(p_token);
  c := btrim(coalesce(p_content,''));
  n := btrim(coalesce(p_nickname,''));
  if char_length(c) = 0 then raise exception '评论不能为空'; end if;
  if char_length(c) > 300 then raise exception '评论最多 300 字'; end if;
  if char_length(n) = 0 or char_length(n) > 20 then raise exception '昵称需要 1–20 个字'; end if;
  if not exists (select 1 from cs_cars where id = p_car and status = 'active') then raise exception '车壳不存在'; end if;
  if (select count(*) from cs_comments where token_hash = h and created_at > now() - interval '1 minute') >= 3
    then raise exception '发得太快了，请稍等一分钟'; end if;
  if (select count(*) from cs_comments where created_at > now() - interval '10 minutes') >= 60
    then raise exception '评论太多了，请稍后再试'; end if;
  insert into cs_comments (car_id, content, nickname, is_admin, token_hash)
  values (p_car, c, n, public.is_admin(), h) returning * into rec;
  rec.token_hash := '';
  return rec;
end $$;

create or replace function public.cs_delete_comment(p_id uuid, p_token text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from cs_comments where id = p_id and (token_hash = cs_hash(p_token) or public.is_admin());
  return found;
end $$;

-- Toggle a like for this device; returns the new total.
create or replace function public.cs_toggle_like(p_car text, p_token text)
returns json
language plpgsql security definer set search_path = public as $$
declare h text; was boolean; total int;
begin
  if p_token is null or char_length(p_token) < 24 then raise exception '无效的设备标识'; end if;
  h := cs_hash(p_token);
  delete from cs_likes where car_id = p_car and token_hash = h;
  was := found;
  if not was then
    if not exists (select 1 from cs_cars where id = p_car and status = 'active') then raise exception '车壳不存在'; end if;
    insert into cs_likes (car_id, token_hash) values (p_car, h);
  end if;
  update cs_cars set like_count = base_likes + (select count(*) from cs_likes where car_id = p_car)
    where id = p_car returning like_count into total;
  return json_build_object('liked', not was, 'count', total);
end $$;

create or replace function public.cs_my_likes(p_token text)
returns setof text
language sql stable security definer set search_path = public as $$
  select car_id from cs_likes where token_hash = cs_hash(p_token)
$$;

create or replace function public.cs_view(p_car text)
returns void
language sql security definer set search_path = public as $$
  update cs_cars set views = views + 1 where id = p_car and status = 'active'
$$;

revoke execute on function public.cs_add_comment(text,text,text,text), public.cs_delete_comment(uuid,text),
  public.cs_toggle_like(text,text), public.cs_my_likes(text), public.cs_view(text) from public;
grant execute on function public.cs_add_comment(text,text,text,text), public.cs_delete_comment(uuid,text),
  public.cs_toggle_like(text,text), public.cs_my_likes(text), public.cs_view(text), public.cs_hash(text) to anon, authenticated;

-- =====================================================================
-- 最后一步：在 Authentication → Users 里建好你自己的账号后，单独运行：
-- insert into public.admins (user_id) select id from auth.users where email = '你的邮箱';
-- =====================================================================
