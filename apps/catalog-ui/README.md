# Skills Catalog UI

This app is the management surface for Skills Platform. It never writes a
provider `skills/` directory. It resolves and previews Catalog policy, then
hands a validated `ActivationPlan` to Skills Manager for materialization.

## Local prototype

```bash
npm install
npm run dev
```

Without configuration, the project screen is an interactive visual prototype.

## Connect a local Catalog

Start the local Catalog bridge in another terminal. The UI reads project
policy, effective skill sets, history, plan previews, and the evidence-derived
review queue; it does not apply a plan or mutate a delivery path.

```bash
cd ../skills-catalog
node src/cli.js serve --catalog ../example/.skills-platform/catalog \
  --registry ../example/.skills-platform/registry --port 4300
```

Then launch the UI with the bridge URL:

```bash
$env:VITE_CATALOG_API = "http://127.0.0.1:4300"
npm run dev
```

The UI displays the first registered project, its pinned template and matching
overlays, every selected/disabled skill reason, and the adapter-ready preview.
It also shows why any skill needs review—unreviewed metadata, declared risk,
feedback signals, missing current-revision evaluations, or failed/blocked
evaluation results.
