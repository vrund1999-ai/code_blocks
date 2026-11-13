import { describe, expect, it } from 'vitest';
import { EMPTY_SAMPLE, parseFields, samplePayload } from './tryApi';

describe('parseFields', () => {
  it('reads name: value lines, with : or =, skipping blank lines', () => {
    expect(parseFields('name: Ada\n\n  city = London  \r\nnote: a: b')).toEqual({ name: 'Ada', city: 'London', note: 'a: b' });
    expect(parseFields('')).toEqual({});
  });

  it('says which line has no name', () => {
    expect(parseFields('name: Ada\njust text')).toMatch(/This line has no name: “just text”/);
    expect(parseFields(': Ada')).toMatch(/no name/);
  });
});

describe('samplePayload', () => {
  const now = new Date('2026-11-13T09:00:00Z');

  it('builds what a web address call carries', () => {
    const sample = { ...EMPTY_SAMPLE, query: 'name: Ada', body: '{"item":"tea"}' };
    expect(samplePayload('server.http', { method: 'POST' }, sample)).toEqual({
      body: { item: 'tea' },
      query: { name: 'Ada' },
      method: 'POST',
    });
    expect(samplePayload('server.http', { method: 'PUT' }, { ...sample, body: 'plain words' })).toMatchObject({ body: 'plain words' });
  });

  it('tries “Any” as a GET, or a POST when data is sent; GET sends no data', () => {
    expect(samplePayload('server.http', { method: 'ANY' }, EMPTY_SAMPLE)).toMatchObject({ method: 'GET', body: '' });
    expect(samplePayload('server.http', { method: 'ANY' }, { ...EMPTY_SAMPLE, body: 'hi' })).toMatchObject({ method: 'POST', body: 'hi' });
    expect(samplePayload('server.http', { method: 'GET' }, { ...EMPTY_SAMPLE, body: 'hi' })).toMatchObject({ body: '' });
  });

  it('builds form values and schedule times', () => {
    expect(samplePayload('server.form', {}, { ...EMPTY_SAMPLE, values: 'name: Ada' })).toEqual({ values: { name: 'Ada' } });
    expect(samplePayload('server.schedule', {}, EMPTY_SAMPLE, now)).toEqual({ time: '2026-11-13T09:00:00.000Z' });
  });

  it('passes on a message for samples that can’t be read', () => {
    expect(samplePayload('server.form', {}, { ...EMPTY_SAMPLE, values: 'oops' })).toMatch(/no name/);
    expect(samplePayload('server.http', {}, { ...EMPTY_SAMPLE, query: 'oops' })).toMatch(/no name/);
  });
});
