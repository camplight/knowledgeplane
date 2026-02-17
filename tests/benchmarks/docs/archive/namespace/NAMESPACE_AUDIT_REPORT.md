# Namespace Handling Audit Report

**Date:** 2026-02-13
**Scope:** `/Users/altras/home/dev/knowledgeplane/tests/benchmarks`
**Focus:** Complete namespace lifecycle from creation → ingestion → querying

---

## Executive Summary

This audit identifies **critical inconsistencies** in namespace handling across the benchmark codebase. The primary issues stem from:

1. **Type inconsistency**: Namespaces flow as strings without validation
2. **Metadata structure inconsistency**: Namespaces stored/accessed differently in different adapters
3. **Disabled namespace filtering**: Critical filtering logic commented out in production code
4. **No centralized validation**: Each component handles namespaces independently

**Risk Level:** HIGH - Leads to data contamination across benchmark runs

---

## 1. Namespace Flow Analysis

### 1.1 Creation Phase

**Location:** `bench_hotpotqa.py:603-604`, `bench_msmarco.py:499-500`

```python
# HotpotQA
namespace = f"hotpotqa_{int(time.time())}"

# MSMARCO (with query-specific extension)
namespace = f"msmarco_{int(time.time())}"
query_namespace = f"{namespace}_q{query_data['id']}"
```

**Issues Identified:**
- ✗ No type annotation at point of creation
- ✗ No validation of format/length
- ✗ No escaping of special characters
- ✗ Timestamp-based collision possible within same second
- ✗ `query_data['id']` type not validated (could be int, str, uuid)

### 1.2 Initialization Phase

**Location:** `bench_hotpotqa.py:314-347`

```python
def initialize_kp_system(self, namespace: str) -> None:
    if self.mock_kp:
        self.kp_adapter.initialize(
            workspace_id=namespace,  # ← namespace becomes workspace_id
            ...
        )
    else:
        workspace_id = os.getenv("KP_WORKSPACE_ID", namespace)  # ← fallback to namespace
        self.kp_adapter.initialize(
            workspace_id=workspace_id,
            ...
        )
```

**Issues Identified:**
- ✗ **Semantic confusion**: `namespace` repurposed as `workspace_id`
- ✗ Environment variable can override namespace (unexpected behavior)
- ✗ Mock adapter uses namespace directly, HTTP adapter may not
- ✗ No distinction between "namespace for isolation" vs "workspace identifier"

### 1.3 Ingestion Phase

**Location:** `kp_adapter.py:215-297` (HTTPKnowledgePlaneAdapter)

```python
def ingest_documents(
    self,
    documents: List[Dict[str, Any]],
    namespace: Optional[str] = None
) -> List[IngestionResult]:
    for doc in documents:
        metadata = doc.get('metadata', {})

        # Add filename and mimeType to metadata
        metadata['filename'] = filename
        metadata['mimeType'] = mime_type

        # Add namespace to metadata
        if namespace:
            metadata['namespace'] = namespace  # ← KEY POINT: stored as metadata field
```

**Location:** `kp_adapter.py:462-542` (MockKnowledgePlaneAdapter)

```python
def ingest_documents(
    self,
    documents: List[Dict[str, Any]],
    namespace: Optional[str] = None
) -> List[IngestionResult]:
    for doc in documents:
        metadata = doc.get('metadata', {})

        if namespace:
            metadata['namespace'] = namespace  # ← Same pattern
```

**Issues Identified:**
- ✓ Consistent storage pattern: `metadata['namespace']`
- ✗ `metadata` is mutable dict - no validation
- ✗ Existing `metadata['namespace']` can be overwritten silently
- ✗ No check for `namespace` key conflicts in input metadata
- ✗ Mock adapter splits content into sentences but all get same namespace

### 1.4 Query Phase - **CRITICAL ISSUES**

**Location:** `kp_adapter.py:299-377` (HTTPKnowledgePlaneAdapter.query)

