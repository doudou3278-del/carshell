-- =====================================================================
-- v2：车友投稿（图片上传到 Storage 桶 carshell/uploads/，车壳直接上架，管理员可隐藏）
-- 在 schema.sql 之后运行一次。
-- =====================================================================

alter table public.cs_cars add column if not exists owner_hash text not null default '';

-- Owner hash must never be readable through the API.
revoke select on public.cs_cars from anon, authenticated;
grant select (id, name, brand, model, scale, wide, wide_link, len, wb, ft, rt, cover, thumb, ratio, finished, scan,
  parts, note, by_name, by_id, avatar, views, base_likes, like_count, week, week_key, created_ms, status)
  on public.cs_cars to anon, authenticated;
revoke insert, delete on public.cs_cars from anon;

-- ---------- Storage: public bucket, anyone may upload small images under uploads/ ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('carshell', 'carshell', true, 4194304, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 4194304, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "cs upload images" on storage.objects;
drop policy if exists "cs admin delete images" on storage.objects;
create policy "cs upload images" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'carshell' and (storage.foldername(name))[1] = 'uploads');
create policy "cs admin delete images" on storage.objects for delete to authenticated
  using (bucket_id = 'carshell' and public.is_admin());

-- ---------- Submit a car ----------
create or replace function public.cs_add_car(p jsonb, p_token text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  h text; new_id text;
  v_name text := btrim(coalesce(p->>'name',''));
  v_brand text := btrim(coalesce(p->>'brand','其他'));
  v_model text := btrim(coalesce(p->>'model','其他'));
  v_by text := btrim(coalesce(p->>'by',''));
  v_note text := btrim(coalesce(p->>'note',''));
  v_link text := btrim(coalesce(p->>'wideLink',''));
  v_wide boolean := coalesce((p->>'wide')::boolean, false);
  v_wb numeric := nullif(p->>'wb','')::numeric;
  v_ft numeric := nullif(p->>'ft','')::numeric;
  v_rt numeric := nullif(p->>'rt','')::numeric;
  v_len numeric := nullif(p->>'len','')::numeric;
  v_cover text := coalesce(p->>'cover',''); v_thumb text := coalesce(p->>'thumb','');
  v_finished text := coalesce(p->>'finished',''); v_scan text := coalesce(p->>'scan','');
  v_parts jsonb := coalesce(p->'parts','[]'::jsonb);
  u text;
begin
  if p_token is null or char_length(p_token) < 24 then raise exception '无效的设备标识'; end if;
  h := cs_hash(p_token);
  if char_length(v_name) not between 1 and 40 then raise exception '车壳名称需要 1–40 个字'; end if;
  if char_length(v_by) not between 1 and 20 then raise exception '昵称需要 1–20 个字'; end if;
  if char_length(v_brand) not between 1 and 10 or char_length(v_model) not between 1 and 20 then raise exception '品牌或车型不正确'; end if;
  if char_length(v_note) > 200 then raise exception '备注最多 200 字'; end if;
  if v_wb is null or v_wb not between 50 and 300 then raise exception '轴距需在 50–300 mm'; end if;
  if v_ft is null or v_ft not between 30 and 250 then raise exception '前轮距需在 30–250 mm'; end if;
  if v_rt is null or v_rt not between 30 and 250 then raise exception '后轮距需在 30–250 mm'; end if;
  if v_len is not null and v_len not between 50 and 500 then raise exception '车身长度需在 50–500 mm'; end if;
  if v_link <> '' and (char_length(v_link) > 300 or v_link !~* '^https?://') then raise exception '宽体链接需以 http 开头'; end if;
  if jsonb_typeof(v_parts) <> 'array' or jsonb_array_length(v_parts) > 9 then raise exception '板件图最多 9 张'; end if;
  -- Every image must be one of our own uploads.
  if v_cover = '' then raise exception '请上传封面图'; end if;
  for u in select unnest(array_remove(array[v_cover, v_thumb, v_finished, v_scan], ''))
           union all select jsonb_array_elements_text(v_parts) loop
    if u !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/carshell/uploads/[A-Za-z0-9_./-]+$' then
      raise exception '图片地址不正确'; end if;
  end loop;
  if (select count(*) from cs_cars where owner_hash = h and created_ms > (extract(epoch from now() - interval '1 hour')*1000)) >= 3
    then raise exception '一小时最多投稿 3 款，请稍后再来'; end if;
  if (select count(*) from cs_cars where owner_hash <> '' and created_ms > (extract(epoch from now() - interval '1 hour')*1000)) >= 30
    then raise exception '投稿太多了，请稍后再试'; end if;

  new_id := 'w' || replace(gen_random_uuid()::text, '-', '');
  insert into cs_cars (id, name, brand, model, wide, wide_link, len, wb, ft, rt, cover, thumb, ratio,
                       finished, scan, parts, note, by_name, by_id, owner_hash)
  values (new_id, v_name, v_brand, v_model, v_wide, case when v_wide then v_link else '' end, v_len, v_wb, v_ft, v_rt,
          v_cover, v_thumb, coalesce(nullif(p->>'ratio','')::numeric, 1.33),
          v_finished, case when v_wide then v_scan else '' end, v_parts, v_note, v_by, left(h, 8), h);
  return new_id;
end $$;

-- Owner (same device) or admin may delete a car.
create or replace function public.cs_delete_car(p_id text, p_token text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from cs_cars where id = p_id and ((owner_hash <> '' and owner_hash = cs_hash(p_token)) or public.is_admin());
  return found;
end $$;

create or replace function public.cs_my_cars(p_token text)
returns setof text
language sql stable security definer set search_path = public as $$
  select id from cs_cars where owner_hash <> '' and owner_hash = cs_hash(p_token)
$$;

revoke execute on function public.cs_add_car(jsonb,text), public.cs_delete_car(text,text), public.cs_my_cars(text) from public;
grant execute on function public.cs_add_car(jsonb,text), public.cs_delete_car(text,text), public.cs_my_cars(text) to anon, authenticated;
