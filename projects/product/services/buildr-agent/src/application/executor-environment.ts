/** Explicit networking/tool environment, excluding all inherited agent authentication and desktop RPC. */
export function executorEnvironment(source: Record<string, string | undefined>): Record<string, string> {
  const keys = ['PATH', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'XDG_CACHE_HOME', 'PLAYWRIGHT_BROWSERS_PATH', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS'];
  return Object.fromEntries(keys.flatMap(key => typeof source[key] === 'string' ? [[key, source[key]!]] : []));
}