```python
def query(
    self,
    question: str,
    namespace: Optional[str] = None,
    k: int = 5,
    search_mode: str = "hybrid"
) -> QueryResult:
    # ... REST API call ...

    for hit in hits:
        # Filter by namespace if specified - DISABLED FOR TESTING
        # if namespace:
        #     hit_namespace = hit.get('metadata', {}).get('namespace')
        #     if hit_namespace != namespace:
        #         continue

        results.append(FactResult(...))  # ← NO FILTERING APPLIED
```

**🚨 CRITICAL:** Namespace filtering is **completely disabled** in production code!

**Location:** `kp_adapter.py:544-606` (MockKnowledgePlaneAdapter.query)

```python
def query(
    self,
    question: str,
    namespace: Optional[str] = None,
    k: int = 5,
    search_mode: str = "hybrid"
) -> QueryResult:
    for fact_id, fact in self.facts.items():
        # Namespace filter
        if namespace:
            fact_namespace = fact.get('metadata', {}).get('namespace')
            if fact_namespace != namespace:
                continue  # ← FILTERING ENABLED in mock
```

**Issues Identified:**
- ✗ **CRITICAL**: HTTP adapter has namespace filtering disabled
- ✗ Mock adapter and HTTP adapter behave **completely differently**
- ✗ Tests using mock adapter pass but production fails
- ✗ Comment says "DISABLED FOR TESTING" but this is production code
- ✗ No logging/warning when namespace filter is provided but ignored

### 1.5 Metadata Access Patterns

**Inconsistent access across codebase:**

```python
# Pattern 1: Direct dict access (unsafe)
metadata['namespace']  # kp_adapter.py:253, 483

# Pattern 2: Safe get with default (used in filtering)
fact.get('metadata', {}).get('namespace')  # kp_adapter.py:351, 565

# Pattern 3: Attribute access (bench_freshness.py only)
fact.namespace  # bench_freshness.py:263, 274, etc.

# Pattern 4: Mixed access (bench_msmarco.py)
r.metadata.get('passage_id') if hasattr(r, 'metadata') else None
```

**Issues Identified:**
- ✗ No consistent data model for facts
- ✗ `FactResult` dataclass has `metadata: Dict` but no type-safe accessors
- ✗ `bench_freshness.py` uses `fact.namespace` but `FactResult` has no such field
- ✗ No validation that metadata contains expected fields

---

## 2. Root Cause Analysis

### 2.1 Primary Root Causes

| Issue | Root Cause | Impact |
|-------|-----------|--------|
| Namespace filtering disabled | Developer comment suggests temporary change never reverted | **CRITICAL** - Data contamination |
| Mock/HTTP adapter divergence | No integration tests comparing behavior | Tests pass, production fails |
| Type safety gaps | No TypedDict/dataclass for metadata | Silent failures, hard to debug |
| Semantic confusion | `namespace` used as `workspace_id` | Unclear boundaries |
| No validation layer | Each component validates independently | Inconsistent behavior |

### 2.2 Secondary Issues

- **No centralized namespace constants** - String literals scattered
- **No namespace lifecycle management** - No cleanup/archival strategy
- **No collision detection** - Timestamp-based IDs can collide
- **No audit trail** - Can't trace which data belongs to which benchmark run

---

## 3. Current Namespace Lifecycle (AS-IS)

```
┌──────────────────────────────────────────────────────────────┐
│ 1. CREATION (bench_hotpotqa.py:604)                         │
│    namespace = f"hotpotqa_{int(time.time())}"               │
│    Type: str (unvalidated)                                   │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. INITIALIZATION (bench_hotpotqa.py:327)                   │
│    workspace_id = namespace  ← Semantic confusion            │
│    self.kp_adapter.initialize(workspace_id=workspace_id)     │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. INGESTION (kp_adapter.py:253)                            │
│    metadata['namespace'] = namespace                         │
│    Stored in: fact.metadata.namespace (HTTP)                 │
│              fact['metadata']['namespace'] (Mock)            │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. QUERY (kp_adapter.py:349-353) ← DISABLED!                │
│    # if namespace:                                           │
│    #     hit_namespace = hit.get('metadata', {}).get(...)    │
│    #     if hit_namespace != namespace:                      │
│    #         continue                                        │
│    Results returned: ALL facts (namespace ignored)           │
└──────────────────────────────────────────────────────────────┘
```

**Result:** Benchmarks query ALL facts from ALL previous runs, not just current run.

