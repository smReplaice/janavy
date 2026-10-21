import React from "react";

import { Body, Head, Html, Preview, Tailwind, Text } from "react-email";

interface ThousandViewsCongratsEmailProps {
  name: string | null | undefined;
}

const ThousandViewsCongratsEmail = ({
  name,
}: ThousandViewsCongratsEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>1000 views on JANAVY.</Preview>
      <Tailwind>
        <Body className="font-sans text-sm">
          <Text>Hi{name && ` ${name}`},</Text>
          <Text>Congrats on 1000 views on your documents.</Text>
          <Text>How is your experience so far?</Text>

          <Text>
            Best,
            <br />
            The JANAVY Team
          </Text>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default ThousandViewsCongratsEmail;
