# Benchmark Documentation

## Overview

This directory contains comprehensive documentation for the KnowledgePlane benchmarking suite. These documents provide scientific rigor, transparency, and reproducibility for all benchmark claims.

**Purpose**: Support all claims in the blog post with detailed methodology, limitations, and examples.

---

## Documentation Index

### 📋 [METHODOLOGY.md](./METHODOLOGY.md)
**Master methodology document covering all benchmarks**

**Contents**:
- A. Answer Generation (KP vs Vector, extraction methods)
- B. Latency Measurement (what's included/excluded)
- C. Freshness Benchmark (polling, time-to-truth)
- D. Multi-Hop Reasoning - HotpotQA (dataset, metrics, sampling)
- E. Passage Ranking - MS MARCO (MRR, Recall@k, NDCG@k)
- F. Statistical Analysis (t-tests, effect sizes, confidence intervals)
- G. Reproducibility (seeds, configs, versions)
- H. Limitations and Known Issues
- I. References

**Read this first** for complete methodology details.

---

### 🔬 [EXAMPLE_CASE_STUDY.md](./EXAMPLE_CASE_STUDY.md)
**Concrete worked example showing how both systems handle a multi-hop question**

**Contents**:
1. The Question (HotpotQA example)
2. The Context (passages provided)
3. KP's Retrieval (facts extracted, search process, answer)
4. Vector Baseline's Retrieval (chunks created, search process, answer)
5. Comparison (what each got right/wrong)
6. Why KP Would Excel on Harder Questions
7. Metrics Breakdown
8. Conclusion

**Read this** to see a concrete example of how the benchmarks work.

---

### ⚠️ [LIMITATIONS.md](./LIMITATIONS.md)
**Honest discussion of what's not tested and where methodology could improve**

**Contents**:
- **Current Limitations**: Sample sizes, HTTP overhead, simple answer extraction, no graph traversal, polling granularity, binary relevance, hardware variability, no RAGAS metrics, single-threaded
- **Threats to Validity**: Internal, external, construct, conclusion validity
- **Future Work**: Larger samples, explicit graph traversal, stdio transport, additional datasets, better answer extraction, RAGAS metrics, concurrent queries, vector baseline freshness
- **Known Bugs and Issues**
- **Assumptions Made**
- **When NOT to Use These Benchmarks**
- **Responsible Reporting**

**Read this** to understand the limitations before citing results.

---

### ❓ [FAQ.md](./FAQ.md)
**Common questions about methodology, design decisions, and interpretation**

**Contents**:
- **General Questions**: Is the comparison fair? Why these metrics? Why these datasets? What about other systems? Can I reproduce results? What hardware? How long? Why is KP slower? Statistical significance? Why not LLM generation? Graph traversal? Updates? Namespaces? Custom data? Mock mode? Citation? Help?
- **Advanced Questions**: Hyperparameter sensitivity, multilingual, ties, prompt engineering
- **Troubleshooting**: Memory errors, slow benchmarks, differing results

**Read this** for quick answers to common questions.

---

## Quick Navigation

### I want to...

**Understand the complete methodology**
→ Read [METHODOLOGY.md](./METHODOLOGY.md)

**See a concrete example**
→ Read [EXAMPLE_CASE_STUDY.md](./EXAMPLE_CASE_STUDY.md)

**Know the limitations**
→ Read [LIMITATIONS.md](./LIMITATIONS.md)

**Answer a specific question**
→ Check [FAQ.md](./FAQ.md)

**Run the benchmarks**
→ See [../README.md](../README.md) for quick start

**Cite the benchmarks**
→ See [FAQ.md - Citation](./FAQ.md#q-how-do-i-cite-this-benchmark)

**Report an issue**
→ Open [GitHub Issue](https://github.com/knowledgeplane/benchmarks/issues)

---

## Documentation Standards

### Scientific Rigor

All documentation follows these principles:

1. **Transparency**: Openly discuss limitations and biases
2. **Reproducibility**: Provide exact commands and configurations
3. **Honesty**: Acknowledge what's not tested
4. **Precision**: Use specific numbers, not vague claims
5. **References**: Cite datasets, metrics, and methods

### Responsible Reporting

When reporting benchmark results:

✅ **DO**:
- Report sample size: "n=100 questions"
- Report confidence intervals: "F1: 0.85 [0.82, 0.88]"
- Report p-values: "p<0.01"
- Report effect sizes: "Cohen's d=0.72 (large)"
- Report configuration: "HTTP transport, 512-token chunks"
- Report hardware: "MacBook Pro M2, 16GB RAM"
- Acknowledge limitations: "HTTP overhead inflates KP latency"

❌ **DON'T**:
- Cherry-pick metrics
- Claim "improvement" without statistical tests
- Ignore limitations
- Compare different configurations without disclosure
- Report point estimates without uncertainty

### Example Good Reporting

```
KnowledgePlane achieved F1=0.85 (95% CI: [0.82, 0.88]) compared to
vector baseline F1=0.78 (95% CI: [0.75, 0.81]) on n=100 HotpotQA
validation questions (paired t-test p<0.01, Cohen's d=0.72 large effect).

Testing was performed on a MacBook Pro M2 (16GB RAM) using HTTP MCP
transport (adding ~30ms overhead to KP latency). Both systems used
identical extractive answer generation (first-sentence heuristic).

Limitations: Small sample size (n=100) may not detect small effects.
HTTP overhead biases KP latency upward. Graph traversal capabilities
were not explicitly leveraged in this benchmark.
```

---

## Contributing

### Improving Documentation

Found an error or unclear explanation? Please:

1. **Open an issue**: https://github.com/knowledgeplane/benchmarks/issues
2. **Tag appropriately**: Use `documentation` or `methodology` tags
3. **Suggest specific changes**: Be precise about what needs improvement

### Adding New Benchmarks

When adding new benchmarks, please:

1. **Update METHODOLOGY.md**: Add new section describing methodology
2. **Add worked example**: Contribute to EXAMPLE_CASE_STUDY.md
3. **Document limitations**: Update LIMITATIONS.md with any new limitations
4. **Add FAQ entries**: Anticipate common questions

---

## Version History

### Version 1.0 (2026-02-12)
- Initial comprehensive documentation
- METHODOLOGY.md: Complete methodology for all benchmarks
- EXAMPLE_CASE_STUDY.md: Worked example for HotpotQA
- LIMITATIONS.md: Honest discussion of limitations
- FAQ.md: Common questions and answers

---

## Document Metadata

**Maintainers**: KnowledgePlane Benchmark Suite Contributors
**Last Updated**: 2026-02-12
**Status**: Complete (Version 1.0)
**License**: MIT (same as benchmark code)

---

## References

**Related Resources**:
- [Main README](../README.md) - Quick start and installation
- [Benchmark Code](../) - Implementation in Python
- [GitHub Repository](https://github.com/knowledgeplane/benchmarks)
- [Issue Tracker](https://github.com/knowledgeplane/benchmarks/issues)

**Dataset References**:
- HotpotQA: https://hotpotqa.github.io/
- MS MARCO: https://microsoft.github.io/msmarco/

**Methodology References**:
- SQuAD Metrics: Rajpurkar et al., EMNLP 2016
- Statistical Methods: Cohen (1988), Efron & Tibshirani (1993)

---

**For questions or support, please open a GitHub issue.**
