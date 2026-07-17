# Next-basket predictor research

## Decision

Use `multi-scale-recency-30` as the default repeat-purchase ranker. It is a small personalized-frequency model with three recency scales. It beat personal frequency, weekday, and cadence baselines on a final chronological holdout; more elaborate receipt-only features did not earn robust lift.

This model predicts only products already seen in the household's history. New, local, seasonal, or culturally unfamiliar products belong to a separate live-catalog exploration lane.

## Private corpus and cleaning

The research used a private local Ametller receipt corpus through 2026-07-13. No receipt, location, customer field, or product-level recommendation is committed here.

| Stage | Count |
|---|---:|
| Source ticket records | 380 |
| Source item lines | 5,012 |
| Placeholder-only tickets removed | 26 |
| Exact duplicate receipts removed | 7 |
| Non-product `Parking` lines removed | 14 |
| Purchase-day baskets after same-day merging | 265 |

The target is an exact normalized product identifier, not a broad semantic cluster. The cluster audit found unrelated products sharing some source clusters. The production pipeline applies the same principles to complete SCAPI online orders and the private Gmail ticket cache:

1. reject synthetic placeholder and observed service lines;
2. fingerprint and remove exact duplicate purchases;
3. merge valid receipts from the same calendar day into one prediction basket;
4. join an offline name to an online product id only when the normalized name has one unambiguous id;
5. exclude every current API-cart id/name before presenting suggestions;
6. resolve the historical exact pack against the live catalog by id or conservative name-and-price matching.

Offline POS receipts are Gmail-backed. They are not available from Ametller's SCAPI order history.

## Chronological evaluation

Random train/test splits were forbidden because they leak future shopping behavior. The 265 purchase days were kept in order:

- first 25%: minimum warm-up history;
- 25%-65%: candidate tuning origins;
- 65%-80%: validation and one-standard-error model selection;
- final 20%: untouched audit, reported once;
- direct horizons: the next 1, 2, 3, and 4 purchase events.

Round one evaluated 299 configurations over 33,684 rolling-origin forecasts. Only the top 24 tuning candidates entered validation. The final choice was the simplest model within one validation standard error of the best validation score. Round two then audited 384 configurations—383 genuinely new due, adaptive-recency, family, rotation, cap, and ensemble variants—under the same chronological partitions. None robustly displaced the simple exact-product model.

## Candidate hypotheses

| Candidate | Result |
|---|---|
| Personal item frequency | Strong baseline, but materially below selected recency. |
| Frequency + weekday | Small lift over frequency; not selected. |
| Recency + item cadence | Better than frequency; weaker than multi-scale recency. |
| Seasonality and momentum | No robust extra holdout lift with this corpus. |
| Similar-basket transitions | Too sparse for one household. |
| Quantity-adjusted due/depletion | Rejected: purchase quantity is not observed consumption. |
| Item-adaptive half-lives | Appeared in complex validation ensembles but lost the simplicity rule. |
| Trusted need-family boosts/caps | Improved some family diagnostics, not robust exact-SKU accuracy. |
| Protein rotation | Kept as an explicit experimental objective; improves protein-family coverage while slightly lowering exact-product metrics. |

## Selected score

For product `i` at target day `t`, every prior purchase day `p` contributes:

```text
0.5 × 2^(-age(p,t)/10)
+ 0.3 × 2^(-age(p,t)/30)
+ 0.2 × 2^(-age(p,t)/120)
```

Contributions are summed per product and normalized by the largest current product score. The result is a relative rank, not a calibrated probability. Suggested quantity is the rounded median quantity across the five most recent purchase days. Quantity does not alter ranking.

## Untouched holdout

All metrics are exact-product metrics at K=15.

| Horizon | Origins | Precision | Recall | F1 | NDCG | Repeat recall | Novel share |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 53 | 0.340 | 0.186 | 0.214 | 0.379 | 0.223 | 0.174 |
| 2 | 52 | 0.332 | 0.165 | 0.203 | 0.359 | 0.203 | 0.191 |
| 3 | 51 | 0.329 | 0.172 | 0.204 | 0.350 | 0.213 | 0.202 |
| 4 | 50 | 0.319 | 0.164 | 0.198 | 0.330 | 0.207 | 0.214 |

Horizon-1 comparison:

| Model | Precision@15 | F1@15 | NDCG@15 |
|---|---:|---:|---:|
| Personal frequency | 0.199 | 0.131 | 0.254 |
| Frequency + weekday | 0.213 | 0.139 | 0.266 |
| Recency + cadence | 0.299 | 0.188 | 0.340 |
| **Selected multi-scale recency** | **0.340** | **0.214** | **0.379** |

Against personal frequency, the selected model improved Precision@15 by about 71%, F1@15 by 64%, and NDCG@15 by 49%.

The optional protein-rotation score adds `0.2 × normalized family-rotation` to the default score. It raised protein-family recall from 0.676 to 0.741, but Precision@15 fell from 0.340 to 0.338 and NDCG@15 from 0.379 to 0.373. It is therefore never the default.

## Limitations

- This is one household and 265 purchase days, not a population recommender.
- Purchases do not reveal consumption, waste, guests, freezer stock, recipes, or remaining pantry quantities.
- Exact-SKU metrics penalize sensible pack substitutions, but broad clusters were too unsafe to use as targets.
- Receipt-only prediction cannot rank genuinely unseen products; discovery requires current catalog/content evidence.
- Historical demand is not proof of current availability. Unresolved or price-incompatible catalog matches remain unselectable.
- Metrics will drift as behavior changes. Re-run chronological evaluation before changing the model, not after looking at the new holdout.

## Primary references

- Hu et al., [Modeling Personalized Item Frequency Information for Next-basket Recommendation (TIFU-KNN)](https://arxiv.org/abs/2006.00556).
- Li et al., [A Next Basket Recommendation Reality Check](https://arxiv.org/abs/2109.14233), especially the repeat/explore distinction.
- Shao et al., [A Systematical Evaluation for Next-Basket Recommendation Algorithms](https://arxiv.org/abs/2209.02892).
- Hyndman and Athanasopoulos, [Time series cross-validation and rolling forecasting origins](https://otexts.com/fpp3/tscv.html).

