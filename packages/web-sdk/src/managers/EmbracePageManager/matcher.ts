// Route templates ('/order/:id') are matched against raw pathnames ('/order/123')
// to recover a low-cardinality page path. Specificity is ranked most-static-first,
// then most-params, then fewest wildcards, so '/order/new' wins over '/order/:id',
// and '/files/*' loses to '/files/:name'. Equal-shape templates (e.g. '/:a/b' vs
// '/a/:b') resolve to declaration order, so list more specific templates first.
// A '*' is terminal: it matches the current segment and everything after it.

// Matches path options like "(pending|shipped)" so "/order/:state(pending|shipped)"
// normalizes to "/order/:state". Written to avoid catastrophic backtracking:
// https://javascript.info/regexp-catastrophic-backtracking
const PATH_OPTIONS_RE = /\([^()]+\)/g;

export type RouteMatcher = (pathname: string) => string;

const normalize = (path: string): string =>
  path.replace(PATH_OPTIONS_RE, '').replace(/\/+$/, '') || '/';

const toSegments = (path: string): string[] =>
  normalize(path)
    .split('/')
    .filter((segment) => segment !== '');

interface CompiledTemplate {
  template: string;
  segments: string[];
  staticCount: number;
  paramCount: number;
  wildcardCount: number;
}

const compile = (template: string): CompiledTemplate => {
  const segments = toSegments(template);
  let staticCount = 0;
  let paramCount = 0;
  let wildcardCount = 0;

  for (const segment of segments) {
    if (segment === '*') {
      wildcardCount++;
    } else if (segment.startsWith(':')) {
      paramCount++;
    } else {
      staticCount++;
    }
  }

  return {
    template: normalize(template),
    segments,
    staticCount,
    paramCount,
    wildcardCount,
  };
};

// Most specific first: static segments dominate params, params dominate wildcards.
const bySpecificity = (a: CompiledTemplate, b: CompiledTemplate): number =>
  b.staticCount - a.staticCount ||
  b.paramCount - a.paramCount ||
  a.wildcardCount - b.wildcardCount;

const segmentsMatch = (
  templateSegments: string[],
  urlSegments: string[],
): boolean => {
  for (let i = 0; i < templateSegments.length; i++) {
    const segment = templateSegments[i];

    // A wildcard is terminal: it consumes the remaining URL segments.
    if (segment === '*') {
      return true;
    }
    if (i >= urlSegments.length) {
      return false;
    }
    // A param (":id") matches any single non-empty segment.
    if (segment.startsWith(':')) {
      continue;
    }
    if (segment !== urlSegments[i]) {
      return false;
    }
  }

  return templateSegments.length === urlSegments.length;
};

/**
 * Builds a matcher that maps a raw pathname to the most specific configured
 * route template, falling back to the normalized pathname when nothing matches
 * so that a page path is always available.
 */
export const createRouteMatcher = (templates: string[]): RouteMatcher => {
  const compiled = templates.map(compile).sort(bySpecificity);

  return (pathname: string): string => {
    const urlSegments = toSegments(pathname);

    for (const { template, segments } of compiled) {
      if (segmentsMatch(segments, urlSegments)) {
        return template;
      }
    }

    return normalize(pathname);
  };
};