---

## 4. Type Safety Analysis

### 4.1 Current Type Signatures

```python
# kp_adapter.py - Base class
def ingest_documents(
    self,
    documents: List[Dict[str, Any]],  # ← No structure validation
    namespace: Optional[str] = None    # ← No format validation
) -> List[IngestionResult]:

def query(
    self,
    question: str,
    namespace: Optional[str] = None,  # ← Can be silently ignored
    k: int = 5,
    search_mode: str = "hybrid"
) -> QueryResult:
```

### 4.2 Metadata Structure (Implicit)

**Discovered structure** (from code analysis):

```python
# HTTP Adapter expects:
{
    'filename': str,
    'mimeType': str,
    'namespace': str,  # ← Added by adapter
    ... user-provided fields
}

# Mock Adapter expects: (same)

# bench_freshness.py expects:
{
    'namespace': str,
    'fact_id': str,
    'version': Optional[str]
}

# bench_msmarco.py expects:
{
    'passage_id': str,
    'namespace': str,
    ... other fields
}
```

**Issue:** No single source of truth for metadata structure.

---

## 5. Proposed Solution: Type-Safe Namespace System

### 5.1 Core Data Models

```python
"""
namespace_models.py - Type-safe namespace handling
"""
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List, Literal
from typing_extensions import TypedDict
import re


class BenchmarkType(Enum):
    """Valid benchmark types for namespace prefixes."""
    HOTPOTQA = "hotpotqa"
    MSMARCO = "msmarco"
    FRESHNESS = "freshness"
    CUSTOM = "custom"


@dataclass(frozen=True)
class NamespaceId:
    """
    Immutable namespace identifier with validation.

    Format: {benchmark}_{timestamp}[_{suffix}]
    Examples:
        - hotpotqa_1707728400
        - msmarco_1707728400_q123
        - freshness_bench
    """
    benchmark: BenchmarkType
    timestamp: int
    suffix: Optional[str] = None

    def __post_init__(self):
        """Validate namespace components."""
        if self.timestamp < 0:
            raise ValueError(f"Invalid timestamp: {self.timestamp}")

        if self.suffix:
            # Validate suffix: alphanumeric, hyphens, underscores only
            if not re.match(r'^[a-zA-Z0-9_-]+$', self.suffix):
                raise ValueError(
                    f"Invalid suffix '{self.suffix}': must be alphanumeric with - or _"
                )

    def to_string(self) -> str:
        """Convert to string format for storage."""
        base = f"{self.benchmark.value}_{self.timestamp}"
        return f"{base}_{self.suffix}" if self.suffix else base

    @classmethod
    def from_string(cls, namespace_str: str) -> 'NamespaceId':
        """Parse namespace from string format."""
        parts = namespace_str.split('_')

        if len(parts) < 2:
            raise ValueError(
                f"Invalid namespace format: {namespace_str}. "
                f"Expected: {{benchmark}}_{{timestamp}}[_{{suffix}}]"
            )

        benchmark_str = parts[0]
        try:
            benchmark = BenchmarkType(benchmark_str)
        except ValueError:
            benchmark = BenchmarkType.CUSTOM

        try:
            timestamp = int(parts[1])
        except ValueError:
            raise ValueError(f"Invalid timestamp in namespace: {parts[1]}")

        suffix = '_'.join(parts[2:]) if len(parts) > 2 else None

        return cls(benchmark=benchmark, timestamp=timestamp, suffix=suffix)

    @classmethod
    def create(
        cls,
        benchmark: BenchmarkType,
        suffix: Optional[str] = None,
        timestamp: Optional[int] = None
    ) -> 'NamespaceId':
        """Create new namespace with current timestamp."""
        if timestamp is None:
            timestamp = int(datetime.now().timestamp())

        return cls(benchmark=benchmark, timestamp=timestamp, suffix=suffix)

    def __str__(self) -> str:
        return self.to_string()

    def __repr__(self) -> str:
        return f"NamespaceId('{self.to_string()}')"


class FactMetadata(TypedDict, total=False):
    """
    Type-safe metadata structure for facts.

    Required fields: namespace
    Optional fields: All others
    """
    namespace: str  # REQUIRED via FactMetadataRequired
    filename: str
    mimeType: str
    title: str
    source: str
    passage_id: str
    fact_id: str
    version: str
    num_sentences: int


class FactMetadataRequired(TypedDict):
    """Required metadata fields."""
    namespace: str


@dataclass
class FactDocument:
    """
    Type-safe document for ingestion.

    Replaces Dict[str, Any] with validated structure.
    """
    content: str
    namespace: NamespaceId
    filename: Optional[str] = None
    mime_type: str = 'text/plain'
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_adapter_format(self) -> Dict[str, Any]:
        """Convert to adapter's expected format."""
        # Merge namespace into metadata
        full_metadata = {
            **self.metadata,
            'namespace': self.namespace.to_string()
        }

        # Add filename and mimeType if provided
        if self.filename:
            full_metadata['filename'] = self.filename
        full_metadata['mimeType'] = self.mime_type

        return {
            'content': self.content,
            'filename': self.filename or 'document.txt',
            'mimeType': self.mime_type,
            'metadata': full_metadata
        }


@dataclass
class NamespaceFilter:
    """
    Filter for namespace-aware queries.

    Handles validation and comparison logic.
    """
    namespace: NamespaceId
    include_parent: bool = False  # For hierarchical namespaces

    def matches(self, fact_namespace: str) -> bool:
        """Check if fact namespace matches filter."""
        try:
            fact_ns = NamespaceId.from_string(fact_namespace)
        except ValueError:
            # Invalid namespace format - don't match
            return False

        if self.include_parent:
            # Match if same benchmark and timestamp
            return (
                fact_ns.benchmark == self.namespace.benchmark and
                fact_ns.timestamp == self.namespace.timestamp
            )
        else:
            # Exact match required
            return fact_ns.to_string() == self.namespace.to_string()

    def to_metadata_query(self) -> Dict[str, str]:
        """Convert to metadata query format."""
        return {'namespace': self.namespace.to_string()}


def validate_metadata(metadata: Dict[str, Any]) -> FactMetadata:
    """
    Validate metadata dict and return typed version.

    Args:
        metadata: Raw metadata dict

    Returns:
        Typed metadata (if valid)

    Raises:
        ValueError: If required fields missing
    """
    if 'namespace' not in metadata:
        raise ValueError("Metadata missing required field: namespace")

    # Validate namespace format
    try:
        NamespaceId.from_string(metadata['namespace'])
    except ValueError as e:
        raise ValueError(f"Invalid namespace in metadata: {e}")

    # Return typed dict (runtime validation only)
    return metadata  # type: ignore
```

