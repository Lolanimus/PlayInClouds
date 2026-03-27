CREATE OR REPLACE FUNCTION public.signup_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public."user" (id, email, phone_number, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    nullif(NEW.phone, ''),
    COALESCE(nullif(NEW.raw_user_meta_data->>'first_name', ''), 'Unknown'),
    COALESCE(nullif(NEW.raw_user_meta_data->>'last_name', ''), 'Unknown')
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Profile creation failed: %', SQLERRM;
END;
$function$;
