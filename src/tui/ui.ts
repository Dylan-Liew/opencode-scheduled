import { MouseButton, type MouseEvent } from "@opentui/core";

export function clickPrimary(event: MouseEvent): boolean {
  if (event.button !== MouseButton.LEFT) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  return true;
}
