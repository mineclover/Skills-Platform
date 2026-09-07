# ConnectorRuntime Specification & Directory Layout

Reference for implementing built-in OpenWiki source connectors.

---

## 1. Type Registration & Registry

- Add the new connector identifier to `src/connectors/types.ts`.
- Export and register the connector runtime in `src/connectors/registry.ts`.
- Implement source logic under `src/connectors/sources/<connector>.ts`.

---

## 2. ConnectorRuntime Interface Shape

A connector implementation must export an object adhering to `ConnectorRuntime`:

```typescript
export interface ConnectorRuntime {
  id: string;
  displayName: string;
  description: string;
  backend: "mcp" | "native_api" | "git";
  requiredEnv: string[];
  supportsAgenticDiscovery: boolean;
  ingest(options: IngestionOptions): Promise<IngestionResult>;
}
```

---

## 3. Storage Paths & Filesystem Contracts

- **Raw Ingestion Dumps**: `~/.openwiki/connectors/<id>/raw/<run-id>/`
- **Connector State**: `~/.openwiki/connectors/<id>/state.json`
- **Connector Config**: `~/.openwiki/connectors/<id>/config.json`
- **Secrets & Credentials**: Stored exclusively in `~/.openwiki/.env` and referenced by variable name. Never store raw secrets in config or state files.
