import type { Database as DatabaseGenerated } from "../database-generated.types";
import type { MergeDeep } from "type-fest";

export type Database = MergeDeep<
  DatabaseGenerated,
  {
    public: {
      Functions: {
        // Definitions of custom RPC Functions
        // Ex: 
        // get_user_id_by_username: {
        //   Returns: string;
        // };
      };
    };
  }
>;

export type Functions = Database["public"]["Functions"];
export type Function<T extends keyof Functions> = Functions[T];
