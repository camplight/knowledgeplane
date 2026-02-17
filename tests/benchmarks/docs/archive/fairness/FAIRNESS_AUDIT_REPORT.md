# Fairness Audit Report: Answer Generation Comparison
## KnowledgePlane vs Vector Baseline

**Date**: 2026-02-12
**Auditor**: Code Quality Analyzer
**Issue**: Red Flag #1 - Answer generation method fairness

---

## Executive Summary

**Finding**: The critique claiming unfair answer generation methods is **PARTIALLY INCORRECT** but reveals a **real architectural asymmetry** in the benchmark design.

- ✅ **Both systems use extractive answer generation** (same method)
- ⚠️ **Architectural asymmetry exists**: KP answer extraction implemented in benchmark code, vector baseline answer extraction built into the system
- ⚠️ **Simplistic extraction**: Both systems use naive "first sentence" extraction, which may not fairly evaluate either system's true capabilities

**Risk Level**: MEDIUM
**Impact on Results**: MODERATE - Results are fair in comparison, but both systems are underutilized

---

## Detailed Analysis

### 1. KP System Answer Generation

**Location**: `bench_hotpotqa.py`, lines 434-471

```python
def query_kp_system(
    self,
    question: str,
    namespace: str
) -> Tuple[Optional[str], float]:
    """Query KP system and extract answer."""
    try:
        start_time = time.time()
        result = self.kp_adapter.query(
            question=question,
            namespace=namespace,
            k=self.top_k,
            search_mode="hybrid"
        )
        latency_ms = (time.time() - start_time) * 1000

        # Extract answer from results
        if result.results:
            # Simple strategy: concatenate top results and extract answer
            context = " ".join([r.content for r in result.results[:3]])
            answer = self._extract_answer_from_context(question, context)
        else:
            answer = "No answer found"

        return answer, latency_ms
```

**Answer Extraction Method** (lines 501-528):
```python
def _extract_answer_from_context(
    self,
    question: str,
    context: str
) -> str:
    """
    Extract answer from context using simple heuristics.

    This is a simplified extraction. In production, you might use
    a QA model or more sophisticated methods.
    """
    # Split into sentences
    sentences = re.split(r'[.!?]+', context)
    sentences = [s.strip() for s in sentences if s.strip()]

    if not sentences:
        return "No answer found"

    # Simple heuristic: return first sentence (often contains answer)
    # In a real system, you'd use NER, keyword matching, or a QA model
    return sentences[0]
```

**Method**: Extractive (sentence splitting + first sentence selection)
**LLM Used**: No
**Location of Logic**: In benchmark harness code

---

### 2. Vector Baseline Answer Generation

**Location**: `vector_baseline.py`, lines 172-217

```python
def query(
    self,
    question: str,
    k: int = 5,
    mode: str = "extractive"
) -> str:
    """
    Query the vector baseline and generate an answer.

    Args:
        mode: Answer generation mode:
              - "extractive": Extract best sentence from top chunk (default, no API cost)
              - "generative": Use LLM to synthesize answer (requires API key)
    """
    # ... retrieval logic ...

    # Step 3: Generate answer based on mode
    if mode == "extractive":
        return self._generate_answer_extractive(question, retrieved)
    else:  # generative
        return self._generate_answer_generative(question, retrieved)
```

**Answer Extraction Method** (lines 439-471):
```python
def _generate_answer_extractive(
    self,
    question: str,
    retrieved: List[RetrievalResult]
) -> str:
    """
    Generate answer extractively from retrieved chunks.

    Strategy: Return the highest-scoring sentence from the top chunk.
    This is simple, deterministic, and has no API cost.
    """
    if not retrieved:
        return "No relevant information found."

    # Get the top-scoring chunk
    top_chunk = retrieved[0].chunk

    # Split chunk into sentences
    sentences = self._split_into_sentences(top_chunk.text)

    if not sentences:
        return top_chunk.text  # Fallback to full chunk

    # Simple heuristic: return first sentence (often contains key info)
    return sentences[0]
```

**Benchmark Usage** (`bench_hotpotqa.py`, line 491):
```python
answer = self.vector_baseline.query(
    question=question,
    k=self.top_k,
    mode="extractive"  # ← EXPLICITLY EXTRACTIVE
)
```

**Method**: Extractive (sentence splitting + first sentence selection)
**LLM Used**: No
**Location of Logic**: Built into vector baseline class

---

### 3. Comparison Matrix

| Aspect | KP System | Vector Baseline | Fair? |
|--------|-----------|-----------------|-------|
| **Answer Generation Type** | Extractive | Extractive | ✅ YES |
| **Uses LLM** | No | No | ✅ YES |
| **Extraction Strategy** | First sentence | First sentence | ✅ YES |
| **Sentence Splitting** | `re.split(r'[.!?]+', ...)` | `re.split(sentence_endings, ...)` | ✅ YES |
| **Logic Location** | Benchmark harness | System itself | ⚠️ ASYMMETRIC |
| **Sophistication** | Naive | Naive | ✅ YES |
| **Has Generative Option** | No | Yes (unused) | ⚠️ ASYMMETRIC |

---

## Identified Issues

### Issue 1: Architectural Asymmetry ⚠️
**Severity**: Medium
**Description**: KP's answer extraction is implemented in the benchmark code (`bench_hotpotqa.py`), while vector baseline's is built into its class (`vector_baseline.py`).

