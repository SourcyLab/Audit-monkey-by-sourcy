import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(js.configs.recommended, ...ts.configs.recommended, {
  files: ["app/src/**/*.ts", "mcp/**/*.ts"],
  languageOptions: {
    globals: {
      Buffer: "readonly",
      structuredClone: "readonly",
      setTimeout: "readonly",
      document: "readonly",
      window: "readonly",
      localStorage: "readonly",
      File: "readonly",
      FileReader: "readonly",
      Blob: "readonly",
      URL: "readonly",
      crypto: "readonly",
      alert: "readonly",
      confirm: "readonly",
      console: "readonly",
      HTMLElement: "readonly",
      HTMLInputElement: "readonly",
      HTMLSelectElement: "readonly",
      HTMLTextAreaElement: "readonly",
      FormData: "readonly",
      Event: "readonly",
    },
  },
});
