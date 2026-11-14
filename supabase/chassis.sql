-- =====================================================================
-- v5：车架资料库（受邀填写，公开只读）。在 wechat.sql 之后运行一次。
-- 规则照搬小程序 cloudfunctions/chassisData：管理员生成单次邀请口令（7 天有效），
-- 受邀者绑定到自己的设备/微信账号后可直接发布；管理员可下架资料、收回填写权限。
-- =====================================================================

create table if not exists public.cs_chassis (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  brand text not null check (char_length(brand) between 1 and 30),
  version text not null check (char_length(version) between 1 and 60),
  source_type text not null check (source_type in ('manufacturer','measured','setup')),
  source_note text not null check (char_length(source_note) between 1 and 300),
  source_url text not null default '' check (source_url = '' or source_url ~* '^https://\S+$'),
  wheelbase numeric not null check (wheelbase between 50 and 500),
  front_track numeric check (front_track between 30 and 400), rear_track numeric check (rear_track between 30 and 400),
  front_camber numeric check (front_camber between -20 and 20), rear_camber numeric check (rear_camber between -20 and 20),
  caster numeric check (caster between -30 and 30),
  front_toe numeric check (front_toe between -10 and 10), rear_toe numeric check (rear_toe between -10 and 10),
  contributor text not null,
  author_hash text not null default '',
  status text not null default 'published' check (status in ('published','hidden')),
  updated_at timestamptz not null default now()
);
create table if not exists public.cs_chassis_invites (
  code_hash text primary key, expires_at timestamptz not null, used_by text not null default '', used_at timestamptz
);
create table if not exists public.cs_chassis_members (
  owner_hash text primary key, public_id text not null unique, display_name text not null check (char_length(display_name) between 1 and 20),
  active boolean not null default true, joined_at timestamptz not null default now()
);
alter table public.cs_chassis enable row level security;
alter table public.cs_chassis_invites enable row level security;
alter table public.cs_chassis_members enable row level security;
drop policy if exists "cs read chassis" on public.cs_chassis;
create policy "cs read chassis" on public.cs_chassis for select using (status = 'published' or public.is_admin());
revoke all on public.cs_chassis, public.cs_chassis_invites, public.cs_chassis_members from anon, authenticated;
grant select (id, name, brand, version, source_type, source_note, source_url, wheelbase, front_track, rear_track,
  front_camber, rear_camber, caster, front_toe, rear_toe, contributor, status, updated_at) on public.cs_chassis to anon, authenticated;

