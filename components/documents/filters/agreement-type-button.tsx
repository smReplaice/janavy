import { useRouter } from "next/router";

import { useEffect, useState } from "react";

import { CheckIcon, FileSignature, XCircleIcon } from "lucide-react";

import { AGREEMENT_TYPE_OPTIONS } from "@/lib/documents/agreement";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { cn } from "@/lib/utils";

/**
 * "Agreement" category filter for the All Documents page. Sets/clears the
 * `?agreementType=` query param consumed by the documents GET API (same
 * mechanism as the sort button next to it).
 */
export default function AgreementTypeButton() {
  const router = useRouter();
  const [agreementType, setAgreementType] = useState<string | null>(null);

  useEffect(() => {
    const { agreementType } = router.query;
    setAgreementType(typeof agreementType === "string" ? agreementType : null);
  }, [router.query]);

  useEffect(() => {
    const currentQuery = { ...router.query };

    if (agreementType === null) {
      delete currentQuery.agreementType;
      delete currentQuery.page;
      delete currentQuery.limit;
    } else {
      currentQuery.agreementType = agreementType;
      currentQuery.page = "1";
    }

    router.push(
      {
        pathname: router.pathname,
        query: currentQuery,
      },
      undefined,
      { shallow: true },
    );
  }, [agreementType]);

  return (
    <div className="relative inline-block">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size={agreementType === null ? "icon" : "default"}
            variant={"outline"}
            title="Filter by agreement type"
            className={cn(
              "space-x-2",
              agreementType !== null && "border-2 border-foreground",
            )}
          >
            <FileSignature className="h-4 w-4" />
            {agreementType !== null && (
              <span className="font-medium">{agreementType}</span>
            )}
            <span className="sr-only">Filter by agreement type</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end">
          <DropdownMenuLabel>Agreement type</DropdownMenuLabel>
          {AGREEMENT_TYPE_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => setAgreementType(option.value)}
              disabled={agreementType === option.value}
            >
              <FileSignature className="mr-2 h-4 w-4" />
              {option.label}
              {agreementType === option.value && (
                <CheckIcon className="ml-auto h-4 w-4" />
              )}
            </DropdownMenuItem>
          ))}
          {agreementType !== null && (
            <DropdownMenuItem
              onClick={() => setAgreementType(null)}
              className="text-destructive focus:bg-destructive/80"
            >
              <XCircleIcon className="mr-2 h-4 w-4" />
              Reset Filter
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