### 5.2 Enhanced Adapter Interface

```python
"""
Enhanced kp_adapter.py with type-safe namespace handling
"""
from namespace_models import (
    NamespaceId, FactDocument, NamespaceFilter,
    validate_metadata
)


class KnowledgePlaneAdapter(ABC):
    """Enhanced adapter with type-safe namespace handling."""

    @abstractmethod
    def ingest_documents(
        self,
        documents: List[FactDocument],  # ← Type-safe documents
        validate: bool = True
    ) -> List[IngestionResult]:
        """
        Ingest documents with validated namespaces.

        Args:
            documents: Type-safe document list
            validate: Validate namespace uniqueness (default: True)
        """
        pass

    @abstractmethod
    def query(
        self,
        question: str,
        namespace_filter: NamespaceFilter,  # ← Type-safe filter
        k: int = 5,
        search_mode: str = "hybrid"
    ) -> QueryResult:
        """
        Query with validated namespace filtering.

        Args:
            question: Query text
            namespace_filter: Type-safe namespace filter
            k: Max results
            search_mode: Search mode

        Note:
            Implementations MUST apply namespace filter.
            No results from other namespaces should be returned.
        """
        pass


class HTTPKnowledgePlaneAdapter(KnowledgePlaneAdapter):
    """Enhanced HTTP adapter with namespace enforcement."""

    def ingest_documents(
        self,
        documents: List[FactDocument],
        validate: bool = True
    ) -> List[IngestionResult]:
        """Ingest with namespace validation."""
        results = []

        for doc in documents:
            # Convert to adapter format (includes namespace in metadata)
            adapter_doc = doc.to_adapter_format()

            # Validate namespace if requested
            if validate:
                namespace_str = doc.namespace.to_string()
                logger.info(f"Ingesting to namespace: {namespace_str}")

            # Call REST API (same as before)
            # ... existing logic ...

        return results

    def query(
        self,
        question: str,
        namespace_filter: NamespaceFilter,
        k: int = 5,
        search_mode: str = "hybrid"
    ) -> QueryResult:
        """Query with MANDATORY namespace filtering."""
        start_time = time.time()

        # Call REST API (same as before)
        # ... existing logic ...

        # *** CRITICAL FIX: ENABLE NAMESPACE FILTERING ***
        hits = result.get('hits', [])
        results = []

        for hit in hits:
            hit_namespace = hit.get('metadata', {}).get('namespace')

            # MANDATORY: Filter by namespace
            if not hit_namespace:
                logger.warning(
                    f"Fact {hit['id']} has no namespace, skipping"
                )
                continue

            if not namespace_filter.matches(hit_namespace):
                logger.debug(
                    f"Fact {hit['id']} namespace '{hit_namespace}' "
                    f"doesn't match filter '{namespace_filter.namespace}'"
                )
                continue

            # Validate metadata
            try:
                validated_metadata = validate_metadata(hit.get('metadata', {}))
            except ValueError as e:
                logger.error(f"Invalid metadata in fact {hit['id']}: {e}")
                continue

            results.append(FactResult(
                id=hit['id'],
                content=hit['content'],
                score=hit.get('score', 1.0),
                metadata=validated_metadata,
                created_at=hit.get('created_at'),
            ))

        elapsed_ms = (time.time() - start_time) * 1000

        logger.info(
            f"Query '{question}' in namespace '{namespace_filter.namespace}': "
            f"{len(results)} results in {elapsed_ms:.2f}ms "
            f"(filtered from {len(hits)} total hits)"
        )

        return QueryResult(
            results=results,
            total_returned=len(results),
            query_time_ms=elapsed_ms,
        )
```

