# Namespace Handling Quick Reference

**Version:** 1.0 (Type-Safe)
**Date:** 2026-02-13

One-page reference for type-safe namespace handling.

---

## Quick Start

```python
from namespace_models import NamespaceId, BenchmarkType, FactDocument, NamespaceFilter

# 1. Create namespace
namespace = NamespaceId.create(BenchmarkType.HOTPOTQA)

# 2. Create documents
docs = [
    FactDocument(content="Test", namespace=namespace, filename="test.txt")
]

# 3. Ingest
adapter.ingest_documents(docs)

# 4. Query with filter
filter = NamespaceFilter(namespace)
results = adapter.query("question", filter, k=5)

# 5. Validate results
assert all(r.metadata['namespace'] == namespace.to_string() for r in results)
```

---

## Common Patterns

### Create Namespace

```python
# Basic (auto-timestamp)
ns = NamespaceId.create(BenchmarkType.HOTPOTQA)
# Result: hotpotqa_1707728400

# With suffix (for sub-namespaces)
ns = NamespaceId.create(BenchmarkType.MSMARCO, suffix="q123")
# Result: msmarco_1707728400_q123

# With explicit timestamp (for testing)
ns = NamespaceId.create(BenchmarkType.HOTPOTQA, timestamp=123)
# Result: hotpotqa_123
```

### Create Child Namespace

```python
parent = NamespaceId.create(BenchmarkType.MSMARCO)
# Result: msmarco_1707728400

child = parent.with_suffix("q123")
# Result: msmarco_1707728400_q123
```

### Parse Namespace String

```python
# From string
ns = NamespaceId.from_string("hotpotqa_1707728400_test")

# To string
ns_str = ns.to_string()
# Result: "hotpotqa_1707728400_test"
```

### Create Document

```python
doc = FactDocument(
    content="Document content",
    namespace=namespace,
    filename="doc.txt",
    mime_type="text/plain",
    metadata={'custom_field': 'value'}
)
```

### Query with Filter

```python
# Exact match (default)
filter = NamespaceFilter(namespace)
results = adapter.query("question", filter, k=5)

# Include parent namespace
filter = NamespaceFilter(namespace, include_parent=True)
# Matches: msmarco_123, msmarco_123_q1, msmarco_123_q2

# Include children
filter = NamespaceFilter(namespace, include_children=True)
# Matches: msmarco_123_q1, msmarco_123_q1_sub1, msmarco_123_q1_sub2
```

---

## Validation

### Validate Namespace Format

```python
from namespace_models import validate_metadata

metadata = {
    'namespace': 'hotpotqa_123',
    'custom': 'value'
}

try:
    validated = validate_metadata(metadata)
except ValueError as e:
    print(f"Invalid: {e}")
```

### Test Namespace Isolation

```python
from namespace_validation import test_namespace_filtering

ns1 = NamespaceId.create(BenchmarkType.HOTPOTQA, suffix="test1")
ns2 = NamespaceId.create(BenchmarkType.HOTPOTQA, suffix="test2")

result = test_namespace_filtering(adapter, ns1, ns2)
assert result, "Isolation test failed!"
```

### Audit Metadata

```python
from namespace_validation import audit_metadata_consistency, print_metadata_audit_report

facts = adapter.query("*", filter, k=1000)
audit_result = audit_metadata_consistency(facts)
print_metadata_audit_report(audit_result)
```

---

## Error Handling

### Common Errors

```python
# Invalid format
try:
    ns = NamespaceId.from_string("invalid")
except ValueError as e:
    # Error: Invalid namespace format: 'invalid'.
    # Expected: {benchmark}_{timestamp}[_{suffix}]
    pass

# Invalid suffix
try:
    ns = NamespaceId(BenchmarkType.HOTPOTQA, 123, suffix="invalid space")
except ValueError as e:
    # Error: Invalid suffix 'invalid space': must be alphanumeric with - or _
    pass

# Empty content
try:
    doc = FactDocument(content="", namespace=namespace)
except ValueError as e:
    # Error: Document content cannot be empty
    pass
```

---

## Migration Guide

### Old Code (String-Based)

```python
# Before
namespace = f"hotpotqa_{int(time.time())}"

documents = [
    {
        'content': 'Test',
        'filename': 'test.txt',
        'mimeType': 'text/plain',
        'metadata': {'namespace': namespace}
    }
]

adapter.ingest_documents(documents, namespace=namespace)
result = adapter.query("question", namespace=namespace, k=5)
```

### New Code (Type-Safe)

```python
# After
from namespace_models import NamespaceId, BenchmarkType, FactDocument, NamespaceFilter

namespace = NamespaceId.create(BenchmarkType.HOTPOTQA)

documents = [
    FactDocument(
        content='Test',
        namespace=namespace,
        filename='test.txt'
    )
]

adapter.ingest_documents(documents)

filter = NamespaceFilter(namespace)
result = adapter.query("question", filter, k=5)
```

---

## Benchmark-Specific Examples

### HotpotQA

```python
from namespace_models import NamespaceId, BenchmarkType, FactDocument

class HotpotQABenchmark:
    def run_benchmark(self):
        # Create namespace
        namespace = NamespaceId.create(BenchmarkType.HOTPOTQA)

        # Prepare documents
        documents = []
        for doc_dict in unique_documents:
            doc = FactDocument(
                content=doc_dict['content'],
                namespace=namespace,
                filename=doc_dict.get('filename'),
                metadata=doc_dict.get('metadata', {})
            )
            documents.append(doc)

        # Ingest
        self.kp_adapter.ingest_documents(documents)

        # Query
        filter = NamespaceFilter(namespace)
        result = self.kp_adapter.query(question, filter, k=self.top_k)
```

