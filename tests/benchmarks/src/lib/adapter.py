"""
KnowledgePlane Adapter for Benchmarking Suite

This module provides adapters for interacting with KnowledgePlane instances
for benchmarking purposes. It includes both a real adapter (HTTP-based) and
a mock adapter for testing without a live instance.

Based on: /Users/altras/home/dev/knowledgeplane/tests/kp_discovery_report.md
"""

import base64
import json
import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
import os
from typing import Any, Dict, List, Optional, Tuple, Set
from urllib.parse import urljoin
import requests


logger = logging.getLogger(__name__)


# Data Models
@dataclass
class IngestionResult:
    """Result of document ingestion."""
    file_id: Optional[str] = None
    facts_created: int = 0
    relations_created: int = 0
    fact_ids: List[str] = field(default_factory=list)
    ingestion_time_ms: float = 0.0


@dataclass
class FactResult:
    """A single fact result from search."""
    id: str
    content: str
    score: float = 1.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: Optional[str] = None


@dataclass
class QueryResult:
    """Result of a fact search query."""
    results: List[FactResult] = field(default_factory=list)
    total_returned: int = 0
    query_time_ms: float = 0.0


@dataclass
class RelationResult:
    """A relation with connected fact."""
    relation_id: str
    relation_type: str
    fact: FactResult


@dataclass
class RelationsQueryResult:
    """Result of relations traversal."""
    relations: List[RelationResult] = field(default_factory=list)


# Base Adapter Interface
class KnowledgePlaneAdapter(ABC):
    """
    Abstract base class for KnowledgePlane adapters.

    Defines the interface for ingestion and querying operations
    that all adapters must implement.
    """

    @abstractmethod
    def initialize(
        self,
        mcp_url: str,
        api_key: str,
        workspace_id: str,
        user_id: str,
        **kwargs
    ) -> None:
        """
        Initialize the adapter with connection configuration.

        Args:
            mcp_url: Base URL of the MCP server (e.g., "http://localhost:8080/mcp")
            api_key: Authentication token
            workspace_id: Target workspace for all operations
            user_id: User ID for created_by fields
            **kwargs: Additional configuration options
        """
        pass

    @abstractmethod
    def ingest_documents(
        self,
        documents: List[Dict[str, Any]],
        namespace: Optional[str] = None
    ) -> List[IngestionResult]:
        """
        Ingest documents and extract facts/relations.

        Args:
            documents: List of documents with 'content', 'filename', 'mimeType'
            namespace: Optional namespace (stored in metadata)

        Returns:
            List of ingestion results
        """
        pass

    @abstractmethod
    def query(
        self,
        question: str,
        namespace: Optional[str] = None,
        k: int = 5,
        search_mode: str = "hybrid"
    ) -> QueryResult:
        """
        Query facts using semantic or keyword search.

        Args:
            question: Search query
            namespace: Optional namespace filter (via metadata)
            k: Maximum number of results
            search_mode: Search mode - "fulltext", "vector", or "hybrid"

        Returns:
            Query result with matched facts
        """
        pass

    @abstractmethod
    def get_related_facts(
        self,
        fact_id: str,
        relation_type: Optional[str] = None
    ) -> RelationsQueryResult:
        """
        Get facts related to a given fact (outgoing relations).

        Args:
            fact_id: Source fact ID
            relation_type: Optional filter by relation type

        Returns:
            Relations and connected facts
        """
        pass

    @abstractmethod
    def close(self) -> None:
        """Clean up resources and connections."""
        pass


