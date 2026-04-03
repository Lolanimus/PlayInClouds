import { processRpcRequest } from "@/api/helpers";

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

const listUserFutureReservations = async (p_renter_id?: string | null) => {
  return await processRpcRequest("list_user_future_reservations", {
    p_renter_id: p_renter_id ?? null,
  });
};

const listHostMonthlyReservations = async (
  p_host_id?: string | null,
  p_month?: number
) => {
  return await processRpcRequest("list_host_monthly_reservations", {
    p_host_id: p_host_id ?? null,
    ...(typeof p_month === "number" ? { p_month } : {}),
  });
};

export {
  createReservation,
  listUserFutureReservations,
  listHostMonthlyReservations,
};
