"use client";

import {
  Root as SelectRoot,
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from "@radix-ui/react-select";
import Check from "lucide-react/dist/esm/icons/check";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";

import { cn } from "@/lib/utils";


export function ClinicalSelect({
  className,
  disabled = false,
  id,
  name,
  onValueChange,
  options,
  placeholder,
  required = false,
  value,
}) {
  return (
    <SelectRoot
      disabled={disabled}
      name={name}
      onValueChange={onValueChange}
      required={required}
      value={value}
    >
      <SelectTrigger
        id={id}
        className={cn("clinical-select-trigger", className)}
        data-slot="clinical-select-trigger"
      >
        <SelectValue placeholder={placeholder} />
        <SelectIcon className="clinical-select-icon">
          <ChevronDown aria-hidden="true" size={16} />
        </SelectIcon>
      </SelectTrigger>

      <SelectPortal>
        <SelectContent
          className="clinical-select-content"
          position="popper"
          align="start"
          sideOffset={6}
          collisionPadding={8}
        >
          <SelectScrollUpButton className="clinical-select-scroll-button">
            <ChevronUp aria-hidden="true" size={16} />
          </SelectScrollUpButton>
          <SelectViewport className="clinical-select-viewport">
            {options.map((option) => (
              <SelectItem
                className="clinical-select-item"
                data-slot="clinical-select-item"
                disabled={option.disabled}
                key={option.value}
                value={option.value}
              >
                <SelectItemIndicator className="clinical-select-indicator">
                  <Check aria-hidden="true" size={16} />
                </SelectItemIndicator>
                <SelectItemText>{option.label}</SelectItemText>
              </SelectItem>
            ))}
          </SelectViewport>
          <SelectScrollDownButton className="clinical-select-scroll-button">
            <ChevronDown aria-hidden="true" size={16} />
          </SelectScrollDownButton>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>
  );
}

export default ClinicalSelect;
