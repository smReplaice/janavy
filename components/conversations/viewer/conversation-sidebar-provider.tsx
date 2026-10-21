"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { JANAVI_FEATURES } from "@/config/features";
import { cn } from "@/lib/utils";

/**
 * Conversation (Q&A) sidebar state for the viewer (JANAVY).
 *
 * The provider owns the sidebar open/close state shared between the nav
 * toggle, the 'c' keyboard shortcut and the layout that pads the document
 * content while the panel is open. Whether the sidebar can be used at all
 * is `JANAVI_FEATURES.conversations` AND the link/dataroom flag passed in
 * by the viewer — when the feature is off (current state) the toggle in
 * the navs must not render and the shortcuts no-op, so `isOpen` can never
 * become true.
 *
 * TODO(P2 Q&A): render the actual Q&A panel (thread list + messages over
 * the DataroomQuestion/Conversation Prisma models) inside
 * `ConversationSidebarLayout` when JANAVI_FEATURES.conversations is
 * enabled. Until then no panel content exists; the navs' ConversationSidebar
 * mounts are gated by the same flag.
 */

export type ConversationSidebarContextValue = {
  /** Whether the Q&A panel is currently open. */
  isOpen: boolean;
  /** Open/close the panel. Ignored while the feature is disabled. */
  setOpen: (open: boolean) => void;
  /** Toggle the panel. No-op while the feature is disabled. */
  toggle: () => void;
  /**
   * Whether conversations may be used at all: the deployment feature flag
   * AND the link/dataroom-level flag. False hides every toggle and disables
   * every shortcut.
   */
  conversationsEnabled: boolean;
};

const ConversationSidebarContext =
  createContext<ConversationSidebarContextValue | null>(null);

export function ConversationSidebarProvider({
  children,
  /** Link/dataroom-level conversations flag from the view data. */
  conversationsEnabled: linkConversationsEnabled = false,
}: {
  children: React.ReactNode;
  conversationsEnabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const conversationsEnabled =
    JANAVI_FEATURES.conversations && linkConversationsEnabled;

  const setOpen = useCallback(
    (open: boolean) => {
      // Fail closed: while the feature is disabled the panel never opens.
      if (!conversationsEnabled) return;
      setIsOpen(open);
    },
    [conversationsEnabled],
  );

  const toggle = useCallback(() => setOpen(!isOpen), [setOpen, isOpen]);

  const value = useMemo(
    () => ({ isOpen, setOpen, toggle, conversationsEnabled }),
    [isOpen, setOpen, toggle, conversationsEnabled],
  );

  return (
    <ConversationSidebarContext.Provider value={value}>
      {children}
    </ConversationSidebarContext.Provider>
  );
}

/** Read the sidebar context; throws when used outside the provider. */
export function useConversationSidebar(): ConversationSidebarContextValue {
  const context = useContext(ConversationSidebarContext);
  if (!context) {
    throw new Error(
      "useConversationSidebar must be used within a ConversationSidebarProvider",
    );
  }
  return context;
}

/**
 * Read the sidebar context from components that can render both inside and
 * outside the provider (navs, banner, ...): returns `undefined` instead of
 * throwing, so callers can fall back to closed/disabled.
 */
export function useConversationSidebarSafe(): ConversationSidebarContextValue | undefined {
  return useContext(ConversationSidebarContext) ?? undefined;
}

/** Width of the Q&A panel (400px); the navs counter-shift by the same amount. */

/**
 * Layout wrapper for the document/dataroom content. While the Q&A panel is
 * open, pads the content on the right by the panel width (with the same
 * easing the navs counter-shift with) so content is never hidden under the
 * panel. No panel content is rendered here yet — see the TODO(P2) above;
 * with the feature disabled `isOpen` is always false and this is a pass-through.
 */
export function ConversationSidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isOpen } = useConversationSidebar();
  return (
    <div
      className={cn(
        "transition-[padding] duration-300 ease-in-out",
        isOpen && "pr-[400px]",
      )}
      data-conversation-sidebar-open={isOpen}
    >
      {children}
    </div>
  );
}
