const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,64}$/;


export function readTokenFromFragment() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
  if (window.location.hash) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }
  return token && TOKEN_PATTERN.test(token) ? token : null;
}
