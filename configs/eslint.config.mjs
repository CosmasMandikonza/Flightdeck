import eslintPluginBaseline from "../packages/eslint-plugin-baseline/src/index.ts";

export default [
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: { baseline: eslintPluginBaseline },
    rules: {
      "baseline/no-notyet-baseline": "warn"
    }
  }
];
