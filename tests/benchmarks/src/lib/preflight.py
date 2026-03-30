#!/usr/bin/env python3
"""
Shared Preflight Check Module for KnowledgePlane Benchmarks

This module consolidates common preflight checks across all benchmarks:
- HotpotQA, LongMemEval, RelationRecall, MSMARCO, Freshness

Usage:
    from lib.preflight import PreflightChecker, PreflightConfig

    checker = PreflightChecker(PreflightConfig(
        check_database=True,
        check_vector_index=True,
        auto_fix_vector_index=True,
    ))

    if not checker.run():
        sys.exit(1)
"""

import logging
import os
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import requests

logger = logging.getLogger(__name__)


@dataclass
class PreflightConfig:
    """Configuration for preflight checks."""

    # Which checks to run
    check_rest_api: bool = True
    check_database: bool = True
    check_vector_index: bool = True
    check_workspace_setup: bool = True  # Seed workspace/user/membership
    check_credentials: bool = True
    check_openai: bool = True
    check_background_worker: bool = True

    # Auto-fix options
    auto_fix_vector_index: bool = True
    auto_create_workspace: bool = True  # Create workspace/user if missing

    # Timeouts
    timeout_seconds: int = 5

    # Database config
    arango_url: Optional[str] = None
    arango_user: str = "root"
    arango_password: str = "root"
    arango_db: str = "knowledgeplane"

    # API config
    api_url: Optional[str] = None


@dataclass
class PreflightResult:
    """Result of preflight checks."""
    passed: bool
    checks_run: int
    checks_passed: int
    checks_failed: int
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


