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
from typing import Any, Dict, List, Optional, Tuple
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
        self.session = requests.Session()
        self.timeout = 30  # seconds

    def initialize(
        self,
        mcp_url: str,
        api_key: str,
        workspace_id: str,
        user_id: str,
        timeout: int = 30,
        **kwargs
    ) -> None:
        """
        Initialize connection to MCP server.

        Args:
            mcp_url: Base URL of MCP server
            api_key: Bearer token for authentication
            workspace_id: Target workspace
            user_id: User for operations
            timeout: Request timeout in seconds
        """
        self.mcp_url = mcp_url.rstrip('/')
        self.api_key = api_key
        self.workspace_id = workspace_id
        self.user_id = user_id
        self.timeout = timeout

        # Set authentication header
        self.session.headers.update({
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        })

        logger.info(f"Initialized HTTP adapter for {mcp_url}")

    def _call_tool(
        self,
        tool_name: str,
        arguments: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Call an MCP tool via HTTP.

        Args:
            tool_name: Name of the tool to call
            arguments: Tool arguments

        Returns:
            Parsed response data

        Raises:
            requests.RequestException: On HTTP errors
            ValueError: On invalid response format
        """
        url = urljoin(self.mcp_url + '/', 'tools/call')

        payload = {
            'name': tool_name,
            'arguments': arguments,
        }

        try:
            response = self.session.post(
                url,
                json=payload,
                timeout=self.timeout
            )
            response.raise_for_status()

            result = response.json()

            # MCP tool responses have content array with text
            if 'content' in result and len(result['content']) > 0:
                content_text = result['content'][0].get('text', '{}')
                return json.loads(content_text)

            return result

        except requests.RequestException as e:
            logger.error(f"HTTP request failed for tool {tool_name}: {e}")
            raise
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"Failed to parse response for tool {tool_name}: {e}")
            raise ValueError(f"Invalid response format: {e}")

    def ingest_documents(
        self,
        documents: List[Dict[str, Any]],
        namespace: Optional[str] = None
    ) -> List[IngestionResult]:
        """
        Ingest documents via files_upload tool.

        Each document should contain:
        - content: Raw text content
        - filename: Name of the file
        - mimeType: MIME type (default: text/plain)
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

            # Add namespace to metadata
            if namespace:
                metadata['namespace'] = namespace

            # Encode content as base64
            content_bytes = content.encode('utf-8')
            base64_data = base64.b64encode(content_bytes).decode('utf-8')

            # Call files_upload tool
            try:
                response = self._call_tool('files_upload', {
                    'filename': filename,
                    'mimeType': mime_type,
                    'data': base64_data,
                })

                elapsed_ms = (time.time() - start_time) * 1000

                # Extract fact IDs from response
                fact_ids = []
                if 'facts' in response:
                    fact_ids = [f['id'] for f in response['facts']]

                results.append(IngestionResult(
                    file_id=response.get('file', {}).get('id'),
                    facts_created=response.get('factsCreated', 0),
                    relations_created=response.get('relationsCreated', 0),
                    fact_ids=fact_ids,
                    ingestion_time_ms=elapsed_ms,
                ))

                logger.info(
                    f"Ingested {filename}: {response.get('factsCreated', 0)} facts, "
                    f"{response.get('relationsCreated', 0)} relations in {elapsed_ms:.2f}ms"
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
        Query facts via facts_search tool.

        Note: The MCP tool does not expose search mode selection.
        It always uses hybrid search by default. The search_mode
        parameter is accepted for API compatibility but ignored.

        Args:
            question: Search query
            namespace: Optional namespace filter (not implemented in KP)
            k: Maximum results (capped at 20)
            search_mode: Ignored (always hybrid)

        Returns:
            Query results
        """
        start_time = time.time()

        # Cap k at 20 (KP limitation)
        k = min(k, 20)

        try:
            response = self._call_tool('facts_search', {
                'query': question,
                'k': k,
                'include_trashed': False,
            })

            elapsed_ms = (time.time() - start_time) * 1000

            # Parse results
            hits = response.get('hits', [])
            results = []

            for hit in hits:
                # Filter by namespace if specified
                if namespace:
                    hit_namespace = hit.get('metadata', {}).get('namespace')
                    if hit_namespace != namespace:
                        continue

                results.append(FactResult(
                    id=hit['id'],
                    content=hit['content'],
                    score=hit.get('score', 1.0),
                    metadata=hit.get('metadata', {}),
                    created_at=hit.get('created_at'),
                ))

            logger.info(
                f"Query '{question}' returned {len(results)} results in {elapsed_ms:.2f}ms"
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
        Get related facts via fact_relations_get_related tool.

        Args:
            fact_id: Source fact ID
            relation_type: Optional relation type filter

        Returns:
            Relations and connected facts
        """
        try:
            args = {'factId': fact_id}
            if relation_type:
                args['relationType'] = relation_type

            response = self._call_tool('fact_relations_get_related', args)

            relations = []
            for item in response.get('relations', []):
                relation = item.get('relation', {})
                fact_data = item.get('fact', {})

                relations.append(RelationResult(
                    relation_id=relation.get('id', ''),
                    relation_type=relation.get('type', ''),
                    fact=FactResult(
                        id=fact_data.get('id', ''),
                        content=fact_data.get('content', ''),
                        score=1.0,
                        metadata=fact_data.get('metadata', {}),
                        created_at=fact_data.get('created_at'),
                    )
                ))

            logger.info(f"Found {len(relations)} relations for fact {fact_id}")

            return RelationsQueryResult(relations=relations)

        except Exception as e:
            logger.error(f"Failed to get relations for {fact_id}: {e}")
            return RelationsQueryResult()

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
