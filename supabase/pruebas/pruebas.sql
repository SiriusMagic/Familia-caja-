-- Pruebas de reglas de seguridad y de la lógica de préstamos.
-- Se ejecutan con:  bash supabase/pruebas/ejecutar.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

-- Ayudantes de prueba: actuar como un usuario y esperar un error.
create function pg_temp.como(u uuid) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false) $$;
create function pg_temp.debe_fallar(sql text, contiene text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FALLO: se esperaba error "%" en: %', contiene, sql;
exception when others then
  if sqlerrm like 'FALLO:%' then raise; end if;
  if position(contiene in sqlerrm) = 0 then
    raise exception 'FALLO: error distinto en %: % (se esperaba "%")', sql, sqlerrm, contiene;
  end if;
end $$;
create function pg_temp.igual(obtenido anyelement, esperado anyelement, que text) returns void language plpgsql as $$
begin
  if obtenido is distinct from esperado then
    raise exception 'FALLO: % = %, se esperaba %', que, obtenido, esperado;
  end if;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- Registro: el primero es admin activo; los demás quedan pendientes.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'Ana@Correo.com', '{"name":"Ana"}'),
  ('00000000-0000-0000-0000-00000000000b', 'beto@correo.com', '{"name":"Beto","phone":"099"}'),
  ('00000000-0000-0000-0000-00000000000c', 'caro@correo.com', '{"name":"Caro"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dani@correo.com', '{"name":"Dani"}');
select pg_temp.igual((select role || '/' || status || '/' || email from profiles where name = 'Ana'), 'admin/active/ana@correo.com', 'primer usuario');
select pg_temp.igual((select role || '/' || status from profiles where name = 'Beto'), 'socio/pending', 'segundo usuario');

set role authenticated;

-- Sin sesión no se puede nada.
select pg_temp.como(null);
select pg_temp.debe_fallar('select my_summary()', 'No autenticado');

-- Un socio pendiente no puede usar la app ni aprobarse.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_fallar('select my_summary()', 'aun no ha sido aprobada');
select pg_temp.debe_fallar($$select admin_review_user('00000000-0000-0000-0000-00000000000b', true)$$, 'Acceso denegado');
select pg_temp.debe_fallar($$update profiles set status = 'active', role = 'admin' where id = auth.uid()$$, 'permission denied');
select pg_temp.debe_fallar($$insert into payments (user_id, amount) values (auth.uid(), 10)$$, 'permission denied');
select pg_temp.igual((select count(*) from profiles), 1::bigint, 'un pendiente solo ve su perfil');

-- La admin aprueba a Beto y a Caro, rechaza a Dani.
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select admin_review_user('00000000-0000-0000-0000-00000000000b', true);
select admin_review_user('00000000-0000-0000-0000-00000000000c', true);
select admin_review_user('00000000-0000-0000-0000-00000000000d', false);
select pg_temp.debe_fallar($$select admin_review_user('00000000-0000-0000-0000-00000000000b', true)$$, 'ya aprobado');
select pg_temp.igual(json_array_length(admin_users(false)), 4, 'admin ve todos');
select pg_temp.debe_fallar($$select admin_set_role('00000000-0000-0000-0000-00000000000a', 'socio')$$, 'al menos un administrador');

-- Pagos: Beto sube un pago con comprobante en su carpeta.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_fallar($$select create_payment(0, 'ahorro', '', null)$$, 'Monto invalido');
select pg_temp.debe_fallar($$select create_payment(10, 'ahorro', '', '00000000-0000-0000-0000-00000000000c/x.jpg')$$, 'Comprobante invalido');
insert into storage.objects (bucket_id, name) values ('comprobantes', '00000000-0000-0000-0000-00000000000b/r1.jpg');
select pg_temp.debe_fallar($$insert into storage.objects (bucket_id, name) values ('comprobantes', '00000000-0000-0000-0000-00000000000c/r1.jpg')$$, 'row-level security');
select create_payment(75, 'ahorro', 'enero', '00000000-0000-0000-0000-00000000000b/r1.jpg');
select pg_temp.debe_fallar($$select admin_review_payment((select id from payments limit 1), true)$$, 'Acceso denegado');
select pg_temp.igual((my_summary() ->> 'savings')::numeric, 0::numeric, 'ahorro antes de aprobar');

-- Caro no ve los pagos ni comprobantes de Beto.
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.igual((select count(*) from payments), 0::bigint, 'pagos ajenos ocultos');
select pg_temp.igual((select count(*) from storage.objects), 0::bigint, 'comprobantes ajenos ocultos');

-- La admin aprueba el pago (una sola vez) y lo ve en la caja.
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.igual(json_array_length(admin_pending_payments()), 1, 'pagos pendientes');
select pg_temp.igual(admin_pending_payments() -> 0 ->> 'user_name', 'Beto', 'nombre en pago pendiente');
select pg_temp.igual((select count(*) from storage.objects), 1::bigint, 'admin ve comprobantes');
select admin_review_payment((select id from payments limit 1), true);
select pg_temp.debe_fallar($$select admin_review_payment((select id from payments limit 1), true)$$, 'ya procesado');
select pg_temp.igual((admin_dashboard() ->> 'caja_total')::numeric, 75::numeric, 'caja total');

-- Préstamos: 3 activos → votan 2, mayoría = 2.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.igual((my_summary() ->> 'savings')::numeric, 75::numeric, 'ahorro aprobado');
select pg_temp.debe_fallar($$select request_loan(10, 'fiesta', '')$$, 'Proposito invalido');
select request_loan(50, 'Salud', 'medicina');
select pg_temp.debe_fallar($$select vote_loan((select id from loans limit 1), 'for')$$, 'propio prestamo');
select pg_temp.igual(list_loans() -> 0 ->> 'can_vote', 'false', 'no vota lo suyo');
select pg_temp.igual(list_loans() -> 0 ->> 'user_name', 'Beto', 'nombre del solicitante');

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.igual(list_loans() -> 0 ->> 'can_vote', 'true', 'Caro puede votar');
select pg_temp.igual(list_loans() -> 0 ->> 'eligible_voters', '2', 'votantes elegibles');
select pg_temp.debe_fallar($$select vote_loan((select id from loans limit 1), 'tal vez')$$, 'Voto invalido');
select pg_temp.igual(vote_loan((select id from loans limit 1), 'for') ->> 'message', 'Voto registrado', 'primer voto');
select pg_temp.debe_fallar($$select vote_loan((select id from loans limit 1), 'for')$$, 'Ya votaste');
select pg_temp.debe_fallar($$insert into loan_votes values ((select id from loans limit 1), auth.uid(), 'for')$$, 'permission denied');
select pg_temp.igual(list_loans() -> 0 ->> 'my_vote', 'for', 'mi voto');

select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.igual(vote_loan((select id from loans limit 1), 'for') ->> 'status', 'active', 'aprobado por mayoria');
select pg_temp.debe_fallar($$select vote_loan((select id from loans limit 1), 'against')$$, 'ya cerro');

select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.igual(my_summary()::jsonb, '{"savings": 75, "debt": 50, "available": 25}'::jsonb, 'resumen final');

-- Dani (rechazada) no ve préstamos.
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.igual((select count(*) from loans), 0::bigint, 'rechazada no ve prestamos');

-- Anónimo no puede llamar funciones.
reset role;
set role anon;
select pg_temp.debe_fallar('select public.my_summary()', 'permission denied');
reset role;

\echo 'TODAS LAS PRUEBAS PASARON'
