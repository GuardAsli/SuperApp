# GuardAsli — Payments

**Product:** GuardAsli · **Developer:** AsliCode · **Release:** is0.1.0

## Methods (exactly four)

1. `admin_manual` — Admin/Super Admin credit → Ledger `admin_credit`
2. `card_to_card` — receipt → `pending_review` → approve/reject/fraud
3. `cubepay` — official API at `https://cubevps.ir/smspay`
4. `tetraminator` — `https://api.tetraminator.com/v1`

Super Admin toggles each method via `paymentMethods.globallyEnabled`. Disabled methods are rejected in backend mutations/actions.

## Rule

**A webhook alone never credits the Wallet.**

Flow: Webhook → `jobs.payment_verify` → `verifyProviderPaymentAction` (inquiry/verify) → `acceptProviderPayment` → Ledger credit once (`idempotencyKey: provider_accept:{paymentId}`).

## CubePay

- Create: `POST /api/v1/create-payment.php` + `Authorization: Bearer`
- Verify: `POST /api/v1/verify-payment.php`
- Callback: GET/POST `/api/v1/payments/cubepay/callback?order_id=`

## Tetraminator

- Create: `POST /invoice/create` + `X-API-KEY`
- Inquiry: `GET /payment/inquiry/{pay_id}`
- Accept only if `status==true`, `payment_status=="paid"`, id+amount match
- Webhook: GET/POST `/api/v1/payments/tetraminator/webhook?order_id=`
- Amount limits: 50_000 – 10_000_000 Toman

## User provider secrets

Stored in `userPaymentConfigs` as AES-256-GCM envelopes. Never returned in queries. Owner-only access.