# HTTP-Based Real Adapter
class HTTPKnowledgePlaneAdapter(KnowledgePlaneAdapter):
    """
    Production adapter that connects to KnowledgePlane via HTTP MCP server.

    This adapter uses the MCP protocol over HTTP to interact with a real
    KnowledgePlane instance. It requires a running MCP server and valid
    authentication credentials.
    """

    def __init__(self):
        """Initialize the HTTP adapter."""
        self.mcp_url: Optional[str] = None
        self.api_key: Optional[str] = None
        self.workspace_id: Optional[str] = None
        self.user_id: Optional[str] = None
        self.username: Optional[str] = None
        self.email: Optional[str] = None
        self.session = requests.Session()
        self.timeout = 30  # seconds
        self.sync_embedding = True  # Generate embeddings synchronously for benchmarks

    def initialize(
        self,
        mcp_url: str,
        api_key: str,
        workspace_id: str,
        user_id: str,
        timeout: int = 30,
        sync_embedding: bool = True,
        username: Optional[str] = None,
        email: Optional[str] = None,
        **kwargs
    ) -> None:
        """
        Initialize connection to REST API server.

        Args:
            mcp_url: Base URL of REST API server (e.g. http://localhost:8081)
            api_key: API key for authentication
            workspace_id: Target workspace
            user_id: User for operations
            timeout: Request timeout in seconds
            sync_embedding: Generate embeddings synchronously (default: True for benchmarks)
            username: Username for auto-user creation (defaults to bench_{workspace_id})
            email: Email for auto-user creation (defaults to bench_{workspace_id}@benchmark.local)
        """
        self.api_url = mcp_url.rstrip('/')
        self.api_key = api_key
        self.workspace_id = workspace_id
        self.user_id = user_id
        self.timeout = timeout
        self.sync_embedding = sync_embedding

        # Auto-generate username/email for REST API auto-user creation
        ws_slug = workspace_id.replace('-', '_')[:20] if workspace_id else 'bench'
        self.username = username or f"bench_{ws_slug}"
        self.email = email or f"bench_{ws_slug}@benchmark.local"

        # Set headers for REST API authentication
        # API key header enables workspace resolution from auth context
        self.session.headers.update({
            'Content-Type': 'application/json',
            'knowledgeplane-key': api_key,
        })

        sync_status = "enabled (facts immediately searchable)" if sync_embedding else "disabled (async)"
        logger.info(f"Initialized REST API adapter for {mcp_url} [sync_embedding: {sync_status}]")


    def ingest_documents(
        self,
        documents: List[Dict[str, Any]],
        namespace: Optional[str] = None
    ) -> List[IngestionResult]:
        """
        Ingest documents via REST API POST /api/facts.

        Each document should contain:
        - content: Raw text content
        - filename: Name of the file (added to metadata)
        - mimeType: MIME type (added to metadata)
        - metadata: Optional metadata dict

        Args:
            documents: List of document dicts
            namespace: Optional namespace (added to metadata)

        Returns:
            List of ingestion results
        """
        results = []

        for doc in documents:
            start_time = time.time()

            # Prepare document
            content = doc['content']
            filename = doc.get('filename', 'document.txt')
            mime_type = doc.get('mimeType', 'text/plain')
            metadata = doc.get('metadata', {})

            # Add filename and mimeType to metadata
            metadata['filename'] = filename
            metadata['mimeType'] = mime_type

            # Add namespace to metadata
            if namespace:
                metadata['namespace'] = namespace
                logger.debug(f"[DEBUG] Ingesting with namespace={namespace}, metadata keys: {list(metadata.keys())}")

            # Create fact via REST API
            try:
                # Build URL with auth params for auto-user creation + sync_embedding
                url = f"{self.api_url}/api/facts?workspace_id={self.workspace_id}&username={self.username}&email={self.email}"
                if self.sync_embedding:
                    url += "&sync_embedding=true"
                payload = {
                    'content': content,
                    'metadata': metadata,
                    'created_by': self.user_id,
                    'last_updated_by': self.user_id,
                }

                response = self.session.post(
                    url,
                    json=payload,
                    timeout=self.timeout
                )
                response.raise_for_status()

                result = response.json()
                elapsed_ms = (time.time() - start_time) * 1000

                # Extract fact ID from response
                fact = result.get('fact', {})
                fact_id = fact.get('id')

                results.append(IngestionResult(
                    file_id=None,  # REST API doesn't track files
                    facts_created=1 if fact_id else 0,
                    relations_created=0,  # REST API doesn't auto-create relations
                    fact_ids=[fact_id] if fact_id else [],
                    ingestion_time_ms=elapsed_ms,
                ))

                # Log with embedding status if sync_embedding was used
                embedding_status = ""
                if self.sync_embedding:
                    emb_generated = result.get('embedding_generated', False)
                    emb_model = result.get('embedding_model', '')
                    embedding_status = f" [embedding: {'✓' if emb_generated else '✗'}{' ' + emb_model if emb_model else ''}]"

                logger.info(
                    f"Ingested {filename}: fact {fact_id} in {elapsed_ms:.2f}ms{embedding_status}"
                )

            except Exception as e:
                logger.error(f"Failed to ingest {filename}: {e}")
                results.append(IngestionResult(
                    ingestion_time_ms=(time.time() - start_time) * 1000
                ))

        return results

    def query(
        self,
        question: str,
        namespace: Optional[str] = None,
        k: int = 5,
        search_mode: str = "hybrid"
    ) -> QueryResult:
        """
        Query facts via REST API POST /api/facts/search.

        Note: The REST API uses hybrid search by default.
        The search_mode parameter is accepted for API compatibility but ignored.

        Args:
            question: Search query
            namespace: Optional namespace filter
            k: Maximum results (capped at 100)
            search_mode: Ignored (always hybrid)

        Returns:
            Query results
        """
        start_time = time.time()

        # Cap k at 100
        k = min(k, 100)

        # When filtering by namespace, request more results since the search
        # endpoint returns global results and we filter client-side.
        # Request 10x to ensure we get enough namespace-matching results.
        search_k = k * 10 if namespace else k
        search_k = min(search_k, 100)

        try:
            # Include auth params for auto-user creation
            url = f"{self.api_url}/api/facts/search?workspace_id={self.workspace_id}&username={self.username}&email={self.email}"
            payload = {
                'query': question,
                'k': search_k,
                'include_trashed': False,
            }

            response = self.session.post(
                url,
                json=payload,
                timeout=self.timeout
            )
            response.raise_for_status()

            result = response.json()
            elapsed_ms = (time.time() - start_time) * 1000

            # Parse results
            hits = result.get('hits', [])
            results = []
            filtered_count = 0

            # Debug: log first few hits to understand namespace distribution
            if namespace and len(hits) > 0:
                sample_namespaces = [hit.get('metadata', {}).get('namespace', '<NONE>') for hit in hits[:5]]
                logger.debug(f"[DEBUG] First 5 hit namespaces: {sample_namespaces}")
                logger.debug(f"[DEBUG] Looking for namespace: {namespace}")

            for hit in hits:
                # Filter by namespace if specified
                if namespace:
                    hit_namespace = hit.get('metadata', {}).get('namespace')
                    if hit_namespace != namespace:
                        if filtered_count < 3:  # Log first 3 filtered hits
                            logger.debug(f"[DEBUG] Filtered fact {hit['id']}: namespace '{hit_namespace}' != '{namespace}'")
                        filtered_count += 1
                        continue

                results.append(FactResult(
                    id=hit['id'],
                    content=hit['content'],
                    score=hit.get('score', 1.0),
                    metadata=hit.get('metadata', {}),
                    created_at=hit.get('created_at'),
                ))

                # Stop once we have enough results
                if len(results) >= k:
                    break

            # Detailed benchmark logging
            logger.info(
                f"[BENCHMARK] Query completed: query='{question[:50]}...' "
                f"total_hits={len(hits)} filtered_out={filtered_count} "
                f"results_returned={len(results)} time={elapsed_ms:.2f}ms "
                f"top_score={results[0].score if results else 0:.4f} "
                f"namespace={namespace} k={k}"
            )

            return QueryResult(
                results=results,
                total_returned=len(results),
                query_time_ms=elapsed_ms,
            )

        except Exception as e:
            logger.error(f"Query failed: {e}")
            return QueryResult(
                query_time_ms=(time.time() - start_time) * 1000
            )

    def get_related_facts(
        self,
        fact_id: str,
        relation_type: Optional[str] = None
    ) -> RelationsQueryResult:
        """
        Get related facts via REST API GET /api/facts/:id/relations.

        Args:
            fact_id: Source fact ID
            relation_type: Optional relation type filter

        Returns:
            Relations and connected facts
        """
        try:
            # Extract fact key from full ID (e.g., "facts/123" -> "123")
            fact_key = fact_id.split('/')[-1] if '/' in fact_id else fact_id

            url = f"{self.api_url}/api/facts/{fact_key}/relations?workspace_id={self.workspace_id}&username={self.username}&email={self.email}"
            if relation_type:
                url += f"&type={relation_type}"

            response = self.session.get(url, timeout=self.timeout)
            response.raise_for_status()

            result = response.json()
            relations = []

            # REST API returns outgoing/incoming arrays, not 'relations'
            # outgoing: relations where this fact is the source
            # incoming: relations where this fact is the target
            outgoing_items = result.get('outgoing', [])
            incoming_items = result.get('incoming', [])

            for item in outgoing_items:
                # Each item has 'relation' and 'fact' nested objects
                rel = item.get('relation', {})
                fact_data = item.get('fact', {})

                relation_id = rel.get('id', rel.get('_id', ''))
                rel_type = rel.get('type', rel.get('relation_type', ''))
                to_fact_id = fact_data.get('id', fact_data.get('_id', ''))
                fact_content = fact_data.get('content', '')

                relations.append(RelationResult(
                    relation_id=relation_id,
                    relation_type=rel_type,
                    fact=FactResult(
                        id=to_fact_id,
                        content=fact_content,
                        score=1.0,
                        metadata=fact_data.get('metadata', {}),
                    )
                ))

            for item in incoming_items:
                rel = item.get('relation', {})
                fact_data = item.get('fact', {})

                relation_id = rel.get('id', rel.get('_id', ''))
                rel_type = rel.get('type', rel.get('relation_type', ''))
                from_fact_id = fact_data.get('id', fact_data.get('_id', ''))
                fact_content = fact_data.get('content', '')

                relations.append(RelationResult(
                    relation_id=relation_id,
                    relation_type=rel_type,
                    fact=FactResult(
                        id=from_fact_id,
                        content=fact_content,
                        score=1.0,
                        metadata=fact_data.get('metadata', {}),
                    )
                ))

            logger.info(f"Found {len(relations)} relations for fact {fact_id}")

            return RelationsQueryResult(relations=relations)

        except Exception as e:
            logger.warning(f"Failed to get relations for {fact_id}: {e}")
            return RelationsQueryResult()

    def consolidate_sync(
        self,
        fact_ids: Optional[List[str]] = None,
        embedding_threshold: float = 0.30,
        reranker_threshold: float = 0.40,
        max_facts: int = 100,
        timeout_seconds: int = 120,
    ) -> Dict[str, Any]:
        """
        Run synchronous consolidation to create FactRelations.

        This delegates to the actual CardConsolidator background worker
        via trigger-consolidation with wait=True, ensuring benchmarks
        test the real implementation (with sliding window, relation caps,
        reranker, etc.) rather than a simplified duplicate.

        Args:
            fact_ids: Optional list of specific fact IDs to consolidate
            embedding_threshold: Cosine similarity threshold (ignored - uses worker config)
            reranker_threshold: Cross-encoder score threshold (ignored - uses worker config)
            max_facts: Maximum facts to process (ignored - uses worker config)
            timeout_seconds: Max wait time for consolidation to complete (default: 120s)

        Returns:
            Dict with:
            - success: bool
            - status: str ('completed', 'pending', 'failed')
            - message: str
            - trigger_id: str
        """
        # Delegate to trigger_consolidation with wait=True to use actual CardConsolidator
        # This ensures benchmarks test the real implementation, not a simplified copy
        return self.trigger_consolidation(
            fact_ids=fact_ids,
            wait=True,
            timeout_seconds=timeout_seconds,
        )

    def query_with_graph_expansion(
        self,
        question: str,
        namespace: Optional[str] = None,
        initial_k: int = 10,
        final_k: int = 5,
        rerank_threshold: float = 0.30,
    ) -> QueryResult:
        """
        Query with graph-based fact expansion and reranking.

        Phase 2 of full pipeline integration:
        1. Initial vector search (over-fetch with initial_k)
        2. Graph expansion via get_related_facts()
        3. Rerank combined set against query
        4. Return top final_k results

        Args:
            question: Search query
            namespace: Optional namespace filter
            initial_k: Over-fetch amount for initial search (default: 10)
            final_k: Final number of results after reranking (default: 5)
            rerank_threshold: Minimum reranker score to keep (default: 0.30)

        Returns:
            QueryResult with reranked facts
        """
        start_time = time.time()

        # Step 1: Initial vector search (over-fetch)
        initial_results = self.query(question, namespace, k=initial_k)

        if not initial_results.results:
            return initial_results

        # Step 2: Graph expansion (1-hop)
        expanded_facts: Dict[str, FactResult] = {}
        for fact in initial_results.results:
            expanded_facts[fact.id] = fact

            # Get related facts
            relations = self.get_related_facts(fact.id)
            for rel in relations.relations:
                if rel.fact.id not in expanded_facts:
                    # Filter by namespace if specified
                    if namespace:
                        fact_namespace = rel.fact.metadata.get('namespace')
                        if fact_namespace != namespace:
                            continue
                    expanded_facts[rel.fact.id] = rel.fact

        all_facts = list(expanded_facts.values())
        logger.info(
            f"Graph expansion: {len(initial_results.results)} initial -> {len(all_facts)} expanded"
        )

        # Step 3: Rerank against query
        reranked = self._rerank_for_query(question, all_facts, threshold=rerank_threshold)

        # Step 4: Return top-K
        final_results = reranked[:final_k] if len(reranked) > final_k else reranked
        elapsed_ms = (time.time() - start_time) * 1000

        logger.info(
            f"Graph query: {len(final_results)} results after reranking in {elapsed_ms:.2f}ms"
        )

        return QueryResult(
            results=final_results,
            total_returned=len(final_results),
            query_time_ms=elapsed_ms,
        )

    def _rerank_for_query(
        self,
        query: str,
        facts: List[FactResult],
        threshold: float = 0.30,
    ) -> List[FactResult]:
        """
        Rerank facts against a query using the cross-encoder.

        Args:
            query: The question to rerank against
            facts: List of facts to rerank
            threshold: Minimum score to keep (default: 0.30)

        Returns:
            List of facts sorted by reranker score (highest first)
        """
        if not facts:
            return facts

        reranker_url = os.environ.get('RERANKER_URL', 'http://localhost:8082')

        try:
            pairs = [{"fact_a": query, "fact_b": f.content} for f in facts]

            response = requests.post(
                f"{reranker_url}/rerank",
                json={"pairs": pairs, "threshold": threshold},
                timeout=30,
            )

            if response.status_code != 200:
                logger.warning(f"Reranker returned {response.status_code}, using original order")
                return facts

            results = response.json().get("results", [])

            # Build scored facts list
            scored_facts: List[Tuple[float, FactResult]] = []
            for r in results:
                if r.get("keep", False) and r.get("index", -1) < len(facts):
                    scored_facts.append((r["score"], facts[r["index"]]))

            # Sort by score descending
            scored_facts.sort(key=lambda x: x[0], reverse=True)

            reranked = [f for _, f in scored_facts]
            logger.debug(f"Reranked {len(facts)} -> {len(reranked)} facts (threshold={threshold})")

            return reranked

        except Exception as e:
            logger.warning(f"Reranker failed: {e}, using original order")
            return facts

    def trigger_consolidation(
        self,
        fact_ids: Optional[List[str]] = None,
        wait: bool = False,
        timeout_seconds: int = 60
    ) -> Dict[str, Any]:
        """
        Trigger card consolidation for workspace or specific facts.

        This triggers the CardConsolidator background worker which:
        1. Finds similar fact pairs using embedding similarity
        2. Reranks with cross-encoder
        3. Creates FactRelation records
        4. Optionally creates KnowledgeCards

        Args:
            fact_ids: Optional list of specific fact IDs to consolidate
            wait: If True, wait for consolidation to complete (max 60s)
            timeout_seconds: Max wait time if wait=True

        Returns:
            Dict with status and trigger info
        """
        try:
            url = f"{self.api_url}/api/facts/trigger-consolidation?workspace_id={self.workspace_id}&username={self.username}&email={self.email}"
            payload = {
                'workspace_id': self.workspace_id,
                'wait': wait,
            }
            if fact_ids:
                payload['fact_ids'] = fact_ids
                logger.debug(f"Sending {len(fact_ids)} fact_ids to trigger-consolidation")
            else:
                logger.debug(f"No fact_ids provided to trigger-consolidation")

            response = self.session.post(
                url,
                json=payload,
                timeout=timeout_seconds + 10 if wait else self.timeout
            )
            response.raise_for_status()

            result = response.json()
            logger.info(f"Consolidation trigger: {result.get('status', 'unknown')} - {result.get('message', '')}")
            return result

        except Exception as e:
            logger.error(f"Failed to trigger consolidation: {e}")
            return {'success': False, 'error': str(e)}

    def wait_for_relations(
        self,
        fact_ids: List[str],
        min_relations: int = 1,
        timeout_seconds: int = 300,
        poll_interval: float = 5.0,
        sample_size: int = 10,
    ) -> Dict[str, Any]:
        """
        Wait for relations to actually exist in the database.

        Unlike trigger_consolidation(wait=True) which waits for trigger status,
        this method polls the actual relations endpoint to verify relations exist.
        This ensures the background worker has fully processed the facts.

        Args:
            fact_ids: List of fact IDs to check for relations
            min_relations: Minimum total relations required to consider done
            timeout_seconds: Max wait time (default: 5 minutes)
            poll_interval: Seconds between polls (default: 5s)
            sample_size: Number of facts to sample for relation checks

        Returns:
            Dict with:
            - success: bool
            - total_relations: int
            - facts_with_relations: int
            - elapsed_seconds: float
        """
        import random

        start_time = time.time()
        deadline = start_time + timeout_seconds

        # Sample facts to check (don't check all to avoid N queries)
        sample_facts = fact_ids[:sample_size] if len(fact_ids) <= sample_size else random.sample(fact_ids, sample_size)

        logger.info(f"Waiting for relations on {len(sample_facts)} sample facts (min={min_relations}, timeout={timeout_seconds}s)")

        while time.time() < deadline:
            total_relations = 0
            facts_with_relations = 0

            for fact_id in sample_facts:
                try:
                    relations = self.get_related_facts(fact_id)
                    n_relations = len(relations.relations)
                    total_relations += n_relations
                    if n_relations > 0:
                        facts_with_relations += 1
                except Exception as e:
                    logger.debug(f"Failed to get relations for {fact_id}: {e}")

            elapsed = time.time() - start_time
            logger.info(f"[{elapsed:.1f}s] Relations check: {total_relations} total, {facts_with_relations}/{len(sample_facts)} facts with relations")

            if total_relations >= min_relations:
                logger.info(f"✓ Found {total_relations} relations after {elapsed:.1f}s - pre-warm complete!")
                return {
                    'success': True,
                    'total_relations': total_relations,
                    'facts_with_relations': facts_with_relations,
                    'elapsed_seconds': elapsed,
                }

            # Wait before next poll
            time.sleep(poll_interval)

        elapsed = time.time() - start_time
        logger.warning(f"⚠ Timeout after {elapsed:.1f}s - only found {total_relations} relations")
        return {
            'success': False,
            'total_relations': total_relations,
            'facts_with_relations': facts_with_relations,
            'elapsed_seconds': elapsed,
        }

    def close(self) -> None:
        """Close HTTP session."""
        self.session.close()
        logger.info("Closed HTTP adapter")


