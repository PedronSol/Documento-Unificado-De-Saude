"use client";

import { useRef, useState } from "react";

import { BloodTypeDialog } from "@/components/patient/blood-type-dialog";


const SOURCE_LABELS = {
  patient: "autodeclarado",
  guardian: "informado pelo responsável",
  doctor: "registrado por profissional",
};


export function MedicalBloodType({ patient, onPatientUpdated, onUnauthenticated }) {
  const triggerRef = useRef(null);
  const [opening, setOpening] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="blood-type-fact">
      <dt>Tipo sanguíneo</dt>
      <dd>
        {patient.blood_type || "Não informado"}
        {patient.blood_type_source ? (
          <span className="blood-type-source">
            {SOURCE_LABELS[patient.blood_type_source]}
          </span>
        ) : null}
        <button
          ref={triggerRef}
          className="blood-type-action"
          type="button"
          onClick={() => {
            setOpening((current) => current + 1);
            setIsOpen(true);
          }}
        >
          {patient.blood_type ? "Corrigir" : "Registrar"}
        </button>
      </dd>
      {opening > 0 ? (
        <BloodTypeDialog
          key={opening}
          currentValue={patient.blood_type}
          endpoint={`/medical/patients/${patient.patient_id}/blood-type`}
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          onSaved={(saved) => onPatientUpdated({ ...patient, ...saved })}
          onUnauthenticated={onUnauthenticated}
          returnFocusRef={triggerRef}
          selfDeclared={false}
        />
      ) : null}
    </div>
  );
}
