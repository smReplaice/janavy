"use client";

/**
 * JANAVY viewer conversation sidebar.
 *
 * The Q&A feature is registered in config/features.ts
 * (`JANAVI_FEATURES.conversations`, currently false). Until it ships, this
 * renders nothing; nav mounts and shortcuts stay hidden via the
 * conversation-sidebar-provider (components/conversations/viewer/).
 */

export type ConversationSidebarProps = Record<string, unknown>;

export function ConversationSidebar(_props: ConversationSidebarProps) {
  return null;
}