### MSMARCO (with Query-Specific Namespaces)

```python
class MSMARCOBenchmark:
    def run_benchmark(self):
        # Base namespace
        base_namespace = NamespaceId.create(BenchmarkType.MSMARCO)

        for query_data in queries:
            # Create query-specific namespace
            query_namespace = base_namespace.with_suffix(f"q{query_data['id']}")

            # Prepare passages
            documents = [
                FactDocument(
                    content=passage['text'],
                    namespace=query_namespace,
                    metadata={'passage_id': passage['id']}
                )
                for passage in passages
            ]

            # Ingest
            self.kp_adapter.ingest_documents(documents)

            # Query
            filter = NamespaceFilter(query_namespace)
            result = self.kp_adapter.query(question, filter, k=10)
```

### Freshness Test

```python
from namespace_models import NamespaceId, BenchmarkType, FactDocument

def test_freshness():
    # Fixed namespace for freshness tests
    namespace = NamespaceId(
        benchmark=BenchmarkType.FRESHNESS,
        timestamp=0,  # Fixed timestamp for consistency
        suffix="bench"
    )

    # Create test fact
    doc = FactDocument(
        content="Test value",
        namespace=namespace,
        metadata={'test_id': 'abc123'}
    )

    # Ingest
    adapter.ingest_documents([doc])

    # Query
    filter = NamespaceFilter(namespace)
    result = adapter.query("test", filter, k=1)
```

---

## Type Reference

### NamespaceId

```python
@dataclass(frozen=True)
class NamespaceId:
    benchmark: BenchmarkType
    timestamp: int
    suffix: Optional[str] = None

    # Methods
    def to_string() -> str
    def with_suffix(suffix: str) -> NamespaceId

    # Class methods
    @classmethod
    def create(benchmark, suffix=None, timestamp=None) -> NamespaceId

    @classmethod
    def from_string(namespace_str: str) -> NamespaceId
```

### FactDocument

```python
@dataclass
class FactDocument:
    content: str
    namespace: NamespaceId
    filename: Optional[str] = None
    mime_type: str = 'text/plain'
    metadata: Dict[str, Any] = field(default_factory=dict)

    # Methods
    def to_adapter_format() -> Dict[str, Any]

    @classmethod
    def from_adapter_format(adapter_doc: Dict) -> FactDocument
```

### NamespaceFilter

```python
@dataclass
class NamespaceFilter:
    namespace: NamespaceId
    include_children: bool = False
    include_parent: bool = False

    # Methods
    def matches(fact_namespace: str) -> bool
    def to_metadata_query() -> Dict[str, str]
```

---

## Command-Line Examples

### Run Tests

```bash
# Unit tests
pytest tests/test_namespace_models.py -v

# Specific test
pytest tests/test_namespace_models.py::TestNamespaceId::test_create_basic -v

# With coverage
pytest tests/test_namespace_models.py --cov=namespace_models --cov-report=html
```

### Validate Isolation

```python
# In Python shell or script
from namespace_models import NamespaceId, BenchmarkType
from namespace_validation import validate_namespace_isolation
from kp_adapter import HTTPKnowledgePlaneAdapter

adapter = HTTPKnowledgePlaneAdapter()
adapter.initialize(...)

namespaces = [
    NamespaceId.create(BenchmarkType.HOTPOTQA, suffix="run1"),
    NamespaceId.create(BenchmarkType.HOTPOTQA, suffix="run2"),
]

results = validate_namespace_isolation(adapter, namespaces)
for ns, result in results.items():
    print(f"{ns}: {'PASS' if result.valid else 'FAIL'}")
```

---

## Best Practices

### ✅ DO

- Use `NamespaceId.create()` for new namespaces
- Use `FactDocument` for type safety
- Use `NamespaceFilter` for queries
- Validate namespaces at creation time
- Log namespace operations for debugging
- Test isolation between namespaces

### ❌ DON'T

- Don't use raw strings for namespaces
- Don't skip validation
- Don't modify NamespaceId after creation (it's immutable)
- Don't assume filtering works (test it!)
- Don't ignore validation errors
- Don't mix namespace and workspace_id concepts

---

## Troubleshooting

### Query Returns No Results

```python
# Check namespace exists
filter = NamespaceFilter(namespace)
all_facts = adapter.query("*", filter, k=100)
print(f"Found {len(all_facts)} facts in namespace {namespace}")

# Check if filtering is enabled
# Look for log message: "filtered from X total hits"
```

### Isolation Violations

```python
# Run isolation test
from namespace_validation import validate_namespace_isolation

results = validate_namespace_isolation(adapter, [namespace])
if not results[namespace.to_string()].valid:
    violations = results[namespace.to_string()].violations
    print(f"Violations: {violations}")
```

### Invalid Namespace Format

```python
# Parse and validate
try:
    ns = NamespaceId.from_string(namespace_str)
    print(f"Valid: {ns}")
except ValueError as e:
    print(f"Invalid: {e}")
    # Error message tells you what's wrong
```

---

## Performance Tips

1. **Reuse NamespaceId objects** - They're immutable and hashable
2. **Use exact matching** - Faster than parent/child matching
3. **Validate once at creation** - Don't re-validate in loops
4. **Batch documents** - Ingest multiple documents at once

---

## Further Reading

- `docs/NAMESPACE_AUDIT_REPORT.md` - Complete audit and analysis
- `docs/NAMESPACE_FLOW_DIAGRAM.md` - Visual flow diagrams
- `docs/NAMESPACE_FIX_SUMMARY.md` - Implementation summary
- `namespace_models.py` - Full implementation with docstrings
- `namespace_validation.py` - Validation utilities

---

**Document Version:** 1.0
**Last Updated:** 2026-02-13
**Status:** Production Ready
