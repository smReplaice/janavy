import { NextApiRequest, NextApiResponse } from "next";

import { getLimits } from "@/lib/janavi/limits";
import { authOptions } from "@/lib/auth/auth-options";
import { getServerSession } from "next-auth/next";

import { getFeatureFlags } from "@/lib/featureFlags";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    // GET /api/:teamId/limits
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).end("Unauthorized");
    }

    const { teamId } = req.query as { teamId: string };
    const userId = (session.user as CustomUser).id;

    try {
      // Verify the caller is a member of the team (tenant isolation).
      const team = await prisma.team.findUnique({
        where: {
          id: teamId,
          users: {
            some: {
              userId: userId,
            },
          },
        },
        select: {
          plan: true,
        },
      });

      if (!team) {
        return res.status(404).json("Team not found");
      }

      // JANAVY: plan entitlements are gone — only technical limits and
      // opt-in feature flags remain.
      const limits = await getLimits({ teamId, userId });
      const featureFlags = await getFeatureFlags({ teamId });
      const conversationsInDataroom =
        featureFlags.conversations || !!limits.conversationsInDataroom;
      const dataroomUpload = featureFlags.dataroomUpload;

      return res.status(200).json({
        ...limits,
        conversationsInDataroom,
        dataroomUpload,
      });
    } catch (error) {
      return res.status(500).json((error as Error).message);
    }
  } else {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
