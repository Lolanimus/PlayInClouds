import { processRpcRequest } from "~/api/supabase/helpers";

const getPublicProfile = async (
  p_user_id: string,
  p_limit = 12,
  p_offset = 0
) => {
  return await processRpcRequest("get_public_profile", {
    p_user_id,
    p_limit,
    p_offset,
  });
};

export { getPublicProfile };
