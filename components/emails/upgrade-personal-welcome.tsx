import React from "react";

import { Body, Head, Html, Preview, Tailwind, Text } from "react-email";

interface UpgradePersonalEmailProps {
  name: string | null | undefined;
  planName?: string;
}

const UpgradePersonalEmail = ({
  name,
  planName = "Pro",
}: UpgradePersonalEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Welcome to {planName}</Preview>
      <Tailwind>
        <Body className="font-sans text-sm">
          <Text>Hi{name && ` ${name}`},</Text>
          <Text>
            Thanks for upgrading! We&apos;re thrilled to have you on the{" "}
            {planName} plan.
          </Text>
          <Text>
            You now have access to advanced features. Any questions so far?
          </Text>
          <Text>The JANAVY Team</Text>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default UpgradePersonalEmail;
