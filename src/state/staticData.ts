// The three static data files the interface reads: the timezone table, the
// country list and the banIP feed list.
//
// They stay out of the bundle and are fetched once per page from the same origin,
// which is also why the country list is shared between the wireless regulatory
// field and banIP's country blocking -- 242 options is real weight and there is no
// reason to carry two copies of it.

export interface Zone {
  /** The tz database name, e.g. Asia/Ho_Chi_Minh. Emitted as ZONE_NAME. */
  zoneName: string;
  /** The POSIX TZ string. Emitted as TIME_ZONE. */
  tzString: string;
}

export interface Country {
  code: string;
  name: string;
}

export interface Feed {
  name: string;
  chain: string;
  descr: string;
}

async function text(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'force-cache' });
  return res.ok ? res.text() : '';
}

let zonesPromise: Promise<Zone[]> | null = null;
let countriesPromise: Promise<Country[]> | null = null;
let feedsPromise: Promise<Feed[]> | null = null;

/** Parse the `{ 'Zone/Name', 'TZSTRING' }` pairs out of LuCI's tzdata.lua. */
export function parseTzdata(src: string): Zone[] {
  const re = /\{\s*'([^']+)'\s*,\s*'([^']+)'\s*\}/g;
  const out: Zone[] = [];
  for (let m = re.exec(src); m; m = re.exec(src)) {
    out.push({ zoneName: m[1] ?? '', tzString: m[2] ?? '' });
  }
  return out.sort((a, b) => a.zoneName.localeCompare(b.zoneName));
}

export function loadZones(): Promise<Zone[]> {
  zonesPromise ??= text('/tzdata.lua').then(parseTzdata);
  return zonesPromise;
}

/** Tab-separated `code<TAB>name`. */
export function parseCountries(src: string): Country[] {
  return src
    .split('\n')
    .map((line) => {
      const [code, name] = line.split('\t');
      return code && name ? { code: code.trim(), name: name.trim() } : null;
    })
    .filter((c): c is Country => c !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function loadCountries(): Promise<Country[]> {
  countriesPromise ??= text('/countries.txt').then(parseCountries);
  return countriesPromise;
}

/** Tab-separated `name<TAB>chain<TAB>description`. */
export function parseFeeds(src: string): Feed[] {
  return src
    .split('\n')
    .map((line) => {
      const [name, chain, descr] = line.split('\t');
      return name && chain
        ? { name: name.trim(), chain: chain.trim(), descr: (descr ?? '').trim() }
        : null;
    })
    .filter((f): f is Feed => f !== null);
}

export function loadFeeds(): Promise<Feed[]> {
  feedsPromise ??= text('/banip-feeds.txt').then(parseFeeds);
  return feedsPromise;
}
