// Navigation rules derived from /me. They shape the experience only; the
// backend authorizes every request again.
import HeartPulse from "lucide-react/dist/esm/icons/heart-pulse";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";
import UserRound from "lucide-react/dist/esm/icons/user-round";


export const HOME_PATH = "/home";
export const PATIENT_PATH = "/patient";
export const DEPENDENTS_PATH = "/patient/dependents";

// Adding an area means adding a row here; the shell reads this table.
export const AREAS = [
  {
    key: "patient",
    path: PATIENT_PATH,
    label: "Minha saúde",
    icon: HeartPulse,
    isAvailable: (identity) => (
      identity.user.roles.includes("patient") && Boolean(identity.patient_profile)
    ),
  },
  {
    key: "doctor",
    path: "/medical",
    label: "Área profissional",
    icon: Stethoscope,
    isAvailable: (identity) => identity.user.roles.includes("doctor"),
  },
  {
    key: "admin",
    path: "/admin",
    label: "Administração",
    icon: ShieldCheck,
    isAvailable: (identity) => identity.user.roles.includes("admin"),
  },
];

const PATIENT_ID_PATTERN = /^[1-9]\d*$/;
const DEPENDENT_KEY_PREFIX = "dependent:";


export function resolveDefaultArea(identity) {
  const area = AREAS.find((item) => item.isAvailable(identity));
  return area ? area.path : HOME_PATH;
}


export function isAreaAllowed(identity, areaKey) {
  const area = AREAS.find((item) => item.key === areaKey);
  return Boolean(area?.isAvailable(identity));
}


export function listDependents(identity) {
  return isAreaAllowed(identity, "patient") ? identity.dependents || [] : [];
}


export function dependentPath(patientId) {
  return `${DEPENDENTS_PATH}/${patientId}`;
}


export function dependentTone(dependent) {
  return dependent.is_adult ? "default" : "minor";
}


export function listContexts(identity, pathname = null) {
  const onDependentsList = pathname === DEPENDENTS_PATH;
  const areas = AREAS
    .filter((area) => area.isAvailable(identity))
    .map((area) => ({
      key: area.key,
      href: area.path,
      label: area.label,
      icon: area.icon,
      tone: "default",
      // On the list, the patient context names where the user is (spec 037, 9g).
      ...(onDependentsList && area.key === "patient"
        ? { href: DEPENDENTS_PATH, label: "Meus dependentes" }
        : {}),
    }));
  const dependents = listDependents(identity).map((dependent) => ({
    key: `${DEPENDENT_KEY_PREFIX}${dependent.patient_id}`,
    href: dependentPath(dependent.patient_id),
    label: `Saúde de ${dependent.preferred_name}`,
    icon: UserRound,
    tone: dependentTone(dependent),
  }));
  return [...areas, ...dependents];
}


export function parsePatientId(raw) {
  if (typeof raw !== "string" || !PATIENT_ID_PATTERN.test(raw)) {
    return null;
  }
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}


export function findDependent(identity, rawPatientId) {
  const patientId = parsePatientId(rawPatientId);
  if (patientId === null) {
    return null;
  }
  return listDependents(identity).find(
    (dependent) => dependent.patient_id === patientId,
  ) || null;
}


export function contextKeyForPath(pathname) {
  const dependentMatch = pathname.match(/^\/patient\/dependents\/([^/]+)$/);
  if (dependentMatch) {
    return `${DEPENDENT_KEY_PREFIX}${dependentMatch[1]}`;
  }
  const area = AREAS.find(
    ({ path }) => pathname === path || pathname.startsWith(`${path}/`),
  );
  return area ? area.key : null;
}