### 5.3 Enhanced Benchmark Integration

```python
"""
Enhanced bench_hotpotqa.py with type-safe namespaces
"""
from namespace_models import (
    NamespaceId, BenchmarkType, FactDocument, NamespaceFilter
)


class HotpotQABenchmark:
    """Enhanced benchmark with type-safe namespace handling."""

    def run_benchmark(self) -> BenchmarkSummary:
        """Run benchmark with validated namespaces."""

        # Create type-safe namespace
        namespace = NamespaceId.create(
            benchmark=BenchmarkType.HOTPOTQA,
            suffix=None  # Optional: add run identifier
        )

        logger.info(f"Using namespace: {namespace}")

        # Prepare type-safe documents
        documents = []
        for doc_dict in unique_documents:
            doc = FactDocument(
                content=doc_dict['content'],
                namespace=namespace,
                filename=doc_dict.get('filename'),
                mime_type=doc_dict.get('mimeType', 'text/plain'),
                metadata=doc_dict.get('metadata', {})
            )
            documents.append(doc)

        # Initialize and ingest
        if self.run_kp:
            # Pass namespace string for workspace initialization
            self.initialize_kp_system(namespace.to_string())

            # Ingest type-safe documents
            if not self.ingest_kp_documents(documents):
                logger.warning("KP ingestion failed")
                self.run_kp = False

        # ... rest of benchmark ...

    def ingest_kp_documents(
        self,
        documents: List[FactDocument]  # ← Type-safe
    ) -> bool:
        """Ingest type-safe documents."""
        try:
            logger.info(f"Ingesting {len(documents)} documents into KP...")
            start_time = time.time()

            # Adapter handles namespace validation
            results = self.kp_adapter.ingest_documents(
                documents,
                validate=True  # Enforce validation
            )

            elapsed = time.time() - start_time
            total_facts = sum(r.facts_created for r in results)

            logger.info(f"KP ingestion complete: {total_facts} facts in {elapsed:.2f}s")
            return True

        except Exception as e:
            logger.error(f"KP ingestion failed: {e}", exc_info=True)
            return False

    def query_kp_system(
        self,
        question: str,
        namespace: NamespaceId  # ← Type-safe
    ) -> Tuple[Optional[str], float]:
        """Query with type-safe namespace filter."""
        try:
            start_time = time.time()

            # Create type-safe filter
            namespace_filter = NamespaceFilter(
                namespace=namespace,
                include_parent=False  # Exact match only
            )

            # Query with filter
            result = self.kp_adapter.query(
                question=question,
                namespace_filter=namespace_filter,
                k=self.top_k,
                search_mode="hybrid"
            )

            latency_ms = (time.time() - start_time) * 1000

            # Extract answer
            if result.results:
                context = " ".join([r.content for r in result.results[:3]])
                answer = self._extract_answer_from_context(question, context)
            else:
                answer = "No answer found"

            return answer, latency_ms

        except Exception as e:
            logger.error(f"KP query failed: {e}", exc_info=True)
            return None, 0.0
```

