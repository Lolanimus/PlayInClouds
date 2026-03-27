create extension if not exists "pgtap" with schema "extensions";

create table "public"."user" (
    "id" uuid not null,
    "first_name" text not null,
    "last_name" text not null,
    "email" text,
    "phone_number" text,
    "inserted_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
);

set check_function_bodies = off;

alter table "public"."user" enable row level security;
ALTER TABLE public."user"
ADD CONSTRAINT user_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX user_email_key
ON public."user" (LOWER(email))
WHERE email IS NOT NULL;

CREATE UNIQUE INDEX user_phone_number_key
ON public."user" (phone_number)
WHERE phone_number IS NOT NULL;

CREATE INDEX user_first_last_name_idx
ON public."user" (first_name, last_name);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public."user"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

alter table "public"."user" add constraint "email_or_phone_required" CHECK ((((email IS NOT NULL) AND ((email)::text <> ''::text)) OR ((phone_number IS NOT NULL) AND ((phone_number)::text <> ''::text)))) not valid;

alter table "public"."user" validate constraint "email_or_phone_required";

alter table "public"."user" add constraint "user_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."user" validate constraint "user_id_fkey";

CREATE OR REPLACE FUNCTION public.get_user_id_by_username(target_username text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$

   DECLARE
      target_user_id UUID;
    BEGIN
      -- Find target user by username (qualify with table alias)
      SELECT u.id INTO target_user_id
      FROM public.user u
      WHERE u.username = target_username;

      -- Return JSON object
      RETURN target_user_id;
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.signup_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  BEGIN
    INSERT INTO public.user (id, email, username)
    VALUES (
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data->>'username'
    );

    RETURN NEW;
  EXCEPTION
    WHEN OTHERS THEN
      -- Fail the entire auth signup if profile creation fails
      RAISE EXCEPTION 'Profile creation failed: %', SQLERRM;
  END;
  $function$
;

create policy "Users can manage own profile"
on "public"."user"
as permissive
for all
to authenticated
using ((auth.uid() = id));


create policy "Users can view profiles"
on "public"."user"
as permissive
for select
to public
using (true);


create policy "insert_new_user"
on "public"."user"
as permissive
for insert
to public
with check (true);

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION signup_user();
