/**
 * Calendar helpers (spec §6, US-19 – US-23). The server enforces every rule
 * (overlaps, approvals, silence = approval); these helpers only shape the UI.
 */

export type EventType = 'guests' | 'party' | 'shabbat_big';
export type EventStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface Period {
  start: Date;
  end: Date;
}

export interface EventResponse {
  user_id: string;
  response: 'approve' | 'reject';
}

export interface CalendarEvent {
  id: string;
  requester_id: string;
  status: EventStatus;
  responses: EventResponse[];
}

/** Postgres timestamps look like "2026-11-25 18:00:00+00"; make them ISO so every JS engine parses them. */
function parseTimestamp(text: string): Date {
  const iso = text.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`Bad timestamp: ${text}`);
  return date;
}

/** Parse a tstzrange as returned by PostgREST, e.g. ["2026-11-25 18:00:00+00","2026-11-25 22:00:00+00"). */
export function parseRange(range: string): Period {
  const match = /^[[(]"?([^",]+)"?,"?([^",]+)"?[\])]$/.exec(range.trim());
  if (!match) throw new Error(`Bad range: ${range}`);
  return { start: parseTimestamp(match[1]), end: parseTimestamp(match[2]) };
}

/** A whole day in local time: midnight to the next midnight. */
export function allDayPeriod(day: Date): Period {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return { start, end };
}

/**
 * Build the requested period from the form: a date plus start and end times.
 * An end time at or before the start time means the event ends the next day (a party until 02:00).
 */
export function buildPeriod(day: Date, startTime: Date, endTime: Date, allDay: boolean): Period {
  if (allDay) return allDayPeriod(day);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), startTime.getHours(), startTime.getMinutes());
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), endTime.getHours(), endTime.getMinutes());
  if (end <= start) end.setDate(end.getDate() + 1);
  return { start, end };
}

export const MAX_EVENT_HOURS = 72;

/** Client-side check before sending. Returns an error key, or null when the request looks fine. */
export function validateRequest(period: Period, now: Date = new Date()): 'past' | 'tooLong' | null {
  if (period.start <= now) return 'past';
  if (period.end.getTime() - period.start.getTime() > MAX_EVENT_HOURS * 3600_000) return 'tooLong';
  return null;
}

export function overlaps(a: Period, b: Period): boolean {
  return a.start < b.end && b.start < a.end;
}

/** What the current user can do with an event. */
export function myAction(event: CalendarEvent, me: string, activePartners: string[]): 'respond' | 'mine' | 'answered' | 'none' {
  if (event.requester_id === me) return 'mine';
  if (event.status !== 'pending') return 'none';
  if (event.responses.some((r) => r.user_id === me)) return 'answered';
  return activePartners.includes(me) ? 'respond' : 'none';
}

export function canCancel(event: CalendarEvent, me: string): boolean {
  return event.requester_id === me && (event.status === 'pending' || event.status === 'approved');
}

/** How many active partners approved so far (the requester counts as approving). */
export function approvalProgress(event: CalendarEvent, activePartners: string[]): { approved: number; total: number } {
  const approved = activePartners.filter((p) =>
    event.responses.some((r) => r.user_id === p && r.response === 'approve'),
  ).length;
  return { approved, total: activePartners.length };
}
