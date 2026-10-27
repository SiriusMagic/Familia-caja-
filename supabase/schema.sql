-- Ahorro familiar: base de datos compartida en Supabase.
--
-- Cómo usarlo: en tu proyecto de Supabase abre "SQL Editor", pega este archivo
-- completo y pulsa "Run". Se puede ejecutar varias veces sin romper nada.
--
-- Seguridad: el navegador solo tiene la llave pública (anon). Por eso TODAS las
-- reglas viven aquí: las tablas tienen RLS (cada quien ve solo lo suyo) y los
-- cambios importantes (aprobar, votar, pagar) solo se hacen con funciones que
-- revisan quién llama. Nadie puede cambiarse el rol o el estado desde el navegador.

-- ---------------------------------------------------------------- Tablas

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  name        text not null check (char_length(name) between 1 and 120),
  cedula      text not null default '' check (char_length(cedula) <= 30),
  phone       text not null default '' check (char_length(phone) <= 30),
  role        text not null default 'socio' check (role in ('admin', 'socio')),
  status      text not null default 'pending' check (status in ('pending', 'active', 'rejected', 'suspended')),
  created_at  timestamptz not null default now()
);

create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  amount        numeric(12, 2) not null check (amount > 0),
  type          text not null default 'ahorro' check (char_length(type) <= 30),
  note          text not null default '' check (char_length(note) <= 500),
  receipt_path  text,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by   uuid references public.profiles (id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists public.loans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  user_name    text not null,
  amount       numeric(12, 2) not null check (amount > 0),
  purpose      text not null check (purpose in ('vanidad', 'salud', 'educacion', 'emergencia', 'negocio', 'otro')),
  description  text not null default '' check (char_length(description) <= 1000),
  status       text not null default 'voting' check (status in ('voting', 'active', 'rejected')),
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.loan_votes (
  loan_id     uuid not null references public.loans (id) on delete cascade,
  voter_id    uuid not null references public.profiles (id) on delete cascade,
  vote        text not null check (vote in ('for', 'against')),
  created_at  timestamptz not null default now(),
  primary key (loan_id, voter_id)
);

create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists loans_created_idx on public.loans (created_at desc);

-- ---------------------------------------------------------------- Ayudantes

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and status = 'active');
$$;

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active');
$$;

create or replace function public.require_admin() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'Acceso denegado: se requiere rol de admin' using errcode = '42501';
  end if;
end $$;

create or replace function public.require_active() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if not is_active() then
    raise exception 'Tu cuenta aun no ha sido aprobada' using errcode = '42501';
  end if;
end $$;

-- Perfil automático al registrarse. El primer usuario queda como admin activo.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  first_user boolean;
begin
  perform pg_advisory_xact_lock(hashtext('ahorro-familiar-first-user'));
  select not exists (select 1 from profiles) into first_user;
  insert into profiles (id, email, name, cedula, phone, role, status)
  values (
    new.id,
    lower(new.email),
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 120),
    left(trim(coalesce(new.raw_user_meta_data ->> 'cedula', '')), 30),
    left(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), 30),
    case when first_user then 'admin' else 'socio' end,
    case when first_user then 'active' else 'pending' end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- RLS
-- Solo lectura directa; toda escritura pasa por las funciones de abajo.

alter table public.profiles   enable row level security;
alter table public.payments   enable row level security;
alter table public.loans      enable row level security;
alter table public.loan_votes enable row level security;

drop policy if exists "ver mi perfil o admin" on public.profiles;
create policy "ver mi perfil o admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "ver mis pagos o admin" on public.payments;
create policy "ver mis pagos o admin" on public.payments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "socios activos ven prestamos" on public.loans;
create policy "socios activos ven prestamos" on public.loans for select to authenticated
  using (public.is_active());

drop policy if exists "ver mis votos o admin" on public.loan_votes;
create policy "ver mis votos o admin" on public.loan_votes for select to authenticated
  using (voter_id = auth.uid() or public.is_admin());

revoke all on public.profiles, public.payments, public.loans, public.loan_votes from anon;
revoke insert, update, delete on public.profiles, public.payments, public.loans, public.loan_votes from authenticated;
grant select on public.profiles, public.payments, public.loans, public.loan_votes to authenticated;

-- ---------------------------------------------------------------- Funciones de la app

-- Resumen del socio: ahorro aprobado, deuda de préstamos activos y disponible.
create or replace function public.my_summary() returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s numeric; d numeric;
begin
  perform require_active();
  select coalesce(sum(amount), 0) into s from payments where user_id = auth.uid() and status = 'approved';
  select coalesce(sum(amount), 0) into d from loans where user_id = auth.uid() and status = 'active';
  return json_build_object('savings', s, 'debt', d, 'available', s - d);
