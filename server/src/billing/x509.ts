/**
 * Minimal DER / X.509 reader, enough to verify an App Store x5c chain (ECDSA P-256/P-384) with
 * Web Crypto. No dependency on node:crypto.X509Certificate, so it runs the same in Workers and tests.
 */
export interface Tlv {
  tag: number;
  start: number; // offset of the tag byte
  contentStart: number;
  end: number; // exclusive
}

export function readTlv(buf: Uint8Array, offset: number): Tlv {
  if (offset + 2 > buf.length) throw new Error('asn1: truncated');
  const tag = buf[offset]!;
  if ((tag & 0x1f) === 0x1f) throw new Error('asn1: high tag numbers unsupported');
  let len = buf[offset + 1]!;
  let p = offset + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error('asn1: bad length');
    len = 0;
    for (let i = 0; i < n; i++) {
      if (p >= buf.length) throw new Error('asn1: truncated');
      len = len * 256 + buf[p++]!;
    }
  }
  const end = p + len;
  if (end > buf.length) throw new Error('asn1: truncated');
  return { tag, start: offset, contentStart: p, end };
}

export function children(buf: Uint8Array, t: Tlv): Tlv[] {
  const out: Tlv[] = [];
  let p = t.contentStart;
  while (p < t.end) {
    const c = readTlv(buf, p);
    out.push(c);
    p = c.end;
  }
  if (p !== t.end) throw new Error('asn1: overrun');
  return out;
}

const content = (buf: Uint8Array, t: Tlv) => buf.subarray(t.contentStart, t.end);
const whole = (buf: Uint8Array, t: Tlv) => buf.subarray(t.start, t.end);

export function decodeOid(bytes: Uint8Array): string {
  const parts: number[] = [];
  let v = 0;
  for (let i = 0; i < bytes.length; i++) {
    v = v * 128 + (bytes[i]! & 0x7f);
    if (!(bytes[i]! & 0x80)) {
      if (parts.length === 0) {
        const first = v < 80 ? Math.floor(v / 40) : 2;
        parts.push(first, v - first * 40);
      } else parts.push(v);
      v = 0;
    }
  }
  return parts.join('.');
}

function decodeTime(buf: Uint8Array, t: Tlv): number {
  const s = new TextDecoder().decode(content(buf, t));
  let m: RegExpExecArray | null;
  if (t.tag === 0x17 && (m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s))) {
    const yy = Number(m[1]);
    return Date.UTC(yy >= 50 ? 1900 + yy : 2000 + yy, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  }
  if (t.tag === 0x18 && (m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s))) {
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  }
  throw new Error('x509: bad time');
}

export interface Certificate {
  der: Uint8Array;
  tbs: Uint8Array;
  sigAlg: string;
  signature: Uint8Array; // DER-encoded ECDSA signature
  issuer: Uint8Array;
  subject: Uint8Array;
  notBefore: number;
  notAfter: number;
  spki: Uint8Array;
  curve: string | null; // OID of the named curve
  extensions: Map<string, Uint8Array>; // OID → extnValue (OCTET STRING content)
  isCa: boolean;
}

export const OID = {
  ecPublicKey: '1.2.840.10045.2.1',
  p256: '1.2.840.10045.3.1.7',
  p384: '1.3.132.0.34',
  ecdsaSha256: '1.2.840.10045.4.3.2',
  ecdsaSha384: '1.2.840.10045.4.3.3',
  basicConstraints: '2.5.29.19',
  appleWwdrIntermediate: '1.2.840.113635.100.6.2.1',
  appleReceiptSigning: '1.2.840.113635.100.6.11.1',
};