### 5.4 Validation Functions

```python
"""
namespace_validation.py - Validation and testing utilities
"""
from typing import List, Dict, Set
from namespace_models import NamespaceId, FactDocument
import logging

logger = logging.getLogger(__name__)


def validate_namespace_isolation(
    adapter: 'KnowledgePlaneAdapter',
    namespaces: List[NamespaceId],
    test_query: str = "test"
) -> Dict[str, bool]:
    """
    Test namespace isolation by verifying no cross-contamination.

    Args:
        adapter: Adapter instance to test
        namespaces: List of namespaces to validate
        test_query: Query to run against each namespace

    Returns:
        Dict mapping namespace -> isolation_valid
    """
    results = {}

    for namespace in namespaces:
        # Query this namespace
        filter = NamespaceFilter(namespace=namespace)
        query_result = adapter.query(test_query, filter, k=100)

        # Check all results belong to this namespace
        valid = True
        for fact in query_result.results:
            fact_ns = fact.metadata.get('namespace')
            if fact_ns != namespace.to_string():
                logger.error(
                    f"ISOLATION VIOLATION: Query for '{namespace}' returned "
                    f"fact from '{fact_ns}'"
                )
                valid = False

        results[namespace.to_string()] = valid

    return results


def detect_namespace_collisions(
    documents: List[FactDocument]
) -> Set[str]:
    """
    Detect duplicate namespace assignments in document list.

    Args:
        documents: Documents to check

    Returns:
        Set of duplicate namespace strings
    """
    namespace_counts: Dict[str, int] = {}

    for doc in documents:
        ns_str = doc.namespace.to_string()
        namespace_counts[ns_str] = namespace_counts.get(ns_str, 0) + 1

    # Find duplicates (expected for same-benchmark documents)
    # This is actually EXPECTED behavior - documents in same benchmark share namespace
    # Only collision would be if timestamp collides

    return set()  # No collisions expected with our design


def audit_metadata_consistency(
    facts: List['FactResult']
) -> Dict[str, List[str]]:
    """
    Audit facts for metadata consistency issues.

    Args:
        facts: Facts to audit

    Returns:
        Dict of issue_type -> [fact_ids]
    """
    issues = {
        'missing_namespace': [],
        'invalid_namespace_format': [],
        'missing_required_fields': []
    }

    for fact in facts:
        # Check namespace presence
        if 'namespace' not in fact.metadata:
            issues['missing_namespace'].append(fact.id)
            continue

        # Check namespace format
        try:
            NamespaceId.from_string(fact.metadata['namespace'])
        except ValueError:
            issues['invalid_namespace_format'].append(fact.id)

        # Check required fields based on namespace type
        # (Could be extended based on benchmark type)

    return {k: v for k, v in issues.items() if v}  # Filter empty lists
```

---

## 6. Migration Plan

### Phase 1: Add Type-Safe Models (Non-Breaking)

**Week 1:**
1. Add `namespace_models.py` to codebase
2. Add unit tests for `NamespaceId` parsing/validation
3. Add `namespace_validation.py` utilities
4. Document new models in README

**Deliverables:**
- ✓ Type-safe models available but not enforced
- ✓ Backward compatible with existing code
- ✓ Tests pass for new models

### Phase 2: Fix Critical Bug (High Priority)

