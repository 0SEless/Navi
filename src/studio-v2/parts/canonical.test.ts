import { describe, expect, it } from 'vitest'
import { canonicalJson, fastHash, sha256Hex } from './canonical'

describe('canonicalJson', () => {
  it('sorts keys deeply and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: 'ñ😀' } })).toBe('{"a":{"c":"ñ😀"},"b":1}')
  })

  it('keeps array order and canonicalizes elements', () => {
    expect(canonicalJson([{ b: 1, a: 2 }, 3])).toBe('[{"a":2,"b":1},3]')
  })

  it('keeps null and primitives', () => {
    expect(canonicalJson({ a: null, z: false })).toBe('{"a":null,"z":false}')
    expect(canonicalJson('x')).toBe('"x"')
  })
})

describe('fastHash', () => {
  it('is stable for fixed strings (14 lowercase hex chars)', () => {
    expect(fastHash('hello')).toBe('106f3a63cd7226')
    expect(fastHash('')).toBe('0bdcb81aee8d83')
    expect(fastHash('ñ😀')).toBe('0ad45d0e9de3a3')
  })

  it('differs for different input', () => {
    expect(fastHash('a')).not.toBe(fastHash('b'))
    expect(fastHash('a')).toMatch(/^[0-9a-f]{14}$/)
  })
})

describe('sha256Hex', () => {
  it('matches the known vector for abc', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hashes utf-8 bytes', async () => {
    const hex = await sha256Hex('ñ😀')
    expect(hex).toMatch(/^[0-9a-f]{64}$/)
  })
})
