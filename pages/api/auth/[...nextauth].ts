import { NextApiRequest, NextApiResponse } from "next";

import NextAuth, { type NextAuthOptions } from "next-auth";

import { identifyUser, trackAnalytics } from "@/lib/analytics";
import { authOptions } from "@/lib/auth/auth-options";
import { isBlacklistedEmail } from "@/lib/edge-config/blacklist";
import { ratelimit } from "@/lib/redis";
import { log } from "@/lib/utils";
import { getIpAddress } from "@/lib/utils/ip";

export { authOptions } from "@/lib/auth/auth-options";

// This function can run for a maximum of 180 seconds
export const config = {
  maxDuration: 180,
};

// JANAVY: signin IP rate limit (replaces the commercial security module).
// Fail-open if Redis is unavailable so auth keeps working; the limit itself
// must stay — it is an operational control, not a plan entitlement.
const signinRateLimiter = ratelimit(10, "20 m");

const getAuthOptions = (req: NextApiRequest): NextAuthOptions => {
  return {
    ...authOptions,
    callbacks: {
      ...authOptions.callbacks,
      signIn: async ({ user }) => {
        if (!user.email || (await isBlacklistedEmail(user.email))) {
          await identifyUser(user.email ?? user.id);
          await trackAnalytics({
            event: "User Sign In Attempted",
            email: user.email ?? undefined,
            userId: user.id,
          });
          return false;
        }

        // Apply rate limiting for signin attempts
        try {
          if (req) {
            const clientIP = getIpAddress(req.headers);

            let rateLimitResult;
            try {
              rateLimitResult = await signinRateLimiter.limit(clientIP);
            } catch (error) {
              // Fail open — allow the attempt if rate limiting is unavailable
              rateLimitResult = { success: true };
            }

            if (!rateLimitResult.success) {
              log({
                message: `Rate limit exceeded for IP ${clientIP} during signin attempt`,
                type: "error",
              });
              return false;
            }
          }
        } catch (error) {}

        return true;
      },
    },
    events: {
      ...authOptions.events,
      signIn: async (message) => {
        await Promise.allSettled([
          identifyUser(message.user.email ?? message.user.id),
          trackAnalytics({
            event: "User Signed In",
            email: message.user.email,
          }),
        ]);

      },
    },
  };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  return NextAuth(req, res, getAuthOptions(req));
}
