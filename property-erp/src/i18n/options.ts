import type { Dict } from "./dict";

export function enumOptions(t: Dict, group: keyof Dict["enums"], only?: string[]) {
  const g = t.enums[group] as Record<string, string>;
  return Object.entries(g)
    .filter(([k]) => !only || only.includes(k))
    .map(([value, label]) => ({ value, label }));
}
