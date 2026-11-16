-- 网站访问计数：累计访问次数、独立访客、今日访客（按北京时间算天）
-- 访客按设备 token 区分，只存 sha256（cs_hash），不存 IP

create table if not exists public.cs_site_stats (
  id int primary key default 1 check (id = 1),
  visits bigint not null default 0,
  since timestamptz not null default now()
);
insert into public.cs_site_stats (id) values (1) on conflict do nothing;

create table if not exists public.cs_site_visitors (
  token_hash text primary key,
  first_day date not null,
  last_day date not null,
  visits int not null default 0
);

create table if not exists public.cs_site_daily (
  day date not null,
  token_hash text not null,
  primary key (day, token_hash)
);

alter table public.cs_site_stats enable row level security;
alter table public.cs_site_visitors enable row level security;
alter table public.cs_site_daily enable row level security;
revoke all on public.cs_site_stats, public.cs_site_visitors, public.cs_site_daily from anon, authenticated;

create or replace function public.cs_site_today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Shanghai')::date
$$;

-- p_count = true 时记一次访问；false 时只读数字
create or replace function public.cs_site_visit(p_token text, p_count boolean default true)
returns json language plpgsql security definer set search_path = public as $$
declare h text; d date := cs_site_today();
begin
  if p_count and p_token is not null and length(p_token) between 16 and 128 then
    h := cs_hash(p_token);
    update cs_site_stats set visits = visits + 1 where id = 1;
    insert into cs_site_visitors (token_hash, first_day, last_day, visits) values (h, d, d, 1)
      on conflict (token_hash) do update set last_day = d, visits = cs_site_visitors.visits + 1;
    insert into cs_site_daily (day, token_hash) values (d, h) on conflict do nothing;
  end if;
  return json_build_object(
    'visits', (select visits from cs_site_stats where id = 1),
    'visitors', (select count(*) from cs_site_visitors),
    'today', (select count(*) from cs_site_daily where day = d),
    'since', (select since from cs_site_stats where id = 1)
  );
end $$;

revoke execute on function public.cs_site_visit(text, boolean) from public;
grant execute on function public.cs_site_visit(text, boolean), public.cs_site_today() to anon, authenticated;
