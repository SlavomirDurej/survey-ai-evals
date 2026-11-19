"""Cross-checks src/metrics/multilabel.ts against scikit-learn on a scored run.

Reads <run>/joined.json (written by score-run) and <run>/scores.json, recomputes the category-level metrics
with scikit-learn on a 50-column indicator matrix, and fails if any value differs by more than 1e-3
(scores.json is rounded to 3 decimals).

Usage: python tools/crosscheck_sklearn.py <DATA_DIR>/runs/<run>
Needs: pip install scikit-learn
"""
import json
import sys
from pathlib import Path

from sklearn.metrics import accuracy_score, hamming_loss, jaccard_score, precision_recall_fscore_support
from sklearn.preprocessing import MultiLabelBinarizer

run = Path(sys.argv[1])
joined = json.loads((run / "joined.json").read_text(encoding="utf-8"))
ours = json.loads((run / "scores.json").read_text(encoding="utf-8"))["category"]

mlb = MultiLabelBinarizer(classes=list(range(1, 51)))
y_true = mlb.fit_transform([j["human_categories"] for j in joined])
y_pred = mlb.transform([j["ai_categories"] for j in joined])

theirs = {}
for avg in ("micro", "macro"):
    p, r, f, _ = precision_recall_fscore_support(y_true, y_pred, average=avg, zero_division=0)
    theirs[avg] = {"precision": p, "recall": r, "f1": f}
theirs["exactMatch"] = accuracy_score(y_true, y_pred)  # subset accuracy
theirs["jaccard"] = jaccard_score(y_true, y_pred, average="samples", zero_division=1)
theirs["hammingLoss"] = hamming_loss(y_true, y_pred)

bad = 0
for key, val in theirs.items():
    pairs = [(f"{key}.{k}", v, ours[key][k]) for k, v in val.items()] if isinstance(val, dict) else [(key, val, ours[key])]
    for name, sk, mine in pairs:
        ok = abs(sk - mine) <= 1e-3
        bad += not ok
        print(f"{'ok  ' if ok else 'DIFF'} {name:<18} sklearn {sk:.4f}  ours {mine:.4f}")
print(f"{len(joined)} items, {'all match' if not bad else f'{bad} differences'}")
sys.exit(1 if bad else 0)
