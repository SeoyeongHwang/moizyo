import type { ButtonHTMLAttributes } from "react";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { disabled?: boolean };

function joinClassNames(...names: Array<string | undefined>): string {
  return names.filter(Boolean).join(" ");
}

export function PrimaryButton({ className, ...props }: BtnProps) {
  return <button {...props} className={joinClassNames("btn-primary", className)} />;
}

export function SecondaryButton({ className, ...props }: BtnProps) {
  return <button {...props} className={joinClassNames("btn-secondary", className)} />;
}

export function UtilityButton({ className, ...props }: BtnProps) {
  return <button {...props} className={joinClassNames("btn-utility", className)} />;
}
