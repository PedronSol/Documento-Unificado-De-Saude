import HeartPulse from "lucide-react/dist/esm/icons/heart-pulse";
import Pill from "lucide-react/dist/esm/icons/pill";
import ShieldAlert from "lucide-react/dist/esm/icons/shield-alert";
import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";


export const TYPE_ORDER = ["allergy", "medication", "condition", "diagnosis"];

export const TYPE_OPTIONS = [
  { value: "condition", label: "Condição" },
  { value: "diagnosis", label: "Diagnóstico" },
  { value: "allergy", label: "Alergia" },
  { value: "medication", label: "Medicação" },
];

export const TYPE_CONFIG = {
  allergy: {
    label: "Alergias",
    singular: "Alergia",
    icon: ShieldAlert,
  },
  medication: {
    label: "Medicações",
    singular: "Medicação",
    icon: Pill,
  },
  condition: {
    label: "Condições",
    singular: "Condição",
    icon: HeartPulse,
  },
  diagnosis: {
    label: "Diagnósticos",
    singular: "Diagnóstico",
    icon: Stethoscope,
  },
};
