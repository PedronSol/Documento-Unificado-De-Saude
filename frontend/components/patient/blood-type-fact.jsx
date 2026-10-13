"use client";

import { useRef, useState } from "react";
import Info from "lucide-react/dist/esm/icons/info";

import { BloodTypeDialog } from "@/components/patient/blood-type-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";


const CONFIRM_OR_CORRECT = "O médico responsável pode confirmá-lo ou corrigi-lo.";


function explanation({ profile, context }) {
  const source = profile.blood_type_source;
  if (source === "doctor") {
    return "Registrado pelo médico responsável. Para corrigir, fale com ele.";
  }
  if (source === "guardian") {
    return `Informado pelo responsável legal. ${CONFIRM_OR_CORRECT}`;
  }
  if (source === "patient") {
    return context === "dependent"
      ? `Informado por ${profile.preferred_name}. ${CONFIRM_OR_CORRECT}`
      : `Informado por você. ${CONFIRM_OR_CORRECT}`;
  }
  if (context === "dependent") {
    return `Ainda não informado. Você pode informar o tipo sanguíneo de `
      + `${profile.preferred_name} ou o médico responsável pode registrá-lo a `
      + "partir de um exame.";
  }
  if (!profile.is_adult) {
    return "Ainda não informado. Seu responsável legal pode informá-lo ou o "
      + "médico responsável pode registrá-lo.";
  }
  return "Ainda não informado. Você pode informar o seu tipo sanguíneo ou o "
    + "médico responsável pode registrá-lo a partir de um exame.";
}


export function BloodTypeInfo({ text }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Tooltip open={isOpen} onOpenChange={setIsOpen}>
      <TooltipTrigger asChild>
        <button
          className="blood-type-info"
          type="button"
          aria-label="Sobre o tipo sanguíneo"
          onClick={(event) => {
            // Radix closes tooltips on trigger click; tap and click must open it.
            event.preventDefault();
            setIsOpen(true);
          }}
        >
          <Info aria-hidden="true" size={15} />
        </button>
      </TooltipTrigger>
      <TooltipContent
        className="blood-type-tooltip"
        sideOffset={6}
        collisionPadding={12}
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}


// Guardians act for dependents of any age; minors cannot edit in their own login.
export function BloodTypeFact({
  profile,
  context = "own",
  onSaved,
  onUnauthenticated,
}) {
  const triggerRef = useRef(null);
  const [opening, setOpening] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const canEdit = (context === "dependent" || profile.is_adult)
    && profile.blood_type_source !== "doctor";

  return (
    <div className="blood-type-fact">
      <dt>
        Tipo sanguíneo
        <BloodTypeInfo text={explanation({ profile, context })} />
      </dt>
      <dd>
        {profile.blood_type || "Não informado"}
        {canEdit ? (
          <button
            ref={triggerRef}
            className="blood-type-action"
            type="button"
            onClick={() => {
              setOpening((current) => current + 1);
              setIsOpen(true);
            }}
          >
            {profile.blood_type ? "Alterar" : "Informar tipo sanguíneo"}
          </button>
        ) : null}
      </dd>
      {opening > 0 ? (
        <BloodTypeDialog
          key={opening}
          currentValue={profile.blood_type}
          endpoint="/me/blood-type"
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          onSaved={onSaved}
          onUnauthenticated={onUnauthenticated}
          returnFocusRef={triggerRef}
        />
      ) : null}
    </div>
  );
}
