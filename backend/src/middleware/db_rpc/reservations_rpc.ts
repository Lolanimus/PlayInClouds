import type { Reservation } from "../../../../app/types/custom/api.types";

import { createAuthedSupabaseClient } from "../../clients/supabase";
import type {
  CountUserPastReservationsQuery,
  CreateReservationBody,
  ListHostMonthlyReservationsQuery,
  ListUserActiveReservationsQuery,
  ListUserPastReservationsQuery,
} from "../../schemas/reservations";

export async function getReservationRpc(args: {
  accessToken: string;
  reservationId: string;
}) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("get_reservation", {
    p_reservation_id: args.reservationId,
  });

  if (error) throw error;

  return data as Reservation | null;
}

export async function cancelReservationRpc(args: {
  accessToken: string;
  reservationId: string;
}) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("cancel_reservation", {
    p_reservation_id: args.reservationId,
  });

  if (error) throw error;

  return data as Reservation | null;
}

export async function confirmReservationRpc(args: {
  accessToken: string;
  reservationId: string;
}) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("confirm_reservation", {
    p_reservation_id: args.reservationId,
  });

  if (error) throw error;

  return data as Reservation | null;
}

export async function createReservationRpc(args: {
  accessToken: string;
  input: CreateReservationBody;
}) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("create_reservation", args.input);

  if (error) throw error;

  return data as Reservation | null;
}

export async function listUserActiveReservationsRpc(args: {
  accessToken: string;
  query: ListUserActiveReservationsQuery;
}) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("list_user_active_reservations", {
    p_renter_id: args.query.p_renter_id ?? undefined,
  } as never);

  if (error) throw error;

  return (data ?? null) as Reservation[] | null;
}

export async function countUserPastReservationsRpc(args: {
  accessToken: string;
  query: CountUserPastReservationsQuery;
}) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("count_user_past_reservations", {
    p_renter_id: args.query.p_renter_id ?? undefined,
  } as never);

  if (error) throw error;

  return (data ?? null) as number | null;
}

export async function listUserPastReservationsRpc(args: {
  accessToken: string;
  query: ListUserPastReservationsQuery;
}) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("list_user_past_reservations", {
    p_renter_id: args.query.p_renter_id ?? undefined,
    p_page: args.query.p_page ?? 1,
    p_page_size: args.query.p_page_size ?? 6,
  } as never);

  if (error) throw error;

  return (data ?? null) as Reservation[] | null;
}

export async function listHostMonthlyReservationsRpc(args: {
  accessToken: string;
  query: ListHostMonthlyReservationsQuery;
}) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("list_host_monthly_reservations", {
    p_host_id: args.query.p_host_id ?? undefined,
    ...(typeof args.query.p_month === "number" ? { p_month: args.query.p_month } : {}),
  } as never);

  if (error) throw error;

  return (data ?? null) as Reservation[] | null;
}
