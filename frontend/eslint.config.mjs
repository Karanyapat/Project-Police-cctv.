import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactPlugin from "eslint-plugin-react";
import hooksPlugin from "eslint-plugin-react-hooks";
import nextPlugin from "eslint-config-next";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "node_modules/**"], // ยกเว้น .next และ node_modules
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: require("@typescript-eslint/parser"),
      sourceType: "module",
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      react: reactPlugin,
      "react-hooks": hooksPlugin,
      "@next/next": nextPlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "warn", // เปลี่ยนเป็น warn
      "@typescript-eslint/no-explicit-any": "warn",
      "@next/next/no-img-element": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "prefer-const": "warn",
      "@next/next/no-assign-module-variable": "off", // ปิดกฎนี้
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/no-this-alias": "warn",
      "react/react-in-jsx-scope": "off", // ปิด เพราะ Next.js ไม่ต้องการ import React
    },
  },
];

export default eslintConfig;