**Why This Matters**:
- Makes KP system appear less capable than it might be
- Violates separation of concerns
- Makes it harder to improve KP's answer generation independently
- Creates maintenance complexity

**Code Evidence**:
- KP: `bench_hotpotqa.py:462-463` - "Simple strategy: concatenate top results"
- Vector: `vector_baseline.py:439-471` - Built-in method with mode selection

### Issue 2: Naive Extraction Strategy ⚠️
**Severity**: Medium
**Description**: Both systems use overly simplistic "first sentence" extraction that doesn't leverage their respective strengths.

**Why This Matters**:
- KP's graph traversal and multi-hop capabilities are not utilized for answer synthesis
- Vector baseline's ranking quality is not reflected (just takes first sentence regardless of score)
- Both systems could perform much better with proper answer extraction

**Code Evidence**:
```python
# Both systems do this:
return sentences[0]  # Just return first sentence
```

### Issue 3: Unused Generative Capability ⚠️
**Severity**: Low
**Description**: Vector baseline has a generative mode (`_generate_answer_generative()`) that's never used.

**Why This Matters**:
- Dead code in the baseline suggests incomplete design
- Could mislead users about what's being compared
- May indicate the benchmark was initially designed differently

---

## Assessment: Is the Comparison Fair?

### ✅ **YES** - Methods Are Identical
Both systems use:
1. Extractive answer generation (no LLM)
2. Simple sentence splitting
3. First sentence selection
4. No keyword matching or semantic scoring

**The critique's claim that "KP uses generative (LLM) while vector baseline uses extractive (chunk concatenation)" is INCORRECT.**

### ⚠️ **BUT** - Architectural Issues Exist

The comparison is fair in that both use the same extraction method, but the implementation location creates:

1. **Maintenance asymmetry**: Changes to KP extraction require editing benchmark code; changes to vector baseline extraction are in the baseline class
2. **Capability mismatch**: Neither system showcases its true strengths
3. **Design inconsistency**: Suggests rushed implementation of KP integration

---

## Code Snippets: Critical Sections

### KP Answer Extraction (bench_hotpotqa.py)
```python
# Lines 459-471
def query_kp_system(self, question: str, namespace: str) -> Tuple[Optional[str], float]:
    """Query KP system and extract answer."""
    try:
        start_time = time.time()
        result = self.kp_adapter.query(
            question=question,
            namespace=namespace,
            k=self.top_k,
            search_mode="hybrid"
        )
        latency_ms = (time.time() - start_time) * 1000

        # Extract answer from results
        if result.results:
            # Simple strategy: concatenate top results and extract answer
            context = " ".join([r.content for r in result.results[:3]])
            answer = self._extract_answer_from_context(question, context)
        else:
            answer = "No answer found"

        return answer, latency_ms
```

### Vector Baseline Answer Extraction (vector_baseline.py)
```python
# Lines 439-471
def _generate_answer_extractive(
    self,
    question: str,
    retrieved: List[RetrievalResult]
) -> str:
    """
    Generate answer extractively from retrieved chunks.

    Strategy: Return the highest-scoring sentence from the top chunk.
    This is simple, deterministic, and has no API cost.
    """
    if not retrieved:
        return "No relevant information found."

    # Get the top-scoring chunk
    top_chunk = retrieved[0].chunk

    # Split chunk into sentences
    sentences = self._split_into_sentences(top_chunk.text)

    if not sentences:
        return top_chunk.text  # Fallback to full chunk

    # Simple heuristic: return first sentence (often contains key info)
    return sentences[0]
```

### Benchmark Usage (bench_hotpotqa.py)
```python
# Line 491 - Vector baseline explicitly uses extractive mode
answer = self.vector_baseline.query(
    question=question,
    k=self.top_k,
    mode="extractive"
)
```

---

## Recommendations

### Priority 1: Refactor Answer Extraction Architecture
Move KP answer extraction into `kp_adapter.py` to match vector baseline structure.

### Priority 2: Implement Proper Answer Extraction
Replace naive "first sentence" strategy with proper extractive QA:
- Keyword overlap scoring
- Named entity recognition
- Question type detection (who/what/when/where/why/how)
- Semantic similarity between question and candidate sentences

### Priority 3: Document Limitations
Add explicit documentation that both systems use extractive methods and discuss implications for result interpretation.

### Priority 4: Consider Generative Baseline
Optionally implement and benchmark a generative variant to show the range of possible approaches.

---

## Conclusion

**The critique's specific claim is INCORRECT**: Both systems use extractive answer generation, not different methods.

**However, legitimate concerns exist**:
1. Architectural asymmetry (answer extraction location)
2. Overly simplistic extraction that doesn't showcase either system's strengths
3. Unused code paths (generative mode in vector baseline)

**Overall Fairness Rating**: ✅ **FAIR** with ⚠️ **ARCHITECTURAL IMPROVEMENTS NEEDED**

The comparison produces valid, comparable results, but both systems are underutilized. The benchmark would be more convincing with better answer extraction that leverages KP's graph capabilities and vector baseline's ranking quality.

---

## References

- `bench_hotpotqa.py`: Lines 434-471 (KP query), 501-528 (extraction)
- `vector_baseline.py`: Lines 172-217 (query), 439-471 (extractive), 473-507 (generative)
- `kp_adapter.py`: Lines 340-410 (query implementation)
- `bench_msmarco.py`: Uses ranking metrics only, no answer generation

---

**Audit Status**: COMPLETE
**Next Steps**: See FAIRNESS_FIX_PROPOSAL.md for implementation recommendations
