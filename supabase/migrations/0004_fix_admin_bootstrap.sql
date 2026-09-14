-- ===========================================================================
-- Fix: the privilege guard also blocked legitimate admin bootstrapping.
--
-- guard_profile_privileges() reset role/is_blocked whenever is_admin() was
-- false. For a request with no JWT — the SQL Editor, psql, or the service-role
-- key — auth.uid() is null, so is_admin() is false and the guard fired. That
-- made it impossible to create the very first admin.
--
-- The guard only needs to constrain *end users*. Those always carry a JWT, so
-- gate it on auth.uid() being present. The service role is server-only and
-- already bypasses RLS, so this gives it nothing it did not have.
-- ===========================================================================

create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only applies to a signed-in end user. A null auth.uid() means the SQL
  -- Editor or the service-role key, which are trusted by definition.
  if auth.uid() is not null and not public.is_admin() then
    new.role       := old.role;
    new.is_blocked := old.is_blocked;
  end if;
  return new;
end $$;
