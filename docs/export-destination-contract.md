# Export destination (legacy — not used in product flow)

**Status:** Deferred / not part of the HTVeriDoc SaaS path.

HTVeriDoc’s job is **PDF parsing + review + status handoff**.  
Approve does **not** call TotalCtrl `POST /orders/store-orders`.

## Active contract (use this)

→ **[`docs/handoff-webhooks-editor.md`](./handoff-webhooks-editor.md)**

```text
Upload → Extract → Review → Approve
                              ↓
                     Webhook event + extraction payload
                     (+ optional editor link)
```

Other projects receive the webhook and handle their own next steps.

## What this folder used to describe

Earlier experiments mapped Live export to TotalCtrl store-orders / partner schedule. That path remains in code under `apps/api/src/integrations/export/` for reference only and is **not** triggered on Approve.

Do not use Matching / store-orders / EXPORTED flow as the product requirement.
