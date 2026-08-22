
-- ============================================================
-- Archivo de Rol · esquema para Supabase
-- Pega TODO este archivo en Supabase → SQL Editor → New query → Run
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- PROFILES: uno por usuario de Discord (username, avatar, si es staff)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null default 'Usuario',
  avatar_url  text,
  is_staff    boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Cualquier persona logueada puede ver los perfiles (nombre/avatar/si es staff)
create policy "profiles: lectura para logueados"
  on public.profiles for select
  using (auth.role() = 'authenticated');

-- OJO: no hay política de INSERT/UPDATE para usuarios normales.
-- El perfil se crea/actualiza únicamente mediante el trigger de abajo
-- (que corre como "security definer"), así nadie puede ponerse
-- is_staff = true a sí mismo desde el navegador.

-- Función que crea/actualiza el perfil cuando alguien inicia sesión con Discord
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'user_name',
      'Usuario'
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    username = excluded.username,
    avatar_url = excluded.avatar_url;
  return new;
end;
$$;

drop trigger if exists on_auth_user_upserted on auth.users;
create trigger on_auth_user_upserted
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

-- Función auxiliar: ¿es staff este usuario? (security definer para poder
-- usarla dentro de las políticas de "fichas" sin problemas de recursión)
create or replace function public.is_staff(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select p.is_staff from public.profiles p where p.id = uid), false);
$$;

-- ------------------------------------------------------------
-- FICHAS: una ficha de personaje por usuario
-- ------------------------------------------------------------
create table if not exists public.fichas (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references public.profiles(id) on delete cascade,
  nombre_personaje   text not null,
  edad               text,
  raza               text,
  apariencia         text,
  historia           text,
  habilidades        text,
  imagen_url         text,
  status             text not null default 'pendiente'
                        check (status in ('pendiente', 'aprobada', 'denegada')),
  motivo_denegacion  text,
  reviewed_by        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.fichas enable row level security;

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists fichas_set_updated_at on public.fichas;
create trigger fichas_set_updated_at
  before update on public.fichas
  for each row execute function public.set_updated_at();

-- SELECT: el dueño ve la suya, el staff las ve todas
create policy "fichas: el dueno ve la suya"
  on public.fichas for select
  using (auth.uid() = user_id);

create policy "fichas: staff ve todas"
  on public.fichas for select
  using (public.is_staff(auth.uid()));

-- INSERT: solo puedes crear tu propia ficha, y siempre nace 'pendiente'
create policy "fichas: crear la propia"
  on public.fichas for insert
  with check (auth.uid() = user_id and status = 'pendiente');

-- UPDATE (usuario): solo puedes reenviar tu ficha si estaba 'denegada',
-- y al reenviarla vuelve a quedar 'pendiente' (no puedes auto-aprobarte)
create policy "fichas: reenviar si estaba denegada"
  on public.fichas for update
  using (auth.uid() = user_id and status = 'denegada')
  with check (auth.uid() = user_id and status = 'pendiente');

-- UPDATE (staff): puede aprobar/denegar cualquier ficha
create policy "fichas: staff puede revisar"
  on public.fichas for update
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- DELETE: solo staff puede eliminar fichas
create policy "fichas: staff puede eliminar"
  on public.fichas for delete
  using (public.is_staff(auth.uid()));

-- ------------------------------------------------------------
-- Para convertir a alguien en staff MÁS ADELANTE (después de que
-- haya iniciado sesión al menos una vez, para que exista su perfil):
--
--   update public.profiles set is_staff = true where username = 'su_nombre_de_discord';
--
-- o buscando por su ID de Discord (columna raw_user_meta_data de auth.users):
--
--   update public.profiles set is_staff = true
--   where id = (select id from auth.users where raw_user_meta_data->>'provider_id' = 'ID_DE_DISCORD_AQUI');
-- ------------------------------------------------------------
