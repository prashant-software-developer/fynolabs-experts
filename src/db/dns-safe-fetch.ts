// fetch for the app's database connection (Neon over HTTPS) that survives a PC whose own address
// lookup can't find Neon's names (seen on Prashant's PC: getaddrinfo ENOTFOUND, on and off). It
// connects through an undici Agent whose lookup asks the computer first and, only if that fails,
// Cloudflare/Google over HTTPS (resolveHost in db-connect). TLS still uses the real name, so the
// certificate is checked as usual. On Vercel the normal lookup works and nothing changes.
import dns from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
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

let agent: Agent | null = null;

export const dnsSafeFetch = ((input: Parameters<typeof undiciFetch>[0], init?: Parameters<typeof undiciFetch>[1]) => {
  agent ??= new Agent({ connect: { lookup: lookup as never } });
  return undiciFetch(input, { ...(init ?? {}), dispatcher: agent });
}) as unknown as typeof fetch;
