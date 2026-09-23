# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Environment variables

Copy `.env.example` to `.env` and fill in values:

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | yes | Express backend URL (e.g. `http://localhost:5000`). |
| `VITE_GOOGLE_MAPS_API_KEY` | optional | Google Maps JavaScript API key. Enables the **Pick on map** tab in Location create/edit (interactive map, marker placement, Places autocomplete, geofence radius circle). Without it, Locations still work via Manual entry and Device GPS. |

### Setting up Google Maps

1. In Google Cloud Console, enable **Maps JavaScript API** and **Places API**.
2. Create an API key and restrict it by HTTP referrer to your dev (`http://localhost:5173`) and production hosts.
3. Paste it into `frontend/.env` as `VITE_GOOGLE_MAPS_API_KEY=...` and restart `npm run dev`.

## Dependency install

Install from the **repository root**, not from this directory: the repo is an npm
workspace and hoists dependencies to the root `node_modules`:

```bash
npm install
```

The root `.npmrc` sets `legacy-peer-deps=true` because React 19 is used alongside
`react-quill@2`, which still lists React 18 as a peer.


Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
