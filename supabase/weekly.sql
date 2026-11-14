-- =====================================================================
-- v6：周榜（按北京时间周一为一周的开始），在 chassis.sql 之后运行一次。
-- =====================================================================
create table if not exists public.cs_weekly_views (
  car_id text not null references public.cs_cars(id) on delete cascade,
  week_key text not null,
  views int not null default 0,
  primary key (car_id, week_key)
);
alter table public.cs_weekly_views enable row level security;
revoke all on public.cs_weekly_views from anon, authenticated;

create or replace function public.cs_week_key() returns text language sql stable as $$
  select 'w' || to_char(date_trunc('week', (now() at time zone 'Asia/Shanghai')), 'YYYYMMDD')
$$;

-- carry over the mini program's weekly counters from the export
insert into public.cs_weekly_views (car_id, week_key, views)
select id, week_key, week from public.cs_cars where week_key <> '' and week > 0
on conflict do nothing;

create or replace function public.cs_view(p_car text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update cs_cars set views = views + 1 where id = p_car and status = 'active';
  if found then
    insert into cs_weekly_views (car_id, week_key, views) values (p_car, cs_week_key(), 1)
    on conflict (car_id, week_key) do update set views = cs_weekly_views.views + 1;
  end if;
end $$;

create or replace function public.cs_week_top(p_limit int default 50)
returns table (car_id text, views int, week_key text)
language sql stable security definer set search_path = public as $$
  select w.car_id, w.views, w.week_key from cs_weekly_views w join cs_cars c on c.id = w.car_id and c.status = 'active'
  where w.week_key = cs_week_key() order by w.views desc limit least(greatest(p_limit, 1), 100)
$$;

revoke execute on function public.cs_view(text), public.cs_week_top(int) from public;
grant execute on function public.cs_view(text), public.cs_week_top(int), public.cs_week_key() to anon, authenticated;