export function parseCertificate(der: Uint8Array): Certificate {
  const root = readTlv(der, 0);
  if (root.tag !== 0x30 || root.end !== der.length) throw new Error('x509: not a certificate');
  const [tbsT, algT, sigT] = children(der, root);
  if (!tbsT || !algT || !sigT || sigT.tag !== 0x03) throw new Error('x509: bad structure');
  const tbsKids = children(der, tbsT);
  let i = 0;
  if (tbsKids[0]?.tag === 0xa0) i++; // [0] version
  i++; // serialNumber
  i++; // signature AlgorithmIdentifier
  const issuerT = tbsKids[i++];
  const validityT = tbsKids[i++];
  const subjectT = tbsKids[i++];
  const spkiT = tbsKids[i++];
  if (!issuerT || !validityT || !subjectT || !spkiT) throw new Error('x509: bad tbs');
  const [nb, na] = children(der, validityT);
  if (!nb || !na) throw new Error('x509: bad validity');

  const spkiAlg = children(der, children(der, spkiT)[0]!);
  const keyOid = decodeOid(content(der, spkiAlg[0]!));
  const curve = keyOid === OID.ecPublicKey && spkiAlg[1]?.tag === 0x06 ? decodeOid(content(der, spkiAlg[1])) : null;

  const extensions = new Map<string, Uint8Array>();
  let isCa = false;
  for (const t of tbsKids.slice(i)) {
    if (t.tag !== 0xa3) continue;
    const seq = children(der, t)[0]!;
    for (const ext of children(der, seq)) {
      const parts = children(der, ext);
      const oid = decodeOid(content(der, parts[0]!));
      const value = content(der, parts[parts.length - 1]!);
      extensions.set(oid, value);
      if (oid === OID.basicConstraints) {
        const bc = readTlv(value, 0);
        const first = children(value, bc)[0];
        isCa = !!first && first.tag === 0x01 && value[first.contentStart] !== 0;
      }
    }
  }
  const sigBits = content(der, sigT);
  if (sigBits[0] !== 0) throw new Error('x509: unused bits in signature');
  return {
    der,
    tbs: whole(der, tbsT),
    sigAlg: decodeOid(content(der, children(der, algT)[0]!)),
    signature: sigBits.subarray(1),
    issuer: whole(der, issuerT),
    subject: whole(der, subjectT),
    notBefore: decodeTime(der, nb),
    notAfter: decodeTime(der, na),
    spki: whole(der, spkiT),
    curve,
    extensions,
    isCa,
  };
}

const CURVES: Record<string, { name: 'P-256' | 'P-384'; size: number }> = {
  [OID.p256]: { name: 'P-256', size: 32 },
  [OID.p384]: { name: 'P-384', size: 48 },
};

/** DER ECDSA-Sig-Value → IEEE P1363 r||s, as Web Crypto expects. */
export function derToRawEcdsa(sig: Uint8Array, size: number): Uint8Array {
  const seq = readTlv(sig, 0);
  const [r, s] = children(sig, seq);
  if (!r || !s || r.tag !== 0x02 || s.tag !== 0x02) throw new Error('ecdsa: bad signature');
  const out = new Uint8Array(size * 2);
  for (const [idx, t] of [r, s].entries()) {
    let v = sig.subarray(t.contentStart, t.end);
    while (v.length > size && v[0] === 0) v = v.subarray(1);
    if (v.length > size) throw new Error('ecdsa: integer too long');
    out.set(v, idx * size + (size - v.length));
  }
  return out;
}

export async function importCertKey(cert: Certificate): Promise<CryptoKey> {
  const curve = cert.curve ? CURVES[cert.curve] : undefined;
  if (!curve) throw new Error('x509: unsupported key type');
  return crypto.subtle.importKey('spki', cert.spki as BufferSource, { name: 'ECDSA', namedCurve: curve.name }, false, ['verify']);
}

/** True if `cert` was signed by `issuer`'s key (names must chain too). */
export async function isSignedBy(cert: Certificate, issuer: Certificate): Promise<boolean> {
  if (!bytesEqual(cert.issuer, issuer.subject)) return false;
  const hash = cert.sigAlg === OID.ecdsaSha256 ? 'SHA-256' : cert.sigAlg === OID.ecdsaSha384 ? 'SHA-384' : null;
  const curve = issuer.curve ? CURVES[issuer.curve] : undefined;
  if (!hash || !curve) return false;
  try {
    const key = await importCertKey(issuer);
    const raw = derToRawEcdsa(cert.signature, curve.size);
    return await crypto.subtle.verify({ name: 'ECDSA', hash }, key, raw as BufferSource, cert.tbs as BufferSource);
  } catch {
    return false;
  }
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
