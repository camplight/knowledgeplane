#!/usr/bin/env python3
"""
BGE Cross-Encoder Reranker Service

A lightweight HTTP service that provides cross-encoder reranking for fact pairs.
Used by CardConsolidator to filter weak candidates before LLM relation extraction.

Usage:
    python reranker.py  # Starts on port 8082

API:
    POST /rerank
    {
        "pairs": [
            {"fact_a": "text1", "fact_b": "text2"},
            ...
        ],
        "threshold": 0.5
    }

    Returns:
    {
        "results": [
            {"index": 0, "score": 0.85, "keep": true},
            ...
        ]
    }
"""

import os
import sys
from typing import List, Dict, Any
from http.server import HTTPServer, BaseHTTPRequestHandler
import json

# Model loading (lazy)
_model = None
_model_name = os.environ.get("RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")

def get_model():
    """Lazy load the cross-encoder model."""
    global _model
    if _model is None:
        try:
            from sentence_transformers import CrossEncoder
            print(f"Loading reranker model: {_model_name}", file=sys.stderr)
            _model = CrossEncoder(_model_name)
            print("Reranker model loaded successfully", file=sys.stderr)
        except ImportError:
            print("ERROR: sentence-transformers not installed. Run: pip install sentence-transformers", file=sys.stderr)
            sys.exit(1)
    return _model


def rerank_pairs(pairs: List[Dict[str, str]], threshold: float = 0.5) -> List[Dict[str, Any]]:
    """
    Rerank fact pairs using cross-encoder.

    Args:
        pairs: List of {"fact_a": str, "fact_b": str}
        threshold: Minimum score to keep (0-1)

    Returns:
        List of {"index": int, "score": float, "keep": bool}
    """
    if not pairs:
        return []

    model = get_model()

    # Prepare pairs for cross-encoder
    text_pairs = [(p["fact_a"], p["fact_b"]) for p in pairs]

    # Get scores
    scores = model.predict(text_pairs)

    # Normalize scores to 0-1 range (sigmoid already applied by most rerankers)
    # BGE reranker outputs logits, need to convert
    import numpy as np
    if hasattr(scores, 'tolist'):
        scores = scores.tolist()

    # Build results
    results = []
    for i, score in enumerate(scores):
        # Normalize to 0-1 if needed (BGE outputs can be negative)
        normalized_score = 1 / (1 + np.exp(-score))  # Sigmoid
        results.append({
            "index": i,
            "score": float(normalized_score),
            "keep": normalized_score >= threshold
        })

    return results


class RerankerHandler(BaseHTTPRequestHandler):
    """HTTP handler for reranker service."""

    def do_POST(self):
        if self.path == "/rerank":
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)

            try:
                data = json.loads(body)
                pairs = data.get("pairs", [])
                threshold = data.get("threshold", 0.5)

                results = rerank_pairs(pairs, threshold)

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"results": results}).encode())

            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())

        elif self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())

        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        """Suppress default logging."""
        pass


def main():
    port = int(os.environ.get("RERANKER_PORT", "8082"))

    # Pre-load model
    print(f"Starting reranker service on port {port}...")
    get_model()

    server = HTTPServer(("0.0.0.0", port), RerankerHandler)
    print(f"Reranker service ready at http://localhost:{port}")
    print("Endpoints: POST /rerank, GET /health")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down reranker service...")
        server.shutdown()


if __name__ == "__main__":
    main()