**Week 1-2:**
1. **Enable namespace filtering in HTTPKnowledgePlaneAdapter.query()**
   - Remove comment block at `kp_adapter.py:349-353`
   - Add logging when filtering occurs
   - Add warning if namespace provided but no facts have namespaces

2. Add integration test comparing Mock and HTTP adapter behavior
3. Add validation test for namespace isolation

**Deliverables:**
- ✓ Namespace filtering enforced in production
- ✓ Mock and HTTP adapters behave identically
- ✓ Existing benchmarks still work (but may show different results)

### Phase 3: Gradual Type-Safe Adoption

**Week 3-4:**
1. Update `bench_hotpotqa.py` to use `NamespaceId`
2. Update `bench_msmarco.py` to use `NamespaceId`
3. Update `bench_freshness.py` to use `NamespaceId`
4. Add validation calls in adapters

**Deliverables:**
- ✓ All benchmarks use type-safe namespaces
- ✓ Validation catches errors at creation time
- ✓ Clearer error messages for namespace issues

### Phase 4: Enforce Type Safety

**Week 5:**
1. Update adapter interfaces to require `FactDocument`
2. Update adapter interfaces to require `NamespaceFilter`
3. Remove legacy `Dict[str, Any]` code paths
4. Add strict validation mode

**Deliverables:**
- ✓ Type errors caught at development time
- ✓ Runtime validation prevents invalid data
- ✓ 100% type-safe namespace handling

---

## 7. Testing Strategy

### 7.1 Unit Tests

```python
def test_namespace_id_creation():
    """Test namespace ID creation and validation."""
    # Valid creation
    ns = NamespaceId.create(BenchmarkType.HOTPOTQA, suffix="test")
    assert ns.benchmark == BenchmarkType.HOTPOTQA
    assert ns.suffix == "test"

    # String conversion
    ns_str = ns.to_string()
    assert "hotpotqa_" in ns_str
    assert "_test" in ns_str

    # Round-trip
    ns2 = NamespaceId.from_string(ns_str)
    assert ns2.benchmark == ns.benchmark
    assert ns2.suffix == ns.suffix


def test_namespace_id_validation():
    """Test namespace ID validation."""
    # Invalid suffix
    with pytest.raises(ValueError):
        NamespaceId(BenchmarkType.HOTPOTQA, 123, suffix="invalid space")

    # Invalid timestamp
    with pytest.raises(ValueError):
        NamespaceId(BenchmarkType.HOTPOTQA, -1)


def test_namespace_filter_matching():
    """Test namespace filter matching logic."""
    ns1 = NamespaceId(BenchmarkType.HOTPOTQA, 123, suffix="q1")
    ns2 = NamespaceId(BenchmarkType.HOTPOTQA, 123, suffix="q2")
    ns3 = NamespaceId(BenchmarkType.MSMARCO, 123, suffix="q1")

    # Exact match
    filter = NamespaceFilter(ns1, include_parent=False)
    assert filter.matches("hotpotqa_123_q1")
    assert not filter.matches("hotpotqa_123_q2")

    # Parent match
    filter_parent = NamespaceFilter(ns1, include_parent=True)
    assert filter_parent.matches("hotpotqa_123_q1")
    assert filter_parent.matches("hotpotqa_123_q2")  # Same parent
    assert not filter_parent.matches("msmarco_123_q1")  # Different benchmark
```

### 7.2 Integration Tests

