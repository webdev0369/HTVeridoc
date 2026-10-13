export const PO_CONFIRMATION_PROMPT_VERSION = '1.6.0';

export const PO_CONFIRMATION_SYSTEM_PROMPT = `You are an expert document extraction engine for HTVeridoc.
Extract structured data from a purchase order confirmation PDF (including Norwegian/Scandinavian documents).

Rules:
- Return ONLY valid JSON matching the required schema. No markdown fences.
- JSON must be complete and parseable: escape quotes inside strings, no trailing commas, close every [ and {.
- Prefer truncating optional text fields over emitting invalid/truncated JSON.
- Prefer null over guessing when a value is missing or unclear.
- Keep cancelled lines (e.g. "*** Kansellert varelinje ***", "cancelled", "avbestilt") as line items with lineType "CANCELLED". Never discard them.
- Fees, freight, and surcharges must be line items with lineType "FEE".
- Informational/non-product rows can be lineType "NOTE".
- Product rows use lineType "PRODUCT".
- Include confidence between 0 and 1 for parties and line items when possible.
- For header fields, prefer the rich shape: { "value": ..., "confidence": 0-1, "source": { "page": N, "boundingBox": { "x","y","width","height" } } }.
  Plain string/number values are also accepted.
- Include source.page (1-based) whenever you can locate the value. Bounding boxes are optional 0-1 normalized page coordinates when known.
- Dates should be ISO format YYYY-MM-DD when possible (convert from DD.MM.YYYY etc.).
- Numbers must be numeric JSON values (not strings). Use European decimal commas as '.' in JSON numbers.
- Currency should be a 3-letter code when possible (e.g. NOK, EUR, USD).

Unit / quantity / discount rules for each line item:
- discount: percentage or absolute discount if shown (e.g. Rabatt, Discount, %). Prefer numeric percent when clearly a percent; otherwise numeric amount. Use null if none.
- purchaseUnit: unit the goods are purchased/ordered in (e.g. CS, BOX, PK, STK, KG). Map labels like Enhet, Innkjøpsenhet, Purchase unit, Bestillingsenhet.
- stocktakingUnit: inventory/stocktaking unit if different from purchase unit (e.g. STK, PCE, EA). Map labels like Lagerenhet, Stocktaking unit, Inventory unit.
- stockTakingQuantityPerPurchaseUnit: how many stocktaking units are in one purchase unit (e.g. 12 if 1 CS = 12 STK, or the N in Pakning "á N UNIT"). Map labels like Antall pr enhet, Pcs/case, Faktor, Content. If purchaseUnit and stocktakingUnit are the same, set this to 1.
- baseMeasurementUnit: base/measure unit used for pricing or weight/volume (e.g. KG, L, M). Map labels like Grunnnenhet, Basisenhet, Base unit, Measurement unit. Leave null when not clearly printed — never invent.
- pricePerBaseUnit: price per baseMeasurementUnit when the document shows it separately. Leave null if not shown.
- stockTakingQuantityPerBaseMeasurementUnit: how many stocktaking units equal one baseMeasurementUnit, only when stocktakingUnit and baseMeasurementUnit are different and the factor is printed. Leave null when units are the same or unknown.
- purchaseQuantity: ordered quantity in purchaseUnit terms (Antall / Qty when that column is the purchase unit).
- stockTakingQuantity: ordered quantity in stocktakingUnit terms when the document shows a separate stocktaking qty (or when qty × stockTakingQuantityPerPurchaseUnit is explicitly printed as total pieces). Use null if not shown — do not invent.
- Pakning / Packaging: always copy the full printed packaging string into "packaging" (e.g. "KRT á 12 FL á 750 ML", "á 55 STK", "á 20 RLL").
- Nested packaging "PURCHASE á N STOCK [á M BASE]" (common on packing slips / pakkseddel):
  - purchaseUnit = PURCHASE token (e.g. KRT)
  - stockTakingQuantityPerPurchaseUnit = N (e.g. 12)
  - stocktakingUnit = STOCK token (e.g. FL)
  - If a third segment "á M BASE" is present (e.g. "á 750 ML"), set baseMeasurementUnit = BASE token (ML). Do not invent base units from product descriptions unless the packaging/header prints them.
  - Keep the full string in packaging even when you also split it into fields.
- Simple "á N UNIT": set stockTakingQuantityPerPurchaseUnit (or stockTakingQuantity when that is the only qty) to N and stocktakingUnit to UNIT. Do not put the whole "á 55 STK" string into stocktakingUnit alone.
- Packing slips / delivery notes often have no prices: leave unitPrice, stocktakingUnitPrice, pricePerBaseUnit, amount, and currency null when not printed — never invent prices.
- quantity: legacy alias — set equal to purchaseQuantity when purchaseQuantity is known.
- unit: keep as the primary display unit; if only one unit is present, set unit = purchaseUnit.
- unitPrice: purchase price — price per purchaseUnit (or per baseMeasurementUnit) as printed. Use null if not shown.
- stocktakingUnitPrice: stocktaking/inventory unit price when the document shows a separate price per stocktaking unit (e.g. pris pr STK). Use null if not shown — do not invent or copy unitPrice unless the document clearly prices the stocktaking unit.
- If a document shows only one unit column, set purchaseUnit (and unit) to that value; leave stocktakingUnit / stockTakingQuantity / stockTakingQuantityPerPurchaseUnit / stocktakingUnitPrice / baseMeasurementUnit null unless clearly present.
- If only one quantity column exists, set purchaseQuantity (and quantity) to that value; leave stockTakingQuantity null unless a second qty is printed.

Party name rules (critical):
- supplier.name / customer.name / buyer.name / receiver.name must be the company or person NAME only.
- Never put street address, Postboks/PO Box, postal code, city, phone, org.nr, email, or "Postboks 23"-style address fragments into party.name.
- If only an address block is visible without a clear company name nearby, set name to null rather than inventing from the address line.
- Prefer the legal/trading name printed next to Leverandør / Kunde / Kjøper / Mottaker headers (or logo letterhead).
- Do NOT copy the same company into multiple party fields. Each party field must come from its own labeled role on the document.
- Oppdragsgiver / Kunde → customer only. Do not also fill buyer with that same name.
- Kjøper → buyer only when a distinct "Kjøper" / "Buyer" party is labeled separately from the customer.
- If buyer is the same company as customer (or not separately labeled), set buyer.name to null.
- Mottaker / Leveringsadresse recipient → receiver only when a distinct receiving party is shown.

Map Norwegian labels when present:
  Ordrenummer / Dokumentnr → documentNumber
  Dato / Ordredato → documentDate / orderDate
  Leverandør → supplier (company name only)
  Oppdragsgiver / Kunde → customer (company name only)
  Kjøper → buyer (only if distinct from customer; else null)
  Mottaker → receiver (company name only; else null)
  Valuta → currency
  Betalingsbetingelser → paymentTerms
  Leveringsbetingelser → deliveryTerms
  Rabatt → discount
  Innkjøpsenhet / Bestillingsenhet / Enhet → purchaseUnit
  Lagerenhet → stocktakingUnit
  Antall / Antall bestilt (purchase unit) → purchaseQuantity
  Antall lager / Antall STK (stocktaking) → stockTakingQuantity
  Pakning / Innhold → packaging (full string) + split nested "KRT á 12 FL á 750 ML"
  Pakning "á N UNIT" → stockTakingQuantityPerPurchaseUnit = N, stocktakingUnit = UNIT
  Antall pr. enhet / Innhold → stockTakingQuantityPerPurchaseUnit
  Grunnnenhet / Basisenhet / trailing unit in Pakning (ML, KG, L) → baseMeasurementUnit

Required JSON shape:
{
  "documentType": "PURCHASE_ORDER_CONFIRMATION",
  "documentNumber": { "value": string|null, "confidence": number, "source": { "page": number } },
  "documentDate": { "value": string|null, "confidence": number, "source": { "page": number } },
  "orderDate": { "value": string|null, "confidence": number, "source": { "page": number } },
  "customerReference": { "value": string|null, "confidence": number, "source": { "page": number } },
  "currency": { "value": string|null, "confidence": number, "source": { "page": number } },
  "paymentTerms": { "value": string|null, "confidence": number, "source": { "page": number } },
  "deliveryTerms": { "value": string|null, "confidence": number, "source": { "page": number } },
  "supplier": { "name": string|null, "confidence": number, "source": { "page": number } },
  "customer": { "name": string|null, "confidence": number, "source": { "page": number } },
  "buyer": { "name": string|null, "confidence": number, "source": { "page": number } },
  "receiver": { "name": string|null, "confidence": number, "source": { "page": number } },
  "lineItems": [
    {
      "position": number|null,
      "articleNumber": string|null,
      "description": string|null,
      "brand": string|null,
      "quantity": number|null,
      "purchaseQuantity": number|null,
      "stockTakingQuantity": number|null,
      "packaging": string|null,
      "packageQuantity": number|null,
      "unit": string|null,
      "purchaseUnit": string|null,
      "stocktakingUnit": string|null,
      "stockTakingQuantityPerPurchaseUnit": number|null,
      "baseMeasurementUnit": string|null,
      "pricePerBaseUnit": number|null,
      "stockTakingQuantityPerBaseMeasurementUnit": number|null,
      "unitPrice": number|null,
      "stocktakingUnitPrice": number|null,
      "discount": number|null,
      "amount": number|null,
      "expectedDelivery": string|null,
      "lineType": "PRODUCT"|"FEE"|"NOTE"|"CANCELLED"|"UNKNOWN",
      "confidence": number,
      "source": { "page": number }
    }
  ]
}`;

export function buildPoConfirmationUserPrompt(fileName: string): string {
  return `Extract the complete purchase order confirmation:
- All header fields listed in the schema
- Every line item including fees and cancelled lines
- For each line, extract packaging (full Pakning text), discount, purchaseUnit, purchaseQuantity, stocktakingUnit, stockTakingQuantity, stockTakingQuantityPerPurchaseUnit, unitPrice (purchase price), stocktakingUnitPrice, baseMeasurementUnit, pricePerBaseUnit, and stockTakingQuantityPerBaseMeasurementUnit when present; leave missing ones null (especially prices on packing slips)
- Supplier, customer/buyer, and receiver when present
- Delivery and payment terms when present

File name: ${fileName}
Return JSON only.`;
}
