const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,64}$/;


export function readFragment() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (window.location.hash) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }
  const token = params.get("token");
  return { token: token && TOKEN_PATTERN.test(token) ? token : null, params };
}


export function readTokenFromFragment() {
  return readFragment().token;
}
