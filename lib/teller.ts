import https from 'https';
import fs from 'fs';
import path from 'path';

// Teller API types
export interface TellerAccount {
  id: string;
  enrollment_id: string;
  name: string;
  type: 'depository' | 'credit';
  subtype: string;
  currency: string;
  last_four: string;
  status: 'open' | 'closed';
  institution: {
    id: string;
    name: string;
  };
  links: {
    self: string;
    balances: string;
    transactions: string;
  };
}

export interface TellerTransaction {
  id: string;
  account_id: string;
  amount: string;
  date: string;
  description: string;
  status: 'posted' | 'pending';
  type: string;
  running_balance: string | null;
  details: {
    processing_status: 'pending' | 'complete';
    category: string | null;
    counterparty: {
      name: string | null;
      type: 'organization' | 'person' | null;
    };
  };
  links: {
    self: string;
    account: string;
  };
}

export interface TellerBalance {
  account_id: string;
  ledger: string;
  available: string;
  links: {
    self: string;
    account: string;
  };
}

interface TellerClientConfig {
  accessToken: string;
}

class TellerClient {
  private accessToken: string;
  private cert: Buffer;
  private key: Buffer;

  constructor(config: TellerClientConfig) {
    this.accessToken = config.accessToken;

    // Prefer base64-encoded env vars (for Vercel/serverless), fall back to file paths (for local dev)
    if (process.env.TELLER_CERTIFICATE_BASE64 && process.env.TELLER_PRIVATE_KEY_BASE64) {
      this.cert = Buffer.from(process.env.TELLER_CERTIFICATE_BASE64, 'base64');
      this.key = Buffer.from(process.env.TELLER_PRIVATE_KEY_BASE64, 'base64');
    } else {
      const certPath = path.resolve(process.env.TELLER_CERTIFICATE_PATH || './certificates/certificate.pem');
      const keyPath = path.resolve(process.env.TELLER_PRIVATE_KEY_PATH || './certificates/private_key.pem');
      this.cert = fs.readFileSync(certPath);
      this.key = fs.readFileSync(keyPath);
    }
  }

  private request<T>(endpoint: string, method: string = 'GET'): Promise<T> {
    return new Promise((resolve, reject) => {
      const authHeader = Buffer.from(`${this.accessToken}:`).toString('base64');

      const options: https.RequestOptions = {
        hostname: 'api.teller.io',
        port: 443,
        path: endpoint,
        method,
        cert: this.cert,
        key: this.key,
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 204) {
            resolve({} as T);
            return;
          }

          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error(`Failed to parse response: ${data}`));
            }
          } else {
            reject(new Error(`Teller API error: ${res.statusCode} ${res.statusMessage} - ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.end();
    });
  }

  // List all accounts for the access token
  async listAccounts(): Promise<TellerAccount[]> {
    return this.request<TellerAccount[]>('/accounts');
  }

  // Get a single account
  async getAccount(accountId: string): Promise<TellerAccount> {
    return this.request<TellerAccount>(`/accounts/${accountId}`);
  }

  // Get account balance
  async getAccountBalance(accountId: string): Promise<TellerBalance> {
    return this.request<TellerBalance>(`/accounts/${accountId}/balances`);
  }

  // List transactions for an account
  async listTransactions(
    accountId: string,
    options?: {
      count?: number;
      fromId?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<TellerTransaction[]> {
    const params = new URLSearchParams();

    if (options?.count) params.append('count', options.count.toString());
    if (options?.fromId) params.append('from_id', options.fromId);
    if (options?.startDate) params.append('start_date', options.startDate);
    if (options?.endDate) params.append('end_date', options.endDate);

    const queryString = params.toString();
    const endpoint = `/accounts/${accountId}/transactions${queryString ? `?${queryString}` : ''}`;

    return this.request<TellerTransaction[]>(endpoint);
  }

  // List ALL transactions for an account with automatic pagination
  async listAllTransactions(
    accountId: string,
    options?: {
      startDate?: string;
      endDate?: string;
    }
  ): Promise<TellerTransaction[]> {
    const pageSize = 250;
    const allTransactions: TellerTransaction[] = [];
    let fromId: string | undefined;

    while (true) {
      const page = await this.listTransactions(accountId, {
        count: pageSize,
        fromId,
        startDate: options?.startDate,
        endDate: options?.endDate,
      });

      if (page.length === 0) break;

      allTransactions.push(...page);
      fromId = page[page.length - 1].id;

      if (page.length < pageSize) break;
    }

    return allTransactions;
  }

  // Delete/disconnect an account
  async deleteAccount(accountId: string): Promise<void> {
    await this.request<void>(`/accounts/${accountId}`, 'DELETE');
  }
}

// Factory function to create a Teller client
export function createTellerClient(accessToken: string): TellerClient {
  return new TellerClient({ accessToken });
}
