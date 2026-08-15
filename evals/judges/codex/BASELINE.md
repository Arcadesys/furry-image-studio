# Codex Judge Baseline

## 2026-07-29: Grey Mouse Calibration

**Done metric:** Compare a blinded Codex judge with at least four completed
human reviews while leaving the holdout partition unseen.

**Budget:** One four-case calibration attempt. No holdout cases.

**Judge:**

- Model: `gpt-5.4`
- Codex CLI: `0.146.0`
- Guidance SHA-256:
  `188f9b961f6e2ff4c8ec7d6fcdcec56f5dea0ffc287162a46872f1cf6cd73a8a`
- Calibration bundle manifest SHA-256:
  `a483ea5eee2580b32965b45e40a3bc46b76fb3a508d9289ccceefb983bddf8ab`
- Cases: 4 calibration, 2 holdout
- Live judge calls: 4 succeeded, 0 failed

**Verdict:** `needs-calibration`

| Metric | Result | Gate |
| --- | ---: | ---: |
| Observable criterion coverage | 80.0% | 75.0% minimum |
| Mean absolute score error | 0.688 | 0.750 maximum |
| Scores within one point | 87.5% | 90.0% minimum |
| Criterion pass/fail agreement | 81.3% | 85.0% minimum |
| Whole-case pass agreement | 50.0% | 75.0% minimum |
| Manual pin location recall | 50.0% | 70.0% minimum |
| Pin category agreement | 0.0% | 60.0% minimum |

The judge passed coverage and mean-error gates. It failed within-one,
pass/fail, whole-case, pin-location, and pin-category gates.

Paws/anatomy was not observable in these head-and-shoulders cases, which
validates the need for the newer full-body anatomy traces. The judge sometimes
found the same visible region as a human pin but assigned a different rubric
category. Future calibration should distinguish scoring disagreement from
annotation-taxonomy disagreement.

**Current best:** This attempt is the first measured baseline. The two holdout
cases remain unjudged.
