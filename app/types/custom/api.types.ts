import type { Database } from "../database-generated.types";
import type { Writable } from "type-fest";

export type User = Omit<Database["public"]["Tables"]["user"]["Insert"], "id"> & { id?: string };
export type UserLogin = { email: string; password: string };
export type UserSignup = Writable<User & { password: string, confirmPassword: string }>;