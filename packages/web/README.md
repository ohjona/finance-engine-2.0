# @finance-engine/web (Scaffold)

This package is a placeholder scaffold for the future Finance Engine Web application.

## Out of Scope for Phase 1

The following features are planned but not yet implemented:
- Next.js / Vite integration
- React UI components
- Browser-based file ingestion
- Visual transaction list
- Rule management interface

## Architectural Approach

The web application will adhere to the **Headless Core** architecture:
1. All business logic, parsing, and categorization will reside in `@finance-engine/core`.
2. The web layer will handle browser-specific I/O (File API) and pass data to the core as `ArrayBuffer`.
3. The core will return plain transaction objects which the web layer will render.
4. Cross-platform compatibility is ensured by using `js-sha256` (instead of Node `crypto`) and standard Web APIs.

## Next Steps

Phase 2 will involve bootstrapping this package with a modern React framework.
