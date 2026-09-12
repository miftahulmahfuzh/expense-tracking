import { describe, expect, it } from 'vitest'

import { linkify } from '@/lib/linkify'

describe('linkify', () => {
  it('returns the whole string as one text segment when there is no URL', () => {
    expect(linkify('Alamat Kos')).toEqual([{ type: 'text', value: 'Alamat Kos' }])
  })

  it('splits plain text around a bare https:// URL', () => {
    const text = 'Alamat Kos\nhttps://maps.google.com/maps?q=-6.123151%2C106.789494'
    expect(linkify(text)).toEqual([
      { type: 'text', value: 'Alamat Kos\n' },
      {
        type: 'link',
        text: 'https://maps.google.com/maps?q=-6.123151%2C106.789494',
        href: 'https://maps.google.com/maps?q=-6.123151%2C106.789494',
      },
    ])
  })

  it('turns a bare www. token into a link, prefixing https:// only in href', () => {
    expect(linkify('lihat www.example.com ya')).toEqual([
      { type: 'text', value: 'lihat ' },
      { type: 'link', text: 'www.example.com', href: 'https://www.example.com' },
      { type: 'text', value: ' ya' },
    ])
  })

  it('does not double-match www. inside an http(s):// URL', () => {
    expect(linkify('http://www.example.com')).toEqual([
      { type: 'link', text: 'http://www.example.com', href: 'http://www.example.com' },
    ])
  })

  it('peels a trailing period off a URL ending a sentence', () => {
    expect(linkify('cek https://example.com/a.')).toEqual([
      { type: 'text', value: 'cek ' },
      { type: 'link', text: 'https://example.com/a', href: 'https://example.com/a' },
      { type: 'text', value: '.' },
    ])
  })

  it('peels a wrapping paren off a URL written in parentheses', () => {
    expect(linkify('(https://example.com)')).toEqual([
      { type: 'text', value: '(' },
      { type: 'link', text: 'https://example.com', href: 'https://example.com' },
      { type: 'text', value: ')' },
    ])
  })

  it('handles two URLs in one note', () => {
    expect(linkify('https://a.com dan https://b.com')).toEqual([
      { type: 'link', text: 'https://a.com', href: 'https://a.com' },
      { type: 'text', value: ' dan ' },
      { type: 'link', text: 'https://b.com', href: 'https://b.com' },
    ])
  })

  it('returns no segments for an empty string', () => {
    expect(linkify('')).toEqual([])
  })
})
