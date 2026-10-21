import { log } from "@/lib/utils";

export default async function sendNotification({
  viewId,
  locationData,
}: {
  viewId: string;
  locationData: {
    continent: string | null;
    country: string;
    region: string;
    city: string;
  };
}) {
  return await fetch(`${process.env.NEXTAUTH_URL}/api/jobs/send-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.INTERNAL_API_KEY}`,
    },
    body: JSON.stringify({ viewId: viewId, locationData }),
  })
    .then(() => {})
    .catch((error) => {
      log({
        message: `Failed to fetch notifications job in _/api/views_ route. \n\n Error: ${error} \n\n*Metadata*: \`{viewId: ${viewId}}\``,
        type: "error",
        mention: true,
      });
    });
}
