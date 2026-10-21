/**
 * Replaice Beacon email adapter.
 *
 * When `BEACON_API_TOKEN` is set, transactional email is dispatched through
 * the Beacon HTTP API (POST …/api/v1/threads) instead of Resend. This module
 * is transport-only: contacts management (subscribe / unsubscribe) is NOT
 * part of the Beacon scope and stays on Resend (see lib/resend.ts).
 *
 * VERIFIED REQUEST CONTRACT (live-validated 2026-10-19):
 *   {
 *     uuid:          string          (required — caller correlation id; also
 *                                    addressable in GET /threads listings)
 *     service_name:  string          (required — BEACON_SERVICE_NAME;
 *                                    "janavy" verified accepted)
 *     domain_number: number          (required — BEACON_DOMAIN_NUMBER)
 *     is_reply:      string "false"  (required — enforced by the validator)
 *     is_new:        string "true"   (docs example; marks a new thread — both
 *                                    fields are accepted together)
 *     from_name:     string          (required — BEACON_FROM_NAME; the sending
 *                                    identity resolves to e.g.
 *                                    "Janavy <janavy@mail.replaice.co>")
 *     subject:       string          (required)
 *     to:            string[]        (required)
 *     html:          string
 *     text?:         string
 *     cc?:           string | string[]
 *   }
 * Responses: 200 {"status":200,"message":"Queued"} on accept. Dispatch is
 * observable via GET /api/v1/threads (list) — dispatched mails carry an SES
 * `thread_id`. Beacon exposes no bounce/open webhooks to us, so delivery is
 * reported as API_ACCEPTED (+DISPATCHED when the SES id appears), never as
 * DELIVERED.
 *
 * Environment:
 *   BEACON_API_TOKEN            required to activate the transport
 *   BEACON_API_URL              full endpoint override (…/api/v1/threads)
 *   BEACON_API_BASE_URL         base-url alternative (default beacon.replaice.co)
 *   BEACON_SERVICE_NAME         default "janavy"
 *   BEACON_DOMAIN_NUMBER        required positive integer (validated)
 *   BEACON_FROM_NAME            default "Janavy"
 *
 * Logging: correlation uuid, endpoint host, HTTP status and Beacon error
 * codes only — never tokens, OTP values or verification links.
 */

const DEFAULT_BEACON_API_BASE_URL = "https://beacon.replaice.co";
const BEACON_TIMEOUT_MS = 10_000;
/** Backoff delays before retry 1 and retry 2 (5xx / network errors only). */
const BEACON_RETRY_DELAYS_MS = [500, 2000];

export type BeaconEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  scheduledAt?: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  tags?: string[];
};

/** Delivery outcome, distinguished per the integration contract. */
export type BeaconDeliveryStatus =
  | "API_ACCEPTED" // Beacon returned 200 — accepted into its queue
  | "DISPATCHED" // Beacon list shows an SES thread_id for our uuid
  | "FAILED" // Beacon rejected (4xx) or all attempts errored
  | "UNKNOWN"; // accepted but not (yet) observable in the thread list

export type BeaconSendResult = {
  status: "API_ACCEPTED" | "FAILED";
  uuid: string;
  threadId?: string;
};

function resolveEndpoint(): string {
  const full = process.env.BEACON_API_URL?.trim();
  if (full) return full.replace(/\/+$/, "");
  const base = (
    process.env.BEACON_API_BASE_URL || DEFAULT_BEACON_API_BASE_URL
  ).replace(/\/+$/, "");
  return `${base}/api/v1/threads`;
}

/**
 * Map our email params to the verified Beacon payload (snake_case tags;
 * `is_reply`/`is_new` as strings; `to` as an array).
 * This builder is the ONLY place that knows the wire contract.
 */
export function buildBeaconPayload(
  params: BeaconEmailParams,
): Record<string, unknown> {
  const to = Array.isArray(params.to) ? params.to : [params.to];
  const uuid = params.idempotencyKey ?? globalThis.crypto.randomUUID();

  return {
    uuid,
    service_name: process.env.BEACON_SERVICE_NAME || "janavy",
    domain_number: beaconDomainNumber(),
    is_reply: "false",
    is_new: "true",
    from_name: process.env.BEACON_FROM_NAME || "Janavy",
    subject: params.subject,
    to,
    html: params.html,
    ...(params.text !== undefined ? { text: params.text } : {}),
    ...(params.cc ? { cc: params.cc } : {}),
  };
}