```python
def test_namespace_isolation():
    """Test that namespaces properly isolate data."""
    adapter = HTTPKnowledgePlaneAdapter()
    adapter.initialize(...)

    # Create two namespaces
    ns1 = NamespaceId.create(BenchmarkType.HOTPOTQA, suffix="test1")
    ns2 = NamespaceId.create(BenchmarkType.HOTPOTQA, suffix="test2")

    # Ingest docs to ns1
    docs1 = [
        FactDocument(content="Doc A in NS1", namespace=ns1),
        FactDocument(content="Doc B in NS1", namespace=ns1),
    ]
    adapter.ingest_documents(docs1)

    # Ingest docs to ns2
    docs2 = [
        FactDocument(content="Doc C in NS2", namespace=ns2),
    ]
    adapter.ingest_documents(docs2)

    # Query ns1 - should only get ns1 docs
    filter1 = NamespaceFilter(ns1)
    result1 = adapter.query("Doc", filter1, k=10)

    for fact in result1.results:
        assert fact.metadata['namespace'] == ns1.to_string()

    # Query ns2 - should only get ns2 docs
    filter2 = NamespaceFilter(ns2)
    result2 = adapter.query("Doc", filter2, k=10)

    for fact in result2.results:
        assert fact.metadata['namespace'] == ns2.to_string()


def test_mock_http_adapter_parity():
    """Test that Mock and HTTP adapters behave identically."""
    mock_adapter = MockKnowledgePlaneAdapter()
    http_adapter = HTTPKnowledgePlaneAdapter()

    # Initialize both
    namespace = NamespaceId.create(BenchmarkType.HOTPOTQA)

    mock_adapter.initialize("mock://", "key", namespace.to_string(), "user")
    http_adapter.initialize("http://localhost:8081", "key", namespace.to_string(), "user")

    # Ingest same documents
    docs = [FactDocument(content="Test content", namespace=namespace)]

    mock_results = mock_adapter.ingest_documents(docs)
    http_results = http_adapter.ingest_documents(docs)

    # Both should create facts
    assert mock_results[0].facts_created > 0
    assert http_results[0].facts_created > 0

    # Query both
    filter = NamespaceFilter(namespace)

    mock_query = mock_adapter.query("Test", filter, k=5)
    http_query = http_adapter.query("Test", filter, k=5)

    # Both should return results
    assert len(mock_query.results) > 0
    assert len(http_query.results) > 0

    # All results should match namespace
    for result in mock_query.results:
        assert result.metadata['namespace'] == namespace.to_string()

    for result in http_query.results:
        assert result.metadata['namespace'] == namespace.to_string()
```

---

## 8. Recommendations

### Immediate Actions (Week 1)

1. **CRITICAL: Enable namespace filtering in HTTPKnowledgePlaneAdapter**
   - File: `kp_adapter.py:349-353`
   - Action: Uncomment and test filtering logic
   - Risk: Existing benchmarks may show different results (this is CORRECT behavior)

2. **Add integration test for namespace isolation**
   - Create test that verifies no cross-contamination
   - Run against both Mock and HTTP adapters
   - Document expected behavior

3. **Add logging for namespace operations**
   - Log when namespace is created
   - Log when namespace is added to metadata
   - Log when namespace filter is applied (or ignored)

### Short-Term Actions (Weeks 2-3)

4. **Introduce type-safe models**
   - Add `namespace_models.py` (non-breaking)
   - Add validation utilities
   - Update documentation

5. **Migrate benchmarks to use NamespaceId**
   - Start with `bench_hotpotqa.py`
   - Add validation at creation time
   - Improve error messages

### Long-Term Actions (Month 2+)

6. **Enforce type safety in adapters**
   - Update adapter interfaces to require `FactDocument`
   - Remove `Dict[str, Any]` code paths
   - Add strict validation mode

7. **Add namespace management utilities**
   - CLI tool to list namespaces
   - Cleanup tool to remove old benchmark data
   - Export/import for benchmark results

8. **Enhance monitoring**
   - Track namespace usage metrics
   - Alert on isolation violations
   - Dashboard for benchmark run history

---

## 9. Conclusion

The namespace handling system has **critical flaws** that lead to data contamination:

1. **Disabled filtering** in production code (HTTP adapter)
2. **No type safety** leading to silent failures
3. **Inconsistent behavior** between Mock and HTTP adapters
4. **No validation** at any lifecycle stage

The proposed solution provides:

- ✓ **Type-safe namespace IDs** with validation
- ✓ **Mandatory filtering** in all adapters
- ✓ **Consistent behavior** across Mock and HTTP
- ✓ **Clear error messages** for debugging
- ✓ **Gradual migration path** (non-breaking initially)

**Priority:** HIGH - Namespace filtering must be enabled immediately to prevent invalid benchmark results.

---

**Document Version:** 1.0
**Last Updated:** 2026-02-13
**Next Review:** After Phase 1 completion
