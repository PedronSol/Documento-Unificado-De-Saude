export function ResourceError({ message, retryLabel, onRetry }) {
  return (
    <div className="form-error" role="alert" aria-label={message}>
      <p>{message}</p>
      <button type="button" onClick={onRetry} aria-label={retryLabel}>
        Tentar novamente
      </button>
    </div>
  );
}

export function ResourceNotice({ title, message, loading = false }) {
  return (
    <section className="clinical-section" aria-label={title}>
      <header>
        <h2>{title}</h2>
      </header>
      <p role={loading ? "status" : undefined}>{message}</p>
    </section>
  );
}
