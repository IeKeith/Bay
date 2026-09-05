# Chatbot catalog backend change summary

This document compares the current backend with the original tracked `backend/main.py` before this branch's changes.

## What changed

The backend changed from a small Markdown-backed concierge with randomized availability snapshots into a catalog-only restaurant chatbot.

| Area | Original `main.py` | Current backend |
| --- | --- | --- |
| Restaurant data | Parsed `satay_by_the_bay.md`; used a small built-in fallback when content was absent or incomplete | Loads and validates `backend/data/restaurant_catalog.json` as the required source of truth |
| Catalog size | Original five-stall catalog | 15 stalls and 35 dishes, with dishes nested under their stall in JSON |
| Availability | Generated a new random queue, closure state, and occasional sold-out items every two minutes | Returns stored catalog status, preparation time, queue estimate, and total estimate; requests never change this data |
| Chat context | Sent the broad knowledge-base text and all availability data to the model | Resolves the named stall, stall number, dish, or follow-up reference; sends the relevant normalized catalog facts to the model and fallback responder |
| Timing | Randomized simulated estimates | Fixed stored catalog estimates, clearly described as non-live values; show-time calculations use Singapore time |
| Ordering | The original backend did not place orders | The brief intermediate simulation/order feature has been removed; the chatbot explicitly provides information and recommendations only |
| Validation | Markdown parsing with limited malformed-line handling | JSON schema version, IDs, required fields, numeric timing and price values, tags, optional display fields, and sold-out-rule validation |

## Current data model

`backend/data/restaurant_catalog.json` uses `schemaVersion: 1` and stores each stall with its `id`, `name`, `cuisine`, `status`, `basePrepMinutes`, `baseQueueMinutes`, optional `bestFor`, and a nested `dishes` list.

Each dish has a stable `id`, `name`, numeric `price`, and `tags`. Optional `priceDisplay`, `popularity`, `imageUrl`, and `description` are supported. When they are absent, the backend derives compatible values for the existing API and chat recommendation marker.

The backend keeps the existing flattened `/api/menu` response so the current frontend can still read `stalls` and `dishes`. It also keeps `/api/stall-log`, but the endpoint now reports a read-only catalog projection rather than generated or live availability.

## Chatbot behavior

- Questions such as “What is on the menu at City Satay?”, “How much is sambal stingray?”, and “How long is the wait at stall 7?” use the matching catalog records.
- A follow-up such as “How long is the wait there?” can use the referenced stall from recent chat history. A newly named stall takes priority over history.
- Unknown explicit stall numbers are reported as absent instead of silently substituting another restaurant.
- Food recommendations still emit the existing `<!--RECOMMEND: ... -->` marker with compatible dish and stored timing fields.
- Checkout, order placement, receipt confirmation, and queue-number tracking are not backend capabilities. `POST /api/orders` has been removed.

## Removed files and behavior

- Removed both food Markdown catalog copies and the ten extra hawker Markdown files. Their restaurant data is now in `restaurant_catalog.json`.
- Removed random time-bucket availability, random closures, random sold-out behavior, and the prior fallback catalog path.
- Removed the temporary autonomous simulation, backend order endpoint, visitor order records, service-capacity fields, and simulation tests.

## Verification

The `bay-app` Conda environment ran 20 backend tests successfully:

```powershell
conda activate bay-app
python -m unittest backend.test_hawker_catalog backend.test_catalog_chat -v
```

The tests cover JSON loading and validation, duplicate IDs, invalid timing and pricing, cache invalidation after catalog changes, 15-stall/35-dish output, restaurant-specific menu and price questions, stall-number and follow-up timing questions, recommendation markers, catalog-only snapshots, removed order routes, and LLM-outage fallback responses.

## PR summary

**Title:** Replace Markdown restaurant knowledge base with validated JSON catalog

**Description:**

Replace the Markdown restaurant knowledge base and randomized availability logic with a validated JSON catalog containing 15 stalls and 35 dishes. The chatbot now resolves named stalls, stall numbers, dishes, and follow-up references against that catalog, and labels preparation and queue values as stored estimates rather than live readings.

The backend retains the menu, stall-log, and streaming chat contracts, including recommendation markers. It removes autonomous simulation and backend ordering so the chatbot provides restaurant information and recommendations only.

Validation: `python -m unittest backend.test_hawker_catalog backend.test_catalog_chat -v` (20 passing).

## PR scope

Stage only the backend catalog, backend chatbot/test changes, API specification, and this summary file for this PR. The working tree also contains unrelated frontend, generated-asset, and `README.md` changes that this backend catalog PR does not include.
