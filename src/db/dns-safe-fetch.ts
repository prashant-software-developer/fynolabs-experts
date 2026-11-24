// fetch for the app's database connection (Neon over HTTPS) that survives a PC whose own address
// lookup can't find Neon's names (seen on Prashant's PC: getaddrinfo ENOTFOUND, on and off). It
// connects through an undici Agent whose lookup asks the computer first and, only if that fails,
// Cloudflare/Google over HTTPS (resolveHost in db-connect). TLS still uses the real name, so the
// certificate is checked as usual. On Vercel the normal lookup works and nothing changes.
import dns from "node:dns";
import { resolveHost } from "@/lib/server/db-connect";

type LookupCb = (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;

function lookup(hostname: string, options: dns.LookupOptions, cb: LookupCb) {
  dns.lookup(hostname, options, (err, address, family) => {
    if (!err) return cb(null, address as string | dns.LookupAddress[], family);
    resolveHost(hostname).then(
      (r) => {
        if (!r) return cb(err);
        if (options.all) return cb(null, [{ address: r.address, family: 4 }]);
        cb(null, r.address, 4);
      },
      () => cb(err),
    );
  });
}

// undici is loaded at run time and only if it is installed; without it the normal fetch is used,
// so a half-finished package install can never stop the app from starting.
type Undici = { Agent: new (o: unknown) => unknown; fetch: (i: unknown, o?: unknown) => Promise<Response> };
let loaded: Promise<{ u: Undici; agent: unknown } | null> | null = null;
function load() {
  loaded ??= (async () => {
    try {
      const name = "undici";
      const u = (await import(/* webpackIgnore: true */ name)) as Undici;
      return { u, agent: new u.Agent({ connect: { lookup } }) };
    } catch {
      return null;
    }
  })();
  return loaded;
}

export const dnsSafeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const l = await load();
  if (!l) return fetch(input, init);
  return l.u.fetch(input, { ...(init ?? {}), dispatcher: l.agent });
}) as typeof fetch;
