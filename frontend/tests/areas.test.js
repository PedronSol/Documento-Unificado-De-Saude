import { describe, expect, it } from "vitest";

import {
  contextKeyForPath,
  findDependent,
  isAreaAllowed,
  listContexts,
  parsePatientId,
  resolveDefaultArea,
} from "@/lib/areas";


const patientProfile = { preferred_name: "Helena", is_adult: true, age: 38 };

function identity({ roles, profile = null, dependents = [] }) {
  return {
    user: { user_id: 1, display_name: "Conta", email: "c@example.com", roles },
    patient_profile: profile,
    dependents,
  };
}


describe("resolveDefaultArea", () => {
  it("sends a patient to the patient area", () => {
    expect(resolveDefaultArea(identity({
      roles: ["patient"],
      profile: patientProfile,
    }))).toBe("/patient");
  });

  it("sends a doctor without patient profile to the medical area", () => {
    expect(resolveDefaultArea(identity({ roles: ["doctor"] }))).toBe("/medical");
  });

  it("sends an admin to the admin area", () => {
    expect(resolveDefaultArea(identity({ roles: ["admin"] }))).toBe("/admin");
  });

  it("prefers the patient area for a combined account", () => {
    expect(resolveDefaultArea(identity({
      roles: ["patient", "doctor"],
      profile: patientProfile,
    }))).toBe("/patient");
  });

  it("skips the patient role when the profile is missing", () => {
    expect(resolveDefaultArea(identity({
      roles: ["patient", "doctor"],
    }))).toBe("/medical");
  });

  it("keeps an account without contexts on the institutional home", () => {
    expect(resolveDefaultArea(identity({ roles: [] }))).toBe("/home");
  });
});


const minor = { patient_id: 15, preferred_name: "Ana", is_adult: false, age: 8 };
const adultDependent = {
  patient_id: 16,
  preferred_name: "Bruno",
  is_adult: true,
  age: 19,
};


describe("listContexts", () => {
  it("lists only available areas followed by dependents", () => {
    const contexts = listContexts(identity({
      roles: ["patient", "doctor"],
      profile: patientProfile,
      dependents: [minor, adultDependent],
    }));

    expect(contexts.map(({ key, href, label, tone }) => ({
      key, href, label, tone,
    }))).toEqual([
      { key: "patient", href: "/patient", label: "Minha saúde", tone: "default" },
      { key: "doctor", href: "/medical", label: "Área profissional", tone: "default" },
      {
        key: "dependent:15",
        href: "/patient/dependents/15",
        label: "Saúde de Ana",
        tone: "minor",
      },
      {
        key: "dependent:16",
        href: "/patient/dependents/16",
        label: "Saúde de Bruno",
        tone: "default",
      },
    ]);
    expect(contexts.every(({ icon }) => typeof icon === "object" || typeof icon === "function"))
      .toBe(true);
  });

  it("hides dependents and areas the identity does not hold", () => {
    const contexts = listContexts(identity({
      roles: ["admin"],
      dependents: [minor],
    }));

    expect(contexts.map(({ key }) => key)).toEqual(["admin"]);
  });
});


describe("isAreaAllowed", () => {
  it("allows only areas available to the identity", () => {
    const doctor = identity({ roles: ["doctor"] });

    expect(isAreaAllowed(doctor, "doctor")).toBe(true);
    expect(isAreaAllowed(doctor, "patient")).toBe(false);
    expect(isAreaAllowed(doctor, "admin")).toBe(false);
  });
});


describe("parsePatientId", () => {
  it.each([
    ["15", 15],
    ["1", 1],
    ["0", null],
    ["-3", null],
    ["01", null],
    ["1.5", null],
    ["abc", null],
    ["", null],
    [undefined, null],
    ["9007199254740993", null],
  ])("parses %s as %s", (raw, expected) => {
    expect(parsePatientId(raw)).toBe(expected);
  });
});


describe("findDependent", () => {
  const guardian = identity({
    roles: ["patient"],
    profile: patientProfile,
    dependents: [minor],
  });

  it("returns a dependent held by the identity", () => {
    expect(findDependent(guardian, "15")).toBe(minor);
  });

  it("returns null for unknown or malformed ids", () => {
    expect(findDependent(guardian, "99")).toBeNull();
    expect(findDependent(guardian, "15abc")).toBeNull();
  });

  it("returns null when the patient area is unavailable", () => {
    expect(findDependent(identity({ roles: ["doctor"], dependents: [minor] }), "15"))
      .toBeNull();
  });
});


describe("contextKeyForPath", () => {
  it.each([
    ["/patient", "patient"],
    ["/patient/dependents", "patient"],
    ["/patient/dependents/15", "dependent:15"],
    ["/medical", "doctor"],
    ["/medical/patients/42", "doctor"],
    ["/admin", "admin"],
    ["/home", null],
    ["/settings", null],
  ])("maps %s to %s", (pathname, expected) => {
    expect(contextKeyForPath(pathname)).toBe(expected);
  });
});
