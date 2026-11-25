interface PresenceShown {
  readonly online: boolean;
  readonly warning: boolean;
  readonly unreachable: boolean;
  readonly label: string;
  readonly spoken: string;
}

interface PresenceDotParts extends PresenceShown {
  readonly name: string;
  readonly place?: "avatar" | "card" | "inline";
}

interface AvatarParts {
  readonly name: string;
  readonly agent: boolean;
  readonly presence: PresenceShown | null;
  readonly size?: "large" | "small" | "tiny";
}

interface SuggestionOptionParts {
  readonly option: string;
  readonly detail: string | null;
  readonly spoken: string;
  readonly presence: PresenceShown | null;
}

interface SuggestionsParts {
  readonly list: string;
  readonly label: string;
  readonly options: readonly SuggestionOptionParts[];
  readonly highlighted: number;
  readonly onChoose: (option: string) => void;
  readonly place?: "above" | "below";
}

export type { AvatarParts, PresenceDotParts, PresenceShown, SuggestionOptionParts, SuggestionsParts };
