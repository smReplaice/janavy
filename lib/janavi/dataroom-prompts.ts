/**
 * JANAVI prompts for the AI dataroom-structure generator.
 *
 * Import-compatible replacement for the commercial
 * `ee/features/templates/lib/prompts` helpers. JANAVI is self-hosted: the
 * prompts live here instead of being fetched from Vercel Edge Config, so no
 * external configuration is required. The output contract matches the zod
 * schema used by `/api/teams/:teamId/datarooms/generate-ai-structure`
 * (name + up to 8 top-level folders, each with up to 5 subfolders).
 */

export async function getDataroomSystemPrompt(): Promise<string> {
  return [
    "You are a data room architect.",
    "Given a short description of a project or transaction, propose a clear",
    "folder structure for a virtual data room.",
    "Use standard due-diligence naming conventions where they apply",
    "(e.g. Corporate Documents, Financials, Legal, HR, Commercial).",
    "Respond ONLY with JSON matching this shape:",
    '{"name": string, "folders": Array<{"name": string, "subfolders": string[]}>}',
    "Rules: 1 to 8 top-level folders; each folder has 0 to 5 subfolders;",
    "no nesting beyond two levels; short, human-readable names;",
    "no documents, only folders; no duplicate names among siblings.",
  ].join(" ");
}

export async function getDataroomUserPrompt(
  description: string,
): Promise<string> {
  return `Propose a data room folder structure for the following description:\n\n${description.trim()}`;
}
