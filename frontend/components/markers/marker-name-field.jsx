"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Anchor, Content, Portal, Root, Trigger } from "@radix-ui/react-popover";
import Check from "lucide-react/dist/esm/icons/check";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";

import { Button } from "@/components/ui/button";

const SUGGESTION_GROUPS = [
  {
    name: "Cardiovascular",
    options: ["Pressão arterial (sistólica/diastólica)", "Batimentos cardíacos (frequência cardíaca)"],
  },
  {
    name: "Diabetes / Metabolismo",
    options: ["Glicemia em jejum", "Glicemia pós-prandial"],
  },
  {
    name: "Composição corporal",
    options: ["Peso corporal", "Circunferência abdominal"],
  },
];

function normalizeSearch(value) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").trim().toLocaleLowerCase("pt-BR");
}

export function MarkerNameField({ inputRef, value, onChange }) {
  const id = useId();
  const controlRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeName, setActiveName] = useState(null);
  const normalizedQuery = normalizeSearch(query);
  const groups = SUGGESTION_GROUPS.map((group, groupIndex) => ({
    ...group,
    id: `${id}-group-${groupIndex}`,
    options: group.options.map((name, optionIndex) => ({
      name, id: `${id}-option-${groupIndex}-${optionIndex}`,
    })).filter((option) => normalizeSearch(option.name).includes(normalizedQuery)),
  })).filter((group) => group.options.length);
  const options = groups.flatMap((group) => group.options);
  const activeOption = isOpen ? options.find((option) => option.name === activeName) : null;
  const activeOptionId = activeOption?.id;

  useEffect(() => {
    if (activeOptionId) {
      document.getElementById(activeOptionId)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [activeOptionId]);

  function openSuggestions() {
    setQuery("");
    setActiveName(null);
    setIsOpen(true);
  }

  function closeSuggestions() {
    setIsOpen(false);
    setActiveName(null);
    setQuery("");
  }

  function selectSuggestion(name) {
    onChange({ target: { name: "name", value: name } });
    closeSuggestions();
  }

  function handleKeyDown(event) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      if (options.length) {
        const current = isOpen ? options.findIndex((option) => option.name === activeName) : -1;
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const next = current < 0
          ? (direction === 1 ? 0 : options.length - 1)
          : (current + direction + options.length) % options.length;
        setActiveName(options[next].name);
      }
    } else if (event.key === "Enter" && activeOption) {
      event.preventDefault();
      selectSuggestion(activeOption.name);
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      closeSuggestions();
    } else if (event.key === "Tab") {
      closeSuggestions();
    }
  }

  return (
    <Root open={isOpen} onOpenChange={(open) => open ? openSuggestions() : closeSuggestions()}>
      <div className="dialog-field marker-name-field">
        <label htmlFor={`${id}-input`}>Nome do marcador</label>
        <Anchor asChild>
          <div ref={controlRef} className="marker-name-control">
            <input
              ref={inputRef}
              id={`${id}-input`}
              name="name"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isOpen}
              aria-controls={isOpen ? `${id}-list` : undefined}
              aria-activedescendant={activeOptionId}
              aria-describedby={`${id}-hint`}
              value={value}
              onChange={(event) => {
                onChange(event);
                setQuery(event.target.value);
                setActiveName(null);
                setIsOpen(true);
              }}
              onClick={() => { if (!isOpen) openSuggestions(); }}
              onKeyDown={handleKeyDown}
              placeholder="Digite ou selecione um marcador"
              autoComplete="off"
              maxLength={120}
              required
            />
            <Trigger asChild>
              <Button
                className="marker-name-toggle"
                variant="ghost"
                size="icon"
                type="button"
                tabIndex={-1}
                aria-label={`${isOpen ? "Fechar" : "Abrir"} sugestões de marcadores`}
                aria-haspopup="listbox"
                aria-controls={isOpen ? `${id}-list` : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => inputRef.current?.focus()}
              >
                <span className="clinical-select-icon"><ChevronDown size={16} aria-hidden="true" /></span>
              </Button>
            </Trigger>
          </div>
        </Anchor>
        <p id={`${id}-hint`} className="marker-name-hint">Escolha uma sugestão ou digite outro nome.</p>
        <Portal>
          <Content
            className="clinical-select-content marker-name-suggestions"
            role="presentation"
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={8}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onInteractOutside={(event) => {
              if (controlRef.current?.contains(event.target)) event.preventDefault();
            }}
            onEscapeKeyDown={(event) => { event.preventDefault(); closeSuggestions(); }}
          >
            <div id={`${id}-list`} className="clinical-select-viewport" role="listbox" aria-label="Sugestões de marcadores">
              {groups.map(({ name, options: groupOptions, id: groupId }) => (
                <div role="group" aria-labelledby={groupId} key={groupId}>
                  <div id={groupId} className="marker-name-category">{name}</div>
                  {groupOptions.map((option) => (
                    <div
                      id={option.id}
                      key={option.id}
                      role="option"
                      aria-selected={value === option.name}
                      data-state={value === option.name ? "checked" : "unchecked"}
                      data-highlighted={activeName === option.name ? "" : undefined}
                      className="clinical-select-item marker-name-option"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSuggestion(option.name)}
                    >
                      {value === option.name ? <span className="clinical-select-indicator"><Check size={16} aria-hidden="true" /></span> : null}
                      {option.name}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {!options.length ? <p className="marker-name-no-results" role="status">Nenhuma sugestão encontrada. Você pode usar o nome digitado.</p> : null}
          </Content>
        </Portal>
      </div>
    </Root>
  );
}
