export function ListEmptyState({ isFiltered, query, emptyText, onClear, className = "" }) {
  if (!isFiltered) {
    return <p className={className}>{emptyText}</p>;
  }
  return (
    <div className={`list-empty-filtered ${className}`.trim()}>
      <p>
        {query
          ? `Nenhum resultado para "${query}".`
          : "Nenhum resultado para os filtros selecionados."}
      </p>
      <button type="button" onClick={onClear}>Limpar busca e filtros</button>
    </div>
  );
}

export default ListEmptyState;
