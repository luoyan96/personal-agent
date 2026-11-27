import { Button } from "antd";
import { useId, useState } from "react";
import type { ReactNode } from "react";

export function SettingsDisclosure({
  label,
  icon,
  className,
  children,
}: {
  label: ReactNode;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className={className}>
      <Button
        className="settings-disclosure-button"
        type="link"
        icon={icon}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((visible) => !visible)}
      >
        {label}
      </Button>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
