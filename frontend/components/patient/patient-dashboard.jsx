"use client";

import { AlertsSection } from "@/components/alerts/alerts-section";
import { DocumentsSection } from "@/components/documents/documents-section";
import { HealthMarkers } from "@/components/markers/health-markers";
import { BloodTypeFact } from "@/components/patient/blood-type-fact";
import { CareInvitations } from "@/components/patient/care-invitations";
import { HealthSharing } from "@/components/patient/health-sharing";
import { VaccinationHistory } from "@/components/vaccines/vaccination-history";


// Composes the patient's feature sections; each one loads its own resource.
export default function PatientDashboard({
  profile,
  onUnauthenticated,
  onProfileChanged,
  context = "own",
  guardianshipPanel = null,
}) {
  return (
    <main className="patient-main">
      <section className="patient-identity" aria-labelledby="patient-name">
        <div>
          <p className="eyebrow">Meu perfil</p>
          <h1 id="patient-name">{profile.preferred_name}</h1>
          <p>{profile.full_name}</p>
        </div>
        <dl className="patient-facts">
          <div>
            <dt>Idade</dt>
            <dd>{profile.age} anos</dd>
          </div>
          <BloodTypeFact
            profile={profile}
            context={context}
            onSaved={onProfileChanged}
            onUnauthenticated={onUnauthenticated}
          />
        </dl>
      </section>

      <div className="patient-sections">
        <HealthSharing
          isAdult={profile.is_adult}
          onUnauthenticated={onUnauthenticated}
        />
        <CareInvitations
          isAdult={profile.is_adult}
          onUnauthenticated={onUnauthenticated}
        />
        {guardianshipPanel}
        <AlertsSection onUnauthenticated={onUnauthenticated} />
        <HealthMarkers
          isAdult={profile.is_adult}
          onUnauthenticated={onUnauthenticated}
        />
        <DocumentsSection
          isAdult={profile.is_adult}
          onUnauthenticated={onUnauthenticated}
        />
        <VaccinationHistory
          isAdult={profile.is_adult}
          onUnauthenticated={onUnauthenticated}
        />
      </div>
    </main>
  );
}
