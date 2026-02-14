#!/usr/bin/env python3
"""
Dependency Validation Script

This script validates that all dependencies are installed correctly
and are compatible with each other. Run this after installing
requirements-docker.txt to verify the environment.

Usage:
    python scripts/validate_dependencies.py
    python scripts/validate_dependencies.py --verbose
    python scripts/validate_dependencies.py --quick
"""

import sys
import importlib
import subprocess
from typing import Dict, List, Tuple, Optional


# Expected versions from requirements-docker.txt
EXPECTED_VERSIONS = {
    'torch': '2.2.0',
    'numpy': '1.26.4',
    'transformers': '4.38.2',
    'sentence_transformers': '2.5.1',
    'datasets': '2.17.1',
    'pandas': '2.2.1',
    'faiss': '1.8.0',  # faiss-cpu shows as 'faiss'
    'sklearn': '1.4.1.post1',  # scikit-learn shows as 'sklearn'
    'openai': '1.12.0',
    'anthropic': '0.18.1',
}


class Color:
    """ANSI color codes for terminal output"""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


def print_header(text: str) -> None:
    """Print a formatted header"""
    print(f"\n{Color.BOLD}{Color.BLUE}{'=' * 70}{Color.RESET}")
    print(f"{Color.BOLD}{Color.BLUE}{text:^70}{Color.RESET}")
    print(f"{Color.BOLD}{Color.BLUE}{'=' * 70}{Color.RESET}\n")


def print_success(text: str) -> None:
    """Print success message"""
    print(f"{Color.GREEN}✓{Color.RESET} {text}")


def print_error(text: str) -> None:
    """Print error message"""
    print(f"{Color.RED}✗{Color.RESET} {text}")


def print_warning(text: str) -> None:
    """Print warning message"""
    print(f"{Color.YELLOW}⚠{Color.RESET} {text}")


def print_info(text: str) -> None:
    """Print info message"""
    print(f"{Color.BLUE}ℹ{Color.RESET} {text}")


def check_python_version() -> Tuple[bool, str]:
    """Check if Python version is compatible"""
    version = sys.version_info
    if version.major != 3 or version.minor < 10:
        return False, f"Python {version.major}.{version.minor}.{version.micro}"
    return True, f"Python {version.major}.{version.minor}.{version.micro}"


def check_package_import(package_name: str, import_name: Optional[str] = None) -> Tuple[bool, str, Optional[str]]:
    """
    Try to import a package and get its version

    Args:
        package_name: Package name for display
        import_name: Actual import name (if different from package_name)

    Returns:
        (success, message, version)
    """
    if import_name is None:
        import_name = package_name

    try:
        module = importlib.import_module(import_name)
        version = getattr(module, '__version__', 'unknown')
        return True, f"{package_name} imported successfully", version
    except ImportError as e:
        return False, f"{package_name} import failed: {e}", None
    except Exception as e:
        return False, f"{package_name} unexpected error: {e}", None


