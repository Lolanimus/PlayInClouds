create or replace function public.get_reservation(
  p_reservation_id uuid
) returns jsonb as $$
declare
  v_uid uuid;
  v_reservation public.reservations%rowtype;
  v_listing public.listings%rowtype;
  v_owner public.user%rowtype;
  v_booker public.user%rowtype;
  v_can_view_sensitive boolean := false;
  v_listing_public jsonb := null;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select r.*
  into v_reservation
  from public.reservations r
  where r.id = p_reservation_id;

  if v_reservation.id is null then
    raise exception 'Reservation not found';
  end if;

  select l.*
  into v_listing
  from public.listings l
  where l.id = v_reservation.listing_id;

  if v_listing.id is not null then
    select u.*
    into v_owner
    from public.user u
    where u.id = v_listing.owner_id;

    select u.*
    into v_booker
    from public.user u
    where u.id = v_reservation.renter_id;

    -- Once a reservation exists, both participants should be able to see each
    -- other's reservation-scoped profile details and the full listing info.
    v_can_view_sensitive :=
      (v_uid = v_listing.owner_id)
      or (v_uid = v_reservation.renter_id);

    v_listing_public := to_jsonb(v_listing)
      || jsonb_build_object(
        'lat', v_listing.lat + (((900 + random() * 600) / 111320.0) * cos(random() * 2 * pi())),
        'lng', v_listing.lng + (((900 + random() * 600) / (111320.0 * greatest(abs(cos(radians(v_listing.lat))), 1e-6))) * sin(random() * 2 * pi())),
        'address', case
          when strpos(v_listing.address, ',') > 0 then ltrim(substr(v_listing.address, strpos(v_listing.address, ',') + 1))
          else v_listing.address
        end
      );
  end if;

  return to_jsonb(v_reservation)
    || jsonb_build_object(
      'listing', case
        when v_listing.id is null then null::jsonb
        when v_can_view_sensitive then to_jsonb(v_listing)
        else v_listing_public
      end,
      'owner', case
        when v_owner.id is null then null::jsonb
        when v_can_view_sensitive then to_jsonb(v_owner) - 'email'
        else null::jsonb
      end,
      'booker', case
        when v_booker.id is null then null::jsonb
        when v_can_view_sensitive then to_jsonb(v_booker) - 'email'
        else null::jsonb
      end
    );
end;
$$ language plpgsql set search_path = '';
