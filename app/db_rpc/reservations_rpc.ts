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

export { createReservation };
