import { processRpcRequest } from "~/api/supabase/helpers";
import {
  acceptLateReservationTermsWithPayment,
  cancelReservationWithPayment,
  confirmReservationWithPayment,
} from "~/api/supabase/reservations";

const getReservation = async (p_reservation_id: string) => {
  return await processRpcRequest("get_reservation", {
    p_reservation_id,
  });
};

const cancelReservation = async (p_reservation_id: string) => {
  return await cancelReservationWithPayment(p_reservation_id);
};

const confirmReservation = async (p_reservation_id: string) => {
  return await confirmReservationWithPayment(p_reservation_id);
};

const acceptLateReservationTerms = async (p_reservation_id: string) => {
  return await acceptLateReservationTermsWithPayment(p_reservation_id);
};

const createReservation = async (
  p_listing_id: string,
  p_start_at: string,
  p_end_at: string,
  p_guests = 1
) => {
  return await processRpcRequest("create_reservation", {
    p_listing_id,
    p_start_at,
    p_end_at,
    p_guests,
  });
};

const listUserActiveReservations = async (p_renter_id?: string | null) => {
  return await processRpcRequest("list_user_active_reservations", {
    p_renter_id: p_renter_id ?? undefined,
  });
};

const countUserPastReservations = async (p_renter_id?: string | null) => {
  return await processRpcRequest("count_user_past_reservations", {
    p_renter_id: p_renter_id ?? undefined,
  });
};

const listUserPastReservations = async (
  p_renter_id?: string | null,
  p_page = 1,
  p_page_size = 6
) => {
  return await processRpcRequest("list_user_past_reservations", {
    p_renter_id: p_renter_id ?? undefined,
    p_page,
    p_page_size,
  });
};

const listHostMonthlyReservations = async (
  p_host_id?: string | null,
  p_month?: number
) => {
  return await processRpcRequest("list_host_monthly_reservations", {
    p_host_id: p_host_id ?? undefined,
    ...(typeof p_month === "number" ? { p_month } : {}),
  });
};

export {
  getReservation,
  cancelReservation,
  confirmReservation,
  acceptLateReservationTerms,
  createReservation,
  listUserActiveReservations,
  countUserPastReservations,
  listUserPastReservations,
  listHostMonthlyReservations,
};
