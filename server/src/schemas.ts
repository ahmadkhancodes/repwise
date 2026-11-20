/**
 * zod schemas for every request input (bodies, query strings, decoded webhook payloads).
 * Failures become 400 `{ error: <code> }` via lib/validate.ts; zod's own text never reaches a client.
 * Objects strip unknown keys (older/newer apps may send extras), except where noted.
 */
import { z } from 'zod';
import { SYNC_LIMITS, TABLE_NAMES } from './sync/tables';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;
const DEVICE_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Compact JWT / JWS: three base64url segments. */
const JWS_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

const deviceId = z.string({ error: 'invalid_device_id' }).regex(DEVICE_RE, { error: 'invalid_device_id' }).nullish();
const jws = (max: number, code: string) => z.string({ error: code }).min(16, { error: code }).max(max, { error: code }).regex(JWS_RE, { error: code });

export const email = z
  .string({ error: 'invalid_email' })
  .max(320, { error: 'invalid_email' })
  .transform((s) => s.trim().toLowerCase())
  .refine((s) => s.length <= 254 && EMAIL_RE.test(s), { error: 'invalid_email' });

// ---------------------------------------------------------------------------------------------- auth

export const AnonymousBody = z.object({ deviceId });
// ID tokens: only bounded here. Anything malformed fails signature verification as 401 invalid_token,
// so the app sees one outcome for every unusable token.
const idToken = (code: string) => z.string({ error: code }).min(1, { error: code }).max(8192, { error: code });
export const GoogleBody = z.object({ idToken: idToken('invalid_id_token'), deviceId });
export const AppleBody = z.object({
  identityToken: idToken('invalid_identity_token'),
  // Raw nonce; the token must carry its sha256-hex.
  nonce: z.string({ error: 'invalid_nonce' }).min(8, { error: 'invalid_nonce' }).max(256, { error: 'invalid_nonce' }),
  deviceId,
});
export const EmailStartBody = z.object({ email });
export const EmailVerifyBody = z.object({ email, code: z.string({ error: 'invalid_code' }).regex(/^\d{6}$/, { error: 'invalid_code' }), deviceId });
export const RefreshBody = z.object({
  refreshToken: z.string({ error: 'invalid_refresh_token' }).min(1, { error: 'invalid_refresh_token' }).max(256, { error: 'invalid_refresh_token' }),
});

// ---------------------------------------------------------------------------------------------- sync

export const PushBody = z.object({
  table: z.enum(TABLE_NAMES as [string, ...string[]], { error: 'unknown_table' }),
  // Each row is checked by sync/validate.ts (allow-listed columns, plain values, sizes, timestamps),
  // so one bad row is reported in `rejected` instead of failing the batch.
  rows: z.array(z.unknown(), { error: 'rows_must_be_array' }).max(SYNC_LIMITS.maxRowsPerPush, { error: 'too_many_rows' }),
});

const intString = (code: string, min: number, max: number) =>
  z
    .string({ error: code })
    .regex(/^\d{1,16}$/, { error: code })
    .transform(Number)
    .refine((n) => Number.isSafeInteger(n) && n >= min && n <= max, { error: code });

export const PullQuery = z.object({
  since: z.union([z.literal(''), intString('invalid_since', 0, Number.MAX_SAFE_INTEGER)]).optional(),
  tables: z
    .string({ error: 'unknown_table' })
    .max(2000, { error: 'unknown_table' })
    .optional(),
  limit: intString('invalid_limit', 1, SYNC_LIMITS.maxPullPage).optional(),
  cursor: z.string({ error: 'invalid_cursor' }).max(1024, { error: 'invalid_cursor' }).regex(/^[A-Za-z0-9_-]+$/, { error: 'invalid_cursor' }).optional(),
});

// ---------------------------------------------------------------------------------------------- billing

export const BillingVerifyBody = z.discriminatedUnion(
  'platform',
  [
    z.object({ platform: z.literal('ios'), signedTransaction: jws(64 * 1024, 'invalid_signed_transaction') }),
    z.object({
      platform: z.literal('android'),
      purchaseToken: z.string({ error: 'invalid_purchase_token' }).min(1, { error: 'invalid_purchase_token' }).max(1024, { error: 'invalid_purchase_token' }),
      productId: z.string({ error: 'invalid_product_id' }).min(1, { error: 'invalid_product_id' }).max(200, { error: 'invalid_product_id' }),
    }),
  ],
  { error: 'invalid_platform' },
);

