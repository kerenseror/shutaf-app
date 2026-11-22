import {
  allDayPeriod,
  approvalProgress,
  buildPeriod,
  canCancel,
  CalendarEvent,
  myAction,
  overlaps,
  parseRange,
  validateRequest,
} from '../calendar';

describe('parseRange', () => {
  it('parses a PostgREST tstzrange', () => {
    const p = parseRange('["2026-11-25 18:00:00+00","2026-11-25 22:00:00+00")');
    expect(p.start.toISOString()).toBe('2026-11-25T18:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-11-25T22:00:00.000Z');
  });

  it('handles other offsets and fractional seconds', () => {
    const p = parseRange('["2026-11-25 20:00:00.5+02","2026-11-26 01:30:00+05:30")');
    expect(p.start.toISOString()).toBe('2026-11-25T18:00:00.500Z');
    expect(p.end.toISOString()).toBe('2026-11-25T20:00:00.000Z');
  });

  it('rejects junk', () => {
    expect(() => parseRange('empty')).toThrow();
  });
});

describe('buildPeriod', () => {
  const day = new Date(2026, 10, 25);
  const at = (h: number, m = 0) => new Date(2026, 0, 1, h, m);

  it('combines the date with the start and end times', () => {
    const p = buildPeriod(day, at(18), at(22, 30), false);
    expect([p.start.getDate(), p.start.getHours()]).toEqual([25, 18]);
    expect([p.end.getDate(), p.end.getHours(), p.end.getMinutes()]).toEqual([25, 22, 30]);
  });

  it('an end time before the start means the next day', () => {
    const p = buildPeriod(day, at(21), at(2), false);
    expect([p.end.getDate(), p.end.getHours()]).toEqual([26, 2]);
  });

  it('a whole day runs from midnight to the next midnight', () => {
    const p = allDayPeriod(new Date(2026, 10, 25, 15, 40));
    expect([p.start.getDate(), p.start.getHours(), p.start.getMinutes()]).toEqual([25, 0, 0]);
    expect([p.end.getDate(), p.end.getHours()]).toEqual([26, 0]);
    expect(buildPeriod(day, at(18), at(19), true)).toEqual(p);
  });
});

describe('validateRequest', () => {
  const now = new Date('2026-11-22T10:00:00Z');
  it('rejects the past and events longer than 3 days', () => {
    expect(validateRequest({ start: new Date('2026-11-22T09:00:00Z'), end: new Date('2026-11-22T12:00:00Z') }, now)).toBe('past');
    expect(validateRequest({ start: new Date('2026-11-23T09:00:00Z'), end: new Date('2026-11-27T09:00:00Z') }, now)).toBe('tooLong');
    expect(validateRequest({ start: new Date('2026-11-23T18:00:00Z'), end: new Date('2026-11-23T23:00:00Z') }, now)).toBeNull();
  });
});

describe('overlaps', () => {
  const p = (a: string, b: string) => ({ start: new Date(a), end: new Date(b) });
  it('touching events do not overlap', () => {
    expect(overlaps(p('2026-11-25T18:00Z', '2026-11-25T20:00Z'), p('2026-11-25T20:00Z', '2026-11-25T22:00Z'))).toBe(false);
    expect(overlaps(p('2026-11-25T18:00Z', '2026-11-25T21:00Z'), p('2026-11-25T20:00Z', '2026-11-25T22:00Z'))).toBe(true);
  });
});

describe('who does what', () => {
  const partners = ['a', 'b', 'c'];
  const event: CalendarEvent = {
    id: 'e1',
    requester_id: 'a',
    status: 'pending',
    responses: [
      { user_id: 'a', response: 'approve' },
      { user_id: 'b', response: 'approve' },
    ],
  };

  it('myAction', () => {
    expect(myAction(event, 'a', partners)).toBe('mine');
    expect(myAction(event, 'b', partners)).toBe('answered');
    expect(myAction(event, 'c', partners)).toBe('respond');
    expect(myAction({ ...event, status: 'approved' }, 'c', partners)).toBe('none');
    expect(myAction(event, 'landlord', partners)).toBe('none');
  });

  it('only the requester cancels an open event', () => {
    expect(canCancel(event, 'a')).toBe(true);
    expect(canCancel(event, 'b')).toBe(false);
    expect(canCancel({ ...event, status: 'rejected' }, 'a')).toBe(false);
  });

  it('approvalProgress counts approvals of active partners', () => {
    expect(approvalProgress(event, partners)).toEqual({ approved: 2, total: 3 });
    expect(approvalProgress(event, ['a', 'c'])).toEqual({ approved: 1, total: 2 });
  });
});
