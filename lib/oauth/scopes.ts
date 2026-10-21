/**
 * OAuth / API-token scope catalog.
 *
 * Reimplements the never-committed `lib/oauth/scopes` module imported by
 * `pages/api/teams/[teamId]/tokens/index.ts` and
 * `components/tokens/scopes.ts`. Independent JANAVI implementation derived
 * from the consuming code's contract:
 *  - presets: `apis.all` (full access) and `apis.read` (read-only)
 *  - granular scopes: `<resource>.<read|write>` where write implies read
 *    (buildScopesList in components/tokens/scopes.ts pushes both).
 * The legacy `full-access` literal is normalized to `apis.all` at the API
 * layer and is NOT part of the catalog itself.
 */

export const PRESET_SCOPES = ["apis.all", "apis.read"] as const;

/** Resources exposed through granular API scopes. */
export const SCOPE_RESOURCES = [
  "documents",
  "links",
  "datarooms",
  "analytics",
  "visitors",
] as const;

export type ScopeResource = (typeof SCOPE_RESOURCES)[number];
export type ScopeAction = "read" | "write";
export type GranularScope = `${ScopeResource}.${ScopeAction}`;

/** All granular `<resource>.<action>` scopes accepted by the tokens API. */
export const GRANULAR_SCOPES: readonly GranularScope[] = SCOPE_RESOURCES
  .flatMap((resource) =>
    (["read", "write"] as const).map(
      (action) => `${resource}.${action}` as GranularScope,
    ),
  );

/** Every scope string the tokens API may persist. */
export const ALLOWED_SCOPES: readonly string[] = [...PRESET_SCOPES, ...GRANULAR_SCOPES];
