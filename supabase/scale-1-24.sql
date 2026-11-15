-- 2026-11-15：车壳库统一改为 1/24（小程序时代投稿默认值 1/28 是错的），新投稿默认 1/24。
alter table public.cs_cars alter column scale set default '1/24';
update public.cs_cars set scale = '1/24' where scale = '1/28';
select scale, count(*) from public.cs_cars group by scale;
