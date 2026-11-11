import type { ResolvedItem } from "@/types/food";

type Macros = ResolvedItem["perUnit"];

const fields = [
  { key: "kcal", label: "Calories", unit: "kcal", spokenUnit: "kcal" },
  { key: "proteinG", label: "Protein", unit: "g", spokenUnit: "grams" },
  { key: "carbsG", label: "Carbs", unit: "g", spokenUnit: "grams" },
  { key: "fatG", label: "Fat", unit: "g", spokenUnit: "grams" },
] as const;

export function DishMacroFields({ macros, dishNumber, onChange }: {
  macros: Macros;
  dishNumber?: number;
  onChange?: (key: keyof Macros, value: string) => void;
}) {
  return (
    <div className="dish-macros">
      {fields.map(({ key, label, unit, spokenUnit }) => (
        <label className="small muted" key={key}>
          {label}
          {onChange ? (
            <input
              className="field mt-1"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              aria-label={`Dish ${dishNumber} ${label.toLowerCase()} in ${spokenUnit}`}
              value={macros[key]}
              onChange={(event) => onChange(key, event.target.value)}
            />
          ) : (
            <output className="field mt-1 block">{macros[key]}</output>
          )}
          <span className="dish-unit">{unit}</span>
        </label>
      ))}
    </div>
  );
}
