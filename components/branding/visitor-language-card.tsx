import { CrownIcon, LanguagesIcon } from "lucide-react";

import {
  DEFAULT_LOCALE,
  type SupportedLocaleCode,
  SUPPORTED_LOCALES,
} from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Default viewer language selector. English is free on every plan; other
 * languages require an eligible plan and render with a crown hint when
 * `hasAccess` is false.
 */
export function VisitorLanguageCard({
  defaultLanguage,
  onDefaultLanguageChange,
  hasAccess,
}: {
  defaultLanguage: SupportedLocaleCode;
  onDefaultLanguageChange: (language: SupportedLocaleCode) => void;
  hasAccess: boolean;
}) {
  const isFreeChoice = (code: SupportedLocaleCode) =>
    hasAccess || code === DEFAULT_LOCALE;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <LanguagesIcon
          className="h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="text-sm font-medium text-foreground">
          Default viewer language
        </span>
        {!hasAccess && (
          <CrownIcon
            className="h-3.5 w-3.5 text-muted-foreground"
            aria-label="Data Rooms Plus feature"
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        The access form, viewer chrome and card labels render in this language
        for everyone who opens a link. Visitors cannot switch languages.
        {!hasAccess
          ? " English is available on every plan; other languages require Data Rooms Plus."
          : ""}
      </p>
      <Select
        value={defaultLanguage}
        onValueChange={(value) => {
          if (isFreeChoice(value as SupportedLocaleCode)) {
            onDefaultLanguageChange(value as SupportedLocaleCode);
          }
        }}
      >
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Language" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel className="text-xs font-normal text-muted-foreground">
              Languages
            </SelectLabel>
            {SUPPORTED_LOCALES.map((locale) => {
              const selectable = isFreeChoice(locale.code);
              return (
                <SelectItem
                  key={locale.code}
                  value={locale.code}
                  disabled={!selectable}
                  className={cn(selectable ? undefined : "opacity-50")}
                >
                  <span className="flex items-center gap-2">
                    {locale.nativeName}
                    <span className="text-xs font-normal text-muted-foreground">
                      {locale.englishName}
                    </span>
                    {!selectable && (
                      <CrownIcon
                        className="h-3 w-3 text-muted-foreground"
                        aria-label="Data Rooms Plus feature"
                      />
                    )}
                  </span>
                </SelectItem>
              );
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
