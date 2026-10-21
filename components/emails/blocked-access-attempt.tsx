import { Body, Head, Html, Tailwind, Text } from "react-email";

interface BlockedAccessAttemptEmailProps {
  blockedEmail: string;
  linkName: string;
  resourceName: string;
  resourceType: "document" | "dataroom";
  timestamp: string;
  accessType: "global" | "allow" | "deny";
}

const ACCESS_TYPE_LABEL: Record<
  BlockedAccessAttemptEmailProps["accessType"],
  string
> = {
  global: "globally blocked",
  allow: "not on the allow list",
  deny: "on the deny list",
};

const BlockedAccessAttemptEmail = ({
  blockedEmail,
  linkName,
  resourceName,
  resourceType,
  timestamp,
  accessType,
}: BlockedAccessAttemptEmailProps) => {
  return (
    <Html>
      <Head />
      <Tailwind>
        <Body className="font-sans text-sm">
          <Text>Hi,</Text>
          <Text>
            Someone tried to access your {resourceType}{" "}
            <strong>{resourceName}</strong> via the link{" "}
            <strong>{linkName}</strong> but was denied access.
          </Text>
          <Text>
            Email: <strong>{blockedEmail}</strong>
            <br />
            Reason: their email address is {ACCESS_TYPE_LABEL[accessType]}.
            <br />
            Time: {timestamp}
          </Text>
          <Text>
            If this looks like someone who should have access, you can update
            the link&apos;s allow/deny lists in your JANAVY settings.
          </Text>
          <Text>
            Thanks,
            <br />
            JANAVY
          </Text>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default BlockedAccessAttemptEmail;