create or replace function public.cs_chassis_account(p_token text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('admin', public.is_admin(),
    'editor', public.is_admin() or exists (select 1 from cs_chassis_members where owner_hash = cs_hash(p_token) and active),
    'name', (select display_name from cs_chassis_members where owner_hash = cs_hash(p_token) and active))
$$;

create or replace function public.cs_chassis_invite()
returns text language plpgsql security definer set search_path = public as $$
declare code text := replace(gen_random_uuid()::text, '-', '');
begin
  if not public.is_admin() then raise exception '仅管理员可邀请'; end if;
  insert into cs_chassis_invites (code_hash, expires_at) values (cs_hash(code), now() + interval '7 days');
  return code;
end $$;

create or replace function public.cs_chassis_redeem(p_token text, p_code text, p_name text)
returns boolean language plpgsql security definer set search_path = public as $$
declare h text; inv cs_chassis_invites; n text := btrim(coalesce(p_name,''));
begin
  if p_token is null or char_length(p_token) < 24 then raise exception '无效的设备标识'; end if;
  if coalesce(p_code,'') !~ '^[a-f0-9]{32}$' then raise exception '邀请口令格式不正确'; end if;
  if char_length(n) not between 1 and 20 then raise exception '署名需要 1–20 个字'; end if;
  h := cs_hash(p_token);
  select * into inv from cs_chassis_invites where code_hash = cs_hash(p_code) for update;
  if not found or inv.expires_at < now() then raise exception '邀请已失效，请联系管理员'; end if;
  if inv.used_by <> '' and inv.used_by <> h then raise exception '邀请口令已使用'; end if;
  if inv.used_by = h then return true; end if;            -- a consumed code never re-activates a revoked member
  if exists (select 1 from cs_chassis_members where owner_hash = h and not active) then raise exception '填写权限已被收回，请联系管理员'; end if;
  insert into cs_chassis_members (owner_hash, public_id, display_name) values (h, left(h, 12), n)
    on conflict (owner_hash) do update set display_name = excluded.display_name;
  update cs_chassis_invites set used_by = h, used_at = now() where code_hash = inv.code_hash;
  return true;
end $$;

create or replace function public.cs_chassis_submit(p_token text, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare h text := cs_hash(coalesce(p_token,'')); who text; new_id uuid;
  num numeric;
begin
  if public.is_admin() then who := '车壳库管理员';
  else select display_name into who from cs_chassis_members where owner_hash = h and active;
       if who is null then raise exception '仅受邀人员可以填写'; end if;
  end if;
  if (select count(*) from cs_chassis where author_hash = h and updated_at > now() - interval '1 hour') >= 10 then raise exception '提交太频繁，请稍后再试'; end if;
  insert into cs_chassis (name, brand, version, source_type, source_note, source_url, wheelbase, front_track, rear_track,
    front_camber, rear_camber, caster, front_toe, rear_toe, contributor, author_hash)
  values (btrim(p->>'name'), btrim(p->>'brand'), btrim(p->>'version'), p->>'sourceType', btrim(p->>'sourceNote'), btrim(coalesce(p->>'sourceUrl','')),
    round(nullif(p->>'wheelbase','')::numeric, 1), round(nullif(p->>'frontTrack','')::numeric, 1), round(nullif(p->>'rearTrack','')::numeric, 1),
    round(nullif(p->>'frontCamber','')::numeric, 1), round(nullif(p->>'rearCamber','')::numeric, 1), round(nullif(p->>'caster','')::numeric, 1),
    round(nullif(p->>'frontToe','')::numeric, 1), round(nullif(p->>'rearToe','')::numeric, 1), who, h)
  returning id into new_id;
  return new_id;
exception when check_violation or not_null_violation or invalid_text_representation then
  raise exception '请检查填写内容：名称、厂商、版本、来源必填；尺寸或角度超出合理范围';
end $$;

create or replace function public.cs_chassis_mine(p_token text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from cs_chassis where author_hash = cs_hash(p_token)
$$;

create or replace function public.cs_chassis_hide(p_id uuid, p_hidden boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '仅管理员可下架资料'; end if;
  update cs_chassis set status = case when p_hidden then 'hidden' else 'published' end, updated_at = now() where id = p_id;
  return found;
end $$;

create or replace function public.cs_chassis_members_list()
returns table (public_id text, display_name text, active boolean, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '仅管理员可管理填写权限'; end if;
  return query select m.public_id, m.display_name, m.active, m.joined_at from cs_chassis_members m order by m.joined_at desc limit 100;
end $$;

create or replace function public.cs_chassis_revoke(p_public_id text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '仅管理员可管理填写权限'; end if;
  update cs_chassis_members set active = false where public_id = p_public_id;
  return found;
end $$;

revoke execute on function public.cs_chassis_account(text), public.cs_chassis_invite(), public.cs_chassis_redeem(text,text,text),
  public.cs_chassis_submit(text,jsonb), public.cs_chassis_mine(text), public.cs_chassis_hide(uuid,boolean),
  public.cs_chassis_members_list(), public.cs_chassis_revoke(text) from public;
grant execute on function public.cs_chassis_account(text), public.cs_chassis_invite(), public.cs_chassis_redeem(text,text,text),
  public.cs_chassis_submit(text,jsonb), public.cs_chassis_mine(text), public.cs_chassis_hide(uuid,boolean),
  public.cs_chassis_members_list(), public.cs_chassis_revoke(text) to anon, authenticated;
