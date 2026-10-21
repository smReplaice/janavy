/**
 * Janavy auth marketing panel — right column of the login/register pages.
 *
 * Premium security-focused panel using the official janavy.com palette
 * (#0A1234 navy, #123DFF brand blue, #FFD236 highlight) and Geist-adjacent
 * system typography. All document data shown is an illustrative product
 * mock (captioned), never real customer data or evidence of shipped claims.
 */
import {
  Activity,
  Eye,
  FileLock,
  KeyRound,
  LockKeyhole,
  ScanEye,
  ShieldCheck,
  Share2,
} from "lucide-react";

const FEATURES = [
  {
    icon: LockKeyhole,
    title: "Prevent Data Leaks",
    text: "Restrict downloads, copying and printing to keep confidential information protected.",
  },
  {
    icon: Activity,
    title: "Track Every View",
    text: "Know who accessed your documents, when they opened them and how they engaged.",
  },
  {
    icon: ShieldCheck,
    title: "Maintain Control",
    text: "Revoke access anytime, even after sharing.",
  },
  {
    icon: FileLock,
    title: "Protect Sensitive Information",
    text: "Dynamic watermarking, granular permissions and AI usage protection policies.",
  },
] as const;

const CAPABILITIES = [
  { icon: Share2, label: "Secure Sharing" },
  { icon: KeyRound, label: "Access Control" },
  { icon: ScanEye, label: "Document Tracking" },
  { icon: ShieldCheck, label: "Data Protection" },
] as const;

const PROTECTIONS = [
  "Disable Download",
  "Disable Copy",
  "Disable Print",
  "Dynamic Watermark",
] as const;

export function AuthMarketingPanel() {
  return (
    <div
      className="relative hidden w-full justify-center overflow-hidden md:flex md:w-[45%] lg:w-[45%]"
      style={{ backgroundColor: "#050A22" }}
    >
      {/* brand-blue radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 60% at 70% 10%, rgba(18,61,255,0.35) 0%, rgba(18,61,255,0) 60%), radial-gradient(60% 50% at 20% 90%, rgba(18,61,255,0.18) 0%, rgba(18,61,255,0) 65%)",
        }}
      />
      <div className="relative flex h-full w-full flex-col items-center justify-center overflow-y-auto px-8 py-10 lg:px-12">
        <div className="flex w-full max-w-md flex-col items-start gap-8">
          {/* Headline */}
          <div className="flex flex-col gap-3">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white lg:text-[2.4rem]">
              Share with Confidence.
              <br />
              Stay in Control.
            </h2>
            <p className="text-sm leading-relaxed text-[#8FA3D8]">
              Janavy helps you securely share sensitive documents with
              advanced protection, real-time tracking and complete control
              over your information.
            </p>
          </div>

          {/* Feature highlights */}
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-4 transition-colors duration-200 hover:border-[#3866FF]/50 hover:bg-white/[0.06]"
              >
                <div
                  className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "rgba(18,61,255,0.18)" }}
                >
                  <Icon className="h-4 w-4 text-[#6C8DFF]" />
                </div>
                <h3 className="text-sm font-medium text-white">{title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-[#8FA3D8]">
                  {text}
                </p>
              </div>
            ))}
          </div>

          {/* Illustrative document-protection hero */}
          <div className="w-full">
            <div
              className="relative overflow-hidden rounded-xl border border-white/10 shadow-2xl"
              style={{ backgroundColor: "#0A1234" }}
            >
              {/* diagonal CONFIDENTIAL watermark */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <span
                  className="select-none text-2xl font-bold tracking-[0.35em] opacity-[0.08]"
                  style={{ color: "#6C8DFF", transform: "rotate(-18deg)" }}
                >
                  CONFIDENTIAL · CONFIDENTIAL
                </span>
              </div>
              <div className="relative flex items-start justify-between gap-3 p-5">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "rgba(18,61,255,0.18)" }}
                  >
                    <FileLock className="h-4 w-4 text-[#6C8DFF]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      Strategic Partnership Agreement
                    </p>
                    <p className="mt-0.5 text-xs text-[#8FA3D8]">
                      Protected document · Janavy
                    </p>
                  </div>
                </div>
                <span
                  className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{ backgroundColor: "rgba(255,210,54,0.12)", color: "#FFD236" }}
                >
                  <Eye className="h-3 w-3" />
                  Viewed — 12 times
                </span>
              </div>
              <div className="relative grid grid-cols-2 gap-2 px-5 pb-5">
                {PROTECTIONS.map((label) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                  >
                    <span className="text-xs text-[#B5C3E8]">{label}</span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-4 w-7 items-center rounded-full px-0.5"
                        style={{ backgroundColor: "#123DFF" }}
                      >
                        <span className="mt-0.5 block h-3 w-3 translate-x-3 rounded-full bg-white" />
                      </span>
                      <span className="text-[10px] font-semibold tracking-wide text-[#6C8DFF]">
                        ON
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-2 text-center text-[10px] tracking-wide text-[#5B6C99]">
              Illustrative preview — not real customer data
            </p>
          </div>

          {/* Capability strip (replaces third-party customer logos) */}
          <div className="w-full border-t border-white/10 pt-6">
            <p className="mb-3 text-center text-[10px] font-semibold tracking-[0.25em] text-[#5B6C99]">
              BUILT FOR CONFIDENTIAL INFORMATION
            </p>
            <div className="grid grid-cols-4 gap-2">
              {CAPABILITIES.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-1 py-3"
                >
                  <Icon className="h-4 w-4 text-[#6C8DFF]" />
                  <span className="text-center text-[10px] leading-tight text-[#8FA3D8]">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
