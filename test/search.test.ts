import { describe, expect, it } from 'vitest'
import type { SearchOptions, SearchPredicate } from '../src/lib/search.ts'
import { defaultSearchOptions, messages, parseSearch, sameOptions } from '../src/lib/search.ts'

function domain(name: string): Record<string, unknown> {
  const labels = name.split('.').reverse()
  return Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`label${i}`, labels[i] ?? null]))
}

function predicate(query: string, options: Partial<SearchOptions> = {}): SearchPredicate {
  const parsed = parseSearch(query, { ...defaultSearchOptions, ...options })
  if (parsed.kind !== 'search') throw new Error(`expected a search, got ${parsed.kind}`)
  return parsed.predicate
}

function matching(query: string, names: string[], options: Partial<SearchOptions> = {}): string[] {
  const { matches } = predicate(query, options)
  return names.filter(name => matches(domain(name)))
}

describe('parseSearch – Domain mode (PLAN.md 4.2 table)', () => {
  const names = ['svt.se', 'svtplay.se', 'www.svt.se', 'a.www.svt.se', 'api.svt.se', 'svt.com', 'svt.example.com']

  it('svt: label1 contains "svt"', () => {
    expect(matching('svt', names)).toEqual(['svt.se', 'svtplay.se', 'www.svt.se', 'a.www.svt.se', 'api.svt.se', 'svt.com'])
    expect(predicate('svt').columns).toEqual(['label1'])
  })

  it('svt.se: label0 = se and label1 contains "svt", subdomains included', () => {
    expect(matching('svt.se', names)).toEqual(['svt.se', 'svtplay.se', 'www.svt.se', 'a.www.svt.se', 'api.svt.se'])
    expect(predicate('svt.se').columns).toEqual(['label0', 'label1'])
  })

  it('www.svt.se: label0 = se, label1 = svt, label2 contains "www"', () => {
    expect(matching('www.svt.se', names)).toEqual(['www.svt.se', 'a.www.svt.se'])
  })

  it('matches only the leftmost typed label as a substring', () => {
    expect(matching('vt.se', ['svt.se', 'vt.se.se'])).toEqual(['svt.se'])
    expect(matching('svt.s', ['svt.se'])).toEqual([])
  })
})

describe('parseSearch – normalisation and validation', () => {
  it('ignores case, surrounding spaces and one trailing dot', () => {
    expect(matching('  WWW.SVT.SE. ', ['www.svt.se'])).toEqual(['www.svt.se'])
    expect(matching('svt', ['SVT.se'])).toEqual(['SVT.se'])
  })

  it('treats an empty query as no search, except when searching all files', () => {
    expect(parseSearch('  ', defaultSearchOptions)).toEqual({ kind: 'none' })
    expect(parseSearch('', { ...defaultSearchOptions, extended: true }))
      .toEqual({ kind: 'invalid', field: 'query', message: messages.tooShortExtended })
  })

  it('requires at least 2 characters after normalisation', () => {
    expect(parseSearch('a', defaultSearchOptions)).toEqual({ kind: 'invalid', field: 'query', message: messages.tooShort })
    expect(parseSearch('a.', defaultSearchOptions)).toEqual({ kind: 'invalid', field: 'query', message: messages.tooShort })
    expect(parseSearch('ab', defaultSearchOptions).kind).toBe('search')
  })

  it('rejects empty domain parts', () => {
    for (const query of ['.se', 'www..se']) {
      expect(parseSearch(query, defaultSearchOptions)).toEqual({ kind: 'invalid', field: 'query', message: messages.emptyLabel })
    }
  })

  it('accepts up to 10 domain parts and rejects more', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `l${i}`).join('.')
    expect(predicate(ten).columns).toHaveLength(10)
    expect(parseSearch(`x.${ten}`, defaultSearchOptions))
      .toEqual({ kind: 'invalid', field: 'query', message: messages.tooManyLabels })
  })

  it('does not match labels that are missing in the data (> 5 labels in the samples)', () => {
    const row = domain('e.d.c.b.a')
    expect(predicate('f.e.d.c.b.a').matches(row)).toBe(false)
  })
})

describe('parseSearch – Columns mode', () => {
  const columns = (list: string[]): Partial<SearchOptions> => ({ mode: 'columns', columns: list })

  it('matches if any selected column contains the query', () => {
    const names = ['svt.se', 'example.com', 'svt.example.com', 'sex.example']
    expect(matching('se', names, columns(['label0']))).toEqual(['svt.se'])
    expect(matching('sv', names, columns(['label1', 'label2']))).toEqual(['svt.se', 'svt.example.com'])
    expect(matching('ex', names, columns(['label0', 'label1']))).toEqual(['example.com', 'svt.example.com', 'sex.example'])
  })

  it('keeps dots as part of the text', () => {
    expect(matching('svt.', ['svt.se'], columns(['label1']))).toEqual([])
  })

  it('requires at least one column', () => {
    expect(parseSearch('svt', { ...defaultSearchOptions, mode: 'columns', columns: [] }))
      .toEqual({ kind: 'invalid', field: 'columns', message: messages.noColumns })
  })
})

describe('sameOptions', () => {
  it('ignores the column choice in Domain mode', () => {
    expect(sameOptions(defaultSearchOptions, { ...defaultSearchOptions, columns: ['label0'] })).toBe(true)
  })
  it('compares columns as a set in Columns mode', () => {
    const a: SearchOptions = { mode: 'columns', columns: ['label0', 'label1'], extended: false }
    expect(sameOptions(a, { ...a, columns: ['label1', 'label0'] })).toBe(true)
    expect(sameOptions(a, { ...a, columns: ['label1'] })).toBe(false)
  })
  it('detects mode and scope changes', () => {
    expect(sameOptions(defaultSearchOptions, { ...defaultSearchOptions, mode: 'columns' })).toBe(false)
    expect(sameOptions(defaultSearchOptions, { ...defaultSearchOptions, extended: true })).toBe(false)
  })
})
