export const HEALTH_STATUS = {
  updated: "Prontuário atualizado",
  pending: "Atualização pendente",
  overdue: "Revisão necessária",
};


export function formatDate(value) {
  if (!value) {
    return "Data não informada";
  }
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}
