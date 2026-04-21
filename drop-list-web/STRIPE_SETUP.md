# Stripe Dashboard Setup — DropList

Complete reference for everything you need to configure in the Stripe Dashboard before taking real payments.

---

## 1. Account mode

Stripe has two separate environments: **Test mode** and **Live mode**.  
Everything below must be done in **both** modes (once for testing, once for real payments).  
Keys and IDs from one mode do **not** work in the other.

---

## 2. Create a Product and Price

This becomes `STRIPE_PRICE_ID` in your env.

1. Go to **Product catalog** → **Add product**.
2. Fill in:
   - **Name:** `DropList Pro` (shown on Stripe invoices and receipts)
   - **Description:** optional
3. Under **Pricing**, add a price:
   - **Model:** Recurring
   - **Billing period:** Monthly
   - **Price:** $2.99 USD (or your currency)
4. Save the product.
5. Copy the **Price ID** (starts with `price_`).

Set in Vercel / `.env.local`:
```
STRIPE_PRICE_ID=price_xxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 3. API Keys

1. Go to **Developers** → **API keys**.
2. Copy:
   - **Publishable key** (`pk_test_...` / `pk_live_...`)
   - **Secret key** (`sk_test_...` / `sk_live_...`)

Set in Vercel / `.env.local`:
```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
```

> Never commit secret keys. Use Vercel environment variables for production.

---

## 4. Webhook Endpoint

The webhook is how Stripe tells your app about payment events (subscription paid, failed, cancelled, etc).

### Create the endpoint

1. Go to **Developers** → **Webhooks** → **Add endpoint**.
2. **Endpoint URL:**
   ```
   https://your-production-domain.com/api/stripe/webhook
   ```
3. **Events to listen for** — select all of the following:

   | Event | Why |
   |-------|-----|
   | `checkout.session.completed` | User finishes Checkout → set plan to Pro |
   | `invoice.paid` | Payment collected (initial or retry) → restore/confirm Pro |
   | `invoice.payment_failed` | Charge failed → check sub status, may set Free |
   | `customer.subscription.deleted` | Subscription fully ended → set Free |

4. Click **Add endpoint**.
5. After creation, reveal and copy the **Signing secret** (`whsec_...`).

Set in Vercel / `.env.local`:
```
STRIPE_WEBHOOK_SECRET=whsec_...
```

> The signing secret is **per endpoint**. Test and production webhooks have different secrets.

### For local development

Use the Stripe CLI to forward events to localhost:
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```
The CLI prints a temporary `whsec_...` secret — set that as `STRIPE_WEBHOOK_SECRET` in `.env.local` while developing.

---

## 5. Customer Portal

The Customer Portal is the Stripe-hosted page where users manage their subscription (cancel, update payment method, view invoices). Your app opens it via **Manage subscription** → **"Manage billing"** button.

### Enable and configure

1. Go to **Settings** → **Billing** → **Customer portal**.
2. Turn on the portal.
3. Under **Functionality**, enable at minimum:
   - **Cancel subscriptions** — so users can cancel
   - **Update payment methods** — so users can fix failed payments
   - Invoice history (optional but recommended)
4. Under **Business information**, set your business name and support email.
5. Under **Default return URL**, set:
   ```
   https://your-production-domain.com/app
   ```
   (Your app overrides this per-session via `return_url` in code, but this is the fallback.)
6. Save.

> You must configure the portal **separately in test and live mode**.

---

## 6. Branding (optional but recommended)

1. Go to **Settings** → **Branding**.
2. Upload your logo and set brand colors.
3. This affects how the Stripe Checkout page and Customer Portal look to users.

---

## 7. Email / Receipt settings

1. Go to **Settings** → **Emails**.
2. Enable **Successful payments** and **Failed payments** — Stripe sends receipts automatically.
3. Set your **Support email** (shown on receipts). Use `droplist.app@gmail.com`.

---

## 8. Summary: environment variables needed

| Variable | Where to find it |
|----------|-----------------|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Developers → API keys → Publishable key |
| `STRIPE_SECRET_KEY` | Developers → API keys → Secret key |
| `STRIPE_PRICE_ID` | Product catalog → your product → Pricing → Price ID |
| `STRIPE_WEBHOOK_SECRET` | Developers → Webhooks → your endpoint → Signing secret |

---

## 9. Test → Live checklist

Before switching from test to live mode:

- [ ] Swap all four env vars above to **live mode** values in Vercel Production
- [ ] Create a separate webhook endpoint for the live domain in **live mode** with its own signing secret
- [ ] Verify the **Customer Portal** is configured in **live mode**
- [ ] Set `BYPASS_STRIPE` to **unset or `false`** on the Production Vercel environment
- [ ] Do a real end-to-end test: subscribe with a real card, check Supabase `users.plan`, cancel via portal, confirm `customer.subscription.deleted` fires

---

## 10. Webhook events: what each one does in DropList

| Stripe event | DropList action |
|---|---|
| `checkout.session.completed` | `plan = pro`, `stripe_subscription_id` saved |
| `invoice.paid` | `plan = pro` restored (handles successful retries and renewals) |
| `invoice.payment_failed` | If sub is `canceled` or `unpaid` → `plan = free`; if `past_due` → keep Pro (Stripe still retrying) |
| `customer.subscription.deleted` | `plan = free`, `stripe_subscription_id` cleared |
