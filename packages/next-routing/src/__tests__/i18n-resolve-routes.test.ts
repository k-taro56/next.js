import { resolveRoutes } from '../resolve-routes'
import type { ResolveRoutesParams } from '../types'

describe('resolveRoutes with i18n', () => {
  const baseParams: Omit<ResolveRoutesParams, 'url' | 'headers'> = {
    buildId: 'BUILD_ID',
    basePath: '',
    requestBody: new ReadableStream(),
    pathnames: ['/en/about', '/fr/about', '/de/about', '/about'],
    routes: {
      beforeMiddleware: [],
      beforeFiles: [],
      afterFiles: [],
      dynamicRoutes: [],
      onMatch: [],
      fallback: [],
    },
    invokeMiddleware: async () => ({ bodySent: false }),
  }

  const i18nConfig = {
    defaultLocale: 'en',
    locales: ['en', 'fr', 'de', 'ja'],
    domains: [
      { domain: 'example.com', defaultLocale: 'en' },
      { domain: 'example.fr', defaultLocale: 'fr' },
      { domain: 'example.de', defaultLocale: 'de' },
    ],
  }

  const i18nConfigNoDomains = {
    defaultLocale: 'en',
    locales: ['en', 'fr', 'de', 'ja'],
  }

  describe('locale detection from accept-language header', () => {
    it('should redirect to locale prefix when accept-language is set', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/'),
        headers: new Headers({
          'accept-language': 'fr,en;q=0.9',
        }),
        i18n: i18nConfigNoDomains,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.pathname).toBe('/fr/')
      expect(result.redirect?.status).toBe(307)
    })

    it('should use quality values from accept-language', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/'),
        headers: new Headers({
          'accept-language': 'de;q=0.8,fr;q=0.9,en;q=0.7',
        }),
        i18n: i18nConfigNoDomains,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.pathname).toBe('/fr/')
    })

    it('should preserve middleware response headers on locale redirect', async () => {
      const invokeMiddleware = jest.fn(async () => ({
        responseHeaders: new Headers({
          'x-nested-header': 'valid',
          'x-append-me': 'top',
        }),
      }))

      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/'),
        headers: new Headers({
          'accept-language': 'fr,en;q=0.9',
        }),
        i18n: i18nConfigNoDomains,
        invokeMiddleware,
        routes: {
          ...baseParams.routes,
          middlewareMatchers: [
            {
              sourceRegex: '^/.*$',
            },
          ],
        },
      })

      expect(invokeMiddleware).toHaveBeenCalledTimes(1)
      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.pathname).toBe('/fr/')
      expect(result.resolvedHeaders?.get('x-nested-header')).toBe('valid')
      expect(result.resolvedHeaders?.get('x-append-me')).toBe('top')
    })

    it('should not redirect when locale matches default', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/'),
        headers: new Headers({
          'accept-language': 'en',
        }),
        i18n: i18nConfig,
      })

      // Should prefix internally but not redirect
      expect(result.redirect).toBeUndefined()
    })

    it('should not redirect preferred locale for non-index pathnames', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/about'),
        headers: new Headers({
          'accept-language': 'fr,en;q=0.9',
        }),
        i18n: i18nConfigNoDomains,
      })

      expect(result.redirect).toBeUndefined()
    })
  })

  describe('locale detection from cookie', () => {
    it('should redirect to locale from NEXT_LOCALE cookie', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/'),
        headers: new Headers({
          cookie: 'NEXT_LOCALE=ja',
        }),
        i18n: i18nConfigNoDomains,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.pathname).toBe('/ja/')
    })

    it('should prioritize cookie over accept-language', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/'),
        headers: new Headers({
          cookie: 'session=abc; NEXT_LOCALE=ja; theme=dark',
          'accept-language': 'fr',
        }),
        i18n: i18nConfigNoDomains,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.pathname).toBe('/ja/')
    })
  })

  describe('domain locale handling', () => {
    it('should use domain default locale without redirect', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.fr/about'),
        headers: new Headers({}),
        i18n: i18nConfig,
      })

      // Should not redirect since we're on the FR domain
      expect(result.redirect).toBeUndefined()
    })

    it('should redirect to correct domain for preferred locale', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/'),
        headers: new Headers({
          'accept-language': 'fr',
        }),
        i18n: i18nConfig,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.hostname).toBe('example.fr')
      expect(result.redirect?.url.pathname).toBe('/')
    })

    it('should not include locale prefix for domain default locale', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/'),
        headers: new Headers({
          'accept-language': 'de',
        }),
        i18n: i18nConfig,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.hostname).toBe('example.de')
      expect(result.redirect?.url.pathname).toBe('/')
    })
  })

  describe('locale prefix in pathname', () => {
    it('should use locale from pathname', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/fr/about'),
        headers: new Headers({
          'accept-language': 'de',
        }),
        i18n: i18nConfig,
      })

      // Path locale takes priority, so no redirect
      expect(result.redirect).toBeUndefined()
      expect(result.resolvedPathname).toBe('/fr/about')
    })

    it('should handle locale prefix with trailing slash', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/fr/about/'),
        headers: new Headers({}),
        pathnames: ['/fr/about/', '/fr/about'],
        i18n: i18nConfig,
      })

      expect(result.redirect).toBeUndefined()
      expect(result.resolvedPathname).toBe('/fr/about/')
    })
  })

  describe('_next/data routes', () => {
    it('should not handle locale for _next/data routes', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        buildId: 'build123',
        url: new URL('http://example.com/_next/data/build123/about.json'),
        headers: new Headers({
          'accept-language': 'fr',
        }),
        i18n: i18nConfig,
        routes: {
          ...baseParams.routes,
          shouldNormalizeNextData: true,
        },
      })

      // Should not redirect for _next/data routes
      expect(result.redirect).toBeUndefined()
    })
  })

  describe('localeDetection disabled', () => {
    it('should not redirect when localeDetection is false', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/about'),
        headers: new Headers({
          'accept-language': 'fr',
          cookie: 'NEXT_LOCALE=de',
        }),
        i18n: { ...i18nConfig, localeDetection: false },
      })

      // Should prefix internally with default locale but not redirect
      expect(result.redirect).toBeUndefined()
    })

    it('should still use domain locale when localeDetection is false', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.fr/about'),
        headers: new Headers({
          'accept-language': 'de',
        }),
        i18n: { ...i18nConfig, localeDetection: false },
      })

      // Domain locale still applies
      expect(result.redirect).toBeUndefined()
    })
  })

  describe('basePath with i18n', () => {
    it('should handle basePath with locale prefix redirect', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        basePath: '/base',
        url: new URL('http://example.com/base'),
        headers: new Headers({
          'accept-language': 'ja',
        }),
        i18n: i18nConfigNoDomains,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.pathname).toBe('/base/ja/')
    })

    it('should handle basePath with domain redirect', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        basePath: '/base',
        url: new URL('http://example.com/base'),
        headers: new Headers({
          'accept-language': 'de',
        }),
        i18n: i18nConfig,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.hostname).toBe('example.de')
      expect(result.redirect?.url.pathname).toBe('/base/')
    })
  })

  describe('edge cases', () => {
    it('should handle root path', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/'),
        headers: new Headers({
          'accept-language': 'ja',
        }),
        pathnames: ['/', '/ja/', '/en/'],
        i18n: i18nConfigNoDomains,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.pathname).toBe('/ja/')
    })

    it('should handle query strings', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/?foo=bar'),
        headers: new Headers({
          'accept-language': 'ja',
        }),
        i18n: i18nConfigNoDomains,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.pathname).toBe('/ja/')
      expect(result.redirect?.url.search).toBe('?foo=bar')
    })

    it('should skip locale handling for _next routes', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/_next/static/chunk.js'),
        headers: new Headers({
          'accept-language': 'fr',
        }),
        i18n: i18nConfig,
      })

      // Should not redirect for _next routes
      expect(result.redirect).toBeUndefined()
    })

    it('should skip locale handling for api routes', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/api/ping'),
        headers: new Headers({
          'accept-language': 'fr',
        }),
        pathnames: ['/api/ping'],
        i18n: i18nConfig,
      })

      // Should not redirect for api routes
      expect(result.redirect).toBeUndefined()
      expect(result.resolvedPathname).toBe('/api/ping')
    })

    it('should skip locale handling for nested api routes', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/api/users/123'),
        headers: new Headers({
          'accept-language': 'ja',
          cookie: 'NEXT_LOCALE=de',
        }),
        pathnames: ['/api/users/[id]'],
        routes: {
          ...baseParams.routes,
          dynamicRoutes: [
            {
              sourceRegex: '^[/]?/api/users/(?<id>[^/]+?)(?:/)?$',
              destination: '/api/users/[id]?id=$id',
            },
          ],
        },
        i18n: i18nConfigNoDomains,
      })

      // Should not redirect for api routes, even with locale cookies/headers
      expect(result.redirect).toBeUndefined()
      expect(result.resolvedPathname).toBe('/api/users/[id]')
      expect(result.routeMatches).toEqual({
        '1': '123',
        id: '123',
      })
    })

    it('should match non-localized dynamic templates when localized variant is absent', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/app-dir/foo'),
        headers: new Headers({}),
        pathnames: ['/app-dir/[[...slug]]', '/en/[[...slug]]'],
        routes: {
          ...baseParams.routes,
          dynamicRoutes: [
            {
              sourceRegex:
                '^[/]?(?<nextLocale>[^/]{1,})/app\\-dir(?:/(?<nxtPslug>.+?))?(?:/)?$',
              destination:
                '/$nextLocale/app-dir/[[...slug]]?nxtPslug=$nxtPslug',
            },
            {
              sourceRegex:
                '^[/]?(?<nextLocale>[^/]{1,})(?:/(?<nxtPslug>.+?))?(?:/)?$',
              destination: '/$nextLocale/[[...slug]]?nxtPslug=$nxtPslug',
            },
          ],
        },
        i18n: {
          defaultLocale: 'en',
          locales: ['en', 'en-GB'],
          localeDetection: false,
        },
      })

      expect(result.redirect).toBeUndefined()
      expect(result.resolvedPathname).toBe('/app-dir/[[...slug]]')
    })
  })

  // App Router outputs have no locale in their pathnames, and Pages Router
  // outputs have one for each locale. Next.js's own router serves an App Router
  // page without a locale. It also serves an exact pathname with the default
  // locale, and nothing under any other locale.
  describe('App Router outputs', () => {
    const i18n = { ...i18nConfigNoDomains, localeDetection: false as const }
    const pathnames = [
      '/app-dir',
      '/app-dir/static',
      '/app-dir/blog/[slug]',
      '/english',
      '/en/pages-dir',
      '/fr/pages-dir',
      '/en/pages-dir/[id]',
      '/fr/pages-dir/[id]',
    ]
    const dynamicRoutes = [
      {
        sourceRegex:
          '^[/]?(?<nextLocale>[^/]{1,})/app\\-dir/blog/(?<nxtPslug>[^/]+?)(?:/)?$',
        destination: '/$nextLocale/app-dir/blog/[slug]?nxtPslug=$nxtPslug',
      },
      {
        sourceRegex:
          '^[/]?(?<nextLocale>[^/]{1,})/pages\\-dir/(?<nxtPid>[^/]+?)(?:/)?$',
        destination: '/$nextLocale/pages-dir/[id]?nxtPid=$nxtPid',
      },
    ]

    function resolve(
      url: string,
      overrides: Partial<ResolveRoutesParams> = {}
    ) {
      return resolveRoutes({
        ...baseParams,
        url: new URL(url),
        headers: new Headers({}),
        pathnames,
        routes: { ...baseParams.routes, dynamicRoutes },
        i18n,
        ...overrides,
      })
    }

    it.each([
      ['/app-dir/static', '/app-dir/static'],
      ['/app-dir', '/app-dir'],
      ['/en/app-dir/static', '/app-dir/static'],
      ['/english', '/english'],
    ])('should resolve the exact pathname %s', async (pathname, output) => {
      const result = await resolve(`http://example.com${pathname}`)

      expect(result.resolvedPathname).toBe(output)
      expect(result.invocationTarget?.pathname).toBe(output)
    })

    it('should resolve a dynamic route when the URL has no locale', async () => {
      const result = await resolve('http://example.com/app-dir/blog/first')

      expect(result.resolvedPathname).toBe('/app-dir/blog/[slug]')
      expect(result.invocationTarget?.pathname).toBe('/app-dir/blog/first')
      expect(result.routeMatches?.nxtPslug).toBe('first')
    })

    it.each([
      '/fr/app-dir/static',
      '/fr/app-dir',
      '/en/app-dir/blog/first',
      '/fr/app-dir/blog/first',
    ])('should not resolve %s', async (pathname) => {
      const result = await resolve(`http://example.com${pathname}`)

      expect(result.resolvedPathname).toBeUndefined()
    })

    it('should use the default locale of the domain', async () => {
      const domains = {
        ...i18n,
        domains: [{ domain: 'example.fr', defaultLocale: 'fr' }],
      }

      const implied = await resolve('http://example.fr/app-dir/static', {
        i18n: domains,
      })
      const named = await resolve('http://example.fr/fr/app-dir/static', {
        i18n: domains,
      })
      const other = await resolve('http://example.fr/en/app-dir/static', {
        i18n: domains,
      })

      expect(implied.resolvedPathname).toBe('/app-dir/static')
      expect(named.resolvedPathname).toBe('/app-dir/static')
      expect(other.resolvedPathname).toBeUndefined()
    })

    it('should find outputs under the base path', async () => {
      const options = {
        basePath: '/docs',
        pathnames: ['/docs/app-dir/static', '/docs/app-dir'],
      }

      const result = await resolve(
        'http://example.com/docs/app-dir/static',
        options
      )
      const named = await resolve('http://example.com/docs/en/app-dir', options)

      expect(result.resolvedPathname).toBe('/docs/app-dir/static')
      expect(result.invocationTarget?.pathname).toBe('/docs/app-dir/static')
      expect(named.resolvedPathname).toBe('/docs/app-dir')
      expect(named.invocationTarget?.pathname).toBe('/docs/app-dir')
    })

    it('should keep the locale of Pages Router outputs', async () => {
      const implied = await resolve('http://example.com/pages-dir')
      const named = await resolve('http://example.com/fr/pages-dir')
      const dynamic = await resolve('http://example.com/pages-dir/1')

      expect(implied.resolvedPathname).toBe('/en/pages-dir')
      expect(implied.invocationTarget?.pathname).toBe('/en/pages-dir')
      expect(named.resolvedPathname).toBe('/fr/pages-dir')
      expect(named.invocationTarget?.pathname).toBe('/fr/pages-dir')
      expect(dynamic.resolvedPathname).toBe('/en/pages-dir/[id]')
      expect(dynamic.invocationTarget?.pathname).toBe('/en/pages-dir/1')
    })
  })
})
