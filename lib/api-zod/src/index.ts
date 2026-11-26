// Zod schemas generated from the OpenAPI spec.
//
// `./generated/api` holds the request/response zod schemas; `./generated/types`
// holds the inferred TypeScript types. They intentionally share some names, so
// the types are re-exported under `*Type` aliases to avoid ambiguous exports.
export * from "./generated/api";
export type {
  AdminLoginResponse as AdminLoginResponseType,
  CreateAdminBody as CreateAdminBodyType,
  UpdateAdminBody as UpdateAdminBodyType,
  SessionHeartbeatBody as SessionHeartbeatBodyType,
} from "./generated/types";
