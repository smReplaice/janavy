/**
 * Restricted-token (API key) revocation on membership loss.
 *
 * Reimplements the never-committed `lib/api/auth/restricted-tokens` module
 * imported by `pages/api/teams/[teamId]/remove-teammate.ts`. Independent
 * JANAVI implementation based on the RestrictedToken model contract in
 * prisma/schema/schema.prisma: keys with `subjectType: "user"` are bound to
 * their creator's membership and must stop working when that membership ends;
 * "machine" keys stay team-scoped.
 */
import prisma from "@/lib/prisma";

import { z } from "zod";

/** Subject types a restricted token can be bound to (RestrictedToken.subjectType). */
export const RestrictedTokenSubjectTypeSchema = z.enum(["user", "machine"]);

export type RestrictedTokenSubjectType = z.infer<
  typeof RestrictedTokenSubjectTypeSchema
>;

/** Parse a subject type from untrusted input, defaulting to "user" (legacy). */
export function parseRestrictedTokenSubjectType(
  value: unknown,
): RestrictedTokenSubjectType {
  const parsed = RestrictedTokenSubjectTypeSchema.safeParse(
    typeof value === "string" ? value.trim().toLowerCase() : value,
  );
  return parsed.success ? parsed.data : "user";
}

/**
 * Revoke all user-bound API keys for a user within a team. Machine keys are
 * left untouched. Called when a teammate is removed from a workspace.
 */
export async function revokeUserBoundTeamTokens(
  user: { id: string } | string,
  teamId: string,
): Promise<number> {
  const userId = typeof user === "string" ? user : user.id;
  const result = await prisma.restrictedToken.deleteMany({
    where: {
      userId,
      teamId,
      subjectType: "user",
    },
  });
  return result.count;
}
