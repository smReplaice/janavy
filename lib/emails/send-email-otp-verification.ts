import {
  resolveBrandLogo,
  type ResolvedBrandLogo,
} from "@/lib/branding/brand-logo";
import { resolveBaseBrand } from "@/lib/branding/resolve-base-brand";

import { getCustomEmail } from "@/lib/edge-config/custom-email";
import { readCachedBrandLogo } from "@/lib/redis/brand-logo-cache";
import { sendEmail } from "@/lib/resend";

import OtpEmailVerification from "@/components/emails/otp-verification";

export type OtpBrandContext = {
  linkBrandId?: string | null;
  dataroomBrandId?: string | null;
};

export const sendOtpVerificationEmail = async (
  email: string,
  code: string,
  isDataroom: boolean = false,
  teamId: string,
  brandContext?: OtpBrandContext,
) => {
  let logo: ResolvedBrandLogo | undefined;
  let from: string | undefined;

  const customEmail = await getCustomEmail(teamId);

  if (customEmail && teamId) {
    from = customEmail;
    const hasOverride = !!(
      brandContext?.linkBrandId || brandContext?.dataroomBrandId
    );
    if (hasOverride) {
      const brand = await resolveBaseBrand({
        teamId,
        linkBrandId: brandContext?.linkBrandId,
        dataroomBrandId: brandContext?.dataroomBrandId,
        select: { logo: true, hideLogo: true },
      });
      logo = resolveBrandLogo(brand);
    } else {
      logo = await readCachedBrandLogo(teamId);
    }
  }

  const emailTemplate = OtpEmailVerification({
    email,
    code,
    isDataroom,
    logo,
  });

  try {
    await sendEmail({
      from,
      to: email,
      subject: `${code} is your Janavy verification code`,
      react: emailTemplate,
      verify: true,
    });
  } catch (e) {
    console.error(e);
  }
};
