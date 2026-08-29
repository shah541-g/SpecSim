# Baseline vs Final Evaluation Report

| Scenario | Baseline score | Final coverageScore | Delta |
| --- | ---: | ---: | ---: |
| pharmacy-management-system | 67 | 72 | 5 |
| restaurant-pos | 75 | 89 | 14 |
| gym-management | 85 | 100 | 15 |
| hospital-appointment-system | 85 | 89 | 4 |
| freelance-marketplace | 45 | 33 | -12 |
| multi-branch-retail | 70 | 80 | 10 |

- Average baseline score: 71.17
- Average final coverage score: 77.17
- Baseline outputs that failed to parse as clean JSON: 0
- Final outputs with valid evaluationMode: "llm": 6

The multi-branch-retail scenario was intentionally made more challenging with overlapping operational, pricing, stock, and branch-control requirements. In the weak-transcript case, the developer asked only for a modern UI and a simple design, which is expected to cause low coverage and multiple missed requirements. The comparison shows the contrast between the deliberately shallow conversation and the fuller branch-operations conversation, which is exactly the kind of stress case we want the evaluator to separate clearly.

Weak transcript snapshot: baseline score 0, final coverageScore 0.
