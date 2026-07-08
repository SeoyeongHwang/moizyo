import type { ReactNode } from "react";

type AccordionPanelProps = {
  id: string;
  open: boolean;
  children: ReactNode;
};

export function AccordionPanel({ id, open, children }: AccordionPanelProps) {
  return (
    <div id={id} className="accordion-panel" data-open={open ? "true" : "false"} aria-hidden={!open} inert={open ? undefined : true}>
      <div className="accordion-panel__content">{children}</div>
    </div>
  );
}
