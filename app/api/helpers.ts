import { errorStore } from "../store/error_state";
import supabase from "../utils/supabase";
import { AuthError } from "@supabase/supabase-js";
import * as z from "zod";
import type { Function, Functions } from "../types/custom/rpc.types";

export async function processAuthRequest<T>(
  cb: () => Promise<T>
): Promise<T | null> {
  try {
    return await cb();
  } catch (err) {
    console.error("", err);

    if (err instanceof z.ZodError)
      errorStore.getState().actions.setError(err.message);
    else if (err instanceof AuthError)
      errorStore.getState().actions.setError(err.message);

    return null;
  }
}

export async function processBlobRequest<T>(
  cb: () => Promise<T>
): Promise<T | null> {
  try {
    return await cb();
  } catch (err: any) {
    console.error("", err);
    errorStore.getState().actions.setError(err.message);

    return null;
  }
}

export async function processRpcRequest<T extends keyof Functions>(
  funName: T,
  argsObj: Function<T>["Args"] = {} as Function<T>["Args"]
): Promise<Function<T>["Returns"] | null> {
  try {
    const { data, error } = await supabase.rpc(funName, argsObj);

    if (error) throw error;

    console.info("Called: ", funName);

    return data as Function<T>["Returns"];
  } catch (err: any) {
    console.error("", err);
    errorStore.getState().actions.setError(err.message);

    return null;
  }
}
