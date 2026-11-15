-- =====================================================================
-- v4：微信登录（小程序 wx.login 一次性登录码 → Edge Function wx-login → code2session）
-- 在 profile.sql 之后运行一次。本文件里的函数只允许 service_role（Edge Function）调用。
-- =====================================================================

-- One account per WeChat user (mini-program openid). The token is the shared device credential.
create table if not exists public.cs_wx_accounts (
  openid     text primary key,
  token      text not null,
  created_at timestamptz not null default now(),
  last_login timestamptz not null default now()
);
alter table public.cs_wx_accounts enable row level security;   -- no policies
revoke all on public.cs_wx_accounts from anon, authenticated;

-- Last 8 chars of the original commenter's openid (cars already keep this in by_id).
alter table public.cs_comments add column if not exists wx_suffix text not null default '';
revoke select (wx_suffix) on public.cs_comments from anon, authenticated;

-- Merge a device identity into the WeChat account and claim mini-program-era content.
create or replace function public.cs_wx_merge(p_openid text, p_old_token text, p_new_token text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  nh text := cs_hash(p_new_token);
  oh text := case when char_length(coalesce(p_old_token,'')) >= 24 then cs_hash(p_old_token) else '' end;
  sfx text := right(p_openid, 8);
  cars_n int := 0; comments_n int := 0; legacy_name text; legacy_avatar text;
begin
  -- 1) bring along what this device did before logging in (if it isn't already another WeChat account's token)
  if oh <> '' and oh <> nh and not exists (select 1 from cs_wx_accounts where cs_hash(token) = oh) then
    update cs_cars set owner_hash = nh, by_id = left(nh, 8) where owner_hash = oh;
    update cs_comments set token_hash = nh where token_hash = oh;
    insert into cs_likes (car_id, token_hash) select car_id, nh from cs_likes where token_hash = oh on conflict do nothing;
    delete from cs_likes where token_hash = oh;
    if not exists (select 1 from cs_profiles where owner_hash = nh) then
      update cs_profiles set owner_hash = nh, public_id = left(nh, 8) where owner_hash = oh;
    else
      delete from cs_profiles where owner_hash = oh;
    end if;
  end if;

  -- 2) claim mini-program-era cars and comments of this WeChat user
  select by_name, avatar into legacy_name, legacy_avatar
    from cs_cars where by_id = sfx and owner_hash = '' order by created_ms desc limit 1;
  update cs_cars set owner_hash = nh, by_id = left(nh, 8) where by_id = sfx and owner_hash = '';
  get diagnostics cars_n = row_count;
  update cs_comments set token_hash = nh where wx_suffix = sfx and token_hash = '';
  get diagnostics comments_n = row_count;

  -- 3) make sure the account has a profile (default: the mini-program nickname/avatar)
  if not exists (select 1 from cs_profiles where owner_hash = nh) then
    select nickname, avatar into legacy_name, legacy_avatar from (
      select legacy_name as nickname, legacy_avatar as avatar where legacy_name is not null
      union all select c.nickname, c.avatar from cs_comments c where c.token_hash = nh
      union all select '车友' || right(nh, 4), ''
    ) s limit 1;
    insert into cs_profiles (owner_hash, public_id, nickname, avatar)
    values (nh, left(nh, 8), left(legacy_name, 20), coalesce(legacy_avatar, ''));
  end if;
  update cs_cars c set by_name = p.nickname, avatar = p.avatar from cs_profiles p where p.owner_hash = nh and c.owner_hash = nh;

  -- 4) recompute like totals touched by the merge
  update cs_cars c set like_count = c.base_likes + (select count(*) from cs_likes l where l.car_id = c.id)
    where c.id in (select car_id from cs_likes where token_hash = nh);

  return (select json_build_object('public_id', p.public_id, 'nickname', p.nickname, 'avatar', p.avatar,
          'claimed_cars', cars_n, 'claimed_comments', comments_n) from cs_profiles p where p.owner_hash = nh);
end $$;

revoke execute on function public.cs_wx_merge(text,text,text) from public, anon, authenticated;
grant execute on function public.cs_wx_merge(text,text,text) to service_role;
