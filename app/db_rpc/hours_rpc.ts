import { processRpcRequest } from "~/app/api/supabase/helpers";

const getCurrentIsoDate = () => new Date().toISOString().slice(0, 10);

const listListingWeekSlots = async (
  p_listing_id: string,
  p_week: string = getCurrentIsoDate()
) => {
  return await processRpcRequest("list_listing_week_slots", {
    p_listing_id,
    p_week,
  });
};

const listListingMonthSlots = async (
  p_listing_id: string,
  p_month: string = getCurrentIsoDate()
) => {
  return await processRpcRequest("list_listing_month_slots", {
    p_listing_id,
    p_month,
  });
};

const upsertListingWeeklySlot = async (
  p_listing_id: string,
  p_weekday: number,
  p_hour: number,
  p_price: number
) => {
  return await processRpcRequest("upsert_listing_weekly_slot", {
    p_listing_id,
    p_weekday,
    p_hour,
    p_price,
  });
};

const setListingWeeklySlots = async (
  p_listing_id: string,
  p_slots: Array<{ weekday: number; hour: number; price: number }>
) => {
  return await processRpcRequest("set_listing_weekly_slots", {
    p_listing_id,
    p_slots: p_slots as any,
  } as any);
};

export {
  listListingWeekSlots,
  listListingMonthSlots,
  upsertListingWeeklySlot,
  setListingWeeklySlots,
};