def check_pip_conflicts() -> Tuple[bool, str]:
    """Check for pip dependency conflicts"""
    try:
        result = subprocess.run(
            ['pip', 'check'],
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            return True, "No dependency conflicts found"
        else:
            return False, f"Dependency conflicts:\n{result.stdout}"
    except subprocess.TimeoutExpired:
        return False, "pip check timed out"
    except Exception as e:
        return False, f"pip check failed: {e}"


def test_torch_cpu() -> Tuple[bool, str]:
    """Test that PyTorch works with CPU"""
    try:
        import torch
        # Test basic tensor operation
        x = torch.randn(2, 3)
        y = torch.randn(3, 4)
        z = torch.mm(x, y)
        assert z.shape == (2, 4), "Unexpected tensor shape"

        # Check that CUDA is not required
        if torch.cuda.is_available():
            return True, "PyTorch CPU working (CUDA also available)"
        else:
            return True, "PyTorch CPU working (CUDA not available, as expected)"
    except Exception as e:
        return False, f"PyTorch test failed: {e}"


def test_sentence_transformers() -> Tuple[bool, str]:
    """Test sentence-transformers basic functionality"""
    try:
        from sentence_transformers import SentenceTransformer

        # Just check if model class loads (don't download model)
        # This tests that transformers integration works
        return True, "sentence-transformers can load model class"
    except Exception as e:
        return False, f"sentence-transformers test failed: {e}"


def test_faiss() -> Tuple[bool, str]:
    """Test FAISS basic functionality"""
    try:
        import faiss
        import numpy as np

        # Test basic FAISS operations
        d = 64  # dimension
        nb = 100  # database size
        np.random.seed(1234)
        xb = np.random.random((nb, d)).astype('float32')

        # Build index
        index = faiss.IndexFlatL2(d)
        index.add(xb)

        # Search
        k = 4  # number of nearest neighbors
        xq = xb[:5]
        D, I = index.search(xq, k)

        assert I.shape == (5, 4), "Unexpected search result shape"
        return True, "FAISS basic operations working"
    except Exception as e:
        return False, f"FAISS test failed: {e}"


def test_datasets() -> Tuple[bool, str]:
    """Test datasets library basic functionality"""
    try:
        from datasets import Dataset

        # Test creating a simple dataset
        data = {
            'text': ['hello', 'world'],
            'label': [0, 1]
        }
        dataset = Dataset.from_dict(data)
        assert len(dataset) == 2, "Unexpected dataset length"

        return True, "datasets library working"
    except Exception as e:
        return False, f"datasets test failed: {e}"


def test_api_clients() -> Tuple[bool, str]:
    """Test API client imports"""
    try:
        import openai
        import anthropic

        # Just check that classes are available
        assert hasattr(openai, 'OpenAI'), "OpenAI client not found"
        assert hasattr(anthropic, 'Anthropic'), "Anthropic client not found"

        return True, "API clients (OpenAI, Anthropic) available"
    except Exception as e:
        return False, f"API client test failed: {e}"


def run_quick_validation() -> Dict[str, Tuple[bool, str]]:
    """Run quick validation (imports only)"""
    results = {}

    # Check Python version
    results['Python Version'] = check_python_version()

    # Check core packages
    core_packages = [
        ('numpy', 'numpy'),
        ('torch', 'torch'),
        ('transformers', 'transformers'),
        ('sentence-transformers', 'sentence_transformers'),
        ('datasets', 'datasets'),
        ('pandas', 'pandas'),
        ('faiss-cpu', 'faiss'),
        ('scikit-learn', 'sklearn'),
        ('openai', 'openai'),
        ('anthropic', 'anthropic'),
    ]

    for display_name, import_name in core_packages:
        success, message, version = check_package_import(display_name, import_name)

        # Check version if expected
        if success and import_name in EXPECTED_VERSIONS:
            expected = EXPECTED_VERSIONS[import_name]
            if version and version != expected:
                message += f" (expected {expected}, got {version})"
                results[display_name] = (False, message)
            else:
                message += f" (version {version})"
                results[display_name] = (True, message)
        else:
            results[display_name] = (success, message)

    return results


def run_full_validation() -> Dict[str, Tuple[bool, str]]:
    """Run full validation including tests"""
    results = run_quick_validation()

    # Add functional tests
    print_info("Running functional tests...")

    results['pip check'] = check_pip_conflicts()
    results['PyTorch CPU'] = test_torch_cpu()
    results['sentence-transformers'] = test_sentence_transformers()
    results['FAISS'] = test_faiss()
    results['datasets'] = test_datasets()
    results['API clients'] = test_api_clients()

    return results


def print_results(results: Dict[str, Tuple[bool, str]]) -> bool:
    """
    Print validation results

    Returns:
        True if all tests passed, False otherwise
    """
    all_passed = True
    passed_count = 0
    failed_count = 0

    for name, (success, message) in results.items():
        if success:
            print_success(f"{name}: {message}")
            passed_count += 1
        else:
            print_error(f"{name}: {message}")
            failed_count += 1
            all_passed = False

    # Print summary
    print_header("Summary")
    total = passed_count + failed_count

    if all_passed:
        print_success(f"All {total} checks passed! ✨")
    else:
        print_error(f"{failed_count}/{total} checks failed")
        print_warning("Please check the errors above and reinstall dependencies if needed")

    return all_passed


def print_recommendations() -> None:
    """Print recommendations based on validation results"""
    print_header("Recommendations")

    print_info("If you see version mismatches:")
    print("  1. Reinstall with: pip install -r requirements-docker.txt --force-reinstall")
    print("  2. Or create fresh environment: python -m venv venv && source venv/bin/activate")
    print()

    print_info("If you see import errors:")
    print("  1. Check that you're in the correct virtual environment")
    print("  2. Reinstall dependencies: pip install -r requirements-docker.txt")
    print()

    print_info("If you see dependency conflicts:")
    print("  1. Try: pip install -r requirements-docker.txt --force-reinstall")
    print("  2. If that fails, create a fresh virtual environment")
    print()

    print_info("If functional tests fail:")
    print("  1. Check available system resources (RAM, disk space)")
    print("  2. Ensure no other processes are using the GPU/CPU heavily")
    print("  3. Try running individual tests to isolate the issue")


def main() -> int:
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Validate benchmark dependencies')
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Show verbose output'
    )
    parser.add_argument(
        '--quick', '-q',
        action='store_true',
        help='Run quick validation (imports only, no functional tests)'
    )

    args = parser.parse_args()

    print_header("KnowledgePlane Benchmark Dependency Validator")

    if args.quick:
        print_info("Running quick validation (imports only)...")
        results = run_quick_validation()
    else:
        print_info("Running full validation (imports + functional tests)...")
        results = run_full_validation()

    print_header("Validation Results")
    all_passed = print_results(results)

    if not all_passed:
        print_recommendations()
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
