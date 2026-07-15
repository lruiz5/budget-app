// SimpleFIN Bridge client — https://bridge.simplefin.org
// No mTLS certs needed; auth is Basic credentials embedded in the per-user access URL.

export interface SimpleFINOrg {
  domain?: string;
  name?: string;
  'sfin-url'?: string;
  url?: string;
  id?: string;
}

export interface SimpleFINTransaction {
  id: string;
  posted: number; // unix seconds (0 when pending)
  amount: string; // signed decimal string, negative = expense
  description?: string;
  payee?: string;
  memo?: string;
  transacted_at?: number; // unix seconds
  pending?: boolean;
}

export interface SimpleFINAccount {
  org?: SimpleFINOrg; // absent on the demo server
  id: string;
  name: string;
  currency: string;
  balance: string;
  'available-balance'?: string;
  'balance-date': number;
  transactions?: SimpleFINTransaction[];
}

export interface SimpleFINAccountSet {
  errors: string[];
  accounts: SimpleFINAccount[];
}

// Setup tokens are base64-encoded claim URLs
export function decodeSetupToken(setupToken: string): string {
  const claimUrl = Buffer.from(setupToken.trim(), 'base64').toString('utf-8').trim();
  if (!/^https?:\/\//.test(claimUrl)) {
    throw new Error('Invalid setup token: does not decode to a claim URL');
  }
  return claimUrl;
}

// One-time exchange: POST the claim URL, response body is the access URL
export async function claimAccessUrl(setupToken: string): Promise<string> {
  const claimUrl = decodeSetupToken(setupToken);
  const res = await fetch(claimUrl, {
    method: 'POST',
    headers: { 'Content-Length': '0' },
  });
  const body = (await res.text()).trim();
  if (!res.ok) {
    throw new Error(`SimpleFIN claim failed: ${res.status} ${body}`);
  }
  if (!/^https?:\/\//.test(body)) {
    throw new Error(`SimpleFIN claim returned unexpected response: ${body}`);
  }
  return body;
}

// Access URLs embed credentials (https://user:pass@host/simplefin), which
// fetch() rejects — split into a bare base URL + Basic auth header.
function parseAccessUrl(accessUrl: string): { baseUrl: string; authHeader: string } {
  const url = new URL(accessUrl.trim());
  const authHeader =
    'Basic ' + Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64');
  url.username = '';
  url.password = '';
  const baseUrl = url.toString().replace(/\/$/, '');
  return { baseUrl, authHeader };
}

export interface GetAccountsOptions {
  startDate?: number; // unix seconds
  endDate?: number; // unix seconds
  accountIds?: string[];
  balancesOnly?: boolean;
  includePending?: boolean;
}

export async function getAccounts(
  accessUrl: string,
  options: GetAccountsOptions = {}
): Promise<SimpleFINAccountSet> {
  const { baseUrl, authHeader } = parseAccessUrl(accessUrl);

  const params = new URLSearchParams();
  if (options.startDate !== undefined) params.append('start-date', String(options.startDate));
  if (options.endDate !== undefined) params.append('end-date', String(options.endDate));
  if (options.balancesOnly) params.append('balances-only', '1');
  if (options.includePending) params.append('pending', '1');
  for (const id of options.accountIds || []) params.append('account', id);

  const queryString = params.toString();
  const res = await fetch(`${baseUrl}/accounts${queryString ? `?${queryString}` : ''}`, {
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SimpleFIN API error: ${res.status} - ${body}`);
  }

  return res.json();
}

// SimpleFIN recommends ≤45 days per request (and may cap larger ranges) —
// walk windows from startDate to now and merge transactions per account
// (deduped by txn id).
export async function getAccountsWithHistory(
  accessUrl: string,
  options: { startDate: number; accountIds?: string[] }
): Promise<SimpleFINAccountSet> {
  const windowSeconds = 45 * 24 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);

  const accountMap = new Map<string, SimpleFINAccount>();
  const txnMaps = new Map<string, Map<string, SimpleFINTransaction>>();
  const errors: string[] = [];

  let windowStart = options.startDate;
  while (windowStart < now) {
    const windowEnd = Math.min(windowStart + windowSeconds, now);
    const page = await getAccounts(accessUrl, {
      startDate: windowStart,
      endDate: windowEnd,
      accountIds: options.accountIds,
      includePending: true,
    });

    errors.push(...page.errors);
    for (const account of page.accounts) {
      accountMap.set(account.id, account); // latest window wins for balance
      const txnMap = txnMaps.get(account.id) || new Map();
      for (const txn of account.transactions || []) {
        txnMap.set(txn.id, txn);
      }
      txnMaps.set(account.id, txnMap);
    }

    windowStart = windowEnd;
  }

  const accounts = [...accountMap.values()].map(account => ({
    ...account,
    transactions: [...(txnMaps.get(account.id)?.values() || [])].sort(
      (a, b) => (a.posted || a.transacted_at || 0) - (b.posted || b.transacted_at || 0)
    ),
  }));

  return { errors, accounts };
}

// SimpleFIN dates are unix seconds; transactions store "YYYY-MM-DD" (UTC)
export function unixToDateString(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().split('T')[0];
}
