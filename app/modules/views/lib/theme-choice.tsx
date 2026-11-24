import { ChoiceGroup, SettingLine, SettingText } from "../../design-system/index.tsx";
import type { Layout, ThemeChoice as Theme } from "../../layout/index.ts";
import { useCallback, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { themeChoices } from "../../layout/index.ts";

const TEXT = {
  description: "System follows your device's setting.",
  theme: "Theme",
  title: "Interface theme",
} as const;

const THEMES = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
] as const;

interface ThemeChoiceProps {
  readonly layout: Layout;
}

function themesOf(value: string): readonly Theme[] {
  return themeChoices.filter((choice) => choice === value);
}

export function ThemeChoice(props: ThemeChoiceProps): ReactNode {
  const { layout } = props;
  const state = useSyncExternalStore(layout.subscribe, layout.snapshot);
  const handleChoose = useCallback(
    (value: string) => {
      for (const theme of themesOf(value)) {
        layout.chooseTheme(theme);
      }
    },
    [layout],
  );
  return (
    <SettingLine>
      <SettingText description={TEXT.description} title={TEXT.title} />
      <ChoiceGroup choices={THEMES} label={TEXT.theme} onChoose={handleChoose} value={state.theme} />
    </SettingLine>
  );
}
