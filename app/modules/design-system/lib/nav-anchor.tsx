import type { NavLinkParts } from "./parts.ts";
import type { ReactNode } from "react";

const ICONS = {
  channel: (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
    >
      <path d="M14 21L18 3M6 21L10 3M5 8H21M3 16H19" />
    </svg>
  ),
  inbox: (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
    >
      <path d="M13.9378 3H10.0622C8.09477 3 7.11106 3 6.34921 3.5158C5.58736 4.0316 5.22202 4.94495 4.49134 6.77166L2.42914 11.9272C2.21522 12.4619 2.10826 12.7293 2.05413 13.0104C2 13.2915 2 13.5795 2 14.1555V15C2 17.8284 2 19.2426 2.87868 20.1213C3.75736 21 5.17157 21 8 21H16C18.8284 21 20.2426 21 21.1213 20.1213C22 19.2426 22 17.8284 22 15V14.1555C22 13.5795 22 13.2915 21.9459 13.0104C21.8917 12.7294 21.7848 12.4619 21.5709 11.9271L19.5087 6.77166C18.778 4.94495 18.4126 4.0316 17.6508 3.5158C16.8889 3 15.9052 3 13.9378 3Z" />
      <path d="M2.5 13H5.58579C6.16263 13 6.45105 13 6.71982 13.0766C6.86747 13.1187 7.00978 13.1776 7.14394 13.2523C7.38816 13.3882 7.59211 13.5921 8 14C8.40789 14.4079 8.61184 14.6118 8.85606 14.7477C8.99022 14.8224 9.13253 14.8813 9.28018 14.9234C9.54895 15 9.83737 15 10.4142 15H13.5858C14.1626 15 14.4511 15 14.7198 14.9234C14.8675 14.8813 15.0098 14.8224 15.1439 14.7477C15.3882 14.6118 15.5921 14.4079 16 14C16.4079 13.5921 16.6118 13.3882 16.8561 13.2523C16.9902 13.1776 17.1325 13.1187 17.2802 13.0766C17.5489 13 17.8374 13 18.4142 13H21.5" />
    </svg>
  ),
  people: (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
    >
      <path d="M18.001 21.0005C18.001 18.7333 18.001 17.5997 17.5939 16.7102C17.1659 15.7751 16.4297 15.0149 15.5081 14.5563C14.6314 14.1201 13.501 14.0005 11.2273 14.0056L8.77373 14.0005C6.50096 14.0005 5.39593 14.1074 4.5302 14.5285C3.57956 14.9908 2.82784 15.7656 2.39508 16.7289C2.00097 17.6062 2.00097 18.7376 2.00096 21.0005" />
      <path d="M14.001 7.00049C14.001 9.20963 12.2101 11.0005 10.001 11.0005C7.79182 11.0005 6.00096 9.20963 6.00096 7.00049C6.00096 4.79135 7.79182 3.00049 10.001 3.00049C12.2101 3.00049 14.001 4.79135 14.001 7.00049Z" />
      <path d="M22.001 21.0006C22.001 18.745 22.001 17.6173 21.5939 16.7323C21.1659 15.8021 20.4245 14.9569 19.5029 14.5007" />
      <path d="M16.001 3.12646C17.7262 3.57051 19.001 5.13661 19.001 7.00045C19.001 8.86429 17.7262 10.4304 16.001 10.8744" />
    </svg>
  ),
} as const;

function linkStyle(parts: NavLinkParts): string {
  if (parts.active) {
    return "bg-accent text-foreground";
  }
  return "text-foreground hover:bg-hover";
}

const SPOKEN_PREFIXES = { channel: "#", inbox: "", people: "" } as const;

function textStyle(parts: NavLinkParts): string {
  if (parts.marked) {
    return "font-semibold";
  }
  return "";
}

function currentOf(active: boolean): "page" | false {
  if (active) {
    return "page";
  }
  return false;
}

interface NavAnchorParts {
  readonly link: NavLinkParts;
}

export function NavAnchor(parts: NavAnchorParts): ReactNode {
  const { link } = parts;
  return (
    <a
      aria-current={currentOf(link.active)}
      className={`group/row flex min-h-[30px] flex-1 items-center gap-1.5 rounded-lg px-1.5 py-[5px] text-[13px] leading-[18px] focus-visible:ring-1 focus-visible:ring-link focus-visible:outline-none focus-visible:ring-inset ${linkStyle(link)}`}
      href={link.href}
    >
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center text-muted-foreground group-aria-[current=page]/row:text-foreground"
      >
        {ICONS[link.icon]}
      </span>
      <span className={`flex-1 truncate ${textStyle(link)}`}>
        {SPOKEN_PREFIXES[link.icon] !== "" && (
          <span className="align-top text-[0px] leading-[0]">{SPOKEN_PREFIXES[link.icon]}</span>
        )}
        {link.label}
      </span>
      <span className="flex items-center justify-end gap-1 group-focus-within/actions:min-w-6 group-focus-within/actions:opacity-0 group-hover/actions:min-w-6 group-hover/actions:opacity-0 group-has-data-[state=open]/actions:min-w-6 group-has-data-[state=open]/actions:opacity-0">
        {link.children}
      </span>
    </a>
  );
}
