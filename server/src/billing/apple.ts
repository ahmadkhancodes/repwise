import { SignJWT, compactVerify, decodeProtectedHeader, importPKCS8 } from 'jose';
import type { Config } from '../config';
import { b64Decode } from '../lib/crypto';
import { HttpError } from '../lib/http';
import { OID, bytesEqual, importCertKey, isSignedBy, parseCertificate, type Certificate } from './x509';

/** StoreKit 2 JWSTransactionDecodedPayload (fields we use). */
export interface AppleTransaction {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
  type?: string;
  appAccountToken?: string;
  environment?: string;
  offerType?: number;
  offerDiscountType?: string;
  signedDate?: number;
}

export interface AppleRenewalInfo {
  originalTransactionId?: string;
  autoRenewStatus?: number;
  autoRenewProductId?: string;
  gracePeriodExpiresDate?: number;
  signedDate?: number;
}

/** App Store Server Notifications v2 responseBodyV2DecodedPayload. */
export interface AppleNotification {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  signedDate?: number;
  data?: {
    bundleId?: string;
    environment?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
}

export interface AppleStatus {
  /** 1 active, 2 expired, 3 billing retry, 4 grace period, 5 revoked. */
  status: number;
  transaction: AppleTransaction;
  renewal: AppleRenewalInfo | null;
}

export interface AppleStore {
  verifyTransaction(jws: string): Promise<AppleTransaction>;
  verifyRenewalInfo(jws: string): Promise<AppleRenewalInfo>;
  verifyNotification(signedPayload: string): Promise<AppleNotification>;
  /** Authoritative status from the App Store Server API; null when API keys are not configured or unknown. */
  getSubscriptionStatus(originalTransactionId: string, environment: string | undefined): Promise<AppleStatus | null>;
}

const invalidJws = () => new HttpError(400, 'invalid_signed_data');

/**
 * Verify an App Store JWS: the x5c chain must lead to a pinned Apple root (APPLE_ROOT_CA_G3_B64),
 * every certificate must be valid now, Apple's marker OIDs must be present, and the JWS must be
 * signed by the leaf key.
 */
export async function verifyAppleJws<T>(jws: string, rootsDer: Uint8Array[], now: number): Promise<T> {
  if (rootsDer.length === 0) throw new HttpError(503, 'not_configured');
  if (typeof jws !== 'string' || jws.length > 64 * 1024 || jws.split('.').length !== 3) throw invalidJws();
  let header: { alg?: string; x5c?: unknown };
  try {
    header = decodeProtectedHeader(jws) as typeof header;
  } catch {
    throw invalidJws();
  }
  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length < 2 || header.x5c.length > 4) throw invalidJws();

  let chain: Certificate[];
  let roots: Certificate[];
  try {
    chain = header.x5c.map((c) => {
      if (typeof c !== 'string') throw new Error('x5c');
      return parseCertificate(b64Decode(c));
    });
    roots = rootsDer.map((d) => parseCertificate(d));
  } catch {
    throw invalidJws();
  }
  for (const cert of chain) if (now < cert.notBefore || now > cert.notAfter) throw invalidJws();
  for (let i = 0; i < chain.length - 1; i++) {
    if (!chain[i + 1]!.isCa || !(await isSignedBy(chain[i]!, chain[i + 1]!))) throw invalidJws();
  }
  const top = chain[chain.length - 1]!;
  let anchored = roots.some((r) => bytesEqual(r.der, top.der));
  if (!anchored) {
    for (const r of roots) if (r.isCa && (await isSignedBy(top, r))) anchored = true;
  }
  if (!anchored) throw invalidJws();
  const leaf = chain[0]!;
  if (!leaf.extensions.has(OID.appleReceiptSigning) || !chain[1]!.extensions.has(OID.appleWwdrIntermediate)) throw invalidJws();
  if (leaf.curve !== OID.p256) throw invalidJws();

  try {
    const { payload } = await compactVerify(jws, await importCertKey(leaf), { algorithms: ['ES256'] });
    return JSON.parse(new TextDecoder().decode(payload)) as T;
  } catch {
    throw invalidJws();
  }
}

export function parseRoots(b64List: string): Uint8Array[] {
  return b64List
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => b64Decode(s));
}

const API_HOSTS = {
  production: 'https://api.storekit.itunes.apple.com',
  sandbox: 'https://api.storekit-sandbox.itunes.apple.com',
};

export function createAppleStore(cfg: Config, fetchFn: typeof fetch, now: () => number): AppleStore {
  let roots: Uint8Array[] | null = null;
  const getRoots = () => (roots ??= cfg.apple.rootCaB64 ? parseRoots(cfg.apple.rootCaB64) : []);
  let keyPromise: Promise<CryptoKey> | null = null;

  async function apiToken(): Promise<string> {
    keyPromise ??= importPKCS8(cfg.apple.privateKey.replace(/\\n/g, '\n'), 'ES256') as Promise<CryptoKey>;
    const iat = Math.floor(now() / 1000);
    return new SignJWT({ bid: cfg.apple.bundleId })
      .setProtectedHeader({ alg: 'ES256', kid: cfg.apple.keyId, typ: 'JWT' })
      .setIssuer(cfg.apple.issuerId)
      .setAudience('appstoreconnect-v1')
      .setIssuedAt(iat)
      .setExpirationTime(iat + 300)
      .sign(await keyPromise);
  }

  const store: AppleStore = {
    verifyTransaction: (jws) => verifyAppleJws<AppleTransaction>(jws, getRoots(), now()),
    verifyRenewalInfo: (jws) => verifyAppleJws<AppleRenewalInfo>(jws, getRoots(), now()),
    verifyNotification: (p) => verifyAppleJws<AppleNotification>(p, getRoots(), now()),
    async getSubscriptionStatus(originalTransactionId, environment) {
      if (!cfg.apple.issuerId || !cfg.apple.keyId || !cfg.apple.privateKey) return null;
      if (!/^\d{1,32}$/.test(originalTransactionId)) return null;
      const host = environment === 'Sandbox' ? API_HOSTS.sandbox : API_HOSTS.production;
      const res = await fetchFn(`${host}/inApps/v1/subscriptions/${originalTransactionId}`, {
        headers: { authorization: `Bearer ${await apiToken()}` },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new HttpError(502, 'store_unavailable');
      const body = (await res.json()) as {
        data?: { lastTransactions?: { originalTransactionId?: string; status?: number; signedTransactionInfo?: string; signedRenewalInfo?: string }[] }[];
      };
      for (const group of body.data ?? []) {
        for (const lt of group.lastTransactions ?? []) {
          if (lt.originalTransactionId !== originalTransactionId || !lt.signedTransactionInfo) continue;
          return {
            status: Number(lt.status ?? 0),
            transaction: await store.verifyTransaction(lt.signedTransactionInfo),
            renewal: lt.signedRenewalInfo ? await store.verifyRenewalInfo(lt.signedRenewalInfo) : null,
          };
        }
      }
      return null;
    },
  };
  return store;
}
