"use client";

import { useEffect, useId, useState } from "react";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import Droplet from "lucide-react/dist/esm/icons/droplet";
import HeartPulse from "lucide-react/dist/esm/icons/heart-pulse";
import Ruler from "lucide-react/dist/esm/icons/ruler";
import Search from "lucide-react/dist/esm/icons/search";

const SUGGESTION_GROUPS = [
  {
    name: "Cardiovascular", icon: HeartPulse,
    options: ["Pressão arterial (sistólica/diastólica)", "Batimentos cardíacos (frequência cardíaca)"],
  },
  {
    name: "Diabetes / Metabolismo", icon: Droplet,
    options: ["Glicemia em jejum", "Glicemia pós-prandial"],
  },
  {
    name: "Composição corporal", icon: Ruler,
    options: ["Peso corporal", "Circunferência abdominal"],
  },
];

function normalizeSearch(value) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").trim().toLocaleLowerCase("pt-BR");
}

export function MarkerNameField({ inputRef, value, onChange }) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [activeName, setActiveName] = useState(null);
  const query = normalizeSearch(value);
  const groups = SUGGESTION_GROUPS.map((group, groupIndex) => ({
    ...group,
    id: `${id}-group-${groupIndex}`,
    options: group.options.map((name, optionIndex) => ({
      name, id: `${id}-option-${groupIndex}-${optionIndex}`,
    })).filter((option) => normalizeSearch(option.name).includes(query)),
  })).filter((group) => group.options.length);
  const options = groups.flatMap((group) => group.options);
  const activeOption = isOpen ? options.find((option) => option.name === activeName) : null;

  const activeOptionId = activeOption?.id;
  useEffect(() => {
    if (activeOptionId) {
      document.getElementById(activeOptionId)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [activeOptionId]);

  function closeSuggestions() {
    setIsOpen(false);
    setActiveName(null);
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
        let next;
        if (current < 0) {
          next = direction === 1 ? 0 : options.length - 1;
        } else {
          next = (current + direction + options.length) % options.length;
        }
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
    <div className="dialog-field marker-name-field">
      <label htmlFor={`${id}-input`}>Nome do marcador</label>
      <div className="marker-name-control">
        <Search className="marker-name-search" size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          id={`${id}-input`}
          name="name"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={isOpen ? `${id}-list` : undefined}
          aria-activedescendant={activeOption?.id}
          aria-describedby={`${id}-hint`}
          value={value}
          onChange={(event) => {
            onChange(event);
            setActiveName(null);
            setIsOpen(true);
          }}
          onFocus={() => { setIsOpen(true); setActiveName(null); }}
          onClick={() => setIsOpen(true)}
          onBlur={closeSuggestions}
          onKeyDown={handleKeyDown}
          placeholder="Digite ou selecione um marcador"
          autoComplete="off"
          maxLength={120}
          required
        />
        <ChevronDown className="marker-name-chevron" size={16} aria-hidden="true" />
        {isOpen ? (
          <div className="marker-name-suggestions">
            <div id={`${id}-list`} role="listbox" aria-label="Sugestões de marcadores">
              {groups.map(({ name, icon: Icon, options: groupOptions, id: groupId }) => (
                <div role="group" aria-labelledby={groupId} key={groupId}>
                  <div id={groupId} className="marker-name-category">
                    <Icon size={16} aria-hidden="true" />
                    <span>{name}</span>
                  </div>
                  {groupOptions.map((option) => (
                    <div
                      id={option.id}
                      key={option.id}
                      role="option"
                      aria-selected={activeName === option.name}
                      className="marker-name-option"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSuggestion(option.name)}
                    >
                      {option.name}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {!options.length ? (
              <p className="marker-name-no-results" role="status">
                Nenhuma sugestão encontrada. Você pode usar o nome digitado.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <p id={`${id}-hint`} className="marker-name-hint">Escolha uma sugestão ou digite outro nome.</p>
    </div>
  );
}
