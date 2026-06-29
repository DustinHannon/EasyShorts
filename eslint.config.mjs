import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypeScript from "eslint-config-next/typescript"

// Next 16's eslint-config-next ships native flat configs, so they're spread
// directly (FlatCompat hits a circular-structure bug with the legacy format).
const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "out/**", "build/**", "next-env.d.ts"] },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      // Advisory, not an error: React 19's rule flags legitimate prop->state
      // sync and object-URL-from-blob effects used across the gallery/wizard.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]

export default eslintConfig
