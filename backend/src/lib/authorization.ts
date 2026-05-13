import type { Database } from "../../../app/types/database-generated.types";

import { throwClientError } from "./client-errors";

export type UserRole = Database["public"]["Enums"]["user_role"];
export type AccountStatus = Database["public"]["Enums"]["account_status"];
export type ActorPermission =
  | "listings.moderate"
  | "admin.access"
  | "support.access";

export type ActorContext = {
  userId: string;
  email: string | null;
  accountStatus: AccountStatus;
  roles: UserRole[];
  permissions: ActorPermission[];
  isAdmin: boolean;
};

const permissionsByRole: Record<UserRole, ActorPermission[]> = {
  USER: [],
  ADMIN: ["listings.moderate", "admin.access", "support.access"],
  MODERATOR: ["listings.moderate", "support.access"],
  SUPPORT: ["support.access"],
};

export function buildActorContext(args: {
  userId: string;
  email: string | null;
  accountStatus: AccountStatus;
  roles: UserRole[];
}): ActorContext {
  const uniqueRoles = Array.from(new Set(args.roles));
  const permissions = Array.from(
    new Set(uniqueRoles.flatMap((role) => permissionsByRole[role] ?? []))
  );

  return {
    userId: args.userId,
    email: args.email,
    accountStatus: args.accountStatus,
    roles: uniqueRoles,
    permissions,
    isAdmin: uniqueRoles.includes("ADMIN"),
  };
}

export function actorHasRole(actor: ActorContext, role: UserRole) {
  return actor.roles.includes(role);
}

export function actorHasPermission(actor: ActorContext, permission: ActorPermission) {
  return actor.permissions.includes(permission);
}

export function assertActiveActor(actor: ActorContext) {
  if (actor.accountStatus === "ACTIVE") {
    return;
  }

  if (actor.accountStatus === "SUSPENDED") {
    throwClientError("Your account is suspended", 403);
  }

  throwClientError("Your account is not available", 403);
}

export function assertActorHasPermission(
  actor: ActorContext,
  permission: ActorPermission,
  message = "Forbidden"
) {
  if (!actorHasPermission(actor, permission)) {
    throwClientError(message, 403);
  }
}