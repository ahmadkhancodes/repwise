// Test-only DER encoder: builds a throwaway Apple-like chain (root → intermediate → leaf) so the
// App Store JWS verifier is exercised end to end without real Apple certificates.
import { CompactSign } from 'jose';
import { b64Encode } from '../src/lib/crypto';
import { OID } from '../src/billing/x509';

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
function tlv(tag: number, content: Uint8Array): Uint8Array {
  const len = content.length;
  let hdr: number[];
  if (len < 0x80) hdr = [len];
  else {
    const bytes: number[] = [];
    for (let n = len; n > 0; n >>= 8) bytes.unshift(n & 0xff);
    hdr = [0x80 | bytes.length, ...bytes];
  }
  return concat(new Uint8Array([tag, ...hdr]), content);
}
const seq = (...p: Uint8Array[]) => tlv(0x30, concat(...p));
const set = (...p: Uint8Array[]) => tlv(0x31, concat(...p));
const octet = (b: Uint8Array) => tlv(0x04, b);
const bitString = (b: Uint8Array) => tlv(0x03, concat(new Uint8Array([0]), b));
const explicit = (n: number, inner: Uint8Array) => tlv(0xa0 + n, inner);
const bool = (v: boolean) => tlv(0x01, new Uint8Array([v ? 0xff : 0]));
const utf8 = (s: string) => tlv(0x0c, new TextEncoder().encode(s));
function oid(s: string): Uint8Array {
  const parts = s.split('.').map(Number);
  const out = [parts[0]! * 40 + parts[1]!];
  for (const p of parts.slice(2)) {
    const stack = [p & 0x7f];
    for (let v = p >> 7; v > 0; v >>= 7) stack.unshift((v & 0x7f) | 0x80);
    out.push(...stack);
  }
  return tlv(0x06, new Uint8Array(out));
}
function int(bytes: Uint8Array): Uint8Array {
  let b = bytes;
  while (b.length > 1 && b[0] === 0 && !(b[1]! & 0x80)) b = b.subarray(1);
  if (b[0]! & 0x80) b = concat(new Uint8Array([0]), b);
  return tlv(0x02, b);
}
function time(ms: number): Uint8Array {
  const d = new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z';
  const y = new Date(ms).getUTCFullYear();
  return y < 2050 ? tlv(0x17, new TextEncoder().encode(d.slice(2))) : tlv(0x18, new TextEncoder().encode(d));
}
const name = (cn: string) => seq(set(seq(oid('2.5.4.3'), utf8(cn))));

export interface TestCert {
  der: Uint8Array;
  keys: CryptoKeyPair;
  cn: string;
  curve: 'P-256' | 'P-384';
}

export async function keyPair(curve: 'P-256' | 'P-384'): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: curve }, true, ['sign', 'verify'])) as CryptoKeyPair;
}

const DEFAULT_NOT_BEFORE = Date.UTC(2020, 0, 1);
const DEFAULT_NOT_AFTER = Date.UTC(2049, 0, 1);

export async function makeCert(opts: {
  cn: string;
  curve: 'P-256' | 'P-384';
  issuer?: TestCert;
  isCa: boolean;
  oids?: string[];
  notBefore?: number;
  notAfter?: number;
  keys?: CryptoKeyPair;
}): Promise<TestCert> {
  const keys = opts.keys ?? (await keyPair(opts.curve));
  const issuerKeys = opts.issuer?.keys ?? keys;
  const issuerCurve = opts.issuer?.curve ?? opts.curve;
  const issuerCn = opts.issuer?.cn ?? opts.cn;
  const hash = issuerCurve === 'P-384' ? 'SHA-384' : 'SHA-256';
  const sigOid = oid(hash === 'SHA-384' ? OID.ecdsaSha384 : OID.ecdsaSha256);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey));
  const exts = [
    seq(oid(OID.basicConstraints), bool(true), octet(opts.isCa ? seq(bool(true)) : seq())),
    ...(opts.oids ?? []).map((o) => seq(oid(o), octet(tlv(0x05, new Uint8Array())))),
  ];
  const now = Date.now();
  const tbs = seq(
    explicit(0, int(new Uint8Array([2]))),
    int(crypto.getRandomValues(new Uint8Array(8))),
    seq(sigOid),
    name(issuerCn),
    // Fixed default validity (not relative to the real clock): tests verify at the injected T0,
    // which must stay inside the window whatever day the suite runs.
    seq(time(opts.notBefore ?? Math.min(now, DEFAULT_NOT_BEFORE)), time(opts.notAfter ?? Math.max(now, DEFAULT_NOT_AFTER))),
    name(opts.cn),
    spki,
    explicit(3, seq(...exts)),
  );
  const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash }, issuerKeys.privateKey, tbs as BufferSource));
  const half = raw.length / 2;
  const derSig = seq(int(raw.subarray(0, half)), int(raw.subarray(half)));
  return { der: seq(tbs, seq(sigOid), bitString(derSig)), keys, cn: opts.cn, curve: opts.curve };
}

export interface AppleChain {
  root: TestCert;
  intermediate: TestCert;
  leaf: TestCert;
  rootB64: string;
  sign(payload: unknown, chain?: TestCert[], signer?: CryptoKey): Promise<string>;
}

export async function appleChain(): Promise<AppleChain> {
  const root = await makeCert({ cn: 'Test Apple Root CA - G3', curve: 'P-384', isCa: true });
  const intermediate = await makeCert({ cn: 'Test WWDR G6', curve: 'P-384', issuer: root, isCa: true, oids: [OID.appleWwdrIntermediate] });
  const leaf = await makeCert({ cn: 'Test StoreKit Signing', curve: 'P-256', issuer: intermediate, isCa: false, oids: [OID.appleReceiptSigning] });
  return {
    root,
    intermediate,
    leaf,
    rootB64: b64Encode(root.der),
    async sign(payload, chain = [leaf, intermediate, root], signer = leaf.keys.privateKey) {
      return new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
        .setProtectedHeader({ alg: 'ES256', x5c: chain.map((c) => b64Encode(c.der)) })
        .sign(signer);
    },
  };
}
