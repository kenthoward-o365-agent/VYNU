import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Tables that must never be read directly from the consumer/anon surface.
// All consumer reads go through SECURITY DEFINER RPCs
// (lookup_venue_by_site_id, get_venue_public_info, get_menu_snapshot, …).
const RESTRICTED_TABLES = [
  "venues",
  "tables",
  "venue_payment_config",
  "venue_pos_integrations",
];

const restrictedFromSelector = {
  // Match: supabase.from('<restricted>').select(...)
  selector: [
    "CallExpression[callee.property.name='select']",
    "[callee.object.callee.property.name='from']",
    `[callee.object.arguments.0.value=/^(${RESTRICTED_TABLES.join("|")})$/]`,
  ].join(""),
  message:
    "Consumer code must not read sensitive tables directly. Use a SECURITY DEFINER RPC " +
    "(lookup_venue_by_site_id, get_venue_public_info, get_menu_snapshot, etc.).",
};

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Hard rule: forbid direct .from('venues'|'tables'|'venue_payment_config'|'venue_pos_integrations').select()
  // in any consumer-facing surface. Admin / venue operator code is still allowed.
  {
    files: [
      "src/components/consumer/**/*.{ts,tsx}",
      "src/pages/Consumer*.{ts,tsx}",
      "src/pages/VenueLanding.tsx",
      "src/hooks/use-diner-session.ts",
    ],
    rules: {
      "no-restricted-syntax": ["error", restrictedFromSelector],
    },
  },
);
