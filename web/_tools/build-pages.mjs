#!/usr/bin/env node
// Regenerates the static legal, support and 404 pages from docs/legal/*.md.
// The site itself has NO build step: the generated HTML is committed. Run this
// only when docs/legal changes:  node web/_tools/build-pages.mjs
// No dependencies. Not deployed (see docs/WEB_DEPLOY.md).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const legal = join(web, '..', 'docs', 'legal');
const SITE = 'https://repwise.app';
const EMAIL = 'buffersoltechnologies@gmail.com';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function inline(s) {
  let t = esc(s);
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/https:\/\/repwise\.app(\/[a-z-]+)?/g, (m, p) => `<a href="${p ? p + '/' : '/'}">${m.replace('https://', '')}</a>`);
  t = t.replace(/\bico\.org\.uk\b/g, '<a href="https://ico.org.uk" rel="noopener">ico.org.uk</a>');
  t = t.replace(new RegExp(EMAIL.replace(/\./g, '\\.'), 'g'), `<a href="mailto:${EMAIL}">${EMAIL}</a>`);
  return t;
}

// Minimal Markdown subset used by docs/legal: #/##/### headings, paragraphs,
// - lists, 1. lists, pipe tables, **bold**.
function md(src) {
  // Editorial notes in the drafts that must not be published.
  src = src.replace(/ · Draft for [^\n]*/g, '').replace(/ \(confirm the registered company name and address before publishing\)/g, '');
  const lines = src.split('\n');
  const out = []; const toc = []; let title = ''; let updated = '';
  let i = 0;
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^# (.+)/))) { title = m[1]; i++; continue; }
    if (!updated && (m = l.match(/^Last updated: (.+)/))) { updated = m[1].trim(); i++; continue; }
    if ((m = l.match(/^(##+) (.+)/))) {
      const h = m[1].length; const text = inline(m[2]); const id = slug(m[2]);
      if (h === 2) toc.push({ id, text: text.replace(/^\d+\.\s*/, '') });
      out.push(`<h${h} id="${id}">${text}</h${h}>`); i++; continue;
    }
    if (/^\|/.test(l)) {
      const head = cells(l); i += 2; const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="tbl" tabindex="0" role="region" aria-label="Table: ${esc(head.join(', '))}"><table><thead><tr>${head.map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^- /.test(l)) {
      const items = [];
      while (i < lines.length && /^- /.test(lines[i])) items.push(lines[i++].slice(2));
      out.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`); continue;
    }
    if (/^\d+\. /.test(l)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\d+\. /, ''));
      out.push(`<ol>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`); continue;
    }
    out.push(`<p>${inline(l)}</p>`); i++;
  }
  return { title, updated, toc, html: out.join('\n') };
}

const sprite = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<symbol id="i-logo" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="var(--inverse)"/><path d="M8 20.5 13 15.5l3.6 3.6L24 11.5" fill="none" stroke="var(--accent)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-phone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 18h3"/></symbol>
<symbol id="i-mail" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></symbol>
<symbol id="i-trash" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></symbol>
</defs></svg>`;

function page({ path, title, desc, body, current = '', noindex = false }) {
  const url = SITE + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`}
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Repwise">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
${noindex ? '' : `<meta property="og:url" content="${url}">\n`}<meta property="og:image" content="${SITE}/assets/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.png" type="image/png" sizes="48x48">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
${sprite}
<a class="skip" href="#main">Skip to content</a>
<header class="hdr">
  <div class="wrap">
    <a class="brand" href="/" aria-label="Repwise home"><svg aria-hidden="true"><use href="#i-logo"/></svg>Repwise</a>
    <nav class="nav" aria-label="Primary">
      <a href="/#features">Features</a>
      <a href="/#pricing">Pricing</a>
      <a href="/#faq">FAQ</a>
      <a href="/support/"${current === 'support' ? ' aria-current="page"' : ''}>Support</a>
    </nav>
    <a class="btn btn-inv btn-sm" href="/#get">Get the app</a>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="ftr">
  <div class="wrap">
    <div class="ftr-grid">
      <div>
        <a class="brand" href="/" aria-label="Repwise home"><svg aria-hidden="true"><use href="#i-logo"/></svg>Repwise</a>
        <p class="muted" style="margin-top:8px;max-width:22em">Your gym plan and your meal plan, made for you, every day.</p>
      </div>
      <nav aria-label="Product"><h2>Product</h2><ul><li><a href="/#features">Features</a></li><li><a href="/#pricing">Pricing</a></li><li><a href="/#faq">FAQ</a></li></ul></nav>
      <nav aria-label="Help"><h2>Help</h2><ul><li><a href="/support/">Support</a></li><li><a href="/delete-account/">Delete account</a></li><li><a href="mailto:${EMAIL}">Email us</a></li></ul></nav>
      <nav aria-label="Legal"><h2>Legal</h2><ul><li><a href="/privacy/">Privacy Policy</a></li><li><a href="/terms/">Terms of Use</a></li></ul></nav>
    </div>
    <div class="legal">
      <p>Repwise provides general fitness and nutrition guidance for healthy adults. It is not medical advice. Consult a qualified professional before starting a new exercise or diet program, especially if you have a medical condition.</p>
      <p>© 2026 Buffersol Technologies. All rights reserved.</p>
    </div>
  </div>
</footer>
</body>
</html>
`;
}

function docPage({ file, path, eyebrow, desc, pre = '' }) {
  const d = md(readFileSync(join(legal, file), 'utf8'));
  const toc = d.toc.length > 3
    ? `<nav class="toc" aria-label="On this page"><h2>On this page</h2><ol>${d.toc.map((t) => `<li><a href="#${t.id}">${t.text}</a></li>`).join('')}</ol></nav>`
    : '<div class="toc" aria-hidden="true"></div>';
  const body = `<div class="wrap doc">
  <!-- Source of truth: docs/legal/${file}. Regenerate with: node web/_tools/build-pages.mjs -->
  <!-- TODO(owner): confirm the registered company name and address before publishing. -->
  <header class="doc-head">
    <p class="eyebrow"><i></i>${eyebrow}</p>
    <h1 class="h1">${esc(d.title)}</h1>
    <p>Last updated: ${esc(d.updated)}</p>
  </header>
  <div class="doc-grid">
    ${toc}
    <article class="prose">
${pre}${d.html}
    </article>
  </div>
</div>`;
  write(path, page({ path, title: `${d.title.replace(/^Repwise /, '')} · Repwise`, desc, body }));
}

function write(path, html) {
  const f = path.endsWith('.html') ? join(web, path) : join(web, path, 'index.html');
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, html);
  console.log('wrote', f.replace(web + '/', 'web/'));
}

docPage({ file: 'privacy.md', path: '/privacy/', eyebrow: 'Legal', desc: 'What Repwise collects, why, who helps us run the app, and the choices you have. No ads, no selling your data, account optional.' });
docPage({ file: 'terms.md', path: '/terms/', eyebrow: 'Legal', desc: 'The terms for using the Repwise app, including Repwise Pro subscriptions, the free trial and cancellation.' });
docPage({
  file: 'delete-account.md', path: '/delete-account/', eyebrow: 'Your data',
  desc: 'How to delete your Repwise account and backed-up data: in the app under Settings > Account, or by email.',
  pre: `<div class="opts">
  <a href="#option-1-in-the-app-fastest"><svg aria-hidden="true"><use href="#i-phone"/></svg><b>In the app</b><span>Settings &gt; Account &gt; Delete account. Removed straight away.</span></a>
  <a href="mailto:${EMAIL}?subject=Delete%20my%20Repwise%20account"><svg aria-hidden="true"><use href="#i-mail"/></svg><b>By email</b><span>${EMAIL}, subject "Delete my Repwise account". Within 30 days.</span></a>
</div>
`,
});

// Support
const faqs = [
  ['Getting started', [
    ['Do I need an account?', 'No. You can use Repwise without signing in, and your plans, workouts, meals and progress stay on your device. An account is optional and only for backup, restore and sync across your devices, and for keeping Pro across devices.'],
    ['How do I change my goal, equipment or diet?', 'Open Settings and update your profile. Your next plan is built around the new answers. Your logged workouts and meals are kept.'],
    ['Does Repwise work offline?', 'Yes. Your plan, your log and the workout player do not need a connection. You need one for things like building a new plan or backing up.'],
    ['I got a new phone. How do I move my data?', 'Sign in on your old phone first so your data is backed up, then sign in with the same account on the new phone to restore it. Without an account, data stays only on the old phone. Progress photo files are not uploaded in this version, so export any photos you want to keep.'],
  ]],
  ['Plans and AI', [
    ['How is AI used?', 'Your plan is personalised with AI through our own server. Your targets and the maths behind sets, reps, calories and macros come from tested rules, and the AI helps choose and order sessions and meals from a vetted library. We do not send your name or email to the AI. If the AI is unavailable, Repwise falls back to a rules-based plan.'],
    ['A workout or meal does not suit me. What can I do?', 'Swap any meal in one tap, and change or skip any exercise. You decide what to do with a plan. If you have a medical condition, an injury or an allergy, check with a qualified professional and always check ingredients yourself.'],
    ['Why did my plan change this week?', 'The weekly check-in looks at what you actually did and refreshes your sessions, targets and menus for the week ahead.'],
  ]],
  ['Subscription and billing', [
    ['What does Repwise Pro include?', 'AI plans that adapt every week, a daily meal plan with swaps, the grocery list, the full reminder schedule, full progress history and Wrapped. The quiz, your first personal plan, workout logging, the exercise library, 3 routines and basic progress stay free.'],
    ['How does the 7-day free trial work?', 'The yearly plan includes a 7-day free trial for eligible new subscribers. After the trial it renews at the yearly price shown unless you cancel before it ends. We send a reminder two days before the trial ends.'],
    ['How do I cancel?', 'Subscriptions are billed by Apple or Google. On iPhone: Settings > your name > Subscriptions. On Android: Play Store > profile > Payments &amp; subscriptions > Subscriptions. In the app, Settings > Subscription > Manage opens the same place. You keep Pro until the end of the paid period. Deleting the app or your account does not cancel a subscription.'],
    ['How do I get a refund?', 'Refunds are handled by Apple or Google under their policies. Request one from the store you bought from.'],
    ['I paid but Pro is not unlocked.', 'Tap Restore purchases on the paywall or in Settings, and make sure you are signed in to the same store account you bought with. If it still does not unlock, email us with the store you used and the purchase date.'],
  ]],
  ['Privacy and data', [
    ['How do I delete my account and data?', 'In the app, go to Settings > Account > Delete account. Or email us from the address linked to your account. Full steps are on the <a href="/delete-account/">delete account page</a>.'],
    ['Where are my progress photos stored?', "In the app's private storage on your device. They are never saved to your gallery and are only shared if you tap Share."],
    ['Can I turn off analytics?', 'Yes, in Settings. Analytics are anonymous and tied to a random install id, not to your name or email. See the <a href="/privacy/">Privacy Policy</a>.'],
  ]],
];
const supportBody = `<div class="wrap doc">
  <header class="doc-head">
    <p class="eyebrow"><i></i>Support</p>
    <h1 class="h1">How can we help?</h1>
    <p>Answers to common questions, and a real inbox when you need one.</p>
  </header>
  <div class="opts">
    <a href="mailto:${EMAIL}?subject=Repwise%20support"><svg aria-hidden="true"><use href="#i-mail"/></svg><b>Email us</b><span>${EMAIL}. We read everything.</span></a>
    <a href="/delete-account/"><svg aria-hidden="true"><use href="#i-trash"/></svg><b>Delete your account</b><span>In the app or by email. Here is how.</span></a>
  </div>
  <div class="doc-grid">
    <nav class="toc" aria-label="On this page"><h2>On this page</h2><ol>${faqs.map(([g]) => `<li><a href="#${slug(g)}">${g}</a></li>`).join('')}<li><a href="#contact">Contact</a></li></ol></nav>
    <div class="prose">
${faqs.map(([g, qs]) => `<h2 id="${slug(g)}">${g}</h2>
<div class="faq">
${qs.map(([q, a]) => `<details><summary>${q}</summary><div><p>${a}</p></div></details>`).join('\n')}
</div>`).join('\n')}
<h2 id="contact">Contact</h2>
<div class="callout">
<p><strong>Email:</strong> <a href="mailto:${EMAIL}">${EMAIL}</a></p>
<p>To help us fix a problem quickly, tell us your phone model, your operating system version, the app version (Settings &gt; About) and what you were doing when it happened. Please do not send passwords or card details.</p>
</div>
<p class="small muted">Repwise provides general fitness and nutrition guidance for healthy adults. It is not medical advice, and we cannot answer medical questions by email.</p>
    </div>
  </div>
</div>`;
write('/support/', page({ path: '/support/', title: 'Support · Repwise', desc: 'Help with Repwise: plans, subscriptions, the free trial, cancelling, backup and deleting your account. Contact buffersoltechnologies@gmail.com.', body: supportBody, current: 'support' }));

write('/404.html', page({ path: '/404.html', noindex: true, title: 'Page not found · Repwise', desc: 'That page does not exist.', body: `<div class="wrap nf"><div>
  <p class="big404 num" aria-hidden="true">404</p>
  <h1 class="h2">That rep did not count.</h1>
  <p class="lead" style="margin-left:auto;margin-right:auto">The page you are looking for is not here. It may have moved.</p>
  <div class="hero-cta"><a class="btn btn-inv btn-lg" href="/">Back to home</a><a class="btn btn-ghost btn-lg" href="/support/">Support</a></div>
</div></div>` }));
