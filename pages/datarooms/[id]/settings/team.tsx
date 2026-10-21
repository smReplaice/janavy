import { useDataroom } from "@/lib/swr/use-dataroom";

import DataroomTeamMembers from "@/components/datarooms/settings/dataroom-team-members";
import AppLayout from "@/components/layouts/app";

export default function DataroomTeamSettings() {
  const { dataroom } = useDataroom();

  if (!dataroom) {
    return <div>Loading...</div>;
  }

  return (
    <AppLayout>
      <main className="relative mx-2 mb-10 mt-4 space-y-8 overflow-hidden px-1 sm:mx-3 md:mx-5 md:mt-5 lg:mx-7 lg:mt-8 xl:mx-10">
        <div className="space-y-1">
          <h3 className="text-2xl font-semibold tracking-tight text-foreground">
            Team members
          </h3>
          <p className="text-sm text-muted-foreground">
            Add teammates to this data room and manage who can access it.
          </p>
        </div>

        <DataroomTeamMembers
          dataroomId={dataroom.id}
          dataroomName={dataroom.name}
        />
      </main>
    </AppLayout>
  );
}
