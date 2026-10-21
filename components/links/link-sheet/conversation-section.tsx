"use client";

/**
 * JANAVY link-option section for viewer Q&A.
 *
 * Hidden until `JANAVI_FEATURES.conversations` is enabled (config/features.ts).
 * The link payload field `enableConversation` remains in the schema for when
 * the feature ships.
 */
import { JANAVI_FEATURES } from "@/config/features";

export default function ConversationSection(_props: {
  // Props are passed through opaquely until the Q&A feature ships.
  [key: string]: unknown;
}) {
  if (!JANAVI_FEATURES.conversations) {
    return null;
  }
  return null; // Q&A options UI ships with the conversations feature (P2)
}