# Mock Adapter for Testing
class MockKnowledgePlaneAdapter(KnowledgePlaneAdapter):
    """
    Mock adapter for testing without a live KnowledgePlane instance.

    This adapter simulates KnowledgePlane behavior using in-memory storage
    and simple keyword matching. Useful for unit tests and local development.
    """

    def __init__(self):
        """Initialize the mock adapter."""
        self.facts: Dict[str, Dict[str, Any]] = {}
        self.relations: Dict[str, Dict[str, Any]] = {}
        self.files: Dict[str, Dict[str, Any]] = {}
        self.workspace_id: Optional[str] = None
        self.initialized = False

    def initialize(
        self,
        mcp_url: str,
        api_key: str,
        workspace_id: str,
        user_id: str,
        **kwargs
    ) -> None:
        """Initialize mock adapter (no-op, just stores config)."""
        self.workspace_id = workspace_id
        self.initialized = True
        logger.info("Initialized mock adapter")

    def ingest_documents(
        self,
        documents: List[Dict[str, Any]],
        namespace: Optional[str] = None
    ) -> List[IngestionResult]:
        """
        Simulate document ingestion.

        Splits content into sentences as mock facts and creates
        sequential relations between them.
        """
        results = []

        for doc in documents:
            start_time = time.time()

            content = doc['content']
            filename = doc.get('filename', 'document.txt')
            metadata = doc.get('metadata', {})

            if namespace:
                metadata['namespace'] = namespace

            # Simple sentence splitting
            sentences = [
                s.strip()
                for s in content.replace('!', '.').replace('?', '.').split('.')
                if s.strip()
            ]

            fact_ids = []

            # Create facts
            for sentence in sentences:
                fact_id = f"fact_{len(self.facts)}"
                self.facts[fact_id] = {
                    'id': fact_id,
                    'content': sentence,
                    'metadata': metadata.copy(),
                    'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'embedding': self._generate_mock_embedding(),
                }
                fact_ids.append(fact_id)

            # Create sequential relations
            relation_count = 0
            for i in range(len(fact_ids) - 1):
                relation_id = f"rel_{len(self.relations)}"
                self.relations[relation_id] = {
                    'id': relation_id,
                    'from_fact': fact_ids[i],
                    'to_fact': fact_ids[i + 1],
                    'type': 'related_to',
                    'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                }
                relation_count += 1

            # Create file record
            file_id = f"file_{len(self.files)}"
            self.files[file_id] = {
                'id': file_id,
                'filename': filename,
                'fact_ids': fact_ids,
            }

            elapsed_ms = (time.time() - start_time) * 1000

            results.append(IngestionResult(
                file_id=file_id,
                facts_created=len(fact_ids),
                relations_created=relation_count,
                fact_ids=fact_ids,
                ingestion_time_ms=elapsed_ms,
            ))

            logger.info(
                f"Mock ingested {filename}: {len(fact_ids)} facts, "
                f"{relation_count} relations"
            )

        return results

    def query(
        self,
        question: str,
        namespace: Optional[str] = None,
        k: int = 5,
        search_mode: str = "hybrid"
    ) -> QueryResult:
        """
        Simulate fact search using keyword matching.

        Performs case-insensitive substring matching and assigns
        random scores for demonstration.
        """
        start_time = time.time()

        query_lower = question.lower()
        matches = []

        for fact_id, fact in self.facts.items():
            # Namespace filter
            if namespace:
                fact_namespace = fact.get('metadata', {}).get('namespace')
                if fact_namespace != namespace:
                    continue

            # Simple keyword matching
            content_lower = fact['content'].lower()
            if query_lower in content_lower:
                # Mock scoring based on position
                position = content_lower.index(query_lower)
                score = 1.0 / (position + 1)  # Earlier matches score higher

                matches.append((score, fact))

        # Sort by score descending
        matches.sort(key=lambda x: x[0], reverse=True)

        # Limit results
        matches = matches[:k]

        results = [
            FactResult(
                id=fact['id'],
                content=fact['content'],
                score=score,
                metadata=fact.get('metadata', {}),
                created_at=fact.get('created_at'),
            )
            for score, fact in matches
        ]

        elapsed_ms = (time.time() - start_time) * 1000

        logger.info(
            f"Mock query '{question}' returned {len(results)} results "
            f"in {elapsed_ms:.2f}ms"
        )

        return QueryResult(
            results=results,
            total_returned=len(results),
            query_time_ms=elapsed_ms,
        )

    def get_related_facts(
        self,
        fact_id: str,
        relation_type: Optional[str] = None
    ) -> RelationsQueryResult:
        """
        Get related facts from mock storage.

        Returns outgoing relations from the specified fact.
        """
        relations = []

        for rel_id, rel in self.relations.items():
            if rel['from_fact'] == fact_id:
                # Type filter
                if relation_type and rel['type'] != relation_type:
                    continue

                # Get target fact
                target_id = rel['to_fact']
                if target_id in self.facts:
                    target_fact = self.facts[target_id]

                    relations.append(RelationResult(
                        relation_id=rel_id,
                        relation_type=rel['type'],
                        fact=FactResult(
                            id=target_fact['id'],
                            content=target_fact['content'],
                            score=1.0,
                            metadata=target_fact.get('metadata', {}),
                            created_at=target_fact.get('created_at'),
                        )
                    ))

        logger.info(f"Mock found {len(relations)} relations for fact {fact_id}")

        return RelationsQueryResult(relations=relations)

    def close(self) -> None:
        """Clean up mock adapter (no-op)."""
        logger.info("Closed mock adapter")

    def _generate_mock_embedding(self) -> List[float]:
        """Generate random 1536-dim embedding for testing."""
        import random
        return [random.random() - 0.5 for _ in range(1536)]


# Helper Functions
def create_benchmark_workspace(
    name: str,
    db_url: str = "http://localhost:8529",
    db_name: str = "knowledgeplane",
    db_user: str = "root",
    db_password: str = "root"
) -> Tuple[str, str, str]:
    """
    Create an isolated workspace for benchmarking.

    This function directly creates a workspace, user, and API key in the
    KnowledgePlane database for benchmarking purposes.

    Args:
        name: Workspace name (will be slugified)
        db_url: ArangoDB URL
        db_name: Database name
        db_user: Database user
        db_password: Database password

    Returns:
        Tuple of (workspace_id, user_id, api_key)

    Raises:
        ImportError: If python-arango is not installed
        Exception: On database connection or creation errors
    """
    try:
        from arango import ArangoClient
        import uuid
    except ImportError:
        raise ImportError(
            "python-arango is required for workspace creation. "
            "Install with: pip install python-arango"
        )

    # Connect to ArangoDB
    client = ArangoClient(hosts=db_url)
    db = client.db(db_name, username=db_user, password=db_password)

    # Generate IDs
    workspace_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    api_key = f"bench_{uuid.uuid4().hex[:24]}"

    slug = name.lower().replace(' ', '-')
    timestamp = time.strftime('%Y-%m-%dT%H:%M:%SZ')

    # Create workspace
    workspace_doc = {
        '_key': workspace_id,
        'id': workspace_id,
        'slug': slug,
        'name': name,
        'created_by': user_id,
        'created_at': timestamp,
        'updated_at': timestamp,
    }
    db.collection('workspaces').insert(workspace_doc)
    logger.info(f"Created workspace: {workspace_id} ({name})")

    # Create user
    user_doc = {
        '_key': user_id,
        'id': user_id,
        'username': f'bench_{slug}',
        'api_key': api_key,
        'created_at': timestamp,
        'updated_at': timestamp,
    }
    db.collection('users').insert(user_doc)
    logger.info(f"Created user: {user_id}")

    # Add user to workspace
    member_doc = {
        'workspace_id': workspace_id,
        'user_id': user_id,
        'role': 'admin',
        'created_at': timestamp,
    }
    db.collection('workspace_members').insert(member_doc)
    logger.info(f"Added user to workspace")

    return workspace_id, user_id, api_key


def cleanup_benchmark_data(
    workspace_id: str,
    db_url: str = "http://localhost:8529",
    db_name: str = "knowledgeplane",
    db_user: str = "root",
    db_password: str = "root"
) -> None:
    """
    Clean up benchmark workspace and all associated data.

    Deletes all facts, relations, files, and the workspace itself.
    Use with caution - this is irreversible!

    Args:
        workspace_id: Workspace ID to delete
        db_url: ArangoDB URL
        db_name: Database name
        db_user: Database user
        db_password: Database password

    Raises:
        ImportError: If python-arango is not installed
    """
    try:
        from arango import ArangoClient
    except ImportError:
        raise ImportError(
            "python-arango is required for cleanup. "
            "Install with: pip install python-arango"
        )

    # Connect to ArangoDB
    client = ArangoClient(hosts=db_url)
    db = client.db(db_name, username=db_user, password=db_password)

    # Delete facts
    result = db.aql.execute(
        'FOR doc IN facts FILTER doc.workspace_id == @wid REMOVE doc IN facts',
        bind_vars={'wid': workspace_id}
    )
    logger.info(f"Deleted facts for workspace {workspace_id}")

    # Delete relations
    result = db.aql.execute(
        'FOR doc IN relations FILTER doc.workspace_id == @wid REMOVE doc IN relations',
        bind_vars={'wid': workspace_id}
    )
    logger.info(f"Deleted relations for workspace {workspace_id}")

    # Delete knowledge cards
    result = db.aql.execute(
        'FOR doc IN knowledge_cards FILTER doc.workspace_id == @wid REMOVE doc IN knowledge_cards',
        bind_vars={'wid': workspace_id}
    )
    logger.info(f"Deleted knowledge cards for workspace {workspace_id}")

    # Delete files
    result = db.aql.execute(
        'FOR doc IN files FILTER doc.workspace_id == @wid REMOVE doc IN files',
        bind_vars={'wid': workspace_id}
    )
    logger.info(f"Deleted files for workspace {workspace_id}")

    # Delete workspace members
    result = db.aql.execute(
        'FOR doc IN workspace_members FILTER doc.workspace_id == @wid REMOVE doc IN workspace_members',
        bind_vars={'wid': workspace_id}
    )
    logger.info(f"Deleted workspace members for workspace {workspace_id}")

    # Delete workspace
    result = db.aql.execute(
        'FOR doc IN workspaces FILTER doc.id == @wid REMOVE doc IN workspaces',
        bind_vars={'wid': workspace_id}
    )
    logger.info(f"Deleted workspace {workspace_id}")


def wait_for_embeddings(
    fact_ids: List[str],
    db_url: str = "http://localhost:8529",
    db_name: str = "knowledgeplane",
    db_user: str = "root",
    db_password: str = "root",
    timeout_seconds: int = 60,
    poll_interval: float = 2.0
) -> Tuple[int, int]:
    """
    Wait for embeddings to be generated for a list of facts.

    The background worker generates embeddings asynchronously. This function
    polls the database until embeddings are ready or timeout is reached.

    Args:
        fact_ids: List of fact IDs to check
        db_url: ArangoDB URL
        db_name: Database name
        db_user: Database user
        db_password: Database password
        timeout_seconds: Maximum time to wait
        poll_interval: Time between checks in seconds

    Returns:
        Tuple of (facts_with_embeddings, facts_without_embeddings)
    """
    import requests

    if not fact_ids:
        return 0, 0

    start_time = time.time()
    with_emb = 0
    without_emb = len(fact_ids)

    while time.time() - start_time < timeout_seconds:
        try:
            # Check embedding status for all facts
            url = f"{db_url}/_db/{db_name}/_api/cursor"

            # AQL query to count facts with and without embeddings
            query = {
                "query": """
                    LET ids = @fact_ids
                    LET with_emb = (
                        FOR f IN facts
                        FILTER f._key IN ids AND f.embedding != null AND LENGTH(f.embedding) > 0
                        RETURN 1
                    )
                    LET without_emb = (
                        FOR f IN facts
                        FILTER f._key IN ids AND (f.embedding == null OR LENGTH(f.embedding) == 0)
                        RETURN 1
                    )
                    RETURN { with_embeddings: LENGTH(with_emb), without_embeddings: LENGTH(without_emb) }
                """,
                "bindVars": {"fact_ids": fact_ids}
            }

            response = requests.post(url, json=query, auth=(db_user, db_password), timeout=10)

            if response.status_code == 200:
                result = response.json().get("result", [{}])[0]
                with_emb = result.get("with_embeddings", 0)
                without_emb = result.get("without_embeddings", 0)

                logger.debug(f"Embedding status: {with_emb}/{len(fact_ids)} ready, {without_emb} pending")

                # All facts have embeddings
                if without_emb == 0:
                    logger.info(f"All {with_emb} facts have embeddings ready")
                    return with_emb, 0

        except Exception as e:
            logger.debug(f"Embedding check failed: {e}")

        time.sleep(poll_interval)

    # Timeout - return current status
    logger.warning(f"Embedding wait timeout after {timeout_seconds}s")
    return with_emb, without_emb


def check_workspace_isolation(
    workspace_id: str,
    db_url: str = "http://localhost:8529",
    db_name: str = "knowledgeplane",
    db_user: str = "root",
    db_password: str = "root"
) -> Dict[str, Any]:
    """
    Check workspace isolation status for benchmarking.

    Returns information about the workspace to help determine if it's safe
    to use for benchmarking (i.e., won't pollute production data).

    Args:
        workspace_id: Workspace ID to check
        db_url: ArangoDB URL
        db_name: Database name
        db_user: Database user
        db_password: Database password

    Returns:
        Dict with workspace status including:
        - exists: bool
        - fact_count: int
        - benchmark_fact_count: int (facts with benchmark namespaces)
        - is_dedicated_benchmark: bool
    """
    import requests

    result = {
        "exists": False,
        "fact_count": 0,
        "benchmark_fact_count": 0,
        "non_benchmark_fact_count": 0,
        "is_dedicated_benchmark": False,
        "workspace_name": None,
    }

    try:
        url = f"{db_url}/_db/{db_name}/_api/cursor"

        # Check if workspace exists
        ws_query = {
            "query": "FOR w IN workspaces FILTER w._key == @wid OR w.id == @wid RETURN w",
            "bindVars": {"wid": workspace_id}
        }
        response = requests.post(url, json=ws_query, auth=(db_user, db_password), timeout=10)

        if response.status_code == 200:
            workspaces = response.json().get("result", [])
            if workspaces:
                result["exists"] = True
                result["workspace_name"] = workspaces[0].get("name", "unknown")

        # Count facts in workspace
        count_query = {
            "query": """
                LET all_facts = (FOR f IN facts FILTER f.workspace_id == @wid RETURN f)
                LET bench_facts = (FOR f IN facts FILTER f.workspace_id == @wid AND
                    (STARTS_WITH(f.metadata.namespace, 'msmarco_') OR
                     STARTS_WITH(f.metadata.namespace, 'hotpotqa_') OR
                     STARTS_WITH(f.metadata.namespace, 'benchmark_'))
                    RETURN f)
                RETURN {
                    total: LENGTH(all_facts),
                    benchmark: LENGTH(bench_facts)
                }
            """,
            "bindVars": {"wid": workspace_id}
        }
        response = requests.post(url, json=count_query, auth=(db_user, db_password), timeout=10)

        if response.status_code == 200:
            counts = response.json().get("result", [{}])[0]
            result["fact_count"] = counts.get("total", 0)
            result["benchmark_fact_count"] = counts.get("benchmark", 0)
            result["non_benchmark_fact_count"] = result["fact_count"] - result["benchmark_fact_count"]

            # Consider it a dedicated benchmark workspace if:
            # - All facts are benchmark facts, OR
            # - Workspace name contains 'benchmark'
            result["is_dedicated_benchmark"] = (
                result["non_benchmark_fact_count"] == 0 or
                (result["workspace_name"] and "benchmark" in result["workspace_name"].lower())
            )

    except Exception as e:
        logger.error(f"Failed to check workspace isolation: {e}")

    return result


def _get_arango_url() -> str:
    """
    Get the ArangoDB URL, handling Docker environment detection.

    Priority:
    1. ARANGO_URL environment variable (explicit override)
    2. host.docker.internal if running in Docker
    3. localhost (default for local execution)
    """
    import os

    # Check explicit override
    if os.environ.get("ARANGO_URL"):
        return os.environ["ARANGO_URL"]

    # Check if running in Docker (/.dockerenv exists in containers)
    if os.path.exists("/.dockerenv"):
        return "http://host.docker.internal:8529"

    # Default for local execution
    return "http://localhost:8529"


def cleanup_benchmark_facts_by_prefix(
    namespace_prefix: str,
    db_url: str = None,  # Auto-detect if None
    db_name: str = "knowledgeplane",
    db_user: str = "root",
    db_password: str = "root"
) -> int:
    """
    Delete all facts with namespaces starting with a given prefix.

    This is useful to clean up old benchmark data before a new run.

    NOTE: Automatically detects Docker environment and uses host.docker.internal
    to reach the host's ArangoDB when running inside a container.

    Args:
        namespace_prefix: Prefix to match (e.g., "msmarco_" or "hotpotqa_")
        db_url: ArangoDB URL (auto-detected if None)
        db_name: Database name
        db_user: Database user
        db_password: Database password

    Returns:
        Number of facts deleted
    """
    import requests
    import os

    # Auto-detect URL if not provided
    if db_url is None:
        db_url = _get_arango_url()

    logger.debug(f"Cleanup using ArangoDB at: {db_url}")

    try:
        # Use AQL to delete facts with matching namespace prefix
        url = f"{db_url}/_db/{db_name}/_api/cursor"

        # First count how many will be deleted
        count_query = {
            "query": f"FOR f IN facts FILTER STARTS_WITH(f.metadata.namespace, @prefix) RETURN 1",
            "bindVars": {"prefix": namespace_prefix}
        }
        response = requests.post(url, json=count_query, auth=(db_user, db_password), timeout=30)

        if response.status_code != 201:
            logger.warning(f"ArangoDB query failed (status {response.status_code}): {response.text[:200]}")
            return 0

        count = len(response.json().get("result", []))

        if count == 0:
            logger.info(f"No facts found with namespace prefix '{namespace_prefix}'")
            return 0

        # Delete the facts
        delete_query = {
            "query": f"FOR f IN facts FILTER STARTS_WITH(f.metadata.namespace, @prefix) REMOVE f IN facts RETURN 1",
            "bindVars": {"prefix": namespace_prefix}
        }
        response = requests.post(url, json=delete_query, auth=(db_user, db_password), timeout=60)

        if response.status_code != 201:
            logger.warning(f"ArangoDB delete failed (status {response.status_code}): {response.text[:200]}")
            return 0

        deleted = len(response.json().get("result", []))

        logger.info(f"Deleted {deleted} facts with namespace prefix '{namespace_prefix}'")
        return deleted

    except requests.exceptions.ConnectionError as e:
        logger.error(f"Cannot connect to ArangoDB at {db_url}: {e}")
        logger.info("Hint: If running in Docker, ensure host.docker.internal is reachable")
        return 0
    except Exception as e:
        logger.error(f"Failed to cleanup benchmark facts: {e}")
        return 0


def ensure_workspace_exists(
    workspace_id: str,
    db_url: str = None,  # Auto-detect if None
    db_name: str = "knowledgeplane",
    db_user: str = "root",
    db_password: str = "root",
    workspace_name: Optional[str] = None
) -> bool:
    """
    Ensure a workspace exists, creating it if necessary.

    This allows benchmarks to work with arbitrary workspace IDs without
    requiring manual setup.

    NOTE: Automatically detects Docker environment and uses host.docker.internal
    to reach the host's ArangoDB when running inside a container.

    Args:
        workspace_id: Workspace ID (can be "workspaces/xxx" or just "xxx")
        db_url: ArangoDB URL (auto-detected if None)
        db_name: Database name
        db_user: Database user
        db_password: Database password
        workspace_name: Optional human-readable name for the workspace

    Returns:
        True if workspace exists (or was created), False on failure
    """
    import requests
    import time

    # Auto-detect URL if not provided
    if db_url is None:
        db_url = _get_arango_url()

    # Normalize workspace_id - extract the key part
    ws_key = workspace_id.replace("workspaces/", "") if "/" in workspace_id else workspace_id

    logger.debug(f"Ensuring workspace {ws_key} exists at {db_url}")

    try:
        url = f"{db_url}/_db/{db_name}/_api/cursor"

        # Check if workspace already exists
        check_query = {
            "query": "FOR w IN workspaces FILTER w._key == @wid RETURN w._key",
            "bindVars": {"wid": ws_key}
        }
        response = requests.post(url, json=check_query, auth=(db_user, db_password), timeout=10)

        if response.status_code == 200:
            result = response.json().get("result", [])
            if result:
                logger.debug(f"Workspace {ws_key} already exists")
                return True

        # Create the workspace
        name = workspace_name or f"Benchmark Workspace {ws_key[:8]}"
        create_url = f"{db_url}/_db/{db_name}/_api/document/workspaces"

        workspace_doc = {
            "_key": ws_key,
            "name": name,
            "description": "Auto-created for benchmarking",
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "settings": {}
        }

        response = requests.post(
            create_url,
            json=workspace_doc,
            auth=(db_user, db_password),
            timeout=10
        )

        if response.status_code in (201, 202):
            logger.info(f"Created workspace: {ws_key} ({name})")
            return True
        else:
            logger.warning(f"Failed to create workspace: {response.text}")
            return False

    except Exception as e:
        logger.error(f"Failed to ensure workspace exists: {e}")
        return False

    except Exception as e:
        logger.error(f"Failed to cleanup benchmark facts: {e}")
        return 0


# Factory function
def create_adapter(adapter_type: str = "mock") -> KnowledgePlaneAdapter:
    """
    Factory function to create an adapter instance.

    Args:
        adapter_type: Type of adapter - "http" or "mock"

    Returns:
        Adapter instance

    Raises:
        ValueError: If adapter_type is invalid
    """
    if adapter_type == "http":
        return HTTPKnowledgePlaneAdapter()
    elif adapter_type == "mock":
        return MockKnowledgePlaneAdapter()
    else:
        raise ValueError(f"Unknown adapter type: {adapter_type}")
