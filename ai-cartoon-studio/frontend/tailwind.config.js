module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: { extend: { colors: {
    bg: "rgb(var(--bg) / <alpha-value>)", panel: "rgb(var(--panel) / <alpha-value>)", panel2: "rgb(var(--panel2) / <alpha-value>)",
    line: "rgb(var(--line) / <alpha-value>)", ink: "rgb(var(--ink) / <alpha-value>)", mute: "rgb(var(--mute) / <alpha-value>)",
    brand: "rgb(var(--brand) / <alpha-value>)", brand2: "rgb(var(--brand2) / <alpha-value>)", ok: "rgb(var(--ok) / <alpha-value>)",
    bad: "rgb(var(--bad) / <alpha-value>)", warn: "rgb(var(--warn) / <alpha-value>)" } } },
};
