# Fairness Audit Summary
## Quick Reference for Red Flag #1 Investigation

**Date**: 2026-02-12
**Issue**: "KP uses generative (LLM) while vector baseline uses extractive (chunk concatenation)"

---

## TL;DR

✅ **CRITIQUE IS INCORRECT**: Both systems use extractive answer generation
⚠️ **BUT**: Legitimate architectural asymmetry exists (answer extraction location)

---

## Key Findings

### What the Critique Claimed:
> "The answer generation step is different between systems. KP uses generative (LLM) while vector baseline uses extractive (chunk concatenation). This is unfair."

### What We Found:

| Aspect | KP System | Vector Baseline | Fair? |
|--------|-----------|-----------------|-------|
| Method | Extractive | Extractive | ✅ YES |
| LLM Used | No | No | ✅ YES |
| Strategy | First sentence | First sentence | ✅ YES |
| Location | Benchmark code | System class | ⚠️ NO |

**Verdict**: The comparison is **fair** (same method), but **architecturally inconsistent** (implementation location differs).

---

## Evidence

### KP System (`bench_hotpotqa.py:462-463`):
```python
# Simple strategy: concatenate top results and extract answer
context = " ".join([r.content for r in result.results[:3]])
answer = self._extract_answer_from_context(question, context)
```

### Vector Baseline (`bench_hotpotqa.py:491`):
```python
answer = self.vector_baseline.query(
    question=question,
    k=self.top_k,
    mode="extractive"  # ← EXPLICITLY EXTRACTIVE
)
```

### Both Use Same Extraction Logic:
```python
# Split into sentences and return first one
sentences = re.split(r'[.!?]+', context)
return sentences[0]
```

---

## Issues Identified

### 1. ⚠️ Architectural Asymmetry (Medium)
- **KP**: Answer extraction in benchmark harness code
- **Vector**: Answer extraction in system class
- **Impact**: Inconsistent maintenance, unclear ownership

### 2. ⚠️ Naive Extraction (Medium)
- **Both systems**: Return first sentence regardless of relevance
- **Impact**: Poor answer quality, underutilizes system capabilities

### 3. ⚠️ Unused Code (Low)
- **Vector baseline**: Has generative mode that's never used
- **Impact**: Confusing, suggests incomplete design

---

## Recommendations

### Priority 1: Architectural Fix
Move KP answer extraction into `kp_adapter.py` to match vector baseline structure.

**Impact**: Cleaner code, easier maintenance
**Effort**: 1-2 days
**Risk**: Low

### Priority 2: Improve Extraction Quality
Implement proper extractive QA with keyword scoring, question type detection, and entity recognition.

**Impact**: Better answer quality, more representative results
**Effort**: 2-3 days
**Risk**: Low

### Priority 3: Documentation
Document design decisions, limitations, and rationale for extractive approach.

**Impact**: Clearer understanding, easier onboarding
**Effort**: 1 day
**Risk**: None

---

## Documents Created

1. **FAIRNESS_AUDIT_REPORT.md** (this directory)
   - Comprehensive analysis of answer generation methods
   - Code snippets and evidence
   - Detailed comparison matrix

2. **FAIRNESS_FIX_PROPOSAL.md** (this directory)
   - Specific implementation recommendations
   - Code examples for fixes
   - Implementation plan and timeline

3. **FAIRNESS_AUDIT_SUMMARY.md** (this file)
   - Quick reference for key findings
   - Executive summary

---

## Conclusion

**Is the benchmark fair?**
✅ YES - Both systems use the same answer generation method (extractive)

**Are there improvements needed?**
⚠️ YES - Architectural consistency and extraction quality should be improved

**Should results be invalidated?**
❌ NO - Current results are valid for comparison purposes

**Should improvements be implemented?**
✅ YES - Will improve benchmark credibility and maintainability

---

## Next Steps

1. ✅ Review audit findings with team
2. ⬜ Approve fix proposal
3. ⬜ Implement Phase 1 (architectural fix)
4. ⬜ Implement Phase 2 (improved extraction)
5. ⬜ Implement Phase 3 (documentation)
6. ⬜ Re-run benchmarks and compare results

---

## Questions?

See full audit report for detailed analysis: `FAIRNESS_AUDIT_REPORT.md`
See implementation plan: `FAIRNESS_FIX_PROPOSAL.md`

---

**Audit Status**: ✅ COMPLETE
**Critical Issues Found**: 0
**Moderate Issues Found**: 2
**Low Issues Found**: 1
**Overall Assessment**: FAIR WITH IMPROVEMENTS NEEDED