function beaconDomainNumber(): number {
  const parsed = Number(process.env.BEACON_DOMAIN_NUMBER);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      "BEACON_DOMAIN_NUMBER must be set to a positive integer when sending via Beacon",
    );
  }
  return parsed;
}

type BeaconAttemptError = Error & { status?: number };

async function sendOnce(
  url: string,
  token: string,
  payload: Record<string, unknown>,
): Promise<{ id?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BEACON_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-BEACON-TOKEN": token,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (response.ok) {
      const body: unknown = await response.json().catch(() => null);
      return { id: resolveThreadId(body) };
    }

    const detail = await response.text().catch(() => "");
    const error: BeaconAttemptError = new Error(
      `Beacon email API responded with status ${response.status}` +
        (detail ? `: ${detail.slice(0, 300)}` : ""),
    );
    error.status = response.status;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveThreadId(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as {
    id?: unknown;
    threadId?: unknown;
    uuid?: unknown;
    data?: { id?: unknown } | string | null;
  };
  if (typeof record.id === "string") return record.id;
  if (typeof record.threadId === "string") return record.threadId;
  if (typeof record.uuid === "string") return record.uuid;
  if (record.data && typeof record.data === "object") {
    if (typeof record.data.id === "string") return record.data.id;
  }
  return undefined;
}

/**
 * Send an email through the Beacon HTTP API.
 *
 * Safe diagnostics: logs the correlation uuid, endpoint host, attempt
 * outcomes and Beacon error codes — never tokens, codes or links.
 * Retries up to 2 times (500 ms / 2 s backoff) on 5xx/network errors.
 */
export async function sendEmailViaBeacon(
  params: BeaconEmailParams,
): Promise<BeaconSendResult> {
  const token = process.env.BEACON_API_TOKEN;
  if (!token) {
    throw new Error(
      "BEACON_API_TOKEN is not set; cannot send email via Beacon",
    );
  }

  const url = resolveEndpoint();
  const payload = buildBeaconPayload(params);
  const uuid = String(payload.uuid);
  const recipientCount = (payload.to as string[]).length;
  console.log(
    `[beacon] send request ${uuid} -> ${new URL(url).host} (${recipientCount} recipient(s))`,
  );

  let lastError: unknown;
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await sendOnce(url, token, payload);
      console.log(`[beacon] request ${uuid} accepted (attempt ${attempt + 1})`);
      return { status: "API_ACCEPTED", uuid, threadId: result.id };
    } catch (error) {
      lastError = error;
      const status = (error as BeaconAttemptError).status;
      console.warn(
        `[beacon] request ${uuid} failed with status=${status ?? "network/timeout"} (attempt ${attempt + 1})`,
      );
      const retryable = status === undefined || status >= 500;
      if (!retryable || attempt >= BEACON_RETRY_DELAYS_MS.length) {
        break;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, BEACON_RETRY_DELAYS_MS[attempt]),
      );
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Beacon email API failed after ${BEACON_RETRY_DELAYS_MS.length + 1} attempts: ${message}`,
  );
}

/**
 * Best-effort delivery observation: look our uuid up in Beacon's thread
 * list. A thread with an SES `thread_id` proves dispatch (DISPATCHED);
 * absence after acceptance is UNKNOWN (Beacon exposes no bounce status to
 * us, so DELIVERED is never claimed).
 */
export async function getBeaconDeliveryStatus(
  uuid: string,
): Promise<BeaconDeliveryStatus> {
  const token = process.env.BEACON_API_TOKEN;
  if (!token) return "UNKNOWN";
  try {
    const url = `${resolveEndpoint()}?page_size=100`;
    const response = await fetch(url, {
      headers: { "X-BEACON-TOKEN": token, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return "UNKNOWN";
    const body = (await response.json()) as {
      data?: { data?: Array<{ uuid?: string; thread_id?: string }> } | null;
    };
    const threads = body.data?.data ?? [];
    const match = threads.find((t) => t.uuid === uuid);
    if (!match) return "UNKNOWN";
    return match.thread_id ? "DISPATCHED" : "API_ACCEPTED";
  } catch {
    return "UNKNOWN";
  }
}
