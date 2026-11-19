# 25 Ops & Costs

| Repwise · Ops & Costs |  |  |
| Running costs (formulas), support, maintenance. |  |  |
| ← Back to Start Here |  |  |
| Monthly running costs (USD) — blue = assumption, verify current pricing |  |  |
| Item | Cost / month | Notes |
| Cloudflare Workers | 0 | Free plan (100k requests/day). Move to Workers Paid ($5/month) once daily active users > ~5k. Verify at developers.cloudflare.com/workers/platform/pricing. |
| MongoDB Atlas | 0 | M0 free (512 MB) at launch. Move to Flex/M10 before backups matter to > 500 paying users. Verify at mongodb.com/pricing. |
| Expo EAS | 0 | Free plan has limited cloud builds and slower queue. Upgrade if builds slow the team. Verify at expo.dev/pricing. |
| Payment processing | 0 | Store fees only (App Store / Play 15% subscriptions) — modelled in sheet 06. |
| Resend (email sign-in codes) | 0 | Free tier (3k emails/month). |
| PostHog | 0 | Free tier (generous monthly event allowance). |
| Sentry | 0 | Free developer tier. |
| Domain + email | 2 | Domain ~$12–20/year; Google Workspace or Zoho for support@ if needed. |
| Web hosting (privacy/terms/deletion pages) | 0 | Vercel or Cloudflare Pages free tier. |
| Google Play developer account | 0 | $25 one-time (client's own account). |
| Apple Developer Program | 8.25 | $99/year (client's own account). |
| AI planner (LLM API) | 150 | ≈ $0.10–0.30 per paying user per month at launch volumes — see sheet 28; set a hard monthly budget alert. |
| Cloudinary | 0 | Free plan to start; Plus (~$89/mo) once GIF bandwidth > 25 credits. Verify at cloudinary.com/pricing. |
| Total at launch | 160.25 |  |
| Support |  |  |
| Channel | Email support@buffersoltech.com (until app domain exists) + in-app 'Contact us' that pre-fills app version, device model and OS version. |  |
| Response time | < 24 h on weekdays. Reply to every store review within 24 h (templates in sheet 21). |  |
| FAQ (in-app Help screen) | How is my plan made? From your answers + our training/nutrition rules; AI picks the variety · Can I change my diet or equipment? Settings → My plan · How do I cancel? Settings → Subscription → Manage · Does it work without internet? Workouts yes; new AI plans need internet · Does it need a watch? No — phone only |  |
| Maintenance rhythm |  |  |
| •  Weekly: check Sentry, App Store Connect + Play vitals, reviews, store finance dashboards, AI cost dashboard and the Worker /admin/metrics endpoint; ship JS fixes via EAS Update. |  |  |
| •  Every 2 weeks: one store release with the most-requested improvement; update 'What's new' text. |  |  |
| •  Monthly: review KPIs (sheet 23), keyword ranks, competitor changes (re-install top 5). |  |  |
| •  Quarterly: upgrade Expo SDK (follow expo.dev changelog), re-test subscriptions and notifications, re-check Play policy updates. |  |  |
| •  Keep targetSdk current: Google Play requires new apps and updates to target a recent Android API level each year. |  |  |
