import { queries } from "@/queries/queries";
import { useQuery } from "@tanstack/react-query";

export const usePublicProfile = (
  opts?: { p_user_id?: string; p_limit?: number; p_offset?: number },
  config?: { enabled?: boolean }
) => {
  const query = useQuery({
    ...queries.profile.detail(opts),
    enabled: config?.enabled ?? Boolean(opts?.p_user_id),
  });

  return query;
};

export default {};