/** App Store Server Notifications v2 envelope. The JWS itself is verified in billing/apple.ts. */
export const AppleWebhookBody = z.object({ signedPayload: jws(128 * 1024, 'invalid_signed_payload') });

/** The verified notification payload (shape check after the signature check). */
export const AppleNotificationPayload = z.object({
  notificationType: z.string().min(1).max(64),
  subtype: z.string().max(64).optional(),
  notificationUUID: z.string().max(64).optional(),
  signedDate: z.number().int().nonnegative().optional(),
  data: z
    .object({
      bundleId: z.string().max(256).optional(),
      environment: z.string().max(32).optional(),
      signedTransactionInfo: z.string().max(64 * 1024).optional(),
      signedRenewalInfo: z.string().max(64 * 1024).optional(),
    })
    .optional(),
});

/** Pub/Sub push envelope. */
export const PlayWebhookBody = z.object({
  message: z.object({
    data: z.string({ error: 'invalid_message' }).max(48 * 1024, { error: 'invalid_message' }).regex(/^[A-Za-z0-9+/=_-]*$/, { error: 'invalid_message' }),
    messageId: z.string().max(128).optional(),
  }, { error: 'invalid_message' }),
  subscription: z.string().max(512).optional(),
});

/** The decoded Real-time Developer Notification (only the parts we act on). */
export const PlayRtdn = z.object({
  version: z.string().max(16).optional(),
  packageName: z.string().max(256),
  eventTimeMillis: z.union([z.string().regex(/^\d{1,16}$/), z.number().int().nonnegative()]).optional(),
  subscriptionNotification: z
    .object({ notificationType: z.number().int().optional(), purchaseToken: z.string().min(1).max(1024), subscriptionId: z.string().max(200).optional() })
    .optional(),
  voidedPurchaseNotification: z.object({ purchaseToken: z.string().min(1).max(1024), orderId: z.string().max(200).optional() }).optional(),
  testNotification: z.object({ version: z.string().max(16).optional() }).optional(),
});

// ---------------------------------------------------------------------------------------------- AI

/** A JSON object (contents are validated by the engine's ProfileSchema / HistorySchema). */
const jsonObject = (code: string) => z.record(z.string(), z.unknown(), { error: code });

/** Planner params. Unknown keys are dropped (the app may send hints the server does not use). */
export const AiParams = z.object({
  weekStart: z.string().regex(ISO_DATE, { error: 'invalid_week_start' }).optional(),
  date: z.string().regex(ISO_DATE, { error: 'invalid_date' }).optional(),
  now: z.number({ error: 'invalid_now' }).int({ error: 'invalid_now' }).min(0, { error: 'invalid_now' }).max(8.64e15, { error: 'invalid_now' }).optional(),
  utcOffsetMin: z.number({ error: 'invalid_utc_offset_min' }).int({ error: 'invalid_utc_offset_min' }).min(-840, { error: 'invalid_utc_offset_min' }).max(840, { error: 'invalid_utc_offset_min' }).optional(),
  noRepeatDays: z.number({ error: 'invalid_no_repeat_days' }).int({ error: 'invalid_no_repeat_days' }).min(7, { error: 'invalid_no_repeat_days' }).max(30, { error: 'invalid_no_repeat_days' }).optional(),
  adjustmentKcal: z.number({ error: 'invalid_adjustment_kcal' }).int({ error: 'invalid_adjustment_kcal' }).min(-1000, { error: 'invalid_adjustment_kcal' }).max(1000, { error: 'invalid_adjustment_kcal' }).optional(),
  /** The user asked for a lighter week (check-in / assistant card): the engine plans a deload. */
  deload: z.boolean({ error: 'invalid_deload' }).optional(),
  // swap only (required there; the engine planner enforces that)
  item: z.enum(['exercise', 'meal'], { error: 'invalid_item' }).optional(),
  index: z.number({ error: 'invalid_index' }).int({ error: 'invalid_index' }).min(0, { error: 'invalid_index' }).max(20, { error: 'invalid_index' }).optional(),
  currentId: z.string({ error: 'invalid_current_id' }).max(128, { error: 'invalid_current_id' }).regex(/^[A-Za-z0-9_-]+$/, { error: 'invalid_current_id' }).optional(),
});

export const AiBody = z.object({
  profile: jsonObject('profile_required'),
  history: jsonObject('invalid_history').nullish(),
  params: jsonObject('invalid_params').nullish(),
});

export const UsageQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'invalid_month' }).optional() });