class PreflightChecker:
    """
    Unified preflight checker for KnowledgePlane benchmarks.

    Consolidates ~200 lines of duplicated preflight code across benchmarks
    into a single, reusable module.
    """

    def __init__(self, config: Optional[PreflightConfig] = None):
        self.config = config or PreflightConfig()
        self.warnings: List[str] = []
        self.errors: List[str] = []
        self._db_url: Optional[str] = None
        self._db_accessible: bool = False

    def run(self, mock_mode: bool = False) -> bool:
        """
        Run all configured preflight checks.

        Args:
            mock_mode: If True, skip service checks (for mock/test runs)

        Returns:
            True if all critical checks pass, False otherwise
        """
        if mock_mode:
            logger.info("✓ Preflight: Mock mode enabled, skipping service checks")
            return True

        checks = []

        if self.config.check_rest_api:
            checks.append(("REST API", self._check_rest_api))
        if self.config.check_database:
            checks.append(("ArangoDB", self._check_database))
        if self.config.check_vector_index:
            checks.append(("Vector Index", self._check_vector_index))
        if self.config.check_workspace_setup:
            checks.append(("Workspace Setup", self._check_workspace_setup))
        if self.config.check_credentials:
            checks.append(("API Credentials", self._check_credentials))
        if self.config.check_openai:
            checks.append(("OpenAI", self._check_openai))
        if self.config.check_background_worker:
            checks.append(("Background Worker", self._check_background_worker))

        total = len(checks)
        passed = 0
        failed = 0

        logger.info("=" * 60)
        logger.info(f"Running Preflight Checks ({total} checks)")
        logger.info("=" * 60)

        for i, (name, check_fn) in enumerate(checks, 1):
            logger.info(f"[{i}/{total}] {name}...")
            try:
                success, msg = check_fn()
                if success:
                    logger.info(f"  ✓ {msg}")
                    passed += 1
                else:
                    logger.error(f"  ✗ {msg}")
                    self.errors.append(f"{name}: {msg}")
                    failed += 1
            except Exception as e:
                logger.error(f"  ✗ Check failed with exception: {e}")
                self.errors.append(f"{name}: {str(e)}")
                failed += 1

        # Summary
        logger.info("=" * 60)
        all_passed = failed == 0

        if all_passed:
            logger.info(f"✓ All {passed}/{total} critical checks passed")
            if self.warnings:
                logger.info(f"  Warnings ({len(self.warnings)}): {', '.join(self.warnings[:3])}")
        else:
            logger.error(f"✗ PREFLIGHT FAILED: {failed}/{total} checks failed")
            for error in self.errors:
                logger.error(f"  - {error}")
            logger.error("  Quick fix: npm run dev && source .env.benchmark")

        logger.info("=" * 60)

        return all_passed

    def get_result(self) -> PreflightResult:
        """Get detailed preflight result."""
        return PreflightResult(
            passed=len(self.errors) == 0,
            checks_run=len(self.warnings) + len(self.errors),
            checks_passed=len(self.warnings),
            checks_failed=len(self.errors),
            warnings=self.warnings.copy(),
            errors=self.errors.copy(),
        )

    def _get_api_url(self) -> str:
        """Get REST API URL from config or environment."""
        return self.config.api_url or os.environ.get("KP_API_URL", "http://localhost:8081")

    def _get_arango_url(self) -> str:
        """Get ArangoDB URL from config or environment."""
        return self.config.arango_url or os.environ.get("ARANGO_URL", "http://localhost:8529")

    def _check_rest_api(self) -> Tuple[bool, str]:
        """Check if REST API is accessible and healthy."""
        api_url = self._get_api_url()

        try:
            response = requests.get(
                f"{api_url}/health",
                timeout=self.config.timeout_seconds
            )
            if response.status_code == 200:
                return True, f"REST API at {api_url} is healthy"
            else:
                return False, f"REST API returned status {response.status_code}"
        except requests.exceptions.ConnectionError:
            return False, f"Cannot connect to REST API at {api_url}. Start with: npm run dev"
        except Exception as e:
            return False, f"REST API check failed: {e}"

    def _check_database(self) -> Tuple[bool, str]:
        """Check if ArangoDB is accessible."""
        arango_url = self._get_arango_url()

        # Try multiple URLs for Docker compatibility
        urls_to_try = [
            arango_url.replace("localhost", "host.docker.internal"),
            arango_url,
        ]

        for try_url in urls_to_try:
            try:
                response = requests.get(
                    f"{try_url}/_api/version",
                    auth=(self.config.arango_user, self.config.arango_password),
                    timeout=self.config.timeout_seconds
                )
                if response.status_code == 200:
                    version = response.json().get("version", "unknown")
                    self._db_url = try_url
                    self._db_accessible = True
                    return True, f"ArangoDB v{version} accessible at {try_url}"
            except:
                continue

        self.warnings.append("Database direct access not verified")
        return True, "ArangoDB not directly accessible (may work via REST API)"

    def _check_vector_index(self) -> Tuple[bool, str]:
        """Check vector index status and auto-fix if needed."""
        if not self._db_accessible:
            self.warnings.append("Vector index not checked (no DB access)")
            return True, "Skipped (no direct DB access)"

        db_url = self._db_url
        db_name = self.config.arango_db
        auth = (self.config.arango_user, self.config.arango_password)

        try:
            # Check if blocking vector index exists
            response = requests.get(
                f"{db_url}/_db/{db_name}/_api/index/facts/idx_facts_embedding_vector",
                auth=auth,
                timeout=self.config.timeout_seconds
            )

            if response.status_code == 200:
                # Blocking index found
                if self.config.auto_fix_vector_index:
                    # Auto-drop the blocking index
                    del_response = requests.delete(
                        f"{db_url}/_db/{db_name}/_api/index/facts/idx_facts_embedding_vector",
                        auth=auth,
                        timeout=self.config.timeout_seconds
                    )
                    if del_response.status_code == 200:
                        return True, "Blocking vector index found and auto-dropped"
                    else:
                        self.warnings.append("Could not auto-drop vector index")
                        return True, "Blocking vector index found (manual drop recommended)"
                else:
                    self.warnings.append("Blocking vector index may prevent inserts")
                    return True, "Blocking vector index found (auto-fix disabled)"
            elif response.status_code == 404:
                return True, "No blocking vector index"
            else:
                return True, "Vector index check passed"

        except Exception as e:
            self.warnings.append(f"Vector index status unknown: {e}")
            return True, f"Could not verify vector index: {e}"

    def _check_workspace_setup(self) -> Tuple[bool, str]:
        """
        Ensure benchmark workspace, user, and membership exist.

        Creates them if missing (idempotent).
        This fixes the "workspace_id is required or must be inferred from auth" error
        by ensuring the user is a member of the workspace.
        """
        if not self._db_accessible:
            self.warnings.append("Workspace setup not verified (no DB access)")
            return True, "Skipped (no direct DB access)"

        if not self.config.auto_create_workspace:
            return True, "Auto-create disabled"

        db_url = self._db_url
        db_name = self.config.arango_db
        auth = (self.config.arango_user, self.config.arango_password)

        # Get IDs from environment
        workspace_id = os.environ.get("KP_WORKSPACE_ID", "benchmark-test-workspace-123")
        user_id = os.environ.get("KP_USER_ID", "benchmark-user")
        api_key = os.environ.get("KP_API_KEY", "bench_4d4e2e4eebfa49a68ede6114")

        # Normalize IDs (remove prefix if present for _key)
        workspace_key = workspace_id.replace("workspaces/", "")
        user_key = user_id.replace("users/", "")

        now = self._get_iso_timestamp()
        created = []

        try:
            # 1. Create user if not exists
            user_exists = self._document_exists(db_url, db_name, auth, "users", user_key)
            if not user_exists:
                user_doc = {
                    "_key": user_key,
                    "username": "benchmark-user",
                    "email": "benchmark@test.local",
                    "api_key": api_key,
                    "created_at": now,
                    "updated_at": now,
                }
                self._create_document(db_url, db_name, auth, "users", user_doc)
                created.append("user")

            # 2. Create workspace if not exists
            ws_exists = self._document_exists(db_url, db_name, auth, "workspaces", workspace_key)
            if not ws_exists:
                ws_doc = {
                    "_key": workspace_key,
                    "name": "Benchmark Workspace",
                    "slug": "benchmark-workspace",
                    "description": "Test workspace for benchmarking suite",
                    "created_by": f"users/{user_key}",
                    "created_at": now,
                    "updated_at": now,
                }
                self._create_document(db_url, db_name, auth, "workspaces", ws_doc)
                created.append("workspace")

            # 3. Create workspace membership if not exists
            member_key = f"{workspace_key}_{user_key}"
            member_exists = self._document_exists(db_url, db_name, auth, "workspace_members", member_key)
            if not member_exists:
                member_doc = {
                    "_key": member_key,
                    "workspace_id": f"workspaces/{workspace_key}",
                    "user_id": f"users/{user_key}",
                    "role": "owner",
                    "created_at": now,
                    "updated_at": now,
                }
                self._create_document(db_url, db_name, auth, "workspace_members", member_doc)
                created.append("membership")

            if created:
                return True, f"Created: {', '.join(created)}"
            else:
                return True, f"Workspace {workspace_key} ready (user is member)"

        except Exception as e:
            return False, f"Workspace setup failed: {e}"

    def _get_iso_timestamp(self) -> str:
        """Get current ISO timestamp."""
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).isoformat()

    def _document_exists(self, db_url: str, db_name: str, auth: tuple, collection: str, key: str) -> bool:
        """Check if a document exists in ArangoDB."""
        try:
            response = requests.get(
                f"{db_url}/_db/{db_name}/_api/document/{collection}/{key}",
                auth=auth,
                timeout=self.config.timeout_seconds
            )
            return response.status_code == 200
        except:
            return False

    def _create_document(self, db_url: str, db_name: str, auth: tuple, collection: str, doc: dict) -> None:
        """Create a document in ArangoDB."""
        response = requests.post(
            f"{db_url}/_db/{db_name}/_api/document/{collection}",
            auth=auth,
            json=doc,
            timeout=self.config.timeout_seconds
        )
        if response.status_code not in (200, 201, 202):
            raise Exception(f"Failed to create document: {response.text}")

    def _check_credentials(self) -> Tuple[bool, str]:
        """Check API credentials are configured."""
        api_key = os.environ.get("KP_API_KEY")
        workspace_id = os.environ.get("KP_WORKSPACE_ID")
        user_id = os.environ.get("KP_USER_ID")

        missing = []

        if not api_key:
            missing.append("KP_API_KEY")
        if not workspace_id:
            missing.append("KP_WORKSPACE_ID")
        if not user_id:
            self.warnings.append("KP_USER_ID not set")

        if missing:
            return False, f"Missing credentials: {', '.join(missing)}"

        return True, f"API key and workspace ({workspace_id}) configured"

    def _check_openai(self) -> Tuple[bool, str]:
        """Check OpenAI API key is configured."""
        openai_key = os.environ.get("OPENAI_API_KEY")

        if not openai_key:
            self.warnings.append("OPENAI_API_KEY not set - embeddings won't generate")
            return True, "OpenAI key not set (warning only)"

        if openai_key.startswith("sk-"):
            return True, "OpenAI API key configured"
        else:
            self.warnings.append("OpenAI key format unusual")
            return True, "OpenAI key set (format unusual)"

    def _check_background_worker(self) -> Tuple[bool, str]:
        """Check background worker status (warning only)."""
        self.warnings.append("Background worker not verified")
        return True, "Cannot verify directly. Run: npm run dev:background-workers"


# Convenience function for quick checks
def run_preflight(
    mock_mode: bool = False,
    check_database: bool = True,
    check_vector_index: bool = True,
    auto_fix_vector_index: bool = True,
) -> bool:
    """
    Run preflight checks with common defaults.

    Args:
        mock_mode: Skip all checks if True
        check_database: Check ArangoDB connectivity
        check_vector_index: Check for blocking vector indexes
        auto_fix_vector_index: Auto-drop blocking indexes

    Returns:
        True if all critical checks pass
    """
    config = PreflightConfig(
        check_database=check_database,
        check_vector_index=check_vector_index,
        auto_fix_vector_index=auto_fix_vector_index,
    )
    checker = PreflightChecker(config)
    return checker.run(mock_mode=mock_mode)
