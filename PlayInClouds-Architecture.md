# Reservation Payment Flow

```text
┌───────────────┐
│     Guest     │
└──────┬────────┘
       │
       │ 1. Book + pay
       v
┌──────────────────────┐
│   Stripe Checkout    │
└──────┬───────────────┘
       │
       │ 2. Charge created on
       │    PlayInClouds platform
       v
┌──────────────────────────────┐
│ PlayInClouds Stripe Platform Bal │
└──────────────┬───────────────┘
               │
               │ 3. Payment captured
               v
┌──────────────────────────────────────────┐
│ reservation_guest_payments               │
│------------------------------------------│
│ reservation_id                           │
│ stripe_charge_id                         │
│ amount_total                             │
│ amount_platform_fee                      │
│ status = PAID                            │
└──────────────┬───────────────────────────┘
               │
               │ 4. Create linked host row
               v
┌──────────────────────────────────────────┐
│ reservation_host_transfers               │
│------------------------------------------│
│ guest_payment_id                         │
│ reservation_id                           │
│ host_user_id                             │
│ host_stripe_account_id                   │
│ amount                                   │
│ status = NOT_READY or READY              │
└──────────────┬───────────────────────────┘
               │
               │ 5. Check host eligibility
               │
               │ canReceiveHostFunds =
               │ transfers active
               │ AND payouts_enabled
               v
        ┌─────────────── Decision ───────────────┐
        │                                         │
        │ Host eligible now?                      │
        │                                         │
        └───────────────┬───────────────┬────────┘
                        │               │
                      Yes               No
                        │               │
                        │               │
                        v               v
        ┌────────────────────────┐   ┌────────────────────────┐
        │ Create Stripe transfer │   │ Keep funds on platform │
        │ destination = acct_... │   │ status = NOT_READY     │
        │ source_transaction=ch_ │   │                        │
        └─────────────┬──────────┘   └─────────────┬──────────┘
                      │                            │
                      │ 6A. Save success           │ 6B. Wait for onboarding
                      v                            v
        ┌──────────────────────────────┐   ┌──────────────────────────────┐
        │ reservation_host_transfers   │   │ Stripe account onboarding    │
        │ status = TRANSFERRED         │   │ not complete yet             │
        │ stripe_transfer_id = tr_...  │   └─────────────┬────────────────┘
        │ transferred_at = now()       │                 │
        └─────────────┬────────────────┘                 │
                      │                                  │
                      │                                  │ 7. Host finishes onboarding
                      │                                  v
                      │                    ┌──────────────────────────────┐
                      │                    │ Stripe account.updated       │
                      │                    │ webhook to PlayInClouds          │
                      │                    └─────────────┬────────────────┘
                      │                                  │
                      │                                  │ 8. Re-check host eligibility
                      │                                  v
                      │                    ┌──────────────────────────────┐
                      │                    │ Find pending                 │
                      │                    │ reservation_host_transfers   │
                      │                    │ status IN (NOT_READY,FAILED) │
                      │                    └─────────────┬────────────────┘
                      │                                  │
                      │                                  │ 9. Create transfer(s)
                      │                                  v
                      │                    ┌──────────────────────────────┐
                      │                    │ reservation_host_transfers   │
                      │                    │ status = TRANSFERRED         │
                      │                    │ stripe_transfer_id = tr_...  │
                      │                    └─────────────┬────────────────┘
                      │                                  │
                      └──────────────────────┬───────────┘
                                             │
                                             │ 10. Funds now sit in host's
                                             │     connected account balance
                                             v
                               ┌──────────────────────────────┐
                               │ Host Stripe Connected Accnt  │
                               └─────────────┬────────────────┘
                                             │
                                             │ 11. Stripe automatic payout
                                             v
                               ┌──────────────────────────────┐
                               │       Host Bank Account      │
                               └──────────────────────────────┘


Fallback path:
Hourly cron
-> scan reservation_host_transfers with status IN (NOT_READY, FAILED)
-> re-check eligibility
-> release missed transfers
```

PlayInClouds collects reservation payments on the platform Stripe account first. Once a guest payment is captured, the guest-side payment record is stored in `reservation_guest_payments`, and a linked host-side obligation is stored in `reservation_host_transfers`.

If the host's connected Stripe account is already eligible to receive funds, PlayInClouds creates a transfer from the platform to the connected account immediately. If the host is not yet eligible, the funds remain on the platform and the host transfer row stays in a pending state until onboarding is completed.

When the host later completes onboarding, Stripe sends an `account.updated` webhook to PlayInClouds. PlayInClouds re-checks eligibility, releases any pending host transfers for that account, and Stripe then handles payout from the connected account balance to the host's bank account. An hourly cron job acts as a fallback in case webhook delivery is missed or delayed.
