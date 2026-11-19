import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Config } from '../config';
import { GOOGLE_JWKS_URL } from '../auth/idtokens';
import { safeEqual } from '../lib/crypto';
import { HttpError } from '../lib/http';

/** purchases.subscriptionsv2 resource (fields we use). */
export interface PlaySubscriptionV2 {
  subscriptionState?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  testPurchase?: Record<string, unknown>;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: {
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
    offerDetails?: { basePlanId?: string; offerId?: string; offerTags?: string[] };
    offerPhase?: { freeTrial?: unknown; introductoryPrice?: unknown; basePrice?: unknown };
  }[];
}

export interface PlayApi {
  /** null when the token is unknown to Google (404/410). */
  getSubscription(purchaseToken: string): Promise<PlaySubscriptionV2 | null>;
  acknowledge(subscriptionId: string, purchaseToken: string): Promise<void>;
}

const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

/** Google Play Developer API via a service account (JWT bearer grant). Credentials: PLAY_SERVICE_ACCOUNT_JSON. */
export function createPlayApi(cfg: Config, fetchFn: typeof fetch, now: () => number): PlayApi {
  let token: { value: string; exp: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.exp - 60_000 > now()) return token.value;
    if (!cfg.play.serviceAccountJson) throw new HttpError(503, 'not_configured');
    let sa: { client_email?: string; private_key?: string; token_uri?: string };
    try {
      sa = JSON.parse(cfg.play.serviceAccountJson);
    } catch {
      throw new HttpError(503, 'not_configured');
    }
    if (!sa.client_email || !sa.private_key) throw new HttpError(503, 'not_configured');
    const aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
    const iat = Math.floor(now() / 1000);
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(sa.client_email)
      .setAudience(aud)
      .setIssuedAt(iat)
      .setExpirationTime(iat + 3600)
      .sign(await importPKCS8(sa.private_key, 'RS256'));
    const res = await fetchFn(aud, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    if (!res.ok) throw new HttpError(502, 'store_unavailable');
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new HttpError(502, 'store_unavailable');
    token = { value: body.access_token, exp: now() + (body.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  const pkg = () => encodeURIComponent(cfg.play.packageName);

  return {
    async getSubscription(purchaseToken) {
      const res = await fetchFn(`${API}/${pkg()}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`, {
        headers: { authorization: `Bearer ${await accessToken()}` },
      });
      if (res.status === 404 || res.status === 410 || res.status === 400) return null;
      if (!res.ok) throw new HttpError(502, 'store_unavailable');
      return (await res.json()) as PlaySubscriptionV2;
    },
    async acknowledge(subscriptionId, purchaseToken) {
      const res = await fetchFn(
        `${API}/${pkg()}/purchases/subscriptions/${encodeURIComponent(subscriptionId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
        { method: 'POST', headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' }, body: '{}' },
      );
      if (!res.ok && res.status !== 400) throw new HttpError(502, 'store_unavailable');
    },
  };
}

/**
 * Pub/Sub push authentication. With PLAY_PUBSUB_AUDIENCE set, require a Google-signed OIDC token
 * for PLAY_PUBSUB_SERVICE_ACCOUNT. Otherwise require `?token=` to equal PLAY_RTDN_SECRET.
 * With neither configured, every push is rejected (fail closed).
 */
export function pubsubVerifier(cfg: Config, jwks: JWTVerifyGetKey = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL))) {
  return async (req: { authorization?: string | undefined; token?: string | undefined }): Promise<boolean> => {
    if (cfg.play.pubsubAudience) {
      const m = /^Bearer\s+(\S+)$/i.exec(req.authorization ?? '');
      if (!m) return false;
      try {
        const { payload } = await jwtVerify(m[1]!, jwks, {
          algorithms: ['RS256'],
          issuer: ['https://accounts.google.com', 'accounts.google.com'],
          audience: cfg.play.pubsubAudience,
        });
        if (cfg.play.pubsubServiceAccount && payload.email !== cfg.play.pubsubServiceAccount) return false;
        return payload.email_verified === true || payload.email_verified === 'true';
      } catch {
        return false;
      }
    }
    if (cfg.play.rtdnSecret) return !!req.token && safeEqual(req.token, cfg.play.rtdnSecret);
    return false;
  };
}
