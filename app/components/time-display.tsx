import type { ReactNode } from "react";
import { useViewerTimeZone } from "@/hooks/useViewerTimeZone";
import {
  formatDateRangeInTimeZone,
  formatDateTimeInTimeZone,
  getTimeZoneLabel,
} from "@/lib/date-time";

type HintAlign = "left" | "right";
type TimeDisplayMode = "event-primary" | "viewer-primary";

function DualTimeHint(props: {
  displayText?: ReactNode;
  primaryLabel: string;
  primaryText: string;
  secondaryLabel: string;
  secondaryText: string;
  align?: HintAlign;
}) {
  const displayText = props.displayText ?? props.primaryText;

  if (props.primaryText.trim() === props.secondaryText.trim()) {
    return <span className="min-w-0">{displayText}</span>;
  }

  return (
    <span className="group relative inline-flex max-w-full">
      <span className="min-w-0">{displayText}</span>
      <span
        className={[
          "pointer-events-none absolute top-full z-30 mt-2 hidden min-w-[260px] rounded-xl border border-[#d8e3f0] bg-[#ffffff] px-3 py-3 text-left shadow-[0_10px_30px_rgba(0,0,0,0.12)] group-hover:block group-focus-within:block",
          props.align === "right" ? "right-0" : "left-0",
        ].join(" ")}
      >
        <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5e738a]">
          {props.primaryLabel}
        </span>
        <span className="mt-1 block text-xs leading-5 text-[#16324f]">
          {props.primaryText}
        </span>
        <span className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5e738a]">
          {props.secondaryLabel}
        </span>
        <span className="mt-1 block text-xs leading-5 text-[#16324f]">
          {props.secondaryText}
        </span>
      </span>
    </span>
  );
}

function getLabels(mode: TimeDisplayMode, eventLabel: string) {
  if (mode === "event-primary") {
    return {
      primaryLabel: eventLabel,
      secondaryLabel: "Your time",
    };
  }

  return {
    primaryLabel: "Your time",
    secondaryLabel: eventLabel,
  };
}

export function TimeDisplay(props: {
  utcIso: string | Date;
  eventTimeZone?: string | null;
  mode: TimeDisplayMode;
  align?: HintAlign;
  eventLabel?: string;
  options?: Intl.DateTimeFormatOptions;
}) {
  const { viewerTimeZone } = useViewerTimeZone();
  const eventTimeZone = props.eventTimeZone ?? viewerTimeZone;
  const eventLabel = props.eventLabel ?? "Listing time";
  const eventText = formatDateTimeInTimeZone(props.utcIso, eventTimeZone, props.options);
  const viewerText = formatDateTimeInTimeZone(props.utcIso, viewerTimeZone, props.options);
  const labels = getLabels(props.mode, eventLabel);

  return (
    <DualTimeHint
      align={props.align}
      primaryLabel={labels.primaryLabel}
      primaryText={props.mode === "event-primary" ? eventText : viewerText}
      secondaryLabel={labels.secondaryLabel}
      secondaryText={props.mode === "event-primary" ? viewerText : eventText}
    />
  );
}

export function TimeRangeDisplay(props: {
  startUtcIso: string;
  endUtcIso: string;
  eventTimeZone?: string | null;
  mode: TimeDisplayMode;
  align?: HintAlign;
  eventLabel?: string;
}) {
  const { viewerTimeZone } = useViewerTimeZone();
  const eventTimeZone = props.eventTimeZone ?? viewerTimeZone;
  const eventLabel = props.eventLabel ?? "Listing time";
  const eventText = formatDateRangeInTimeZone(props.startUtcIso, props.endUtcIso, eventTimeZone);
  const viewerText = formatDateRangeInTimeZone(props.startUtcIso, props.endUtcIso, viewerTimeZone);
  const labels = getLabels(props.mode, eventLabel);

  return (
    <DualTimeHint
      align={props.align}
      primaryLabel={labels.primaryLabel}
      primaryText={props.mode === "event-primary" ? eventText : viewerText}
      secondaryLabel={labels.secondaryLabel}
      secondaryText={props.mode === "event-primary" ? viewerText : eventText}
    />
  );
}

export function TimeTextHint(props: {
  children?: ReactNode;
  primaryText: string;
  secondaryText: string;
  mode: TimeDisplayMode;
  align?: HintAlign;
  eventLabel?: string;
}) {
  const labels = getLabels(props.mode, props.eventLabel ?? "Listing time");

  return (
    <DualTimeHint
      displayText={props.children ?? props.primaryText}
      align={props.align}
      primaryLabel={labels.primaryLabel}
      primaryText={props.primaryText}
      secondaryLabel={labels.secondaryLabel}
      secondaryText={props.secondaryText}
    />
  );
}

export function TimeZoneLabel(props: { timeZone: string }) {
  return <>{getTimeZoneLabel(props.timeZone)}</>;
}