end $$;

create or replace function public.my_payments() returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform require_active();
  return coalesce((
    select json_agg(json_build_object('_id', id, 'user_id', user_id, 'amount', amount, 'type', type, 'note', note,
                                      'status', status, 'has_receipt', receipt_path is not null, 'created_at', created_at)
                    order by created_at desc)
    from (select * from payments where user_id = auth.uid() order by created_at desc limit 100) p
  ), '[]'::json);
end $$;

create or replace function public.create_payment(p_amount numeric, p_type text, p_note text, p_receipt_path text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare new_id uuid;
begin
  perform require_active();
  if p_amount is null or p_amount <= 0 then
    raise exception 'Monto invalido' using errcode = '22023';
  end if;
  -- El comprobante debe estar en la carpeta del propio socio.
  if p_receipt_path is not null and split_part(p_receipt_path, '/', 1) <> auth.uid()::text then
    raise exception 'Comprobante invalido' using errcode = '42501';
  end if;
  insert into payments (user_id, amount, type, note, receipt_path)
  values (auth.uid(), round(p_amount, 2), coalesce(nullif(p_type, ''), 'ahorro'), coalesce(p_note, ''), p_receipt_path)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.request_loan(p_amount numeric, p_purpose text, p_description text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare new_id uuid; me profiles;
begin
  perform require_active();
  if lower(coalesce(p_purpose, '')) not in ('vanidad', 'salud', 'educacion', 'emergencia', 'negocio', 'otro') then
    raise exception 'Proposito invalido. Opciones: vanidad, salud, educacion, emergencia, negocio, otro' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Monto invalido' using errcode = '22023';
  end if;
  select * into me from profiles where id = auth.uid();
  insert into loans (user_id, user_name, amount, purpose, description)
  values (me.id, me.name, round(p_amount, 2), lower(p_purpose), coalesce(p_description, ''))
  returning id into new_id;
  return new_id;
end $$;

-- Lista de préstamos con conteo de votos, mi voto y si puedo votar.
create or replace function public.list_loans(p_only_mine boolean default false) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare eligible int;
begin
  perform require_active();
  select count(*) - 1 into eligible from profiles where status = 'active';
  return coalesce((
    select json_agg(row_to_json(x) order by x.created_at desc) from (
      select l.id as "_id", l.user_id, l.user_name, l.amount, l.purpose, l.description, l.status, l.created_at,
             (select count(*) from loan_votes v where v.loan_id = l.id and v.vote = 'for') as votes_for_count,
             (select count(*) from loan_votes v where v.loan_id = l.id and v.vote = 'against') as votes_against_count,
             eligible as eligible_voters,
             mv.vote as my_vote,
             (l.user_id <> auth.uid() and mv.vote is null and l.status = 'voting') as can_vote
      from loans l
      left join loan_votes mv on mv.loan_id = l.id and mv.voter_id = auth.uid()
      where not p_only_mine or l.user_id = auth.uid()
      order by l.created_at desc
      limit 100
    ) x
  ), '[]'::json);
end $$;

-- Votar. Se bloquea el préstamo mientras se cuenta para evitar votos simultáneos.
create or replace function public.vote_loan(p_loan_id uuid, p_vote text) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare l loans; eligible int; majority int; n_for int; n_against int;
begin
  perform require_active();
  if p_vote not in ('for', 'against') then
    raise exception 'Voto invalido. Usa ''for'' o ''against''' using errcode = '22023';
  end if;
  select * into l from loans where id = p_loan_id for update;
  if not found then raise exception 'Prestamo no encontrado' using errcode = 'P0002'; end if;
  if l.status <> 'voting' then raise exception 'La votacion ya cerro' using errcode = '22023'; end if;
  if l.user_id = auth.uid() then raise exception 'No puedes votar en tu propio prestamo' using errcode = '22023'; end if;
  if exists (select 1 from loan_votes where loan_id = p_loan_id and voter_id = auth.uid()) then
    raise exception 'Ya votaste en este prestamo' using errcode = '22023';
  end if;

  insert into loan_votes (loan_id, voter_id, vote) values (p_loan_id, auth.uid(), p_vote);
  select count(*) - 1 into eligible from profiles where status = 'active';
  majority := eligible / 2 + 1;
  select count(*) filter (where vote = 'for'), count(*) filter (where vote = 'against')
    into n_for, n_against from loan_votes where loan_id = p_loan_id;

  if n_for >= majority then
    update loans set status = 'active', decided_at = now() where id = p_loan_id;
    return json_build_object('message', 'Prestamo aprobado por mayoria!', 'status', 'active');
  elsif n_against >= majority then
    update loans set status = 'rejected', decided_at = now() where id = p_loan_id;
    return json_build_object('message', 'Prestamo rechazado por mayoria.', 'status', 'rejected');
  end if;
  return json_build_object('message', 'Voto registrado', 'votes_for', n_for, 'votes_against', n_against);
end $$;

-- ---------------------------------------------------------------- Funciones de administrador

create or replace function public.admin_dashboard() returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform require_admin();
  return json_build_object(
    'caja_total',            (select coalesce(sum(amount), 0) from payments where status = 'approved'),
    'prestamos_activos',     (select coalesce(sum(amount), 0) from loans where status = 'active'),
    'socios_pendientes',     (select count(*) from profiles where status = 'pending'),
    'total_socios',          (select count(*) from profiles where role = 'socio' and status = 'active'),
    'pagos_pendientes',      (select count(*) from payments where status = 'pending'),
    'prestamos_en_votacion', (select count(*) from loans where status = 'voting')
  );
end $$;

create or replace function public.admin_users(p_only_pending boolean default false) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform require_admin();
  return coalesce((
    select json_agg(json_build_object('_id', id, 'email', email, 'name', name, 'cedula', cedula, 'phone', phone,
                                      'role', role, 'status', status, 'created_at', created_at) order by created_at)
    from profiles where not p_only_pending or status = 'pending'
  ), '[]'::json);
end $$;

create or replace function public.admin_pending_payments() returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform require_admin();
  return coalesce((
    select json_agg(json_build_object('_id', p.id, 'user_id', p.user_id, 'amount', p.amount, 'type', p.type,
                                      'note', p.note, 'status', p.status, 'receipt_path', p.receipt_path,
                                      'created_at', p.created_at,
                                      'user_name', coalesce(u.name, 'Desconocido'), 'user_email', coalesce(u.email, ''))
                    order by p.created_at)
    from payments p left join profiles u on u.id = p.user_id
    where p.status = 'pending'
  ), '[]'::json);
end $$;

-- Aprobar o rechazar un socio que espera aprobación.
create or replace function public.admin_review_user(p_user_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform require_admin();
  update profiles set status = case when p_approve then 'active' else 'rejected' end
  where id = p_user_id and status = 'pending';
  if not found then raise exception 'Usuario no encontrado o ya aprobado' using errcode = 'P0002'; end if;
end $$;

create or replace function public.admin_set_role(p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform require_admin();
  if p_role not in ('admin', 'socio') then raise exception 'Rol invalido' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('ahorro-familiar-roles'));
  if p_role = 'socio' and (select count(*) from profiles where role = 'admin' and status = 'active' and id <> p_user_id) = 0 then
    raise exception 'Debe quedar al menos un administrador' using errcode = '22023';
  end if;
  update profiles set role = p_role where id = p_user_id;
  if not found then raise exception 'Usuario no encontrado' using errcode = 'P0002'; end if;
end $$;

create or replace function public.admin_review_payment(p_payment_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform require_admin();
  update payments
     set status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_payment_id and status = 'pending';
  if not found then raise exception 'Pago no encontrado o ya procesado' using errcode = 'P0002'; end if;
end $$;

-- Solo usuarios con sesión pueden llamar a las funciones (cada una revisa además el rol).
do $$
declare f text;
begin
  foreach f in array array[
    'is_admin()', 'is_active()', 'require_admin()', 'require_active()',
    'my_summary()', 'my_payments()', 'create_payment(numeric, text, text, text)',
    'request_loan(numeric, text, text)', 'list_loans(boolean)', 'vote_loan(uuid, text)',
    'admin_dashboard()', 'admin_users(boolean)', 'admin_pending_payments()',
    'admin_review_user(uuid, boolean)', 'admin_set_role(uuid, text)', 'admin_review_payment(uuid, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke all on function public.handle_new_user() from public, anon, authenticated';
end $$;

-- ---------------------------------------------------------------- Comprobantes (Storage)
-- Carpeta privada: cada socio sube a "<su id>/archivo.jpg"; solo él y los admin la ven.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "subir mis comprobantes" on storage.objects;
create policy "subir mis comprobantes" on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active());

drop policy if exists "ver mis comprobantes o admin" on storage.objects;
create policy "ver mis comprobantes o admin" on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
