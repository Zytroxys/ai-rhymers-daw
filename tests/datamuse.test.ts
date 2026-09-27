import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAntonyms, fetchRelated, fetchSynonyms } from '../src/lexis/datamuse';

function mockFetchOnce(response: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(response),
  });
}

describe('datamuse', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps Datamuse results to a flat word list', async () => {
    vi.stubGlobal('fetch', mockFetchOnce([{ word: 'joyful' }, { word: 'glad' }]));
    const result = await fetchSynonyms('happy-test-1');
    expect(result).toEqual({ words: ['joyful', 'glad'], failed: false });
  });

  it('caches repeated lookups for the same word and endpoint', async () => {
    const fetchMock = mockFetchOnce([{ word: 'joyful' }]);
    vi.stubGlobal('fetch', fetchMock);
    await fetchSynonyms('happy-test-2');
    await fetchSynonyms('happy-test-2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not share a cache entry across different endpoints for the same word', async () => {
    const fetchMock = mockFetchOnce([{ word: 'joyful' }]);
    vi.stubGlobal('fetch', fetchMock);
    await fetchSynonyms('happy-test-5');
    await fetchAntonyms('happy-test-5');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resolves to an empty, failed result when the request rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await fetchAntonyms('happy-test-3');
    expect(result).toEqual({ words: [], failed: true });
  });

  it('resolves to a failed result on a non-2xx response', async () => {
    vi.stubGlobal('fetch', mockFetchOnce([], false));
    const result = await fetchRelated('happy-test-4');
    expect(result).toEqual({ words: [], failed: true });
  });

  it('returns an empty, non-failed result for blank input without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchSynonyms('   ');
    expect(result).toEqual({ words: [], failed: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
