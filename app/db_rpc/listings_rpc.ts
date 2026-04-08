import { processRpcRequest } from "@/api/helpers";

/* Listings RPC */
const createListing = async (
  p_lat: number,
  p_lng: number,
  p_address: string,
  p_title: string,
  p_subtitle: string,
  p_category: any,
  p_price: number,
  p_images: string[],
  p_description: string,
  p_equipment_desc: string,
  p_conveniences_desc: string,
  p_area_m2: number,
  p_cancellation_policy_hours?: number | null,
  p_timezone?: string
) => {
  return await processRpcRequest("create_listing", {
    p_lat,
    p_lng,
    p_address,
    p_title,
    p_subtitle,
    p_category,
    p_price,
    p_images,
    p_description,
    p_equipment_desc,
    p_conveniences_desc,
    p_area_m2,
    p_cancellation_policy_hours,
    ...(p_timezone ? { p_timezone } : {}),
  });
};

const getListing = async (p_id: string) => {
  return await processRpcRequest("get_listing", { p_id });
};

const listListings = async (
  p_address: string | null = null,
  p_category: any = null,
  p_min_price: number | null = null,
  p_max_price: number | null = null,
  p_limit = 50,
  p_offset = 0
) => {
  return await processRpcRequest("list_listings", {
    p_address,
    p_category,
    p_min_price,
    p_max_price,
    p_limit,
    p_offset,
  } as any);
};

const updateListing = async (args: {
  p_id: string;
  p_lat?: number;
  p_lng?: number;
  p_address?: string;
  p_title?: string;
  p_subtitle?: string;
  p_category?: any;
  p_price?: number;
  p_images?: string[];
  p_description?: string;
  p_equipment_desc?: string;
  p_conveniences_desc?: string;
  p_area_m2?: number;
  p_cancellation_policy_hours?: number | null;
  p_timezone?: string;
}) => {
  return await processRpcRequest("update_listing", args);
};

const deleteListing = async (p_id: string) => {
  return await processRpcRequest("delete_listing", { p_id });
};

export {
  createListing,
  getListing,
  listListings,
  updateListing,
  deleteListing,
};

