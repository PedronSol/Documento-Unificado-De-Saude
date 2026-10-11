import Pencil from "lucide-react/dist/esm/icons/pencil";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";

import { TYPE_CONFIG, TYPE_ORDER } from "@/components/markers/marker-types";


function formatClinicalDate(value) {
  if (!value) {
    return "Data não informada";
  }
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function MarkerCard({ marker, canEdit, onEdit, onRemove, variant }) {
  const type = TYPE_CONFIG[marker.type];
  const TypeIcon = type.icon;

  return (
    <article className="marker-card" data-marker-type={marker.type}>
      <div className="marker-card-type">
        <TypeIcon aria-hidden="true" size={15} />
        {type.singular}
      </div>
      <h4>{marker.name}</h4>
      {marker.description ? <p>{marker.description}</p> : null}
      {marker.type === "medication" && (marker.dosage || marker.frequency) ? (
        <dl className="marker-medication-details">
          {marker.dosage ? (
            <div>
              <dt>Dosagem</dt>
              <dd>{marker.dosage}</dd>
            </div>
          ) : null}
          {marker.frequency ? (
            <div>
              <dt>Frequência</dt>
              <dd>{marker.frequency}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {marker.status === "removed" ? (
        <small>Removido em {formatClinicalDate(marker.removed_at)}</small>
      ) : null}
      {canEdit && marker.status === "active" ? (
        <div className="marker-card-actions">
          <button
            type="button"
            onClick={(event) => onEdit(marker, event.currentTarget)}
            aria-label={`Editar ${marker.name}`}
          >
            <Pencil aria-hidden="true" size={15} />
          </button>
          <button
            type="button"
            onClick={(event) => onRemove(marker, event.currentTarget)}
            aria-label={`${variant === "medical" && marker.type === "medication" ? "Suspender" : "Remover"} ${marker.name}`}
          >
            <Trash2 aria-hidden="true" size={15} />
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function MarkerCollection({ markers, canEdit, onEdit, onRemove, variant, view }) {
  if (markers.length === 0) {
    return (
      <div className="marker-empty">
        <span aria-hidden="true">{view === "active" ? "＋" : "○"}</span>
        <p>
          {view === "active"
            ? "Nenhum marcador ativo."
            : "Nenhum marcador no histórico."}
        </p>
      </div>
    );
  }

  if (view === "removed") {
    return (
      <div className="marker-history-list">
        {markers.map((marker) => (
          <MarkerCard
            key={marker.marker_id}
            marker={marker}
            canEdit={false}
            onEdit={onEdit}
            onRemove={onRemove}
            variant={variant}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="marker-groups">
      {TYPE_ORDER.map((type) => {
        const group = markers.filter((marker) => marker.type === type);
        if (group.length === 0) {
          return null;
        }
        const config = TYPE_CONFIG[type];
        return (
          <section className="marker-group" key={type} aria-label={config.label}>
            <h3>
              {config.label}
              <span>{group.length.toString().padStart(2, "0")}</span>
            </h3>
            <div className="marker-card-grid">
              {group.map((marker) => (
                <MarkerCard
                  key={marker.marker_id}
                  marker={marker}
                  canEdit={canEdit}
                  onEdit={onEdit}
                  onRemove={onRemove}
                  variant={variant}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
