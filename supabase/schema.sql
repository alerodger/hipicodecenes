-- =====================================================================
--  Club Hípico de Cenes · Esquema de base de datos (Supabase)
--  Ejecuta este archivo completo en: Supabase > SQL Editor > New query
--  Es idempotente: puedes volver a ejecutarlo sin perder datos.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
--  Administradores
--  Solo los usuarios incluidos en esta tabla pueden gestionar la web.
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "admins: leer el propio registro" on public.admins;
create policy "admins: leer el propio registro" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
--  Eventos
-- ---------------------------------------------------------------------
create table if not exists public.eventos (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null check (char_length(titulo) between 3 and 140),
  resumen      text check (char_length(resumen) <= 280),
  descripcion  text check (char_length(descripcion) <= 8000),
  categoria    text not null default 'otro'
               check (categoria in ('competicion','clinic','campamento','ruta','jornada','social','otro')),
  fecha_inicio date not null,
  fecha_fin    date,
  hora         text check (char_length(hora) <= 60),
  lugar        text check (char_length(lugar) <= 160),
  precio       text check (char_length(precio) <= 80),
  enlace       text check (char_length(enlace) <= 500),
  imagen_url   text,
  imagen_path  text,
  publicado    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint eventos_fechas_ok check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create index if not exists eventos_fecha_idx on public.eventos (fecha_inicio);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists eventos_touch on public.eventos;
create trigger eventos_touch before update on public.eventos
  for each row execute function public.touch_updated_at();

alter table public.eventos enable row level security;

drop policy if exists "eventos: lectura pública" on public.eventos;
create policy "eventos: lectura pública" on public.eventos
  for select to anon, authenticated using (publicado or public.is_admin());

drop policy if exists "eventos: gestión admin" on public.eventos;
create policy "eventos: gestión admin" on public.eventos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
--  Caballos ("Conoce a nuestros caballos")
-- ---------------------------------------------------------------------
create table if not exists public.caballos (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null check (char_length(nombre) between 1 and 60),
  raza            text check (char_length(raza) <= 80),
  sexo            text check (sexo in ('yegua','caballo','castrado','pony')),
  anio_nacimiento int  check (anio_nacimiento between 1980 and 2100),
  capa            text check (char_length(capa) <= 60),       -- color del pelaje
  alzada          text check (char_length(alzada) <= 20),     -- p. ej. "1,65 m"
  disciplina      text check (char_length(disciplina) <= 80), -- p. ej. "Salto · Escuela"
  caracter        text check (char_length(caracter) <= 160),  -- frase breve
  descripcion     text check (char_length(descripcion) <= 4000),
  foto_url        text,
  foto_path       text,
  orden           int  not null default 0,
  visible         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists caballos_orden_idx on public.caballos (orden, nombre);

drop trigger if exists caballos_touch on public.caballos;
create trigger caballos_touch before update on public.caballos
  for each row execute function public.touch_updated_at();

alter table public.caballos enable row level security;

drop policy if exists "caballos: lectura pública" on public.caballos;
create policy "caballos: lectura pública" on public.caballos
  for select to anon, authenticated using (visible or public.is_admin());

drop policy if exists "caballos: gestión admin" on public.caballos;
create policy "caballos: gestión admin" on public.caballos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
--  Fotos (galería)
-- ---------------------------------------------------------------------
create table if not exists public.fotos (
  id          uuid primary key default gen_random_uuid(),
  path        text not null unique,
  url         text not null,
  thumb_path  text,
  thumb_url   text,
  titulo      text check (char_length(titulo) <= 160),
  categoria   text not null default 'club'
              check (categoria in ('club','clases','competiciones','caballos','instalaciones','eventos')),
  ancho       int,
  alto        int,
  destacada   boolean not null default false,   -- se usa como imagen de portada
  created_at  timestamptz not null default now()
);

create index if not exists fotos_created_idx on public.fotos (created_at desc);

alter table public.fotos enable row level security;

drop policy if exists "fotos: lectura pública" on public.fotos;
create policy "fotos: lectura pública" on public.fotos
  for select to anon, authenticated using (true);

drop policy if exists "fotos: gestión admin" on public.fotos;
create policy "fotos: gestión admin" on public.fotos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
--  Mensajes del formulario de contacto
--  Cualquiera puede enviar; solo el admin puede leer, marcar y borrar.
-- ---------------------------------------------------------------------
create table if not exists public.mensajes (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (char_length(nombre) between 2 and 100),
  email      text not null check (char_length(email) between 5 and 160 and email like '%_@_%._%'),
  telefono   text check (char_length(telefono) <= 30),
  asunto     text check (char_length(asunto) <= 80),
  mensaje    text not null check (char_length(mensaje) between 10 and 3000),
  leido      boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.mensajes enable row level security;

drop policy if exists "mensajes: envío público" on public.mensajes;
create policy "mensajes: envío público" on public.mensajes
  for insert to anon, authenticated with check (leido = false);

drop policy if exists "mensajes: gestión admin" on public.mensajes;
create policy "mensajes: gestión admin" on public.mensajes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Antispam básico: máximo 3 mensajes por email cada 10 minutos.
create or replace function public.limitar_mensajes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.mensajes
      where email = new.email and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'Demasiados mensajes. Inténtalo más tarde.';
  end if;
  return new;
end;
$$;

drop trigger if exists mensajes_limite on public.mensajes;
create trigger mensajes_limite before insert on public.mensajes
  for each row execute function public.limitar_mensajes();

-- ---------------------------------------------------------------------
--  Almacenamiento de imágenes (bucket público "media")
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media: subir admin" on storage.objects;
create policy "media: subir admin" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_admin());

drop policy if exists "media: modificar admin" on storage.objects;
create policy "media: modificar admin" on storage.objects
  for update to authenticated using (bucket_id = 'media' and public.is_admin());

drop policy if exists "media: borrar admin" on storage.objects;
create policy "media: borrar admin" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.is_admin());

-- =====================================================================
--  PASO FINAL (una sola vez): dar permisos de administrador
--  1. Supabase > Authentication > Users > "Add user" (email + contraseña,
--     marca "Auto Confirm User").
--  2. Ejecuta la línea siguiente cambiando el email:
--
--  insert into public.admins (user_id)
--  select id from auth.users where email = 'tu-email@ejemplo.com'
--  on conflict do nothing;
-- =====================================================================
