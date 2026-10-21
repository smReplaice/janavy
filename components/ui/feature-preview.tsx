import React from "react";

import { LockIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface FeaturePreviewProps {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
  /** Accepted for caller compatibility; plan badges were removed. */
  requiredPlan?: string;
  /** Accepted for caller compatibility; plan badges were removed. */
  trigger?: string;
  /** Accepted for caller compatibility; plan badges were removed. */
  upgradeButtonText?: string;
  /** Accepted for caller compatibility; plan badges were removed. */
  highlightItem?: string[];
}

/**
 * A reusable component that shows a preview of premium features with an
 * upgrade overlay. JANAVY has no subscriptions, so the overlay button no
 * longer opens a plan modal — the component remains for callers that render
 * a locked feature preview.
 *
 * @example
 * ```tsx
 * <FeaturePreview
 *   title="Advanced Analytics"
 *   description="Get detailed insights into document engagement and user behavior"
 * >
 *   <YourMockAnalyticsComponent />
 * </FeaturePreview>
 * ```
 */
export function FeaturePreview({
  title,
  description,
  children,
  className,
  requiredPlan,
  trigger,
  upgradeButtonText = "Unlock",
  highlightItem,
}: FeaturePreviewProps) {
  return (
    <div className={cn("relative", className)}>
      {/* Content with no interaction */}
      <div className="pointer-events-none">{children}</div>

      {/* Gradient overlay that fades the content into the upgrade section */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/90" />

      {/* Upgrade prompt positioned at the bottom */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-8">
        <Card className="max-w-md border-2 border-primary/20 bg-background/95 shadow-lg backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <LockIcon className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription className="text-base">
              {description}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button size="lg" className="w-full" disabled>
              {upgradeButtonText}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
